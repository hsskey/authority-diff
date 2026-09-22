import { describe, expect, test } from 'vitest';
import { IsoTimestampSchema } from '@authority/kernel';
import type { Analyzability, Capability, Operation, Target } from '@authority/action/schema';
import type { ActionForReplay, ObservedOutcome, ParsedSession } from '@authority/trace/schema';
import { computeMetrics, type ActionMeta } from '../lib/aggregate.ts';
import { selectSamples } from '../lib/report.ts';

const PATH: Target = { kind: 'path', path: '/tmp/x', isInsideWorkspace: true };
const UNKNOWN: Target = { kind: 'unknown' };
const MCP: Target = { kind: 'mcp', server: 'files', tool: 'read' };

function op(
  index: number,
  capability: Capability,
  target: Target,
  analyzability: Analyzability,
  program: string | null,
  signals: readonly string[],
): Operation {
  return {
    index,
    capability,
    target,
    analyzability,
    program,
    fragment: 'synthetic',
    signals: [...signals],
  };
}

function action(
  actionKey: string,
  occurredAt: string,
  operations: Operation[],
  observedOutcome: ObservedOutcome = 'executed',
): ActionForReplay {
  return {
    actionKey,
    sessionExternalId: 'synthetic-session',
    operations,
    observedOutcome,
    occurredAt: IsoTimestampSchema.parse(occurredAt),
  };
}

function session(): ParsedSession {
  return {
    runtime: 'claude_code',
    runtimeVersion: null,
    sessionExternalId: 'synthetic-session',
    workspaceRoot: null,
    gitBranch: null,
    startedAt: null,
    endedAt: null,
    toolCalls: [],
    totalLineCount: 100,
    unparsedLineCount: 5,
    redactions: [
      { kind: 'token', count: 3 },
      { kind: 'email', count: 1 },
    ],
  };
}

const actions: ActionForReplay[] = [
  action('a1', '2026-01-02T03:04:01.000Z', [op(0, 'read', PATH, 'full', 'ls', [])]),
  action('a2', '2026-01-02T03:04:02.000Z', [
    op(0, 'execute', UNKNOWN, 'none', null, ['parse_error']),
  ]),
  action('a3', '2026-01-02T03:04:03.000Z', [
    op(0, 'execute', UNKNOWN, 'none', 'python3', ['inline_code']),
    op(1, 'execute', UNKNOWN, 'none', null, ['heredoc']),
  ]),
  action('a4', '2026-01-02T03:04:04.000Z', [op(0, 'execute', MCP, 'partial', null, [])]),
  action('a5', '2026-01-02T03:04:05.000Z', []),
  action(
    'a6',
    '2026-01-02T03:04:06.000Z',
    [op(0, 'write', PATH, 'full', 'git', [])],
    'rejected_by_human',
  ),
];

const meta = new Map<string, ActionMeta>([
  ['a1', { toolName: 'Bash', isSidechain: false }],
  ['a2', { toolName: 'Bash', isSidechain: false }],
  ['a3', { toolName: 'Bash', isSidechain: false }],
  ['a4', { toolName: 'mcp__files__read', isSidechain: false }],
  ['a5', { toolName: 'Task', isSidechain: true }],
  ['a6', { toolName: 'Bash', isSidechain: false }],
]);

const metrics = computeMetrics({
  sessions: [session()],
  actions,
  duplicateCount: 2,
  meta,
  classifyMs: 1000,
});

describe('computeMetrics', () => {
  test('counts sessions, actions, evaluation split, and duplicates', () => {
    expect([
      metrics.sessions,
      metrics.actionsAfterDedup,
      metrics.evaluatedActions,
      metrics.excludedActions,
      metrics.duplicateCount,
    ]).toEqual([1, 6, 5, 1, 2]);
  });

  test('tallies analyzability by action, bash action, and operation', () => {
    expect(metrics.analyzabilityByAction).toEqual({ full: 2, partial: 1, none: 2 });
    expect(metrics.analyzabilityByBashAction).toEqual({ full: 2, partial: 0, none: 2 });
    expect(metrics.analyzabilityByOperation).toEqual({ full: 2, partial: 1, none: 3 });
  });

  test('derives distributions, ratios, and signal tallies', () => {
    expect(metrics.toolDistribution).toEqual([
      { key: 'Bash', count: 4 },
      { key: 'Task', count: 1 },
      { key: 'mcp__files__read', count: 1 },
    ]);
    expect(metrics.excludedByTool).toEqual([{ key: 'Task', count: 1 }]);
    expect(metrics.bashActions).toBe(4);
    expect(metrics.sidechainActions).toBe(1);
    expect(metrics.compoundActions).toBe(1);
    expect(metrics.inlineProgramOperations).toBe(2);
    expect(metrics.parseErrorOperations).toBe(1);
    expect(metrics.humanRejectedActions).toBe(1);
    expect(metrics.topPrograms).toEqual([
      { key: 'git', count: 1 },
      { key: 'ls', count: 1 },
      { key: 'python3', count: 1 },
    ]);
    expect(metrics.mcpServers).toEqual([{ key: 'files', count: 1 }]);
    expect(metrics.topNoneSignals).toEqual([
      { key: 'heredoc', count: 1 },
      { key: 'inline_code', count: 1 },
      { key: 'parse_error', count: 1 },
    ]);
    expect(metrics.redactionsByKind).toEqual([
      { key: 'token', count: 3 },
      { key: 'email', count: 1 },
    ]);
  });

  test('computes ratios and throughput from the counts', () => {
    expect(metrics.bashRatio).toBeCloseTo(4 / 6, 10);
    expect(metrics.compoundRatio).toBeCloseTo(1 / 5, 10);
    expect(metrics.inlineProgramRatio).toBeCloseTo(2 / 6, 10);
    expect(metrics.parseErrorRatio).toBeCloseTo(1 / 6, 10);
    expect(metrics.unparsedLineRatio).toBeCloseTo(0.05, 10);
    expect(metrics.classifyActionsPerSecond).toBeCloseTo(6, 10);
  });
});

describe('selectSamples', () => {
  test('selects full Bash actions, none actions, and none programs', () => {
    const samples = selectSamples(actions, meta);
    expect(samples.full.map((record) => record.actionKey)).toEqual(['a1', 'a6']);
    expect(samples.none.map((record) => record.actionKey)).toEqual(['a2', 'a3']);
    expect(samples.noneTopPrograms).toEqual([{ key: 'python3', count: 1 }]);
  });
});
