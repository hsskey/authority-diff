import { execFileSync } from 'node:child_process';
import type { ParsedSession } from '@authority/trace/schema';

export type ReadGitRemotes = (workspaceRoot: string) => Record<string, string> | null;

/**
 * Reads `git remote -v` for one workspace root. This is the only I/O exception
 * the local pipeline allows: the classifier resolves a push Remote Key from
 * ToolCall.repoRemotes, which the parser leaves null because it performs no I/O.
 * Returns a remote-name to URL record, or null when the root is not a
 * repository or git is unavailable. A `~`-prefixed workspace root never
 * resolves and therefore yields null.
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
 * measure and replay-local classify identical Actions. Each distinct
 * workspaceRoot is queried once. The read is injected for testability.
 */
export function enrichRepoRemotes(
  sessions: readonly ParsedSession[],
  read: ReadGitRemotes = readGitRemotes,
): ParsedSession[] {
  const cache = new Map<string, Record<string, string> | null>();
  const remotesFor = (root: string): Record<string, string> | null => {
    if (!cache.has(root)) {
      cache.set(root, read(root));
    }
    return cache.get(root) ?? null;
  };
  return sessions.map((session) => ({
    ...session,
    toolCalls: session.toolCalls.map((toolCall) => ({
      ...toolCall,
      repoRemotes: toolCall.workspaceRoot === null ? null : remotesFor(toolCall.workspaceRoot),
    })),
  }));
}
