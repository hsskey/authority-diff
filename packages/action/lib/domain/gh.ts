/**
 * Classifies GitHub CLI (`gh`) commands into Operations.
 *
 * Mapping (task rules): view/list/checks/status/diff/`run view`/`GET api` are
 * `fetch`; pr create/comment/edit/review, issue create, and write-method `api`
 * are `send`; pr merge, release create, repo create are `push`; `auth` token and
 * `secret` commands are a `read` of the credential store. The Target is a
 * `vcs_remote` whose Remote Key comes from `-R`/`--repo` when present, otherwise
 * the session `origin` remote, but only while gh runs inside the session
 * workspace; a preceding `cd` outside it leaves the remote name unresolved.
 */
import type { Capability, Target } from '../../schema.ts';
import { nonFlagArgs, type NormalizedCommand } from './command.ts';
import { draft, type OperationDraft } from './draft.ts';
import { dirOutsideWorkspace, normalizeRemote, pathTarget, resolvePath } from './targets.ts';
import type { ShellWord } from '../shell/ast.ts';

const CREDENTIAL_STORE = '~/.config/gh/hosts.yml';
const FETCH_VERBS: ReadonlySet<string> = new Set([
  'view',
  'list',
  'checks',
  'status',
  'diff',
  'watch',
  'browse',
  'download',
]);
const SEND_VERBS: ReadonlySet<string> = new Set([
  'create',
  'comment',
  'edit',
  'review',
  'close',
  'reopen',
  'ready',
  'upload',
  'lock',
  'unlock',
]);

export function classifyGh(cmd: NormalizedCommand): OperationDraft[] {
  const positional = nonFlagArgs(cmd.args);
  const command = positional[0]?.text ?? '';
  const sub = positional[1]?.text ?? '';

  if (command === 'auth' || command === 'secret') {
    const resolved = resolvePath(CREDENTIAL_STORE, cmd.cwd, cmd.workspaceRoot);
    return [draft('read', pathTarget(resolved), 'partial', 'gh', cmd.raw, ['gh_credentials'])];
  }
  if (command === 'api') {
    const method = apiMethod(cmd.args);
    const capability: Capability = method === 'GET' ? 'fetch' : 'send';
    return [remoteOp(capability, cmd)];
  }
  if (command === 'pr' && sub === 'merge') return [remoteOp('push', cmd)];
  if (command === 'release' && sub === 'create') return [remoteOp('push', cmd)];
  if (command === 'repo' && sub === 'create') return [remoteOp('push', cmd)];
  if (command === 'gist' && sub === 'create') return [remoteOp('send', cmd)];
  if (command === 'repo' && sub === 'clone') return [remoteOp('fetch', cmd)];

  if (FETCH_VERBS.has(sub)) return [remoteOp('fetch', cmd)];
  if (SEND_VERBS.has(sub)) return [remoteOp('send', cmd)];
  // Unknown gh subcommand: assume outbound transmission rather than a false read.
  return [remoteOp('send', cmd, ['gh_subcommand_unknown'])];
}

function apiMethod(args: readonly ShellWord[]): string {
  for (let i = 0; i < args.length; i++) {
    const t = args[i]?.text ?? '';
    if (t === '-X' || t === '--method') return (args[i + 1]?.text ?? 'GET').toUpperCase();
    if (t.startsWith('--method=')) return t.slice('--method='.length).toUpperCase();
    if (t.startsWith('-X=')) return t.slice('-X='.length).toUpperCase();
  }
  return 'GET';
}

function remoteOp(
  capability: Capability,
  cmd: NormalizedCommand,
  extraSignals: readonly string[] = [],
): OperationDraft {
  const signals = [...extraSignals];
  const repoValue = repoFlag(cmd.args);
  let remoteKey: string | null = null;
  let analyzability: 'full' | 'partial' = 'partial';

  if (repoValue !== null) {
    const normalized =
      repoValue.includes('/') && repoValue.split('/').length === 2
        ? `github.com/${repoValue}`
        : repoValue;
    const result = normalizeRemote(normalized);
    remoteKey = result.remoteKey;
    if (result.unparsed) signals.push('remote_unparsed');
    else analyzability = 'full';
  } else if (dirOutsideWorkspace(cmd.cwd, cmd.workspaceRoot)) {
    signals.push('remote_dir_mismatch');
  } else {
    const origin = cmd.repoRemotes?.['origin'];
    if (origin !== undefined) {
      const result = normalizeRemote(origin);
      remoteKey = result.remoteKey;
      if (result.unparsed) signals.push('remote_unparsed');
    }
  }

  const target: Target = {
    kind: 'vcs_remote',
    remoteName: repoValue === null ? 'origin' : null,
    remoteKey,
    branch: cmd.gitBranch,
  };
  return draft(capability, target, analyzability, 'gh', cmd.raw, signals);
}

function repoFlag(args: readonly ShellWord[]): string | null {
  for (let i = 0; i < args.length; i++) {
    const t = args[i]?.text ?? '';
    if (t === '-R' || t === '--repo') return args[i + 1]?.text ?? null;
    if (t.startsWith('--repo=')) return t.slice('--repo='.length);
    if (t.startsWith('-R=')) return t.slice('-R='.length);
  }
  return null;
}
