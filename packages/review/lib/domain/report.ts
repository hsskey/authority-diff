import { foldHomePaths } from '@authority/kernel';
import type { Effect, IsoTimestamp } from '@authority/kernel';
import { UNGUARDED_PERMISSION_MODES } from '@authority/replay/schema';
import type {
  AdoptionEffect,
  AdoptionStats,
  PermissionModeCount,
  ReplayStats,
} from '@authority/replay/schema';
import type { ChangeReviewStatus, Verdict } from '../../schema.ts';

/**
 * The two headline-wording fixes (R3) live in replay's headline rendering, so
 * this report reproduces each group's `headline` as given and never rewrites
 * it beyond folding home directories to `~`. The report deliberately carries
 * no raw command text, `ruleId`, or regex:
 * only plain-language headlines, Target key summaries, counts, transitions,
 * operation-level widening while Action Effect is unchanged, Verdicts, hashes,
 * the Decision Record's audit chain sequence and hash, and the reviewer
 * (docs/cutline.md section 5, item 9).
 */
export interface ReportTransition {
  readonly from: Effect;
  readonly to: Effect;
  readonly count: number;
}

export interface ReportTarget {
  readonly key: string;
  readonly count: number;
}

export interface ReportGroup {
  readonly direction: 'widening' | 'narrowing';
  readonly headline: string;
  readonly fromEffect: Effect;
  readonly toEffect: Effect;
  readonly actionCount: number;
  readonly targetSummary: readonly ReportTarget[];
  readonly verdict: Verdict | null;
}

export interface ReportDecision {
  readonly decision: 'accept' | 'reject';
  readonly reviewerName: string;
  readonly decidedAt: IsoTimestamp;
  readonly note: string;
  readonly sequence: number;
  readonly hash: string;
  readonly replayInputsHash: string;
  readonly replayResultHash: string;
}

/** The review window's Actions counted by the source of their Trace Import. */
export interface TraceSourceCounts {
  readonly transcript: number;
  readonly hook: number;
  readonly synthetic: number;
}

/** The top of the audit chain when the report was generated: the latest Decision Record across all reviews. */
export interface AuditTail {
  readonly sequence: number;
  readonly hash: string;
}

/**
 * The most recent completed conformance run as the report shows it: the run's
 * identity, so the reader can tell it from the review's own replay, and its
 * Action counts per runtime permission mode.
 */
export interface ReportConformance {
  readonly replayRunId: string;
  readonly policyVersionId: string;
  readonly windowFrom: IsoTimestamp;
  readonly windowTo: IsoTimestamp;
  readonly byPermissionMode: readonly PermissionModeCount[];
}

export interface ReportInput {
  readonly changeReviewId: string;
  readonly status: ChangeReviewStatus;
  readonly baselineContentHash: string;
  readonly candidateContentHash: string;
  readonly windowFrom: IsoTimestamp;
  readonly windowTo: IsoTimestamp;
  readonly traceSources: TraceSourceCounts;
  readonly evaluatedActions: number | null;
  readonly changedActions: number | null;
  readonly analyzabilityNoneCount: number | null;
  readonly transitions: readonly ReportTransition[] | null;
  readonly operationWidening: ReplayStats['operationWidening'] | null;
  readonly groups: readonly ReportGroup[];
  readonly conformance: ReportConformance | null;
  readonly decision: ReportDecision | null;
  readonly auditTail: AuditTail | null;
}

/** An Adoption Group as the report shows it: the headline, counts, Targets, and Verdict. */
export interface AdoptionReportGroup {
  readonly effect: AdoptionEffect;
  readonly headline: string;
  readonly actionCount: number;
  readonly sessionCount: number;
  readonly targetSummary: readonly ReportTarget[];
  readonly verdict: Verdict | null;
}

/** `stats` is null until the adoption run completes. */
export interface AdoptionReportInput {
  readonly changeReviewId: string;
  readonly status: ChangeReviewStatus;
  readonly candidateContentHash: string;
  readonly windowFrom: IsoTimestamp;
  readonly windowTo: IsoTimestamp;
  readonly traceSources: TraceSourceCounts;
  readonly stats: AdoptionStats | null;
  readonly groups: readonly AdoptionReportGroup[];
  readonly decision: ReportDecision | null;
  readonly auditTail: AuditTail | null;
}

const EFFECTS: readonly Effect[] = ['allow', 'ask', 'deny'];

const EFFECT_LABEL: Record<Effect, string> = {
  allow: 'allow',
  ask: 'ask',
  deny: 'deny',
};

type VerdictLabel = Record<Verdict, string>;

/** The same words the review screens use for each kind's Verdict. */
const CHANGE_VERDICT_LABEL: VerdictLabel = {
  expected: 'Expected change',
  investigate: 'Needs investigation',
  unexpected: 'Unexpected',
};

const ADOPTION_VERDICT_LABEL: VerdictLabel = {
  expected: 'Intended restriction',
  investigate: 'On hold',
  unexpected: 'Policy needs revision',
};

const DIRECTION_LABEL: Record<'widening' | 'narrowing', string> = {
  widening: 'Widening',
  narrowing: 'Narrowing',
};

type DecisionLabel = Record<'accept' | 'reject', string>;

const CHANGE_DECISION_LABEL: DecisionLabel = {
  accept: 'Policy change accepted',
  reject: 'Policy change rejected',
};

const ADOPTION_DECISION_LABEL: DecisionLabel = {
  accept: 'First policy adopted',
  reject: 'First policy rejected',
};

const FIXED_NOTICE = [
  '> This record states that the policy change was reviewed against the past records above.',
  '> Authority Diff did not deploy or enforce the policy and did not measure whether the runtime behaves as the policy says.',
].join('\n');

const ADOPTION_NOTICE =
  '> These figures apply the policy to past behavior; they do not reconstruct what the runtime approved at the time.';

function ratio(part: number, whole: number): string {
  if (whole === 0) {
    return '0%';
  }
  return `${((part / whole) * 100).toFixed(1)}%`;
}

/** The fixed provenance line; `hook` appears only when some Action came from a hook import. */
function renderTraceSources(counts: TraceSourceCounts): string {
  const line = `Record sources: real transcript ${counts.transcript} / synthetic ${counts.synthetic}`;
  return counts.hook === 0 ? line : `${line} / hook ${counts.hook}`;
}

function renderTarget(target: ReportTarget): string {
  return `${foldHomePaths(target.key)} (${target.count})`;
}

function verdictLabel(verdict: Verdict | null, label: VerdictLabel): string {
  return verdict === null ? 'Unreviewed' : label[verdict];
}

function renderNoneRatio(input: ReportInput): string {
  if (input.evaluatedActions === null) {
    return 'No analysis figures yet because the replay has not completed.';
  }
  const changed = input.changedActions ?? 0;
  const none = input.analyzabilityNoneCount ?? 0;
  return [
    `- Analyzed Actions: ${input.evaluatedActions}`,
    `- Actions whose Effect changed: ${changed}`,
    `- Of those, analyzability none: ${none} (${ratio(none, changed)})`,
  ].join('\n');
}

function renderOperationWidening(rows: ReplayStats['operationWidening'] | null): string {
  if (rows === null) {
    return 'No Operation-level widening table yet because the replay has not completed.';
  }
  const table = [
    '| Capability | Baseline Zone | Candidate Zone | Count |',
    '| --- | --- | --- | --- |',
    ...rows.map((row) => `| ${row.capability} | ${row.fromZone} | ${row.toZone} | ${row.count} |`),
  ];
  return table.join('\n');
}

function renderTransitions(transitions: readonly ReportTransition[] | null): string {
  if (transitions === null || transitions.length === 0) {
    return 'No transition table yet because the replay has not completed.';
  }
  const rows = transitions
    .filter((transition) => transition.count > 0)
    .map(
      (transition) =>
        `| ${EFFECT_LABEL[transition.from]} | ${EFFECT_LABEL[transition.to]} | ${transition.count} |`,
    );
  if (rows.length === 0) {
    return 'No Action changed Effect.';
  }
  return ['| Baseline | Candidate | Count |', '| --- | --- | --- |', ...rows].join('\n');
}

function renderGroup(group: ReportGroup): string {
  const lines = [
    `#### ${foldHomePaths(group.headline)}`,
    '',
    `- Direction: ${DIRECTION_LABEL[group.direction]}`,
    `- Effect: ${EFFECT_LABEL[group.fromEffect]} → ${EFFECT_LABEL[group.toEffect]}`,
    `- Actions: ${group.actionCount}`,
    `- Verdict: ${verdictLabel(group.verdict, CHANGE_VERDICT_LABEL)}`,
  ];
  if (group.targetSummary.length > 0) {
    lines.push('- Target Summary:');
    for (const target of group.targetSummary) {
      lines.push(`  - ${renderTarget(target)}`);
    }
  }
  return lines.join('\n');
}

function renderGroups(groups: readonly ReportGroup[]): string {
  if (groups.length === 0) {
    return 'No Diff Group changed Effect.';
  }
  const widening = groups.filter((group) => group.direction === 'widening');
  const narrowing = groups.filter((group) => group.direction === 'narrowing');
  const sections: string[] = [];
  if (widening.length > 0) {
    sections.push('### Widening Diff Groups', '', widening.map(renderGroup).join('\n\n'));
  }
  if (narrowing.length > 0) {
    sections.push('### Narrowing Diff Groups', '', narrowing.map(renderGroup).join('\n\n'));
  }
  return sections.join('\n');
}

function sumActions(rows: readonly PermissionModeCount[]): number {
  return rows.reduce((sum, row) => sum + row.actionCount, 0);
}

function renderConformance(conformance: ReportConformance | null): string {
  if (conformance === null) {
    return 'No permission mode table because no conformance run has completed.';
  }
  const rows = conformance.byPermissionMode;
  const lines = [
    `- Conformance Replay Run: \`${conformance.replayRunId}\``,
    `- Policy Version: \`${conformance.policyVersionId}\``,
    `- Observation window: ${conformance.windowFrom} ~ ${conformance.windowTo}`,
  ];
  if (rows.length === 0) {
    return [...lines, '- This run has no permission mode breakdown.'].join('\n');
  }
  const total = sumActions(rows);
  const unguarded = sumActions(
    rows.filter((row) => UNGUARDED_PERMISSION_MODES.includes(row.permissionMode)),
  );
  return [
    ...lines,
    `- Actions that can run without a guard (${UNGUARDED_PERMISSION_MODES.join(', ')}): ${unguarded} (${ratio(unguarded, total)})`,
    '',
    '| permission mode | Actions | Actions with findings |',
    '| --- | --- | --- |',
    ...rows.map((row) => `| ${row.permissionMode} | ${row.actionCount} | ${row.findingCount} |`),
  ].join('\n');
}

function renderDecision(decision: ReportDecision | null, label: DecisionLabel): string {
  if (decision === null) {
    return 'Not decided yet.';
  }
  return [
    `- Decision: ${label[decision.decision]}`,
    `- Reviewer: ${decision.reviewerName}`,
    `- Decided at: ${decision.decidedAt}`,
    `- Note: ${decision.note === '' ? '(none)' : decision.note}`,
    `- Decision Record sequence: ${decision.sequence}`,
    `- Decision Record hash: \`${decision.hash}\``,
  ].join('\n');
}

function renderAuditTail(tail: AuditTail | null): string {
  if (tail === null) {
    return 'No decision recorded yet.';
  }
  return [
    `- Audit chain sequence when the report was generated: ${tail.sequence}`,
    `- Audit chain hash when the report was generated: \`${tail.hash}\``,
  ].join('\n');
}

function renderReplayHashes(decision: ReportDecision | null): string[] {
  if (decision === null) {
    return [];
  }
  return [
    `- Replay inputsHash: \`${decision.replayInputsHash}\``,
    `- Replay resultHash: \`${decision.replayResultHash}\``,
  ];
}

/** Renders a change review's Evidence Report as Markdown. */
export function renderReport(input: ReportInput): string {
  return [
    '# Evidence Report',
    '',
    `Change Review \`${input.changeReviewId}\``,
    '',
    renderTraceSources(input.traceSources),
    '',
    '## Policy Versions',
    '',
    `- Baseline Policy Version contentHash: \`${input.baselineContentHash}\``,
    `- Candidate Policy Version contentHash: \`${input.candidateContentHash}\``,
    ...renderReplayHashes(input.decision),
    '',
    '## Review window',
    '',
    `- ${input.windowFrom} ~ ${input.windowTo}`,
    '',
    '## Analysis size',
    '',
    renderNoneRatio(input),
    '',
    '## Effect transitions',
    '',
    renderTransitions(input.transitions),
    '',
    '## Operation-level widening with the Action Effect unchanged',
    '',
    renderOperationWidening(input.operationWidening),
    '',
    '## Diff Groups and Verdicts',
    '',
    renderGroups(input.groups),
    '',
    '## Conformance: Actions by permission mode',
    '',
    renderConformance(input.conformance),
    '',
    '## Decision',
    '',
    renderDecision(input.decision, CHANGE_DECISION_LABEL),
    '',
    '## Audit chain',
    '',
    renderAuditTail(input.auditTail),
    '',
    '## Notice',
    '',
    FIXED_NOTICE,
    '',
  ].join('\n');
}

function renderAdoptionScale(stats: AdoptionStats | null): string {
  if (stats === null) {
    return 'No analysis figures yet because the replay has not completed.';
  }
  const none = stats.analyzability.none;
  return [
    `- Analyzed Actions: ${stats.evaluatedActions} (total ${stats.totalActions}, excluded ${stats.excludedActions})`,
    `- Of those, analyzability none: ${none} (${ratio(none, stats.evaluatedActions)})`,
  ].join('\n');
}

function renderEffectCounts(stats: AdoptionStats | null): string {
  if (stats === null) {
    return 'No Effect table yet because the replay has not completed.';
  }
  const rows = EFFECTS.map((effect) => {
    const count = stats.effectCounts[effect];
    return `| ${EFFECT_LABEL[effect]} | ${count} | ${ratio(count, stats.evaluatedActions)} |`;
  });
  return ['| Effect | Actions | Share |', '| --- | --- | --- |', ...rows].join('\n');
}

function renderAdoptionGroupTable(
  groups: readonly AdoptionReportGroup[],
  effect: AdoptionEffect,
): string {
  const rows = groups.filter((group) => group.effect === effect);
  if (rows.length === 0) {
    return `No '${EFFECT_LABEL[effect]}' Adoption Group.`;
  }
  return [
    '| Adoption Group | Actions | Sessions | Target Summary | Verdict |',
    '| --- | --- | --- | --- | --- |',
    ...rows.map((group) => {
      const targets = group.targetSummary.map(renderTarget).join(', ');
      return `| ${foldHomePaths(group.headline)} | ${group.actionCount} | ${group.sessionCount} | ${targets} | ${verdictLabel(group.verdict, ADOPTION_VERDICT_LABEL)} |`;
    }),
  ].join('\n');
}

/**
 * Renders an adoption review's Evidence Report as Markdown: the candidate's
 * hash, the window, the analysis size, the Effect counts and rates, one table
 * per reviewed Effect with each group's Verdict, the decision, and the notices.
 */
export function renderAdoptionReport(input: AdoptionReportInput): string {
  return [
    '# Evidence Report',
    '',
    `Adoption Review \`${input.changeReviewId}\``,
    '',
    renderTraceSources(input.traceSources),
    '',
    '## Policy Versions',
    '',
    `- Candidate Policy Version contentHash: \`${input.candidateContentHash}\``,
    ...renderReplayHashes(input.decision),
    '',
    '## Review window',
    '',
    `- ${input.windowFrom} ~ ${input.windowTo}`,
    '',
    '## Analysis size',
    '',
    renderAdoptionScale(input.stats),
    '',
    '## Effects under the policy',
    '',
    renderEffectCounts(input.stats),
    '',
    "## 'ask' Adoption Groups and Verdicts",
    '',
    renderAdoptionGroupTable(input.groups, 'ask'),
    '',
    "## 'deny' Adoption Groups and Verdicts",
    '',
    renderAdoptionGroupTable(input.groups, 'deny'),
    '',
    '## Decision',
    '',
    renderDecision(input.decision, ADOPTION_DECISION_LABEL),
    '',
    '## Audit chain',
    '',
    renderAuditTail(input.auditTail),
    '',
    '## Notice',
    '',
    FIXED_NOTICE,
    ADOPTION_NOTICE,
    '',
  ].join('\n');
}
