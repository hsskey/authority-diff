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
  readonly occurredAt: string;
  readonly operations: readonly SampleOperation[];
}

export interface Samples {
  readonly full: readonly SampleRecord[];
  readonly none: readonly SampleRecord[];
  readonly noneTopPrograms: readonly Count[];
}

const SAMPLE_LIMIT = 50;

function toSample(action: ActionForReplay, toolName: string): SampleRecord {
  return {
    actionKey: action.actionKey,
    toolName,
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
  const toolOf = (actionKey: string): string => meta.get(actionKey)?.toolName ?? 'unknown';
  const evaluated = actions.filter((action) => action.operations.length > 0);

  const full = [...evaluated]
    .filter(
      (action) =>
        toolOf(action.actionKey) === 'Bash' && actionAnalyzability(action.operations) === 'full',
    )
    .sort(byActionKey)
    .slice(0, SAMPLE_LIMIT)
    .map((action) => toSample(action, toolOf(action.actionKey)));

  const noneActions = [...evaluated]
    .filter((action) => actionAnalyzability(action.operations) === 'none')
    .sort(byActionKey);
  const none = noneActions
    .slice(0, SAMPLE_LIMIT)
    .map((action) => toSample(action, toolOf(action.actionKey)));

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

  return { full, none, noneTopPrograms };
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
    `| human-rejected actions | ${metrics.humanRejectedActions} |`,
    `| classify actions/sec | ${metrics.classifyActionsPerSecond.toFixed(1)} |`,
    `| analyzability by action (full/partial/none) | ${a.full}/${a.partial}/${a.none} |`,
    `| analyzability by bash action (full/partial/none) | ${b.full}/${b.partial}/${b.none} |`,
    `| analyzability by operation (full/partial/none) | ${o.full}/${o.partial}/${o.none} |`,
    '',
  ].join('\n');

  return [
    overview,
    countTable('tool distribution', metrics.toolDistribution),
    countTable('excluded by tool', metrics.excludedByTool),
    countTable('top programs', metrics.topPrograms),
    countTable('redactions by kind', metrics.redactionsByKind),
    countTable('mcp servers', metrics.mcpServers),
    countTable('top none signals', metrics.topNoneSignals),
  ].join('\n');
}
