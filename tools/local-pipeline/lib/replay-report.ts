import type { Effect } from '@authority/kernel';
import type { Operation } from '@authority/action/schema';
import type { Decision } from '@authority/policy/schema';
import type { ActionForReplay } from '@authority/trace/schema';
import type { DiffGroup, DiffResult } from '@authority/replay/schema';
import type { ActionMeta } from './aggregate.ts';

export interface ReplayReportInput {
  readonly diff: DiffResult;
  readonly actions: readonly ActionForReplay[];
  readonly baselineContentHash: string;
  readonly candidateContentHash: string;
}

const EFFECT_ORDER: readonly Effect[] = ['allow', 'ask', 'deny'];

// Widening critical first, then widening by descending actionCount, then all
// narrowing groups by descending actionCount. Ties fall back to groupKey.
function compareGroups(a: DiffGroup, b: DiffGroup): number {
  const dir = (g: DiffGroup): number => (g.direction === 'widening' ? 0 : 1);
  if (dir(a) !== dir(b)) {
    return dir(a) - dir(b);
  }
  const crit = (g: DiffGroup): number => (g.severity === 'critical' ? 0 : 1);
  if (crit(a) !== crit(b)) {
    return crit(a) - crit(b);
  }
  if (a.actionCount !== b.actionCount) {
    return b.actionCount - a.actionCount;
  }
  return a.groupKey < b.groupKey ? -1 : a.groupKey > b.groupKey ? 1 : 0;
}

function transitionCell(diff: DiffResult, from: Effect, to: Effect): number {
  return diff.stats.transitions.find((t) => t.from === from && t.to === to)?.count ?? 0;
}

function period(actions: readonly ActionForReplay[]): { first: string; last: string } {
  if (actions.length === 0) {
    return { first: '-', last: '-' };
  }
  let first = actions[0]?.occurredAt ?? '-';
  let last = first;
  for (const action of actions) {
    if (action.occurredAt < first) {
      first = action.occurredAt;
    }
    if (action.occurredAt > last) {
      last = action.occurredAt;
    }
  }
  return { first, last };
}

function targetSummaryTop3(group: DiffGroup): string {
  return (
    group.targetSummary
      .slice(0, 3)
      .map((entry) => `${entry.key}(${String(entry.count)})`)
      .join(', ') || '-'
  );
}

function ruleIds(ids: readonly string[]): string {
  return ids.length === 0 ? '-' : ids.join(', ');
}

export function renderReplayMarkdown(input: ReplayReportInput): string {
  const { diff, actions } = input;
  const { stats } = diff;
  const range = period(actions);

  const header = [
    '# replay-local',
    '',
    '| field | value |',
    '| --- | --- |',
    `| baseline contentHash | ${input.baselineContentHash} |`,
    `| candidate contentHash | ${input.candidateContentHash} |`,
    `| resultHash | ${diff.resultHash} |`,
    `| period | ${range.first} .. ${range.last} |`,
    `| total actions | ${stats.totalActions} |`,
    `| evaluated | ${stats.evaluatedActions} |`,
    `| excluded | ${stats.excludedActions} |`,
    `| changed | ${stats.changedActions} |`,
    '',
  ].join('\n');

  const transitionRows = EFFECT_ORDER.map((from) => {
    const cells = EFFECT_ORDER.map((to) => String(transitionCell(diff, from, to)));
    return `| ${from} | ${cells.join(' | ')} |`;
  });
  const transitions = [
    '## transitions (from -> to)',
    '',
    `| from \\ to | ${EFFECT_ORDER.join(' | ')} |`,
    `| --- | ${EFFECT_ORDER.map(() => '---').join(' | ')} |`,
    ...transitionRows,
    '',
  ].join('\n');

  const wideningRows = stats.operationWidening.map(
    (row) => `| ${row.capability} | ${row.fromZone} | ${row.toZone} | ${String(row.count)} |`,
  );
  const operationWidening = [
    '## Action effect unchanged, operation-level widening',
    '',
    '| capability | fromZone | toZone | count |',
    '| --- | --- | --- | --- |',
    ...wideningRows,
    '',
  ].join('\n');

  const groupHeader =
    '| headline | direction | severity | capability | zone | effect | actions | sessions | top targets | baselineRuleIds | candidateRuleIds | groupKey |';
  const groupDivider = `| ${Array.from({ length: 12 }, () => '---').join(' | ')} |`;
  const groupRows = [...diff.groups].sort(compareGroups).map((group) => {
    return [
      group.headline,
      group.direction,
      group.severity,
      group.capability,
      `${group.fromZone}->${group.toZone}`,
      `${group.fromEffect}->${group.toEffect}`,
      String(group.actionCount),
      String(group.sessionCount),
      targetSummaryTop3(group),
      ruleIds(group.baselineRuleIds),
      ruleIds(group.candidateRuleIds),
      group.groupKey.slice(0, 8),
    ].join(' | ');
  });
  const groups = [
    '## groups',
    '',
    groupHeader,
    groupDivider,
    ...groupRows.map((r) => `| ${r} |`),
    '',
  ].join('\n');

  return [header, transitions, operationWidening, groups].join('\n');
}

export interface GroupSampleAction {
  readonly actionKey: string;
  readonly toolName: string;
  readonly toolInputRedacted: string;
  readonly operations: readonly Operation[];
  readonly baselineDecision: Decision | null;
  readonly candidateDecision: Decision | null;
}

const UNKNOWN_META: ActionMeta = { toolName: 'unknown', isSidechain: false, toolInputRedacted: '' };

/**
 * Builds the per-group Gate 2 sample file: for each Action named in the group's
 * sampleActionKeys, its redacted input, classified Operations, and both
 * Decisions so a human can judge the change.
 */
export function buildGroupSample(
  group: DiffGroup,
  actionsByKey: ReadonlyMap<string, ActionForReplay>,
  meta: ReadonlyMap<string, ActionMeta>,
  evaluateBaseline: (operations: readonly Operation[]) => Decision | null,
  evaluateCandidate: (operations: readonly Operation[]) => Decision | null,
): readonly GroupSampleAction[] {
  const samples: GroupSampleAction[] = [];
  for (const actionKey of group.sampleActionKeys) {
    const action = actionsByKey.get(actionKey);
    if (action === undefined) {
      continue;
    }
    const entry = meta.get(actionKey) ?? UNKNOWN_META;
    samples.push({
      actionKey,
      toolName: entry.toolName,
      toolInputRedacted: entry.toolInputRedacted,
      operations: action.operations,
      baselineDecision: evaluateBaseline(action.operations),
      candidateDecision: evaluateCandidate(action.operations),
    });
  }
  return samples;
}
