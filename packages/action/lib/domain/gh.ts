/**
 * Classifies GitHub CLI (`gh`) commands into Operations.
 *
 * Mapping (task rules): view/list/checks/status/diff/`run view`/`GET api` are
 * `fetch`; pr create/comment/edit/review, issue create, and write-method `api`
 * are `send`; pr merge, release create, repo create are `push`; `auth` token and
 * `secret` commands are a `read` of the credential store. The Target is a
 * `vcs_remote` whose Remote Key comes from the repository the arguments name:
 * `-R`/`--repo`, the `repos/<owner>/<repo>` path of `gh api`, the repository
 * operand of `gh repo`, or the repository in a `gh pr`/`gh issue` URL. An
 * argument that names no resolvable repository (`gh api user`, `gh api graphql`,
 * `gh repo create <name>`, a shell expansion) leaves the Remote Key unresolved. Only without such an argument does the
 * Target fall back to the session `origin` remote, and only while gh runs inside
 * the session workspace; a preceding `cd` outside it leaves the Remote Key
 * unresolved.
 */
import type { Capability, Target } from '#schema';
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
/** `gh api` options that consume the next word. */
const API_VALUE_FLAGS: ReadonlySet<string> = new Set([
  '-X',
  '--method',
  '-H',
  '--header',
  '-f',
  '--raw-field',
  '-F',
  '--field',
  '--input',
  '-q',
  '--jq',
  '-t',
  '--template',
  '--hostname',
  '--cache',
  '-p',
  '--preview',
]);
const API_REPO_PATH = /^\/?repos\/([^/?#]+)\/([^/?#]+)/;
const PLACEHOLDER = /^[{:]/;
const ISSUE_URL = /^[a-z]+:\/\/([^/]+)\/([^/]+)\/([^/]+)\/(?:pull|issues)\//i;

/**
 * The repository a gh argument names: a repository string to normalize, null
 * when an argument is present but names no single repository, or undefined when
 * no argument names one and the session `origin` applies.
 */
type ArgumentRepository = string | null | undefined;

export function classifyGh(cmd: NormalizedCommand): OperationDraft[] {
  const positional = nonFlagArgs(cmd.args);
  const command = positional[0]?.text ?? '';
  const sub = positional[1]?.text ?? '';

  if (command === 'auth' || command === 'secret') {
    const resolved = resolvePath(CREDENTIAL_STORE, cmd.cwd, cmd.workspaceRoot);
    return [draft('read', pathTarget(resolved), 'partial', 'gh', cmd.raw, ['gh_credentials'])];
  }
  const repository = repoFlag(cmd.args) ?? argumentRepository(command, positional, cmd.args);
  if (command === 'api') {
    const method = apiMethod(cmd.args);
    const capability: Capability = method === 'GET' ? 'fetch' : 'send';
    return [remoteOp(capability, cmd, repository)];
  }
  if (command === 'pr' && sub === 'merge') return [remoteOp('push', cmd, repository)];
  if (command === 'release' && sub === 'create') return [remoteOp('push', cmd, repository)];
  if (command === 'repo' && sub === 'create') return [remoteOp('push', cmd, repository)];
  if (command === 'gist' && sub === 'create') return [remoteOp('send', cmd, repository)];
  if (command === 'repo' && sub === 'clone') return [remoteOp('fetch', cmd, repository)];

  if (FETCH_VERBS.has(sub)) return [remoteOp('fetch', cmd, repository)];
  if (SEND_VERBS.has(sub)) return [remoteOp('send', cmd, repository)];
  // Unknown gh subcommand: assume outbound transmission rather than a false read.
  return [remoteOp('send', cmd, repository, ['gh_subcommand_unknown'])];
}

function argumentRepository(
  command: string,
  positional: readonly ShellWord[],
  args: readonly ShellWord[],
): ArgumentRepository {
  if (command === 'api') return apiRepository(args);
  const operand = positional[2];
  if (operand === undefined) return undefined;
  if (operand.hasExpansion) return command === 'repo' ? null : undefined;
  // Option values are not told apart from operands, so only an operand with an
  // owner (`owner/repo`, `host/owner/repo`, or a URL) names a repository; a bare
  // name still names one for `gh repo create`, just not a resolvable one.
  if (command === 'repo') {
    if (operand.text.includes('/')) return operand.text;
    return positional[1]?.text === 'create' ? null : undefined;
  }
  if (command === 'pr' || command === 'issue') {
    const url = ISSUE_URL.exec(operand.text);
    return url === null ? undefined : `${url[1]}/${url[2]}/${url[3]}`;
  }
  return undefined;
}

/**
 * The repository of a `gh api` endpoint. A `repos/<owner>/<repo>` path names
 * it; `{owner}`/`{repo}` placeholders are filled by gh from the current
 * repository, so they fall back to `origin`; any other endpoint names none.
 */
function apiRepository(args: readonly ShellWord[]): ArgumentRepository {
  const endpoint = apiEndpoint(args);
  if (endpoint === undefined) return undefined;
  if (endpoint.hasExpansion) return null;
  const match = API_REPO_PATH.exec(endpoint.text);
  const owner = match?.[1];
  const repo = match?.[2];
  if (owner === undefined || repo === undefined) return null;
  if (PLACEHOLDER.test(owner) || PLACEHOLDER.test(repo)) return undefined;
  return `${apiHostname(args)}/${owner}/${repo}`;
}

function apiEndpoint(args: readonly ShellWord[]): ShellWord | undefined {
  const start = args.findIndex((a) => a.text === 'api');
  for (let i = start + 1; i < args.length; i++) {
    const word = args[i];
    if (word === undefined) break;
    if (API_VALUE_FLAGS.has(word.text)) i += 1;
    else if (!(word.text.startsWith('-') && word.text.length > 1)) return word;
  }
  return undefined;
}

function apiHostname(args: readonly ShellWord[]): string {
  const index = args.findIndex((a) => a.text === '--hostname');
  const inline = args.find((a) => a.text.startsWith('--hostname='));
  return (
    (index === -1 ? undefined : args[index + 1]?.text) ??
    inline?.text.slice('--hostname='.length) ??
    'github.com'
  );
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
  repository: ArgumentRepository,
  extraSignals: readonly string[] = [],
): OperationDraft {
  const signals = [...extraSignals];
  let remoteKey: string | null = null;
  let analyzability: 'full' | 'partial' = 'partial';

  if (typeof repository === 'string') {
    const normalized = repository.split('/').length === 2 ? `github.com/${repository}` : repository;
    const result = normalizeRemote(normalized);
    remoteKey = result.remoteKey;
    if (result.unparsed) signals.push('remote_unparsed');
    else analyzability = 'full';
  } else if (repository === undefined) {
    if (dirOutsideWorkspace(cmd.cwd, cmd.workspaceRoot)) {
      signals.push('remote_dir_mismatch');
    } else {
      const origin = cmd.repoRemotes?.['origin'];
      if (origin !== undefined) {
        const result = normalizeRemote(origin);
        remoteKey = result.remoteKey;
        if (result.unparsed) signals.push('remote_unparsed');
      }
    }
  }

  const target: Target = {
    kind: 'vcs_remote',
    remoteName: repository === undefined ? 'origin' : null,
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
