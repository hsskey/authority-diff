import { describe, expect, test } from 'vitest';
import { IsoTimestampSchema } from '@authority/kernel';
import type { Operation } from '@authority/action/schema';
import { createTestTraceModule } from '@authority/trace/testing';
import type { ActivityOverview } from '@authority/trace/schema';
import {
  AgentSessionIdSchema,
  StoredAgentActionSchema,
  TraceImportIdSchema,
} from '@authority/trace/schema';
import type { StoredAgentAction } from '@authority/trace/schema';

const WINDOW = {
  from: IsoTimestampSchema.parse('2026-01-01T00:00:00.000Z'),
  to: IsoTimestampSchema.parse('2026-01-31T23:59:59.999Z'),
};

function operation(overrides: Partial<Operation>): Operation {
  return {
    index: 0,
    capability: 'execute',
    target: { kind: 'unknown' },
    analyzability: 'full',
    program: null,
    fragment: 'synthetic fragment',
    signals: [],
    ...overrides,
  };
}

function action(
  key: string,
  sessionExternalId: string,
  operations: readonly Operation[],
  occurredAt = '2026-01-10T00:00:00.000Z',
): StoredAgentAction {
  return StoredAgentActionSchema.parse({
    actionKey: key.padStart(2, '0').repeat(32),
    sessionExternalId,
    operations,
    observedOutcome: 'executed',
    occurredAt,
    toolName: 'Bash',
    toolInputRedacted: 'synthetic input',
    isInputTruncated: false,
    isSidechain: false,
    classifierVersion: 'test-classifier',
    recordedAt: occurredAt,
  });
}

async function overviewOf(actions: readonly StoredAgentAction[]): Promise<ActivityOverview> {
  const module = createTestTraceModule();
  await module.store.writeImport({
    traceImport: {
      id: TraceImportIdSchema.parse('imp_00000000000000000000000001'),
      runtime: 'claude_code',
      source: 'synthetic',
      sessionExternalId: 'synthetic-session-001',
      redactionCount: 0,
      classifierVersion: 'test-classifier',
      createdAt: IsoTimestampSchema.parse('2026-01-10T00:00:00.000Z'),
    },
    session: {
      id: AgentSessionIdSchema.parse('ses_00000000000000000000000001'),
      runtime: 'claude_code',
      runtimeVersion: null,
      sessionExternalId: 'synthetic-session-001',
      workspaceRoot: null,
      gitBranch: null,
      hasHookCoverage: false,
      startedAt: null,
      endedAt: null,
    },
    actions,
    attemptedCount: actions.length,
  });
  return module.getActivityOverview(WINDOW);
}

const REMOTE_A = 'github.com/synthetic-org/repo-a';
const REMOTE_B = 'github.com/synthetic-org/repo-b';

const ACTIONS: readonly StoredAgentAction[] = [
  action('a1', 'session-1', [
    operation({
      index: 0,
      capability: 'write',
      target: { kind: 'path', path: '~/synthetic-workspace/note.txt', isInsideWorkspace: true },
      program: null,
    }),
    operation({
      index: 1,
      capability: 'execute',
      target: { kind: 'path', path: '~/other/tool', isInsideWorkspace: false },
      analyzability: 'partial',
      program: 'bash',
    }),
  ]),
  action('b2', 'session-1', [
    operation({
      index: 0,
      capability: 'push',
      target: { kind: 'vcs_remote', remoteName: 'origin', remoteKey: REMOTE_A, branch: null },
      program: 'git',
    }),
    operation({
      index: 1,
      capability: 'fetch',
      target: { kind: 'vcs_remote', remoteName: 'origin', remoteKey: REMOTE_B, branch: null },
      program: 'git',
    }),
    operation({
      index: 2,
      capability: 'fetch',
      target: { kind: 'vcs_remote', remoteName: 'upstream', remoteKey: null, branch: null },
      analyzability: 'none',
      program: 'git',
    }),
  ]),
  action('c3', 'session-2', [
    operation({
      index: 0,
      capability: 'fetch',
      target: { kind: 'vcs_remote', remoteName: null, remoteKey: REMOTE_A, branch: null },
      program: 'gh',
    }),
  ]),
  action('d4', 'session-3', []),
];

describe('trace.getActivityOverview', () => {
  test('counts Sessions, Actions, and evaluable Actions of the window', async () => {
    const overview = await overviewOf(ACTIONS);

    expect(overview.sessionCount).toBe(3);
    expect(overview.actionCount).toBe(4);
    expect(overview.evaluableActionCount).toBe(3);
  });

  test('counts capabilities and Target kinds per Operation with every key present', async () => {
    const overview = await overviewOf(ACTIONS);

    expect(overview.capabilityCounts).toEqual({
      read: 0,
      write: 1,
      delete: 0,
      execute: 1,
      install: 0,
      fetch: 3,
      send: 0,
      commit: 0,
      push: 1,
      rewrite: 0,
      deploy: 0,
    });
    expect(overview.targetKindCounts).toEqual({
      workspace_path: 1,
      other_path: 1,
      vcs_remote: 4,
      host: 0,
      package: 0,
      mcp: 0,
      deploy_target: 0,
      unknown: 0,
    });
  });

  test('counts analyzability per evaluable Action by its worst Operation', async () => {
    const overview = await overviewOf(ACTIONS);

    expect(overview.analyzability).toEqual({ full: 1, partial: 1, none: 1 });
  });

  test('ranks programs and Remote Keys by count then key and skips null values', async () => {
    const overview = await overviewOf(ACTIONS);

    expect(overview.topPrograms).toEqual([
      { program: 'git', count: 3 },
      { program: 'bash', count: 1 },
      { program: 'gh', count: 1 },
    ]);
    expect(overview.topRemoteKeys).toEqual([
      { remoteKey: REMOTE_A, count: 2 },
      { remoteKey: REMOTE_B, count: 1 },
    ]);
  });

  test('keeps at most twenty programs', async () => {
    const many = Array.from({ length: 25 }, (_, i) =>
      action(i.toString(16), 'session-1', [
        operation({ program: `program-${String(i).padStart(2, '0')}` }),
      ]),
    );

    const overview = await overviewOf(many);

    expect(overview.topPrograms).toHaveLength(20);
    expect(overview.topPrograms[0]).toEqual({ program: 'program-00', count: 1 });
  });

  test('ignores Actions outside the window', async () => {
    const overview = await overviewOf([
      ...ACTIONS,
      action('e5', 'session-9', [operation({})], '2025-12-31T23:59:59.999Z'),
    ]);

    expect(overview.sessionCount).toBe(3);
    expect(overview.actionCount).toBe(4);
  });

  test('is all zeros for an empty window', async () => {
    const overview = await overviewOf([]);

    expect(overview).toEqual({
      sessionCount: 0,
      actionCount: 0,
      evaluableActionCount: 0,
      capabilityCounts: {
        read: 0,
        write: 0,
        delete: 0,
        execute: 0,
        install: 0,
        fetch: 0,
        send: 0,
        commit: 0,
        push: 0,
        rewrite: 0,
        deploy: 0,
      },
      targetKindCounts: {
        workspace_path: 0,
        other_path: 0,
        vcs_remote: 0,
        host: 0,
        package: 0,
        mcp: 0,
        deploy_target: 0,
        unknown: 0,
      },
      analyzability: { full: 0, partial: 0, none: 0 },
      topPrograms: [],
      topRemoteKeys: [],
    });
  });
});
