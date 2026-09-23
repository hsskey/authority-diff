import { expect, test } from 'vitest';
import { IsoTimestampSchema } from '@authority/kernel';
import { createTestTraceModule } from '@authority/trace/testing';
import type { TestTraceModule } from '@authority/trace/testing';
import {
  AgentSessionIdSchema,
  StoredAgentActionSchema,
  TraceImportIdSchema,
} from '@authority/trace/schema';
import type { StoredAgentAction, TraceSource } from '@authority/trace/schema';

const WINDOW = {
  from: IsoTimestampSchema.parse('2026-01-01T00:00:00.000Z'),
  to: IsoTimestampSchema.parse('2026-01-31T23:59:59.999Z'),
};

function action(key: string, sessionExternalId: string, occurredAt: string): StoredAgentAction {
  return StoredAgentActionSchema.parse({
    actionKey: key.repeat(64),
    sessionExternalId,
    operations: [],
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

async function importSession(
  module: TestTraceModule,
  id: string,
  source: TraceSource,
  sessionExternalId: string,
  actions: readonly StoredAgentAction[],
): Promise<void> {
  await module.store.writeImport({
    traceImport: {
      id: TraceImportIdSchema.parse(`imp_${id.padStart(26, '0')}`),
      runtime: 'claude_code',
      source,
      sessionExternalId,
      redactionCount: 0,
      classifierVersion: 'test-classifier',
      createdAt: IsoTimestampSchema.parse('2026-02-01T00:00:00.000Z'),
    },
    session: {
      id: AgentSessionIdSchema.parse(`ses_${id.padStart(26, '0')}`),
      runtime: 'claude_code',
      runtimeVersion: null,
      sessionExternalId,
      workspaceRoot: null,
      gitBranch: null,
      hasHookCoverage: false,
      startedAt: null,
      endedAt: null,
    },
    actions,
    attemptedCount: actions.length,
  });
}

test("counts the window's Actions by the source of their Session's first Trace Import", async () => {
  const module = createTestTraceModule();
  await importSession(module, '1', 'transcript', 'session-real', [
    action('a', 'session-real', '2026-01-10T00:00:00.000Z'),
    action('b', 'session-real', '2026-01-11T00:00:00.000Z'),
    action('c', 'session-real', '2026-03-01T00:00:00.000Z'),
  ]);
  await importSession(module, '2', 'synthetic', 'session-fixture', [
    action('d', 'session-fixture', '2026-01-12T00:00:00.000Z'),
  ]);
  await importSession(module, '3', 'synthetic', 'session-real', [
    action('e', 'session-real', '2026-01-13T00:00:00.000Z'),
  ]);

  const counts = await module.countActionsBySource(WINDOW);

  expect(counts).toEqual({ transcript: 3, hook: 0, synthetic: 1 });
});
