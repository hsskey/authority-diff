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

function metaEntry(toolName: string, isSidechain: boolean, actionKey: string): ActionMeta {
  return { toolName, isSidechain, toolInputRedacted: `input-${actionKey}` };
}

const meta = new Map<string, ActionMeta>([
  ['a1', metaEntry('Bash', false, 'a1')],
  ['a2', metaEntry('Bash', false, 'a2')],
  ['a3', metaEntry('Bash', false, 'a3')],
  ['a4', metaEntry('mcp__files__read', false, 'a4')],
  ['a5', metaEntry('Task', true, 'a5')],
  ['a6', metaEntry('Bash', false, 'a6')],
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

  test('carries the redacted tool input on every full and none record', () => {
    const samples = selectSamples(actions, meta);
    expect(samples.full.map((record) => record.toolInputRedacted)).toEqual([
      'input-a1',
      'input-a6',
    ]);
    expect(samples.none.map((record) => record.toolInputRedacted)).toEqual([
      'input-a2',
      'input-a3',
    ]);
  });

  test('emits excluded records per tool with the redacted input', () => {
    const samples = selectSamples(actions, meta);
    expect(samples.excluded).toEqual([{ toolName: 'Task', toolInputRedacted: 'input-a5' }]);
  });

  test('caps excluded records at three per tool', () => {
    const excludedActions: ActionForReplay[] = Array.from({ length: 5 }, (_value, i) =>
      action(`t${i}`, '2026-01-02T03:04:05.000Z', []),
    ).concat(action('b0', '2026-01-02T03:04:05.000Z', []));
    const excludedMeta = new Map<string, ActionMeta>([
      ...excludedActions
        .slice(0, 5)
        .map((record): [string, ActionMeta] => [
          record.actionKey,
          metaEntry('Task', true, record.actionKey),
        ]),
      ['b0', metaEntry('Bash', false, 'b0')],
    ]);
    const samples = selectSamples(excludedActions, excludedMeta);
    expect(samples.excluded.filter((record) => record.toolName === 'Task')).toHaveLength(3);
    expect(samples.excluded.filter((record) => record.toolName === 'Bash')).toHaveLength(1);
  });

  test('tallies noneTopPrograms over the whole population, not the 50-record sample', () => {
    const many: ActionForReplay[] = Array.from({ length: 60 }, (_value, i) => {
      const key = String(i).padStart(2, '0');
      const program = i < 50 ? 'common' : 'rareprog';
      return action(key, '2026-01-02T03:04:05.000Z', [
        op(0, 'execute', UNKNOWN, 'none', program, ['parse_error']),
      ]);
    });
    const manyMeta = new Map<string, ActionMeta>(
      many.map((record) => [record.actionKey, metaEntry('Bash', false, record.actionKey)]),
    );
    const samples = selectSamples(many, manyMeta);
    // The 50 human-reading records are the first 50 by actionKey, all 'common'.
    expect(samples.none).toHaveLength(50);
    // rareprog appears only in records 50-59, outside the sampled 50; a sample-scoped
    // tally would drop it, so its presence proves whole-population aggregation.
    expect(samples.noneTopPrograms).toEqual([
      { key: 'common', count: 50 },
      { key: 'rareprog', count: 10 },
    ]);
  });
});
