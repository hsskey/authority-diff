import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { parseTranscript } from '@authority/trace/client';
import { ImportTraceResponseSchema } from '@authority/contracts/schema';
import { authToken, serverBaseUrl } from '../config.ts';
import { writeStderr, writeStdout } from '../output.ts';

type ParsedSession = ReturnType<typeof parseTranscript>;
type ReadGitRemotes = (workspaceRoot: string) => Record<string, string> | null;

// Duplicated from tools/local-pipeline/lib/enrich.ts: the CLI cannot import from
// tools/, and this git I/O must not live in the pure trace/client. The classifier
// resolves a push Remote Key only when repoRemotes is filled here.
function expandHome(workspaceRoot: string): string {
  if (workspaceRoot === '~') {
    return homedir();
  }
  if (workspaceRoot.startsWith('~/')) {
    return join(homedir(), workspaceRoot.slice(2));
  }
  return workspaceRoot;
}

const readGitRemotes: ReadGitRemotes = (workspaceRoot) => {
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

function enrichRepoRemotes(sessions: readonly ParsedSession[]): ParsedSession[] {
  const cache = new Map<string, Record<string, string> | null>();
  const remotesFor = (root: string): Record<string, string> | null => {
    const resolved = expandHome(root);
    if (!cache.has(resolved)) {
      cache.set(resolved, readGitRemotes(resolved));
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

function discoverTranscripts(root: string): string[] {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        found.push(full);
      }
    }
  };
  walk(root);
  return found.sort();
}

function parseSessions(files: readonly string[]): ParsedSession[] {
  const sessions: ParsedSession[] = [];
  for (const file of files) {
    let content: string;
    try {
      content = readFileSync(file, 'utf8');
    } catch {
      writeStderr(`skipped unreadable transcript: ${file}`);
      continue;
    }
    sessions.push(
      parseTranscript({ sessionExternalId: basename(file, '.jsonl'), lines: content.split('\n') }),
    );
  }
  return sessions;
}

export interface ImportSummary {
  readonly sessions: number;
  readonly acceptedCount: number;
  readonly duplicateCount: number;
  readonly rejectedCount: number;
  readonly failedSessions: number;
  readonly failedSessionIds: readonly string[];
}

/**
 * Parses every transcript under `dir`, enriches each with its git remotes, and
 * posts one import request per Session. Redaction already happened inside
 * parseTranscript; the server re-checks it. Each Session is imported
 * independently so a failure does not roll back earlier successes.
 */
export async function runImport(dir: string): Promise<ImportSummary> {
  const token = authToken();
  if (token === null) {
    writeStderr('AUTHORITY_CLI_TOKEN is not set');
    process.exitCode = 1;
    return {
      sessions: 0,
      acceptedCount: 0,
      duplicateCount: 0,
      rejectedCount: 0,
      failedSessions: 0,
      failedSessionIds: [],
    };
  }

  const sessions = enrichRepoRemotes(parseSessions(discoverTranscripts(dir)));
  const base = serverBaseUrl();
  let acceptedCount = 0;
  let duplicateCount = 0;
  let rejectedCount = 0;
  const failedSessionIds: string[] = [];

  for (const session of sessions) {
    try {
      const response = await fetch(`${base}/api/v1/trace-imports`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify(session),
      });
      if (!response.ok) {
        failedSessionIds.push(session.sessionExternalId);
        writeStderr(`import failed for ${session.sessionExternalId}: HTTP ${response.status}`);
        continue;
      }
      const body = ImportTraceResponseSchema.parse(await response.json());
      acceptedCount += body.acceptedCount;
      duplicateCount += body.duplicateCount;
      rejectedCount += body.rejectedCount;
    } catch {
      failedSessionIds.push(session.sessionExternalId);
      writeStderr(`import failed for ${session.sessionExternalId}`);
    }
  }

  const summary: ImportSummary = {
    sessions: sessions.length,
    acceptedCount,
    duplicateCount,
    rejectedCount,
    failedSessions: failedSessionIds.length,
    failedSessionIds,
  };
  writeStdout(JSON.stringify(summary, null, 2));
  if (summary.failedSessions > 0) {
    process.exitCode = 1;
  }
  return summary;
}
