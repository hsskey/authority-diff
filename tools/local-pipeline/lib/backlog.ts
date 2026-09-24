import type { Operation } from '@authority/action/schema';
import type { ActionForReplay } from '@authority/trace/schema';

/**
 * `soleActions` counts the `none` Actions whose every `none` Operation matches
 * the row, so resolving that row alone takes them out of `none`.
 */
export interface NoneRow {
  readonly key: string;
  readonly noneOperations: number;
  readonly noneActions: number;
  readonly soleActions: number;
}

export interface ProgramRow extends NoneRow {
  readonly operations: number;
}

export interface TargetKindRow {
  readonly key: string;
  readonly operations: number;
  readonly full: number;
  readonly partial: number;
  readonly none: number;
}

/**
 * A hardening candidate names the Operations one classification rule change
 * would reclassify. `gainActions` counts the `none` Actions whose every `none`
 * Operation it matches; `matchedOperations` counts matches at any analyzability.
 */
export interface Candidate {
  readonly key: string;
  readonly matches: (operation: Operation) => boolean;
}

export interface CandidateRow {
  readonly key: string;
  readonly matchedOperations: number;
  readonly noneOperations: number;
  readonly noneActions: number;
  readonly gainActions: number;
}

const SHELLS: ReadonlySet<string> = new Set(['bash', 'sh', 'dash', 'zsh', 'ksh']);

/** The unquoted word that names the program, after any wrappers and assignments. */
function commandWord(operation: Operation): { word: string; args: readonly string[] } | null {
  const words = operation.fragment
    .trim()
    .split(/\s+/)
    .map((word) => word.replace(/["']/g, ''));
  const at = words.findIndex((word) => word.split('/').at(-1) === operation.program);
  const word = words[at];
  return word === undefined ? null : { word, args: words.slice(at + 1) };
}

function unrecognizedPathCommand(operation: Operation): string | null {
  if (!operation.signals.includes('program_unrecognized') || !operation.program) {
    return null;
  }
  const word = commandWord(operation)?.word ?? '';
  return word.includes('/') ? word : null;
}

const RULES: readonly Candidate[] = [
  {
    // `command -v|-V <name>` prints where <name> resolves and never runs it.
    key: 'command_lookup',
    matches: (operation) => /^command\s+-[vV]\b/.test(operation.fragment),
  },
  {
    // A shell given a script file, classified like an interpreter given one.
    key: 'shell_script_file',
    matches: (operation) => {
      if (operation.program === null || !SHELLS.has(operation.program)) {
        return false;
      }
      if (/<</.test(operation.fragment)) {
        return false;
      }
      const args = commandWord(operation)?.args ?? [];
      if (args.some((arg) => /^-[A-Za-z]*[cs][A-Za-z]*$/.test(arg))) {
        return false;
      }
      const operand = args.find((arg) => !arg.startsWith('-'));
      return operand !== undefined && !/^[<>|&;]/.test(operand);
    },
  },
  {
    // A command named by a literal path runs that file, like a shell given a script file.
    key: 'path_command_name',
    matches: (operation) => /^[^$]/.test(unrecognizedPathCommand(operation) ?? '$'),
  },
  {
    // The same through a directory variable (`$DIR/tool`); resolvable only from a literal assignment.
    key: 'variable_path_command_name',
    matches: (operation) => (unrecognizedPathCommand(operation) ?? '').startsWith('$'),
  },
  {
    // A command name taken from a variable; resolvable only from a literal assignment.
    key: 'variable_command_name',
    matches: (operation) =>
      operation.program === '' && /^"?\$\{?[A-Za-z_]/.test(operation.fragment),
  },
];

/** A redirection a command carries is its own write Operation, which no rule here changes. */
export const CANDIDATES: readonly Candidate[] = RULES.map(({ key, matches }) => ({
  key,
  matches: (operation) => !operation.signals.includes('redirect') && matches(operation),
}));

export interface Backlog {
  readonly evaluatedActions: number;
  readonly noneActions: number;
  readonly operations: number;
  readonly noneOperations: number;
  readonly noneSignals: readonly NoneRow[];
  readonly programs: readonly ProgramRow[];
  readonly targetKinds: readonly TargetKindRow[];
  readonly candidates: readonly CandidateRow[];
  readonly candidatesCombinedGainActions: number;
}

const NO_PROGRAM = '(no program)';

interface Tally {
  noneOperations: number;
  noneActions: number;
  soleActions: number;
}

function tally(tallies: Map<string, Tally>, key: string): Tally {
  const existing = tallies.get(key);
  if (existing !== undefined) {
    return existing;
  }
  const created = { noneOperations: 0, noneActions: 0, soleActions: 0 };
  tallies.set(key, created);
  return created;
}

function byCount<T extends { key: string }>(count: (row: T) => number) {
  return (a: T, b: T): number => count(b) - count(a) || (a.key < b.key ? -1 : 1);
}

/** Adds each key's Action counts once per Action, from that Action's `none` Operations. */
function tallyAction(
  tallies: Map<string, Tally>,
  noneOperations: readonly Operation[],
  keysOf: (operation: Operation) => readonly string[],
): void {
  const keysPerOperation = noneOperations.map((operation) => new Set(keysOf(operation)));
  for (const keys of keysPerOperation) {
    for (const key of keys) {
      tally(tallies, key).noneOperations++;
    }
  }
  for (const key of new Set(keysPerOperation.flatMap((keys) => [...keys]))) {
    const row = tally(tallies, key);
    row.noneActions++;
    if (keysPerOperation.every((keys) => keys.has(key))) {
      row.soleActions++;
    }
  }
}

export function computeBacklog(
  actions: readonly ActionForReplay[],
  candidates: readonly Candidate[] = CANDIDATES,
): Backlog {
  const signals = new Map<string, Tally>();
  const programNone = new Map<string, Tally>();
  const programOperations = new Map<string, number>();
  const kinds = new Map<string, TargetKindRow>();
  let evaluatedActions = 0;
  let noneActions = 0;
  let operations = 0;
  let noneOperations = 0;
  const candidateTallies = candidates.map((candidate) => ({
    candidate,
    row: {
      key: candidate.key,
      matchedOperations: 0,
      noneOperations: 0,
      noneActions: 0,
      gainActions: 0,
    },
  }));
  let candidatesCombinedGainActions = 0;

  for (const action of actions) {
    if (action.operations.length === 0) {
      continue;
    }
    evaluatedActions++;
    for (const operation of action.operations) {
      operations++;
      for (const { candidate, row } of candidateTallies) {
        row.matchedOperations += candidate.matches(operation) ? 1 : 0;
      }
      const program = operation.program ?? NO_PROGRAM;
      programOperations.set(program, (programOperations.get(program) ?? 0) + 1);
      const kind = kinds.get(operation.target.kind) ?? {
        key: operation.target.kind,
        operations: 0,
        full: 0,
        partial: 0,
        none: 0,
      };
      kinds.set(operation.target.kind, {
        ...kind,
        operations: kind.operations + 1,
        [operation.analyzability]: kind[operation.analyzability] + 1,
      });
    }
    const none = action.operations.filter((operation) => operation.analyzability === 'none');
    if (none.length === 0) {
      continue;
    }
    noneActions++;
    noneOperations += none.length;
    tallyAction(signals, none, (operation) => operation.signals);
    tallyAction(programNone, none, (operation) => [operation.program ?? NO_PROGRAM]);
    for (const { candidate, row } of candidateTallies) {
      const matched = none.filter(candidate.matches).length;
      row.noneOperations += matched;
      row.noneActions += matched > 0 ? 1 : 0;
      row.gainActions += matched === none.length ? 1 : 0;
    }
    if (none.every((operation) => candidates.some((candidate) => candidate.matches(operation)))) {
      candidatesCombinedGainActions++;
    }
  }

  const rows = (tallies: Map<string, Tally>): NoneRow[] =>
    [...tallies.entries()].map(([key, row]) => ({ key, ...row }));

  return {
    evaluatedActions,
    noneActions,
    operations,
    noneOperations,
    noneSignals: rows(signals)
      .sort(byCount((row) => row.noneOperations))
      .slice(0, 20),
    programs: rows(programNone)
      .map((row) => ({ ...row, operations: programOperations.get(row.key) ?? 0 }))
      .sort(byCount((row) => row.noneOperations))
      .slice(0, 40),
    targetKinds: [...kinds.values()].sort(byCount((row) => row.operations)),
    candidates: candidateTallies.map(({ row }) => row),
    candidatesCombinedGainActions,
  };
}
