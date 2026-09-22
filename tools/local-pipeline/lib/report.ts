import type { Operation } from '@authority/action/schema';
import type { ActionForReplay } from '@authority/trace/schema';
import { actionAnalyzability, type ActionMeta, type Count, type Metrics } from './aggregate.ts';

export interface SampleOperation {
  readonly capability: string;
  readonly program: string | null;
  readonly targetKind: string;
  readonly analyzability: string;
  readonly signals: readonly string[];
  readonly fragment: string;
}

export interface SampleRecord {
  readonly actionKey: string;
  readonly toolName: string;
  readonly toolInputRedacted: string;
  readonly occurredAt: string;
  readonly operations: readonly SampleOperation[];
}

export interface ExcludedRecord {
  readonly toolName: string;
  readonly toolInputRedacted: string;
}

export interface Samples {
  readonly full: readonly SampleRecord[];
  readonly none: readonly SampleRecord[];
  readonly excluded: readonly ExcludedRecord[];
  readonly noneTopPrograms: readonly Count[];
}

const SAMPLE_LIMIT = 50;
const EXCLUDED_PER_TOOL = 3;

const UNKNOWN_META: ActionMeta = { toolName: 'unknown', isSidechain: false, toolInputRedacted: '' };

function toSample(action: ActionForReplay, meta: ActionMeta): SampleRecord {
  return {
    actionKey: action.actionKey,
    toolName: meta.toolName,
    toolInputRedacted: meta.toolInputRedacted,
    occurredAt: action.occurredAt,
    operations: action.operations.map((operation: Operation) => ({
      capability: operation.capability,
      program: operation.program,
      targetKind: operation.target.kind,
      analyzability: operation.analyzability,
      signals: operation.signals,
      fragment: operation.fragment,
    })),
  };
}

function byActionKey(a: ActionForReplay, b: ActionForReplay): number {
  return a.actionKey < b.actionKey ? -1 : a.actionKey > b.actionKey ? 1 : 0;
}

export function selectSamples(
  actions: readonly ActionForReplay[],
  meta: ReadonlyMap<string, ActionMeta>,
): Samples {
  const metaOf = (actionKey: string): ActionMeta => meta.get(actionKey) ?? UNKNOWN_META;
  const evaluated = actions.filter((action) => action.operations.length > 0);

  const full = [...evaluated]
    .filter(
      (action) =>
        metaOf(action.actionKey).toolName === 'Bash' &&
        actionAnalyzability(action.operations) === 'full',
    )
    .sort(byActionKey)
    .slice(0, SAMPLE_LIMIT)
    .map((action) => toSample(action, metaOf(action.actionKey)));

  const noneActions = [...evaluated]
    .filter((action) => actionAnalyzability(action.operations) === 'none')
    .sort(byActionKey);
  const none = noneActions
    .slice(0, SAMPLE_LIMIT)
    .map((action) => toSample(action, metaOf(action.actionKey)));

  const excludedByTool = new Map<string, ExcludedRecord[]>();
  for (const action of [...actions].sort(byActionKey)) {
    if (action.operations.length > 0) {
      continue;
    }
    const entry = metaOf(action.actionKey);
    const bucket = excludedByTool.get(entry.toolName) ?? [];
    if (bucket.length < EXCLUDED_PER_TOOL) {
      bucket.push({ toolName: entry.toolName, toolInputRedacted: entry.toolInputRedacted });
      excludedByTool.set(entry.toolName, bucket);
    }
  }
  const excluded = [...excludedByTool.keys()]
    .sort()
    .flatMap((toolName) => excludedByTool.get(toolName) ?? []);

  const programs = new Map<string, number>();
  for (const action of noneActions) {
    for (const operation of action.operations) {
      if (operation.program !== null) {
        programs.set(operation.program, (programs.get(operation.program) ?? 0) + 1);
      }
    }
  }
  const noneTopPrograms = [...programs.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => (b.count - a.count !== 0 ? b.count - a.count : a.key < b.key ? -1 : 1))
    .slice(0, 5);

  return { full, none, excluded, noneTopPrograms };
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function countTable(title: string, counts: readonly Count[]): string {
  const rows = counts.map((entry) => `| ${entry.key} | ${entry.count} |`).join('\n');
  return `### ${title}\n\n| key | count |\n| --- | --- |\n${rows}\n`;
}

export function renderMeasureMarkdown(metrics: Metrics): string {
  const a = metrics.analyzabilityByAction;
  const b = metrics.analyzabilityByBashAction;
  const o = metrics.analyzabilityByOperation;
  const overview = [
    '# measure',
    '',
    '| metric | value |',
    '| --- | --- |',
    `| sessions | ${metrics.sessions} |`,
    `| tool calls before dedup | ${metrics.toolCallsBeforeDedup} |`,
    `| actions after dedup | ${metrics.actionsAfterDedup} |`,
    `| duplicates removed | ${metrics.duplicateCount} |`,
    `| evaluated actions | ${metrics.evaluatedActions} |`,
    `| excluded actions | ${metrics.excludedActions} |`,
    `| bash actions | ${metrics.bashActions} (${pct(metrics.bashRatio)}) |`,
    `| sidechain actions | ${metrics.sidechainActions} (${pct(metrics.sidechainRatio)}) |`,
    `| compound actions | ${metrics.compoundActions} (${pct(metrics.compoundRatio)}) |`,
    `| inline-program operations | ${metrics.inlineProgramOperations} (${pct(metrics.inlineProgramRatio)}) |`,
    `| parse_error operations | ${metrics.parseErrorOperations} (${pct(metrics.parseErrorRatio)}) |`,
    `| unparsed lines | ${metrics.unparsedLines}/${metrics.totalLines} (${pct(metrics.unparsedLineRatio)}) |`,
    `| tool_use without timestamp | ${metrics.toolUseWithoutTimestamp} |`,
    `| read-failure files | ${metrics.readFailureFiles} |`,
    `| input_truncated tool calls | ${metrics.inputTruncatedCount} |`,
    `| bash input length median/p90 | ${metrics.bashInputLengthMedian}/${metrics.bashInputLengthP90} |`,
    `| human-rejected actions | ${metrics.humanRejectedActions} |`,
    `| observed outcomes (executed/rejected/blocked/unknown) | ${metrics.observedOutcomes.executed}/${metrics.observedOutcomes.rejected_by_human}/${metrics.observedOutcomes.blocked_by_runtime}/${metrics.observedOutcomes.unknown} |`,
    `| classify actions/sec | ${metrics.classifyActionsPerSecond.toFixed(1)} |`,
    `| analyzability by action (full/partial/none) | ${a.full}/${a.partial}/${a.none} |`,
    `| analyzability by bash action (full/partial/none) | ${b.full}/${b.partial}/${b.none} |`,
    `| analyzability by operation (full/partial/none) | ${o.full}/${o.partial}/${o.none} |`,
    '',
  ].join('\n');

  return [
    overview,
    countTable('tool distribution', metrics.toolDistribution),
    countTable('operations by capability', metrics.operationsByCapability),
    countTable('operations by target kind', metrics.operationsByTargetKind),
    countTable('excluded by tool', metrics.excludedByTool),
    countTable('top programs', metrics.topPrograms),
    countTable('redactions by kind', metrics.redactionsByKind),
    countTable('mcp servers', metrics.mcpServers),
    countTable('top none signals', metrics.topNoneSignals),
  ].join('\n');
}
