/**
 * Classifies `git` subcommands into Operations.
 *
 * Mapping (docs/design.md 13.2, 13.4 and the task rules): read subcommands are
 * `read`; add/commit/merge/stash/tag/checkout/branch are `commit`;
 * clone/fetch/pull are `fetch`; push is `push`; force pushes, `reset --hard`,
 * `branch -D`, and `clean` are `rewrite` or `delete`. A network subcommand
 * targets a `vcs_remote` whose Remote Key is resolved from an explicit URL, the
 * named remote, or the default `origin`. A named remote resolves through the
 * session `repoRemotes` only while git runs inside the session workspace.
 */
import type { Capability, Target } from '../../schema.ts';
import { hasFlag, nonFlagArgs, type NormalizedCommand } from './command.ts';
import { draft, type OperationDraft } from './draft.ts';
import { normalizeRemote, pathTarget, resolvePath } from './targets.ts';
import type { ShellWord } from '../shell/ast.ts';

const READ_SUBS: ReadonlySet<string> = new Set([
  'status',
  'log',
  'diff',
  'show',
  'blame',
  'describe',
  'rev-parse',
  'ls-files',
  'cat-file',
  'reflog',
  'shortlog',
  'whatchanged',
  'grep',
  'remote',
  'worktree',
  'cherry',
  'count-objects',
  'rev-list',
  'name-rev',
  'symbolic-ref',
  'for-each-ref',
  'merge-base',
  'check-ignore',
  'check-attr',
  'ls-tree',
  'hash-object',
  'show-ref',
  'merge-tree',
  'archive',
]);
const COMMIT_SUBS: ReadonlySet<string> = new Set([
  'add',
  'commit',
  'merge',
  'stash',
  'checkout',
  'switch',
  'restore',
  'rebase',
  'cherry-pick',
  'revert',
  'am',
  'apply',
  'mv',
  'notes',
  'init',
  'commit-tree',
  'update-ref',
  'format-patch',
]);
const FETCH_SUBS: ReadonlySet<string> = new Set(['clone', 'fetch', 'pull', 'ls-remote']);
const FORCE_FLAGS: readonly string[] = [
  '--force',
  '-f',
  '--force-with-lease',
  '--force-if-includes',
];

/** git global options (before the subcommand) that consume the next token. */
const GIT_GLOBAL_VALUE_FLAGS: ReadonlySet<string> = new Set([
  '-C',
  '-c',
  '--git-dir',
  '--work-tree',
  '--namespace',
  '--exec-path',
  '--super-prefix',
]);

/** git global options split from the subcommand argv. */
interface GitGlobals {
  readonly args: ShellWord[];
  /** `-C` and `--work-tree` values, in order, each resolved against the previous. */
  readonly dirs: ShellWord[];
  readonly hasGitDir: boolean;
}

/**
 * Drops git global options (and their values) that precede the subcommand so
 * `git -C <dir> push` and `git -c k=v commit` resolve to push/commit instead of
 * falling through to an unknown subcommand, and keeps the options that move git
 * to another repository.
 */
function splitGitGlobals(args: readonly ShellWord[]): GitGlobals {
  const dirs: ShellWord[] = [];
  let hasGitDir = false;
  let i = 0;
  while (i < args.length) {
    const word = args[i];
    const t = word?.text ?? '';
    if (word === undefined || t.length === 0) break;
    if (t === '--git-dir' || t.startsWith('--git-dir=')) hasGitDir = true;
    if (t.startsWith('--work-tree=')) {
      dirs.push({ ...word, text: t.slice('--work-tree='.length) });
    }
    if (GIT_GLOBAL_VALUE_FLAGS.has(t)) {
      const value = args[i + 1];
      if ((t === '-C' || t === '--work-tree') && value !== undefined) dirs.push(value);
      i += 2;
      continue;
    }
    if (t.startsWith('-')) {
      i += 1;
      continue;
    }
    break;
  }
  return { args: args.slice(i), dirs, hasGitDir };
}

/**
 * True when git runs against a directory other than the session workspace, so
 * the session `repoRemotes` may not describe its remotes: `--git-dir`, a `-C` or
 * `--work-tree` path outside the workspace or not statically known, or a cwd an
 * earlier `cd` moved outside the workspace or to an unknown directory.
 */
function remoteDirMismatch(cmd: NormalizedCommand, globals: GitGlobals): boolean {
  if (globals.hasGitDir) return true;
  // Without a workspace root the cwd cannot be compared; only an explicit
  // directory change is known to leave the session repository.
  if (cmd.workspaceRoot === null) return globals.dirs.length > 0;
  if (cmd.cwd === null) return true;
  let dir = resolvePath('.', cmd.cwd, cmd.workspaceRoot);
  for (const word of globals.dirs) {
    if (word.hasExpansion) return true;
    dir = resolvePath(word.text, dir.path, cmd.workspaceRoot);
  }
  return !dir.isInsideWorkspace;
}

export function classifyGit(cmd: NormalizedCommand): OperationDraft[] {
  const globals = splitGitGlobals(cmd.args);
  const args = globals.args;
  const gitCmd: NormalizedCommand = { ...cmd, args };
  const dirMismatch = remoteDirMismatch(cmd, globals);
  const positional = nonFlagArgs(args);
  const sub = positional[0]?.text ?? '';
  const rest = args.filter((a) => a !== positional[0]);

  if (FETCH_SUBS.has(sub)) {
    return [remoteOp('fetch', gitCmd, sub, rest, dirMismatch)];
  }
  if (sub === 'push') {
    const forced = hasForceFlag(args) || hasPlusRefspec(rest);
    return [remoteOp(forced ? 'rewrite' : 'push', gitCmd, sub, rest, dirMismatch)];
  }
  if (sub === 'reset') {
    return [localOp(hasFlag(args, '--hard') ? 'rewrite' : 'commit', gitCmd)];
  }
  if (sub === 'clean') return [localOp('delete', gitCmd)];
  if (sub === 'rm') return [localOp('delete', gitCmd)];
  if (sub === 'branch') return [branchOp(gitCmd)];
  if (sub === 'tag') return [tagOp(gitCmd, positional)];
  if (sub === 'config') return [localOp(positional.length >= 3 ? 'write' : 'read', gitCmd)];
  if (COMMIT_SUBS.has(sub)) return [localOp('commit', gitCmd)];
  if (READ_SUBS.has(sub)) return [localOp('read', gitCmd)];
  // Unknown git subcommand: opaque execution rather than a false read.
  return [
    draft('execute', { kind: 'unknown' }, 'none', 'git', gitCmd.raw, ['git_subcommand_unknown']),
  ];
}

function branchOp(cmd: NormalizedCommand): OperationDraft {
  const positional = nonFlagArgs(cmd.args).slice(1);
  if (hasFlag(cmd.args, '-D')) return localOp('rewrite', cmd);
  if (hasFlag(cmd.args, '-d', '--delete')) return localOp('delete', cmd);
  if (positional.length === 0) return localOp('read', cmd);
  return localOp('commit', cmd);
}

function tagOp(cmd: NormalizedCommand, positional: readonly ShellWord[]): OperationDraft {
  if (hasFlag(cmd.args, '-d', '--delete')) return localOp('delete', cmd);
  if (positional.length <= 1) return localOp('read', cmd);
  return localOp('commit', cmd);
}

function localOp(capability: Capability, cmd: NormalizedCommand): OperationDraft {
  const resolved = resolvePath('.', cmd.cwd, cmd.workspaceRoot);
  return draft(capability, pathTarget(resolved), 'full', 'git', cmd.raw);
}

function remoteOp(
  capability: Capability,
  cmd: NormalizedCommand,
  sub: string,
  rest: readonly ShellWord[],
  dirMismatch: boolean,
): OperationDraft {
  const positional = nonFlagArgs(rest);
  const signals: string[] = [];

  // clone takes a URL directly; push/fetch/pull take a remote name.
  const urlArg = positional.find((w) => looksLikeRemoteUrl(w.text) && !w.hasExpansion);
  let remoteName: string | null = null;
  let remoteKey: string | null = null;
  let analyzability: 'full' | 'partial' = 'full';

  if (urlArg !== undefined) {
    const result = normalizeRemote(urlArg.text);
    remoteKey = result.remoteKey;
    if (result.unparsed) {
      signals.push('remote_unparsed');
      analyzability = 'partial';
    }
  } else if (sub === 'clone') {
    analyzability = 'partial';
  } else {
    const named = positional.find((w) => !w.hasExpansion && !w.text.includes(':'));
    remoteName = named?.text ?? 'origin';
    if (named === undefined) analyzability = 'partial';
    const url = dirMismatch ? undefined : cmd.repoRemotes?.[remoteName];
    if (dirMismatch) signals.push('remote_dir_mismatch');
    if (url === undefined) {
      analyzability = 'partial';
    } else {
      const result = normalizeRemote(url);
      remoteKey = result.remoteKey;
      if (result.unparsed) {
        signals.push('remote_unparsed');
        analyzability = 'partial';
      }
    }
  }

  // Only push (without an explicit refspec) targets the current branch; clone,
  // fetch, and pull leave branch null unless a refspec is given.
  const target: Target = {
    kind: 'vcs_remote',
    remoteName,
    remoteKey,
    branch: sub === 'push' ? pushBranch(positional, cmd.gitBranch) : null,
  };
  return draft(capability, target, analyzability, 'git', cmd.raw, signals);
}

/**
 * The branch a push updates: the destination side of an explicit refspec, the
 * current branch when no refspec is given, or null when a refspec is present but
 * its destination cannot be resolved.
 */
function pushBranch(positional: readonly ShellWord[], gitBranch: string | null): string | null {
  const refspec = positional[1];
  if (refspec === undefined) return gitBranch;
  if (refspec.hasExpansion) return null;
  const spec = refspec.text.startsWith('+') ? refspec.text.slice(1) : refspec.text;
  const colon = spec.indexOf(':');
  const dest = (colon === -1 ? spec : spec.slice(colon + 1)).replace(/^refs\/heads\//, '');
  return dest.length === 0 || dest === 'HEAD' ? null : dest;
}

function hasForceFlag(args: readonly ShellWord[]): boolean {
  // `--force-with-lease` and `--force-if-includes` also take a `=<ref>` value form.
  return args.some(
    (a) =>
      FORCE_FLAGS.includes(a.text) ||
      a.text.startsWith('--force-with-lease=') ||
      a.text.startsWith('--force-if-includes='),
  );
}

function hasPlusRefspec(args: readonly ShellWord[]): boolean {
  // A leading `+` force-updates the ref, with or without a `:` (for example
  // `git push origin +main` and `git push origin +src:dst`).
  return nonFlagArgs(args).some((w) => w.text.startsWith('+') && w.text.length > 1);
}

function looksLikeRemoteUrl(text: string): boolean {
  return (
    /:\/\//.test(text) || /^[^/\s]+@[^/\s]+:/.test(text) || /^[\w.-]+\/[\w.-]+\/[\w.-]+/.test(text)
  );
}
