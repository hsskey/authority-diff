/**
 * Classifies `git` subcommands into Operations.
 *
 * Mapping (docs/design.md 13.2, 13.4 and the task rules): read subcommands are
 * `read`; add/commit/merge/stash/tag/checkout/branch are `commit`;
 * clone/fetch/pull are `fetch`; push is `push`; force pushes, `reset --hard`,
 * `branch -D`, and `clean` are `rewrite` or `delete`; a push with a help or
 * dry-run flag transmits nothing and is `execute`. A network subcommand
 * targets a `vcs_remote` whose Remote Key is resolved from an explicit URL, the
 * named remote, or the default `origin`. A named remote resolves through the
 * session `repoRemotes` only while git runs inside the session workspace. A
 * repository operand that is a local path (`/`, `./`, `../`, `~`, `file://`)
 * targets that `path` instead of a remote.
 */
import type { Capability, Target } from '../../schema.ts';
import { hasFlag, nonFlagArgs, type NormalizedCommand } from './command.ts';
import { draft, unlessNoEffect, type OperationDraft } from './draft.ts';
import { dirOutsideWorkspace, normalizeRemote, pathTarget, resolvePath } from './targets.ts';
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

const FETCH_VALUE_FLAGS: readonly string[] = [
  '--depth',
  '--deepen',
  '-j',
  '--jobs',
  '-o',
  '--server-option',
  '--upload-pack',
  '--shallow-since',
  '--shallow-exclude',
  '--refmap',
  '--negotiation-tip',
  '--filter',
];
/** Network subcommand options that consume the next word, so it is not an operand. */
const REMOTE_VALUE_FLAGS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  [
    'clone',
    new Set([
      ...FETCH_VALUE_FLAGS,
      '-b',
      '--branch',
      '--origin',
      '--reference',
      '--reference-if-able',
      '-c',
      '--config',
      '--template',
      '--separate-git-dir',
      '-u',
      '--bundle-uri',
    ]),
  ],
  ['fetch', new Set(FETCH_VALUE_FLAGS)],
  ['pull', new Set([...FETCH_VALUE_FLAGS, '-s', '--strategy', '-X', '--strategy-option'])],
  ['ls-remote', new Set(['-o', '--server-option', '--upload-pack', '--sort'])],
  ['push', new Set(['-o', '--push-option', '--receive-pack', '--exec', '--repo'])],
]);

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

export function classifyGit(cmd: NormalizedCommand): OperationDraft[] {
  const globals = splitGitGlobals(cmd.args);
  const args = globals.args;
  const gitCmd: NormalizedCommand = { ...cmd, args };
  const dirMismatch = dirOutsideWorkspace(
    cmd.cwd,
    cmd.workspaceRoot,
    globals.dirs,
    globals.hasGitDir,
  );
  const positional = nonFlagArgs(args);
  const sub = positional[0]?.text ?? '';
  const rest = args.filter((a) => a !== positional[0]);

  if (FETCH_SUBS.has(sub)) {
    return [remoteOp('fetch', gitCmd, sub, rest, dirMismatch)];
  }
  if (sub === 'push') {
    const forced = hasForceFlag(args) || hasPlusRefspec(rest);
    const op = remoteOp(forced ? 'rewrite' : 'push', gitCmd, sub, rest, dirMismatch);
    return [unlessNoEffect(op, args, ['--dry-run', '-n'])];
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
  // The first operand is the repository, a URL or a remote name; the operands
  // after it are refspecs (`refs/heads/main`, `+refs/*:refs/*`, `HEAD:main`).
  const positional = remoteOperands(sub, rest);
  const signals: string[] = [];

  const repository = positional[0];
  const literal = repository === undefined || repository.hasExpansion ? null : repository.text;
  const localPath = literal === null ? null : localRepositoryPath(literal);
  if (localPath !== null) {
    const resolved = resolvePath(localPath, cmd.cwd, cmd.workspaceRoot);
    return draft(capability, pathTarget(resolved), 'full', 'git', cmd.raw);
  }

  let remoteName: string | null = null;
  let remoteKey: string | null = null;
  let analyzability: 'full' | 'partial' = 'full';

  if (literal !== null && looksLikeRemoteUrl(literal)) {
    const result = normalizeRemote(literal);
    remoteKey = result.remoteKey;
    if (result.unparsed) {
      signals.push('remote_unparsed');
      analyzability = 'partial';
    }
  } else if (sub === 'clone' || isUnnamedRemote(repository)) {
    analyzability = 'partial';
  } else {
    remoteName = literal ?? 'origin';
    if (literal === null) analyzability = 'partial';
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

function remoteOperands(sub: string, rest: readonly ShellWord[]): ShellWord[] {
  const valueFlags = REMOTE_VALUE_FLAGS.get(sub);
  const consumed = new Set<ShellWord>();
  rest.forEach((word, i) => {
    const value = rest[i + 1];
    if (valueFlags?.has(word.text) === true && value !== undefined) consumed.add(value);
  });
  return nonFlagArgs(rest.filter((word) => !consumed.has(word)));
}

/**
 * True when a repository operand is present but names no remote: a shell
 * expansion or a `host:path` form without a user, which the named-remote
 * lookup cannot resolve.
 */
function isUnnamedRemote(repository: ShellWord | undefined): boolean {
  return repository !== undefined && (repository.hasExpansion || repository.text.includes(':'));
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

/** The path form of a repository operand git reads from disk, or null for a remote. */
function localRepositoryPath(text: string): string | null {
  if (text.startsWith('file://')) return text.slice('file://'.length);
  if (text === '.' || text === '..') return text;
  const local = ['/', './', '../', '~'].some((prefix) => text.startsWith(prefix));
  return local ? text : null;
}

/** A scheme URL, an scp-like `user@host:path`, or a `host/owner/repo` whose host has a dot. */
function looksLikeRemoteUrl(text: string): boolean {
  return (
    /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(text) ||
    /^[^/\s]+@[^/\s]+:/.test(text) ||
    /^[\w-]+(?:\.[\w-]+)+\/[\w.-]+\/[\w.-]+/.test(text)
  );
}
