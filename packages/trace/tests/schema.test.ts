import { describe, expect, expectTypeOf, test } from 'vitest';
import type { Runtime } from '@authority/action/schema';
import {
  AgentSessionSchema,
  ParsedSessionSchema,
  RuntimeObservationSchema,
  StoredAgentActionSchema,
  TraceImportSchema,
  type DeriveActionKey,
  type ParseTranscript,
  type ParsedSession,
  type RedactText,
} from '../schema.ts';
import parsedSessionFixture from '../../../tests/fixtures/parsed-session.json' with { type: 'json' };

const ULID = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
const HASH = 'a'.repeat(64);
const TS = '2026-01-02T03:04:05.006Z';

describe('trace schema', () => {
  test('accepts the shared synthetic Parsed Session', () => {
    expect(ParsedSessionSchema.safeParse(parsedSessionFixture).success).toBe(true);
  });

  test('rejects a timestamp without milliseconds', () => {
    expect(
      ParsedSessionSchema.safeParse({
        ...parsedSessionFixture,
        startedAt: '2026-01-02T03:04:05Z',
      }).success,
    ).toBe(false);
  });

  test('exports transcript contract signatures', () => {
    expectTypeOf<ParseTranscript>().toEqualTypeOf<
      (input: {
        readonly sessionExternalId: string;
        readonly lines: readonly string[];
      }) => ParsedSession
    >();
    expectTypeOf<RedactText>().toEqualTypeOf<
      (text: string) => {
        readonly text: string;
        readonly redactions: readonly { readonly kind: string; readonly count: number }[];
      }
    >();
    expectTypeOf<DeriveActionKey>().toEqualTypeOf<
      (input: {
        readonly runtime: Runtime;
        readonly sessionExternalId: string;
        readonly toolUseId: string | null;
        readonly sequence: number;
      }) => string
    >();
  });
});

describe('trace storage schema round-trip', () => {
  test('accepts a Trace Import', () => {
    const value = {
      id: `imp_${ULID}`,
      runtime: 'claude_code',
      source: 'transcript',
      sessionExternalId: 'session-a',
      acceptedCount: 3,
      duplicateCount: 1,
      rejectedCount: 0,
      redactionCount: 2,
      classifierVersion: 'c1',
      createdAt: TS,
    };
    const parsed = TraceImportSchema.parse(value);
    expect(parsed).toEqual(value);
  });

  test('accepts an Agent Session', () => {
    const value = {
      id: `ses_${ULID}`,
      runtime: 'claude_code',
      runtimeVersion: null,
      sessionExternalId: 'session-a',
      workspaceRoot: '~/project',
      gitBranch: null,
      hasHookCoverage: false,
      startedAt: TS,
      endedAt: null,
    };
    expect(AgentSessionSchema.parse(value)).toEqual(value);
  });

  test('accepts a Stored Agent Action keyed by actionKey', () => {
    const value = {
      actionKey: HASH,
      sessionExternalId: 'session-a',
      operations: [
        {
          index: 0,
          capability: 'read',
          target: { kind: 'unknown' },
          analyzability: 'full',
          program: null,
          fragment: 'cat file',
          signals: [],
        },
      ],
      observedOutcome: 'executed',
      occurredAt: TS,
      toolName: 'Bash',
      toolInputRedacted: 'cat file',
      isInputTruncated: false,
      isSidechain: false,
      classifierVersion: 'c1',
      recordedAt: TS,
    };
    expect(StoredAgentActionSchema.parse(value)).toEqual(value);
  });

  test('accepts a Runtime Observation and rejects a bad key', () => {
    const value = {
      observationKey: HASH,
      actionKey: HASH,
      event: 'permission_request',
      sessionExternalId: 'session-a',
      toolUseId: 'toolu_synthetic',
      toolName: 'Bash',
      toolInputHash: HASH,
      hookDecision: 'allow',
      cwd: '~/project',
      runtimeVersion: null,
      occurredAt: TS,
    };
    expect(RuntimeObservationSchema.parse(value)).toEqual(value);
    expect(RuntimeObservationSchema.safeParse({ ...value, observationKey: 'nope' }).success).toBe(
      false,
    );
  });
});
