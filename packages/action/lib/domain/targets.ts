/**
 * Pure Target construction and normalization for the classifier.
 *
 * No third-party imports: this module turns raw path, URL, and VCS remote
 * strings into the normalized {@link Target} shapes the contract fixes in
 * `packages/action/schema.ts`.
 */
import { homeToTilde } from '@authority/kernel';
import type { Target } from '#schema';
import type { ShellWord } from '../shell/ast.ts';

/** Resolved path plus whether it lies inside the workspace root. */
export interface ResolvedPath {
  readonly path: string;
  readonly isInsideWorkspace: boolean;
}

/**
 * Resolves a path argument against the current working directory.
 *
 * Absolute paths are kept; a leading `~` marks the home directory and is kept as
 * `~`; a relative path is joined onto `cwd` when known. `isInsideWorkspace` is
 * true when the resolved path is under `workspaceRoot` in the same form: the
 * parser records a home-directory root as `~/...` and folds the Session home in
 * the input to `~`, so a `~/...` path compares against a `~/...` root.
 */
export function resolvePath(
  rawPath: string,
  cwd: string | null,
  workspaceRoot: string | null,
): ResolvedPath {
  if (rawPath.startsWith('~')) {
    const path = normalizeSegments(rawPath);
    return path.startsWith('~')
      ? { path, isInsideWorkspace: isUnder(path, workspaceRoot) }
      : { path: rawPath, isInsideWorkspace: false };
  }
  if (rawPath.startsWith('/')) {
    const path = normalizeSegments(rawPath);
    return { path, isInsideWorkspace: isUnder(path, workspaceRoot) };
  }
  if (cwd !== null) {
    const path = normalizeSegments(`${cwd}/${rawPath}`);
    return { path, isInsideWorkspace: isUnder(path, workspaceRoot) };
  }
  // Unknown cwd: keep the relative path; assume workspace-relative when a
  // workspace root exists, since agent Bash runs default to the workspace.
  return { path: rawPath, isInsideWorkspace: workspaceRoot !== null };
}

function isUnder(path: string, root: string | null): boolean {
  if (root === null) return false;
  const normRoot = normalizeSegments(root).replace(/\/$/, '');
  return path === normRoot || path.startsWith(`${normRoot}/`);
}

/** Collapses `.` and `..` segments without touching the filesystem. */
function normalizeSegments(path: string): string {
  const absolute = path.startsWith('/');
  const out: string[] = [];
  for (const seg of path.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (out.length > 0 && out[out.length - 1] !== '..') out.pop();
      else if (!absolute) out.push('..');
      continue;
    }
    out.push(seg);
  }
  return (absolute ? '/' : '') + out.join('/');
}

/**
 * True when a command runs against a directory other than the session
 * workspace, so the session `repoRemotes` may not describe its remotes: an
 * explicit `--git-dir`, a `-C`/`--work-tree` path (each resolved against the
 * previous) outside the workspace or not statically known, or a cwd an earlier
 * `cd` moved outside the workspace or to an unknown directory. Callers without
 * such directory options (for example `gh`) pass none, leaving only the cwd
 * check. The recorded workspace root writes the home directory as `~` while
 * command text keeps it absolute, so the directory is compared in both forms.
 */
export function dirOutsideWorkspace(
  cwd: string | null,
  workspaceRoot: string | null,
  dirs: readonly ShellWord[] = [],
  hasGitDir = false,
): boolean {
  if (hasGitDir) return true;
  // Without a workspace root the cwd cannot be compared; only an explicit
  // directory change is known to leave the session repository.
  if (workspaceRoot === null) return dirs.length > 0;
  if (cwd === null) return true;
  let dir = resolvePath('.', cwd, workspaceRoot);
  for (const word of dirs) {
    if (word.hasExpansion) return true;
    dir = resolvePath(word.text, dir.path, workspaceRoot);
  }
  return !dir.isInsideWorkspace && !isUnder(homeToTilde(dir.path), workspaceRoot);
}

export function pathTarget(resolved: ResolvedPath): Target {
  return { kind: 'path', path: resolved.path, isInsideWorkspace: resolved.isInsideWorkspace };
}

export function unknownTarget(): Target {
  return { kind: 'unknown' };
}

/** Parses a URL literal into a host Target, or null when no host is found. */
export function hostTarget(url: string): Target | null {
  const host = parseHost(url);
  if (host === null) return null;
  const scheme = parseScheme(url);
  return { kind: 'host', host, scheme };
}

/** Lowercased host with any port removed, or null when unparseable. */
export function parseHost(url: string): string | null {
  const withScheme = url.match(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/([^/?#]+)/);
  const authority = withScheme?.[1] ?? url.match(/^([^/?#\s]+)/)?.[1];
  if (authority === undefined || authority.length === 0) return null;
  // Strip user@ and :port.
  const hostPort = authority.includes('@')
    ? authority.slice(authority.indexOf('@') + 1)
    : authority;
  const host = hostPort.replace(/:\d+$/, '').toLowerCase();
  if (host.length === 0 || !host.includes('.')) return null;
  return host;
}

function parseScheme(url: string): string | null {
  const m = url.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):\/\//);
  return m?.[1]?.toLowerCase() ?? null;
}

/** Outcome of normalizing a VCS remote URL into a Remote Key. */
export interface RemoteKeyResult {
  readonly remoteKey: string | null;
  /** True when a remote was present but could not be normalized to 3 parts. */
  readonly unparsed: boolean;
}

/**
 * Normalizes a git remote URL to a lowercase `host/owner/repo` Remote Key.
 *
 * SSH (`git@host:owner/repo.git`), HTTPS (`https://host/owner/repo.git`), and
 * scp-like forms collapse to the same key. Anything that does not yield exactly
 * three non-empty segments (for example a GitLab nested group) returns a null
 * key with `unparsed` set.
 */
export function normalizeRemote(url: string): RemoteKeyResult {
  const trimmed = url.trim();
  if (trimmed.length === 0) return { remoteKey: null, unparsed: false };

  let rest = trimmed;
  // Strip scheme.
  const schemeMatch = rest.match(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//);
  if (schemeMatch !== null) rest = rest.slice(schemeMatch[0].length);

  // scp-like: git@host:owner/repo(.git)
  if (schemeMatch === null && rest.includes('@') && rest.includes(':') && !rest.includes('://')) {
    rest = rest.slice(rest.indexOf('@') + 1).replace(':', '/');
  } else if (rest.includes('@')) {
    rest = rest.slice(rest.indexOf('@') + 1);
  }

  // Drop query/fragment and trailing slash and .git.
  rest = rest.replace(/[?#].*$/, '').replace(/\/$/, '');
  if (rest.endsWith('.git')) rest = rest.slice(0, -4);

  const segments = rest.split('/').filter((s) => s.length > 0);
  const rawHost = segments[0];
  const owner = segments[1];
  const repo = segments[2];
  if (segments.length !== 3 || rawHost === undefined || owner === undefined || repo === undefined) {
    return { remoteKey: null, unparsed: true };
  }
  const host = rawHost.replace(/:\d+$/, '').toLowerCase();
  if (host.length === 0) return { remoteKey: null, unparsed: true };
  const key = `${host}/${owner}/${repo}`.toLowerCase();
  if (!isValidRemoteKey(key)) return { remoteKey: null, unparsed: true };
  return { remoteKey: key, unparsed: false };
}

/** Mirrors the RemoteKeySchema contract: lowercase host/owner/repo. */
function isValidRemoteKey(value: string): boolean {
  const parts = value.split('/');
  const host = parts[0];
  const repo = parts[2];
  return (
    parts.length === 3 &&
    parts.every((p) => p.length > 0) &&
    value === value.toLowerCase() &&
    host !== undefined &&
    !host.includes(':') &&
    !host.includes('@') &&
    repo !== undefined &&
    !repo.endsWith('.git')
  );
}
