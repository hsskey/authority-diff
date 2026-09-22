import { describe, expect, test } from 'vitest';
import {
  ChangeReviewResponseSchema,
  CreateDecisionRequestSchema,
  CreateReplayRunRequestSchema,
  CreateRuntimeObservationsRequestSchema,
  ErrorEnvelopeSchema,
  ImportTraceRequestSchema,
  ImportTraceResponseSchema,
  ListActionsQuerySchema,
} from '../schema.ts';
import parsedSessionFixture from '../../../tests/fixtures/parsed-session.json' with { type: 'json' };

const ULID = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
const HASH = 'a'.repeat(64);
const TS = '2026-01-02T03:04:05.006Z';

describe('contracts DTO round-trip', () => {
  test('accepts a trace import request built from a Parsed Session', () => {
    expect(ImportTraceRequestSchema.safeParse(parsedSessionFixture).success).toBe(true);
  });

  test('rejects a trace import over 1,000 tool calls', () => {
    const oneCall = parsedSessionFixture.toolCalls[0];
    const tooMany = {
      ...parsedSessionFixture,
      toolCalls: Array.from({ length: 1001 }, () => oneCall),
    };
    expect(ImportTraceRequestSchema.safeParse(tooMany).success).toBe(false);
  });

  test('rejects a runtime observation batch over 500', () => {
    const obs = {
      event: 'permission_request',
      sessionExternalId: 's',
      toolName: 'Bash',
      toolInputHash: HASH,
      cwd: null,
      runtimeVersion: null,
      occurredAt: TS,
    };
    expect(
      CreateRuntimeObservationsRequestSchema.safeParse({
        runtime: 'claude_code',
        observations: Array.from({ length: 501 }, () => obs),
      }).success,
    ).toBe(false);
  });

  test('round-trips the import response', () => {
    const value = {
      importId: `imp_${ULID}`,
      acceptedCount: 2,
      duplicateCount: 1,
      rejectedCount: 0,
    };
    expect(ImportTraceResponseSchema.parse(value)).toEqual(value);
  });

  test('coerces the actions list limit and defaults it', () => {
    const parsed = ListActionsQuerySchema.parse({ limit: '25', capability: 'read' });
    expect(parsed.limit).toBe(25);
    expect(ListActionsQuerySchema.parse({}).limit).toBe(50);
  });

  test('round-trips a replay run request and a decision request', () => {
    expect(
      CreateReplayRunRequestSchema.safeParse({
        baselineVersionId: `pver_${ULID}`,
        candidateVersionId: `pver_${ULID}`,
        windowFrom: TS,
        windowTo: TS,
      }).success,
    ).toBe(true);
    expect(
      CreateDecisionRequestSchema.safeParse({
        decision: 'reject',
        note: '',
        reviewerName: 'reviewer',
      }).success,
    ).toBe(true);
  });

  test('carries replay summary and gate on a change review response', () => {
    const value = {
      id: `rev_${ULID}`,
      policyId: `pol_${ULID}`,
      candidateVersionId: `pver_${ULID}`,
      candidateContentHash: HASH,
      baselineVersionId: `pver_${ULID}`,
      windowFrom: TS,
      windowTo: TS,
      replayRunId: null,
      status: 'computing',
      decidedBy: null,
      decidedAt: null,
      decisionNote: null,
      createdAt: TS,
      replaySummary: { replayRunId: null, status: 'queued', stats: null, resultHash: null },
      gate: { isOpen: false, blockers: [{ code: 'replay_incomplete', count: 1 }] },
    };
    expect(ChangeReviewResponseSchema.parse(value)).toEqual(value);
  });

  test('round-trips the error envelope', () => {
    const value = {
      error: {
        code: 'review.gate_blocked',
        message: 'a widening group is unreviewed',
        isRetryable: false,
        details: { blockers: [{ code: 'widening_unreviewed', count: 3 }] },
        requestId: 'req_1',
      },
    };
    expect(ErrorEnvelopeSchema.parse(value)).toEqual(value);
  });
});
