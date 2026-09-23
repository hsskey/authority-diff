import { describe, expect, test } from 'vitest';
import {
  ActivityOverviewQuerySchema,
  ChangeReviewResponseSchema,
  CreateDecisionRequestSchema,
  CreateReplayRunRequestSchema,
  CreateRuntimeObservationsRequestSchema,
  ErrorEnvelopeSchema,
  ImportTraceRequestSchema,
  ImportTraceResponseSchema,
  ListActionsQuerySchema,
  ListAdoptionGroupsQuerySchema,
  ListChangeReviewsQuerySchema,
  ListReviewAdoptionGroupsQuerySchema,
  ReviewAdoptionGroupResponseSchema,
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

  test('defaults the activity overview window to 30 days and bounds it to a year', () => {
    expect(ActivityOverviewQuerySchema.parse({})).toEqual({ windowDays: 30 });
    expect(ActivityOverviewQuerySchema.parse({ windowDays: '14' })).toEqual({ windowDays: 14 });
    expect(ActivityOverviewQuerySchema.safeParse({ windowDays: '366' }).success).toBe(false);
    expect(ActivityOverviewQuerySchema.safeParse({ windowDays: '0' }).success).toBe(false);
  });

  test('the change reviews listing requires a policy id', () => {
    expect(ListChangeReviewsQuerySchema.parse({ policyId: `pol_${ULID}` })).toEqual({
      policyId: `pol_${ULID}`,
      limit: 50,
    });
    expect(ListChangeReviewsQuerySchema.safeParse({}).success).toBe(false);
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

  test.each([
    ['no kind as a version diff', { baselineVersionId: `pver_${ULID}` }, 'version_diff'],
    ['a conformance run without a baseline', { kind: 'conformance' }, 'conformance'],
    ['an adoption run without a baseline', { kind: 'adoption' }, 'adoption'],
  ])('parses a replay run request with %s', (_name, extra, expected) => {
    const parsed = CreateReplayRunRequestSchema.parse({
      candidateVersionId: `pver_${ULID}`,
      windowFrom: TS,
      windowTo: TS,
      ...extra,
    });
    expect(parsed.kind).toBe(expected);
  });

  test('rejects a version diff replay run request without a baseline', () => {
    const result = CreateReplayRunRequestSchema.safeParse({
      kind: 'version_diff',
      candidateVersionId: `pver_${ULID}`,
      windowFrom: TS,
      windowTo: TS,
    });
    expect(result.success).toBe(false);
  });

  test('parses the adoption groups query with an effect filter and a default limit', () => {
    expect(ListAdoptionGroupsQuerySchema.parse({ effect: 'deny' })).toEqual({
      effect: 'deny',
      limit: 50,
    });
    expect(ListAdoptionGroupsQuerySchema.safeParse({ effect: 'allow' }).success).toBe(false);
  });

  test.each([
    ['a change review', { kind: 'change', baselineVersionId: `pver_${ULID}` }, 'replay_incomplete'],
    ['an adoption review', { kind: 'adoption', baselineVersionId: null }, 'adoption_unreviewed'],
  ])('carries replay summary and gate on %s response', (_name, kindFields, blockerCode) => {
    const value = {
      id: `rev_${ULID}`,
      policyId: `pol_${ULID}`,
      ...kindFields,
      candidateVersionId: `pver_${ULID}`,
      candidateContentHash: HASH,
      windowFrom: TS,
      windowTo: TS,
      replayRunId: null,
      status: 'computing',
      decidedBy: null,
      decidedAt: null,
      decisionNote: null,
      createdAt: TS,
      replaySummary: { replayRunId: null, status: 'queued', stats: null, resultHash: null },
      gate: { isOpen: false, blockers: [{ code: blockerCode, count: 1 }] },
      traceSources: { transcript: 12, hook: 0, synthetic: 3 },
    };
    expect(ChangeReviewResponseSchema.parse(value)).toEqual(value);
  });

  test('a review adoption group carries the review verdict on the replay group shape', () => {
    const value = {
      groupKey: HASH,
      effect: 'deny',
      capability: 'read',
      zone: 'credentials',
      program: null,
      programSummary: [{ program: 'cat', count: 1 }],
      distinctProgramCount: 1,
      actionCount: 1,
      sessionCount: 1,
      analyzabilityNoneCount: 0,
      firstOccurredAt: TS,
      lastOccurredAt: TS,
      decidingRuleIds: ['deny_credentials_access'],
      targetSummary: [{ key: '~/.synthetic-credentials', count: 1 }],
      headline: "자격 증명에서의 읽기 1건이 이 정책에서 '차단' 대상이 됩니다.",
      sampleActionKeys: [HASH],
      verdict: null,
    };
    expect(ReviewAdoptionGroupResponseSchema.parse(value)).toEqual(value);
  });

  test('parses the review adoption groups query with effect and verdict filters', () => {
    expect(
      ListReviewAdoptionGroupsQuerySchema.parse({ effect: 'ask', verdict: 'expected' }),
    ).toEqual({ effect: 'ask', verdict: 'expected', limit: 50 });
    expect(ListReviewAdoptionGroupsQuerySchema.safeParse({ effect: 'allow' }).success).toBe(false);
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
