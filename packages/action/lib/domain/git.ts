/**
 * Classifies `git` subcommands into Operations.
 *
 * Mapping (docs/design.md 13.2, 13.4 and the task rules): read subcommands are
 * `read`; add/commit/merge/stash/tag/checkout/branch are `commit`;
 * clone/fetch/pull are `fetch`; push is `push`; force pushes, `reset --hard`,
 * `branch -D`, and `clean` are `rewrite` or `delete`. A network subcommand
 * targets a `vcs_remote` whose Remote Key is resolved from an explicit URL, the
 * named remote, or the default `origin`.
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
]);
const FETCH_SUBS: ReadonlySet<string> = new Set(['clone', 'fetch', 'pull']);
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

/**
 * Drops git global options (and their values) that precede the subcommand so
 * `git -C <dir> push` and `git -c k=v commit` resolve to push/commit instead of
 * falling through to an unknown subcommand.
 */
function stripGitGlobals(args: readonly ShellWord[]): ShellWord[] {
  let i = 0;
  while (i < args.length) {
    const t = args[i]?.text ?? '';
    if (t.length === 0) break;
    if (GIT_GLOBAL_VALUE_FLAGS.has(t)) {
      i += 2;
      continue;
    }
    if (t.startsWith('-')) {
      i += 1;
      continue;
    }
    break;
  }
  return args.slice(i);
}

export function classifyGit(cmd: NormalizedCommand): OperationDraft[] {
  const args = stripGitGlobals(cmd.args);
  const gitCmd: NormalizedCommand = { ...cmd, args };
  const positional = nonFlagArgs(args);
  const sub = positional[0]?.text ?? '';
  const rest = args.filter((a) => a !== positional[0]);

  if (FETCH_SUBS.has(sub)) {
    return [remoteOp('fetch', gitCmd, sub, rest)];
  }
  if (sub === 'push') {
    const forced = hasFlag(args, ...FORCE_FLAGS) || hasPlusRefspec(rest);
    return [remoteOp(forced ? 'rewrite' : 'push', gitCmd, sub, rest)];
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
    const url = cmd.repoRemotes?.[remoteName];
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

  const target: Target = {
    kind: 'vcs_remote',
    remoteName,
    remoteKey,
    branch: cmd.gitBranch,
  };
  return draft(capability, target, analyzability, 'git', cmd.raw, signals);
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
