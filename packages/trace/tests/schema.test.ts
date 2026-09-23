import { describe, expect, expectTypeOf, test } from 'vitest';
import type { Runtime } from '@authority/action/schema';
import type { Analyzability, Capability } from '@authority/action/schema';
import {
  ActivityOverviewSchema,
  AgentSessionSchema,
  ParsedSessionSchema,
  RuntimeObservationSchema,
  StoredAgentActionSchema,
  TraceImportSchema,
  type ActionForReplay,
  type ActivityOverview,
  type BuildActivityOverview,
  type DeriveActionKey,
  type ParseTranscript,
  type ParsedSession,
  type RedactText,
  type TargetKind,
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

describe('Activity Overview contract', () => {
  test('locks the overview shape: counts per key, no Effect or Zone', () => {
    expectTypeOf<ActivityOverview>().toEqualTypeOf<{
      sessionCount: number;
      actionCount: number;
      evaluableActionCount: number;
      capabilityCounts: Record<Capability, number>;
      targetKindCounts: Record<TargetKind, number>;
      analyzability: Record<Analyzability, number>;
      topPrograms: { program: string; count: number }[];
      topRemoteKeys: { remoteKey: string; count: number }[];
    }>();
    expectTypeOf<TargetKind>().toEqualTypeOf<
      | 'workspace_path'
      | 'other_path'
      | 'vcs_remote'
      | 'host'
      | 'package'
      | 'mcp'
      | 'deploy_target'
      | 'unknown'
    >();
    expectTypeOf<BuildActivityOverview>().toEqualTypeOf<
      (actions: readonly ActionForReplay[]) => ActivityOverview
    >();
  });

  test('rejects an overview missing a capability key or over twenty programs', () => {
    const zero = (keys: readonly string[]) => Object.fromEntries(keys.map((key) => [key, 0]));
    const capabilities = [
      'read',
      'write',
      'delete',
      'execute',
      'install',
      'fetch',
      'send',
      'commit',
      'push',
      'rewrite',
      'deploy',
    ];
    const kinds = [
      'workspace_path',
      'other_path',
      'vcs_remote',
      'host',
      'package',
      'mcp',
      'deploy_target',
      'unknown',
    ];
    const value = {
      sessionCount: 0,
      actionCount: 0,
      evaluableActionCount: 0,
      capabilityCounts: zero(capabilities),
      targetKindCounts: zero(kinds),
      analyzability: { full: 0, partial: 0, none: 0 },
      topPrograms: [],
      topRemoteKeys: [],
    };
    expect(ActivityOverviewSchema.parse(value)).toEqual(value);
    expect(
      ActivityOverviewSchema.safeParse({ ...value, capabilityCounts: zero(capabilities.slice(1)) })
        .success,
    ).toBe(false);
    expect(
      ActivityOverviewSchema.safeParse({
        ...value,
        topPrograms: Array.from({ length: 21 }, (_, i) => ({ program: `p${i}`, count: 1 })),
      }).success,
    ).toBe(false);
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
      permissionMode: 'acceptEdits',
      cwd: '~/project',
      runtimeVersion: null,
      occurredAt: TS,
    };
    expect(RuntimeObservationSchema.parse(value)).toEqual(value);
    expect(RuntimeObservationSchema.safeParse({ ...value, observationKey: 'nope' }).success).toBe(
      false,
    );
  });

  test('defaults permissionMode to null for hook clients that predate it', () => {
    const legacy = {
      observationKey: HASH,
      actionKey: null,
      event: 'session_end',
      sessionExternalId: 'session-a',
      toolName: null,
      toolInputHash: null,
      cwd: null,
      runtimeVersion: null,
      occurredAt: TS,
    };
    expect(RuntimeObservationSchema.parse(legacy).permissionMode).toBeNull();
  });
});
