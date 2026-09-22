import type { Analyzability, Operation } from '@authority/action/schema';
import type { ActionForReplay, ParsedSession } from '@authority/trace/schema';

export interface ActionMeta {
  readonly toolName: string;
  readonly isSidechain: boolean;
  readonly toolInputRedacted: string;
}

export interface MeasureInput {
  readonly sessions: readonly ParsedSession[];
  readonly actions: readonly ActionForReplay[];
  readonly duplicateCount: number;
  readonly meta: ReadonlyMap<string, ActionMeta>;
  readonly classifyMs: number;
  readonly readFailureFiles: number;
  readonly toolUseWithoutTimestamp: number;
}

export interface ObservedOutcomeCounts {
  readonly executed: number;
  readonly rejected_by_human: number;
  readonly blocked_by_runtime: number;
  readonly unknown: number;
}

export interface Count {
  readonly key: string;
  readonly count: number;
}

export interface AnalyzabilityCounts {
  readonly full: number;
  readonly partial: number;
  readonly none: number;
}

export interface Metrics {
  readonly sessions: number;
  readonly toolCallsBeforeDedup: number;
  readonly actionsAfterDedup: number;
  readonly duplicateCount: number;
  readonly evaluatedActions: number;
  readonly excludedActions: number;
  readonly excludedByTool: readonly Count[];
  readonly toolDistribution: readonly Count[];
  readonly bashActions: number;
  readonly bashRatio: number;
  readonly sidechainActions: number;
  readonly sidechainRatio: number;
  readonly analyzabilityByAction: AnalyzabilityCounts;
  readonly analyzabilityByBashAction: AnalyzabilityCounts;
  readonly analyzabilityByOperation: AnalyzabilityCounts;
  readonly topPrograms: readonly Count[];
  readonly compoundActions: number;
  readonly compoundRatio: number;
  readonly inlineProgramOperations: number;
  readonly inlineProgramRatio: number;
  readonly parseErrorOperations: number;
  readonly parseErrorRatio: number;
  readonly unparsedLines: number;
  readonly totalLines: number;
  readonly unparsedLineRatio: number;
  readonly redactionsByKind: readonly Count[];
  readonly humanRejectedActions: number;
  readonly observedOutcomes: ObservedOutcomeCounts;
  readonly operationsByCapability: readonly Count[];
  readonly operationsByTargetKind: readonly Count[];
  readonly bashInputLengthMedian: number;
  readonly bashInputLengthP90: number;
  readonly inputTruncatedCount: number;
  readonly toolUseWithoutTimestamp: number;
  readonly readFailureFiles: number;
  readonly mcpServers: readonly Count[];
  readonly classifyActionsPerSecond: number;
  readonly topNoneSignals: readonly Count[];
}

const ANALYZABILITY_RANK: Record<Analyzability, number> = { full: 0, partial: 1, none: 2 };
const INLINE_SIGNALS: ReadonlySet<string> = new Set(['inline_code', 'heredoc']);

function ratio(part: number, whole: number): number {
  return whole === 0 ? 0 : part / whole;
}

// Nearest-rank percentile over a copy sorted ascending; 0 when empty.
function percentile(values: readonly number[], fraction: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil(fraction * sorted.length);
  const index = Math.min(sorted.length - 1, Math.max(0, rank - 1));
  return sorted[index] ?? 0;
}

function topCounts(counts: ReadonlyMap<string, number>, limit: number): Count[] {
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => (b.count - a.count !== 0 ? b.count - a.count : a.key < b.key ? -1 : 1))
    .slice(0, limit);
}

function increment(counts: Map<string, number>, key: string): void {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

export function actionAnalyzability(operations: readonly Operation[]): Analyzability {
  return operations.reduce<Analyzability>(
    (worst, operation) =>
      ANALYZABILITY_RANK[operation.analyzability] > ANALYZABILITY_RANK[worst]
        ? operation.analyzability
        : worst,
    'full',
  );
}

function tallyAnalyzability(values: readonly Analyzability[]): AnalyzabilityCounts {
  return {
    full: values.filter((value) => value === 'full').length,
    partial: values.filter((value) => value === 'partial').length,
    none: values.filter((value) => value === 'none').length,
  };
}

export function computeMetrics(input: MeasureInput): Metrics {
  const { sessions, actions, meta } = input;

  const toolCallsBeforeDedup = sessions.reduce((sum, session) => sum + session.toolCalls.length, 0);
  const evaluated = actions.filter((action) => action.operations.length > 0);
  const excluded = actions.filter((action) => action.operations.length === 0);

  const toolDistribution = new Map<string, number>();
  const excludedByTool = new Map<string, number>();
  const programs = new Map<string, number>();
  const mcpServers = new Map<string, number>();
  const noneSignals = new Map<string, number>();
  const operationsByCapability = new Map<string, number>();
  const operationsByTargetKind = new Map<string, number>();
  const observedOutcomes: Record<string, number> = {
    executed: 0,
    rejected_by_human: 0,
    blocked_by_runtime: 0,
    unknown: 0,
  };
  const operationAnalyzability: Analyzability[] = [];
  const actionAnalyzabilityValues: Analyzability[] = [];
  const bashActionAnalyzability: Analyzability[] = [];

  let bashActions = 0;
  let sidechainActions = 0;
  let compoundActions = 0;
  let inlineProgramOperations = 0;
  let parseErrorOperations = 0;
  let humanRejectedActions = 0;

  const toolOf = (actionKey: string): string => meta.get(actionKey)?.toolName ?? 'unknown';

  for (const action of actions) {
    const tool = toolOf(action.actionKey);
    increment(toolDistribution, tool);
    if (tool === 'Bash') {
      bashActions++;
    }
    if (meta.get(action.actionKey)?.isSidechain === true) {
      sidechainActions++;
    }
    if (action.observedOutcome === 'rejected_by_human') {
      humanRejectedActions++;
    }
    observedOutcomes[action.observedOutcome] = (observedOutcomes[action.observedOutcome] ?? 0) + 1;
    if (action.operations.length === 0) {
      increment(excludedByTool, tool);
      continue;
    }
    if (action.operations.length >= 2) {
      compoundActions++;
    }
    const worst = actionAnalyzability(action.operations);
    actionAnalyzabilityValues.push(worst);
    if (tool === 'Bash') {
      bashActionAnalyzability.push(worst);
    }
    for (const operation of action.operations) {
      operationAnalyzability.push(operation.analyzability);
      increment(operationsByCapability, operation.capability);
      increment(operationsByTargetKind, operation.target.kind);
      if (operation.program !== null) {
        increment(programs, operation.program);
      }
      if (operation.target.kind === 'mcp') {
        increment(mcpServers, operation.target.server);
      }
      if (operation.signals.some((signal) => INLINE_SIGNALS.has(signal))) {
        inlineProgramOperations++;
      }
      if (operation.signals.includes('parse_error')) {
        parseErrorOperations++;
      }
      if (operation.analyzability === 'none') {
        for (const signal of operation.signals) {
          increment(noneSignals, signal);
        }
      }
    }
  }

  const redactions = new Map<string, number>();
  for (const session of sessions) {
    for (const entry of session.redactions) {
      redactions.set(entry.kind, (redactions.get(entry.kind) ?? 0) + entry.count);
    }
  }
  const unparsedLines = sessions.reduce((sum, session) => sum + session.unparsedLineCount, 0);
  const totalLines = sessions.reduce((sum, session) => sum + session.totalLineCount, 0);
  const totalOperations = operationAnalyzability.length;

  const bashInputLengths: number[] = [];
  let inputTruncatedCount = 0;
  for (const session of sessions) {
    for (const toolCall of session.toolCalls) {
      if (toolCall.toolName === 'Bash') {
        bashInputLengths.push(toolCall.toolInputRedacted.length);
      }
      if (toolCall.isInputTruncated) {
        inputTruncatedCount++;
      }
    }
  }

  return {
    sessions: sessions.length,
    toolCallsBeforeDedup,
    actionsAfterDedup: actions.length,
    duplicateCount: input.duplicateCount,
    evaluatedActions: evaluated.length,
    excludedActions: excluded.length,
    excludedByTool: topCounts(excludedByTool, excludedByTool.size),
    toolDistribution: topCounts(toolDistribution, toolDistribution.size),
    bashActions,
    bashRatio: ratio(bashActions, actions.length),
    sidechainActions,
    sidechainRatio: ratio(sidechainActions, actions.length),
    analyzabilityByAction: tallyAnalyzability(actionAnalyzabilityValues),
    analyzabilityByBashAction: tallyAnalyzability(bashActionAnalyzability),
    analyzabilityByOperation: tallyAnalyzability(operationAnalyzability),
    topPrograms: topCounts(programs, 30),
    compoundActions,
    compoundRatio: ratio(compoundActions, evaluated.length),
    inlineProgramOperations,
    inlineProgramRatio: ratio(inlineProgramOperations, totalOperations),
    parseErrorOperations,
    parseErrorRatio: ratio(parseErrorOperations, totalOperations),
    unparsedLines,
    totalLines,
    unparsedLineRatio: ratio(unparsedLines, totalLines),
    redactionsByKind: topCounts(redactions, redactions.size),
    humanRejectedActions,
    observedOutcomes: {
      executed: observedOutcomes.executed ?? 0,
      rejected_by_human: observedOutcomes.rejected_by_human ?? 0,
      blocked_by_runtime: observedOutcomes.blocked_by_runtime ?? 0,
      unknown: observedOutcomes.unknown ?? 0,
    },
    operationsByCapability: topCounts(operationsByCapability, operationsByCapability.size),
    operationsByTargetKind: topCounts(operationsByTargetKind, operationsByTargetKind.size),
    bashInputLengthMedian: percentile(bashInputLengths, 0.5),
    bashInputLengthP90: percentile(bashInputLengths, 0.9),
    inputTruncatedCount,
    toolUseWithoutTimestamp: input.toolUseWithoutTimestamp,
    readFailureFiles: input.readFailureFiles,
    mcpServers: topCounts(mcpServers, mcpServers.size),
    classifyActionsPerSecond:
      input.classifyMs === 0 ? 0 : (actions.length * 1000) / input.classifyMs,
    topNoneSignals: topCounts(noneSignals, 20),
  };
}
