import { homedir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { createClassifier } from '@authority/action';
import { IsoTimestampSchema } from '@authority/kernel';
import type { ParsedSession, ParsedToolCall } from '@authority/trace/schema';
import { enrichRepoRemotes, type ReadGitRemotes } from '../lib/enrich.ts';

function pushToolCall(workspaceRoot: string): ParsedToolCall {
  return {
    toolUseId: null,
    toolName: 'Bash',
    toolInputRedacted: 'git push',
    isInputTruncated: false,
    workspaceRoot,
    gitBranch: 'main',
    repoRemotes: null,
    sequence: 0,
    isSidechain: false,
    observedOutcome: 'executed',
    occurredAt: IsoTimestampSchema.parse('2026-01-02T03:04:05.000Z'),
  };
}

function session(toolCall: ParsedToolCall): ParsedSession {
  return {
    runtime: 'claude_code',
    runtimeVersion: null,
    sessionExternalId: 'synthetic-session',
    workspaceRoot: toolCall.workspaceRoot,
    gitBranch: toolCall.gitBranch,
    startedAt: null,
    endedAt: null,
    toolCalls: [toolCall],
    totalLineCount: 1,
    unparsedLineCount: 0,
    redactions: [],
  };
}

describe('enrichRepoRemotes', () => {
  test('expands a ~ workspaceRoot so a home-dir push resolves a vcs_remote key', async () => {
    const expanded = join(homedir(), 'dev/x');
    const seen: string[] = [];
    const read: ReadGitRemotes = (root) => {
      seen.push(root);
      return root === expanded ? { origin: 'git@github.com:acme/x.git' } : null;
    };

    const [enriched] = enrichRepoRemotes([session(pushToolCall('~/dev/x'))], read);

    // The reader is queried with the home-expanded absolute path, not the `~` prefix.
    expect(seen).toEqual([expanded]);

    const call = enriched?.toolCalls[0];
    expect(call).toBeDefined();
    if (call === undefined) throw new Error('expected an enriched tool call');
    expect(call.repoRemotes).toEqual({ origin: 'git@github.com:acme/x.git' });

    const classify = await createClassifier();
    const push = classify(call).find((operation) => operation.capability === 'push');
    expect(push?.target).toMatchObject({ kind: 'vcs_remote', remoteKey: 'github.com/acme/x' });
  });

  test('leaves an unresolved root null so the push falls to a null remoteKey', async () => {
    const read: ReadGitRemotes = () => null;
    const [enriched] = enrichRepoRemotes([session(pushToolCall('~/dev/x'))], read);

    const call = enriched?.toolCalls[0];
    if (call === undefined) throw new Error('expected an enriched tool call');
    expect(call.repoRemotes).toBeNull();

    const classify = await createClassifier();
    const push = classify(call).find((operation) => operation.capability === 'push');
    expect(push?.target).toMatchObject({ kind: 'vcs_remote', remoteKey: null });
  });
});
