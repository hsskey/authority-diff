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

export function classifyGit(cmd: NormalizedCommand): OperationDraft[] {
  const positional = nonFlagArgs(cmd.args);
  const sub = positional[0]?.text ?? '';
  const rest = cmd.args.filter((a) => a !== positional[0]);

  if (FETCH_SUBS.has(sub)) {
    return [remoteOp('fetch', cmd, sub, rest)];
  }
  if (sub === 'push') {
    const forced = hasFlag(cmd.args, ...FORCE_FLAGS) || hasPlusRefspec(rest);
    return [remoteOp(forced ? 'rewrite' : 'push', cmd, sub, rest)];
  }
  if (sub === 'reset') {
    return [localOp(hasFlag(cmd.args, '--hard') ? 'rewrite' : 'commit', cmd)];
  }
  if (sub === 'clean') return [localOp('delete', cmd)];
  if (sub === 'rm') return [localOp('delete', cmd)];
  if (sub === 'branch') return [branchOp(cmd)];
  if (sub === 'tag') return [tagOp(cmd, positional)];
  if (sub === 'config') return [localOp(positional.length >= 3 ? 'write' : 'read', cmd)];
  if (COMMIT_SUBS.has(sub)) return [localOp('commit', cmd)];
  if (READ_SUBS.has(sub)) return [localOp('read', cmd)];
  // Unknown git subcommand: opaque execution rather than a false read.
  return [
    draft('execute', { kind: 'unknown' }, 'none', 'git', cmd.raw, ['git_subcommand_unknown']),
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
  return nonFlagArgs(args).some((w) => w.text.startsWith('+') && w.text.includes(':'));
}

function looksLikeRemoteUrl(text: string): boolean {
  return (
    /:\/\//.test(text) || /^[^/\s]+@[^/\s]+:/.test(text) || /^[\w.-]+\/[\w.-]+\/[\w.-]+/.test(text)
  );
}
