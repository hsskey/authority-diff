import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { ParsedSession } from '@authority/trace/schema';

export type ReadGitRemotes = (workspaceRoot: string) => Record<string, string> | null;

/**
 * Restores a redacted home prefix. The trace parser rewrites a home-dir
 * workspaceRoot to a `~` prefix, which git never resolves because the pipeline
 * runs it without a shell. On the same machine that produced the transcripts,
 * `~` denotes this home. An already-absolute root is returned unchanged, so a
 * cross-machine root stays unresolved and safely yields null.
 */
function expandHome(workspaceRoot: string): string {
  if (workspaceRoot === '~') return homedir();
  if (workspaceRoot.startsWith('~/')) return join(homedir(), workspaceRoot.slice(2));
  return workspaceRoot;
}

/**
 * Reads `git remote -v` for one workspace root. This is the only I/O exception
 * the local pipeline allows: the classifier resolves a push Remote Key from
 * ToolCall.repoRemotes, which the parser leaves null because it performs no I/O.
 * Returns a remote-name to URL record, or null when the root is not a
 * repository or git is unavailable.
 */
export const readGitRemotes: ReadGitRemotes = (workspaceRoot) => {
  let output: string;
  try {
    output = execFileSync('git', ['-C', workspaceRoot, 'remote', '-v'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return null;
  }
  const remotes: Record<string, string> = {};
  for (const line of output.split('\n')) {
    const match = /^(\S+)\t(\S+)\s+\((?:fetch|push)\)$/.exec(line);
    const name = match?.[1];
    const url = match?.[2];
    if (name !== undefined && url !== undefined && !(name in remotes)) {
      remotes[name] = url;
    }
  }
  return Object.keys(remotes).length === 0 ? null : remotes;
};

/**
 * Enriches each ToolCall's repoRemotes from its own workspaceRoot so that
 * measure and replay-local classify identical Actions. A home-relative (`~`)
 * root is expanded to the current home before the query, so same-machine
 * home-dir repositories resolve their remotes. Each distinct expanded root is
 * queried once. The read is injected for testability.
 */
export function enrichRepoRemotes(
  sessions: readonly ParsedSession[],
  read: ReadGitRemotes = readGitRemotes,
): ParsedSession[] {
  const cache = new Map<string, Record<string, string> | null>();
  const remotesFor = (root: string): Record<string, string> | null => {
    const resolved = expandHome(root);
    if (!cache.has(resolved)) {
      cache.set(resolved, read(resolved));
    }
    return cache.get(resolved) ?? null;
  };
  return sessions.map((session) => ({
    ...session,
    toolCalls: session.toolCalls.map((toolCall) => ({
      ...toolCall,
      repoRemotes: toolCall.workspaceRoot === null ? null : remotesFor(toolCall.workspaceRoot),
    })),
  }));
}
