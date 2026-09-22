/**
 * Turns a parsed Bash command into Operations.
 *
 * Responsibilities kept here (docs/design.md 13.2): strip transparent wrappers
 * (sudo, env, time, nohup, timeout, xargs, ...); track the working directory
 * across `cd`; route each simple command to the git, gh, or general program
 * classifier; and add a `write` Operation for each output redirection.
 */
import type { ShellCommand, ShellParse, ShellWord } from '../shell/ast.ts';
import type { ToolCall } from '../../schema.ts';
import { nonFlagArgs, type NormalizedCommand } from './command.ts';
import { draft, type OperationDraft } from './draft.ts';
import { classifyGit } from './git.ts';
import { classifyGh } from './gh.ts';
import { classifyProgram } from './programs.ts';
import { pathTarget, resolvePath, unknownTarget } from './targets.ts';

const WRAPPERS: ReadonlySet<string> = new Set([
  'sudo',
  'doas',
  'nohup',
  'nice',
  'ionice',
  'stdbuf',
  'command',
  'builtin',
  'exec',
  'time',
  'env',
  'timeout',
  'xargs',
  'watch',
  'chroot',
  'setsid',
]);
/** Wrapper flags that consume the following token as a value. */
const VALUE_FLAGS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ['sudo', new Set(['-u', '-g', '-p', '-C', '-h', '-U', '-r', '-t'])],
  ['doas', new Set(['-u', '-C'])],
  ['xargs', new Set(['-I', '-n', '-P', '-L', '-s', '-a', '-d', '-E', '--max-args', '--max-procs'])],
  ['stdbuf', new Set(['-i', '-o', '-e'])],
  ['env', new Set(['-u', '--unset'])],
]);

export function classifyBash(parse: ShellParse, call: ToolCall): OperationDraft[] {
  const ops: OperationDraft[] = [];
  // ponytail: cwd is tracked linearly across the flattened command list; a `cd`
  // buried inside a substitution can leak forward, which is acceptable for V1.
  let cwd = call.workspaceRoot;

  for (const command of parse.commands) {
    if (command.name === null) continue;
    const program = basename(command.name.text);

    if (program === 'cd') {
      const result = classifyCd(command, cwd, call.workspaceRoot);
      ops.push(result.op);
      cwd = result.cwd;
      continue;
    }

    const stripped = stripWrappers(program, command.args);
    if (stripped === null) {
      // A wrapper with no inner command (for example bare `env`): a read.
      const resolved = resolvePath('.', cwd, call.workspaceRoot);
      ops.push(draft('read', pathTarget(resolved), 'full', program, command.raw));
      continue;
    }

    const norm: NormalizedCommand = {
      program: stripped.program,
      args: stripped.args,
      raw: command.raw,
      cwd,
      workspaceRoot: call.workspaceRoot,
      repoRemotes: call.repoRemotes,
      gitBranch: call.gitBranch,
      heredocBodies: heredocBodies(command),
    };

    if (norm.program === 'git') ops.push(...classifyGit(norm));
    else if (norm.program === 'gh') ops.push(...classifyGh(norm));
    else ops.push(...classifyProgram(norm));

    ops.push(...redirectWrites(command, cwd, call.workspaceRoot, norm.program));
  }

  return ops;
}

interface CdResult {
  readonly op: OperationDraft;
  readonly cwd: string | null;
}

function classifyCd(command: ShellCommand, cwd: string | null, root: string | null): CdResult {
  const args = nonFlagArgs(command.args);
  const first = args[0];
  if (first === undefined || first.text === '-' || first.hasExpansion) {
    return {
      op: draft('read', unknownTarget(), 'partial', 'cd', command.raw, ['cwd_unknown']),
      cwd: null,
    };
  }
  const resolved = resolvePath(first.text, cwd, root);
  return { op: draft('read', pathTarget(resolved), 'full', 'cd', command.raw), cwd: resolved.path };
}

interface Stripped {
  readonly program: string;
  readonly args: readonly ShellWord[];
}

function stripWrappers(program: string, args: readonly ShellWord[]): Stripped | null {
  let current = program;
  let rest = args;
  for (let guard = 0; guard < 6 && WRAPPERS.has(current); guard++) {
    const inner = skipWrapperArgs(current, rest);
    const next = inner[0];
    if (next === undefined) return null;
    current = basename(next.text);
    rest = inner.slice(1);
  }
  return { program: current, args: rest };
}

/** Drops the wrapper's own flags (and their values), returning the inner argv. */
function skipWrapperArgs(wrapper: string, args: readonly ShellWord[]): ShellWord[] {
  const valueFlags = VALUE_FLAGS.get(wrapper) ?? new Set<string>();
  const out: ShellWord[] = [];
  let i = 0;
  let sawDuration = false;
  while (i < args.length) {
    const arg = args[i];
    if (arg === undefined) break;
    if (wrapper === 'env' && /^[A-Za-z_][A-Za-z0-9_]*=/.test(arg.text)) {
      i++;
      continue;
    }
    if (arg.text.startsWith('-') && arg.text.length > 1) {
      i += valueFlags.has(arg.text) ? 2 : 1;
      continue;
    }
    if (wrapper === 'timeout' && !sawDuration) {
      // The first positional after timeout is the duration, not the program.
      sawDuration = true;
      i++;
      continue;
    }
    for (let j = i; j < args.length; j++) {
      const w = args[j];
      if (w !== undefined) out.push(w);
    }
    break;
  }
  return out;
}

function redirectWrites(
  command: ShellCommand,
  cwd: string | null,
  root: string | null,
  program: string,
): OperationDraft[] {
  const ops: OperationDraft[] = [];
  for (const r of command.redirects) {
    if (r.kind !== 'write' && r.kind !== 'append') continue;
    if (r.target === null) continue;
    // Special devices and fd forms discard or route output and are not writes.
    if (!r.target.hasExpansion && isSpecialDevice(r.target.text)) continue;
    if (r.target.hasExpansion) {
      ops.push(
        draft('write', unknownTarget(), 'partial', program, command.raw, [
          'target_variable',
          'redirect',
        ]),
      );
      continue;
    }
    const resolved = resolvePath(r.target.text, cwd, root);
    ops.push(draft('write', pathTarget(resolved), 'full', program, command.raw, ['redirect']));
  }
  return ops;
}

/** Redirect targets that discard or route output rather than writing a file. */
function isSpecialDevice(path: string): boolean {
  return (
    path === '/dev/null' ||
    path === '/dev/stdout' ||
    path === '/dev/stderr' ||
    path === '/dev/tty' ||
    path === '/dev/zero' ||
    path.startsWith('/dev/fd/') ||
    path.startsWith('&')
  );
}

function heredocBodies(command: ShellCommand): string[] {
  const bodies: string[] = [];
  for (const r of command.redirects) {
    if (r.kind === 'heredoc' && r.heredocBody !== null) bodies.push(r.heredocBody);
  }
  return bodies;
}

function basename(program: string): string {
  const slash = program.lastIndexOf('/');
  return slash === -1 ? program : program.slice(slash + 1);
}
