import type { Effect, IsoTimestamp } from '@authority/kernel';
import type { AdoptionEffect, AdoptionStats, ReplayStats } from '@authority/replay/schema';
import type { ChangeReviewStatus, Verdict } from '../../schema.ts';

/**
 * The two headline-wording fixes (R3) live in replay's headline rendering, so
 * this report reproduces each group's `headline` as given and never rewrites
 * it. The report deliberately carries no raw command text, `ruleId`, or regex:
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

/** The top of the audit chain when the report was generated: the latest Decision Record across all reviews. */
export interface AuditTail {
  readonly sequence: number;
  readonly hash: string;
}

export interface ReportInput {
  readonly changeReviewId: string;
  readonly status: ChangeReviewStatus;
  readonly baselineContentHash: string;
  readonly candidateContentHash: string;
  readonly windowFrom: IsoTimestamp;
  readonly windowTo: IsoTimestamp;
  readonly evaluatedActions: number | null;
  readonly changedActions: number | null;
  readonly analyzabilityNoneCount: number | null;
  readonly transitions: readonly ReportTransition[] | null;
  readonly operationWidening: ReplayStats['operationWidening'] | null;
  readonly groups: readonly ReportGroup[];
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
  readonly stats: AdoptionStats | null;
  readonly groups: readonly AdoptionReportGroup[];
  readonly decision: ReportDecision | null;
  readonly auditTail: AuditTail | null;
}

const EFFECTS: readonly Effect[] = ['allow', 'ask', 'deny'];

const EFFECT_LABEL: Record<Effect, string> = {
  allow: '허용',
  ask: '확인 필요',
  deny: '차단',
};

const VERDICT_LABEL: Record<Verdict, string> = {
  expected: '예상함',
  investigate: '조사 필요',
  unexpected: '예상 밖',
};

const DIRECTION_LABEL: Record<'widening' | 'narrowing', string> = {
  widening: '넓어짐',
  narrowing: '좁아짐',
};

type DecisionLabel = Record<'accept' | 'reject', string>;

const CHANGE_DECISION_LABEL: DecisionLabel = {
  accept: '정책 변경 수락',
  reject: '정책 변경 반려',
};

const ADOPTION_DECISION_LABEL: DecisionLabel = {
  accept: '최초 정책 채택',
  reject: '최초 정책 반려',
};

const FIXED_NOTICE = [
  '> 이 기록은 정책 변경을 위 과거 기록에 비추어 검토했다는 사실을 남깁니다.',
  '> Authority Diff는 정책을 배포하거나 강제하지 않았고, runtime이 이 정책대로 동작하는지는 측정하지 않았습니다.',
].join('\n');

const ADOPTION_NOTICE =
  '> 이 수치는 과거 행동에 정책을 적용한 결과이며 과거 runtime의 승인 여부를 복원한 것이 아닙니다.';

function ratio(part: number, whole: number): string {
  if (whole === 0) {
    return '0%';
  }
  return `${((part / whole) * 100).toFixed(1)}%`;
}

function verdictLabel(verdict: Verdict | null): string {
  return verdict === null ? '미판정' : VERDICT_LABEL[verdict];
}

function renderNoneRatio(input: ReportInput): string {
  if (input.evaluatedActions === null) {
    return '아직 replay가 완료되지 않아 분석 수치가 없습니다.';
  }
  const changed = input.changedActions ?? 0;
  const none = input.analyzabilityNoneCount ?? 0;
  return [
    `- 분석한 Action: ${input.evaluatedActions}건`,
    `- Effect가 바뀐 Action: ${changed}건`,
    `- 그중 analyzability none: ${none}건 (${ratio(none, changed)})`,
  ].join('\n');
}

function renderOperationWidening(rows: ReplayStats['operationWidening'] | null): string {
  if (rows === null) {
    return '아직 replay가 완료되지 않아 operation-level widening 표가 없습니다.';
  }
  const table = [
    '| capability | fromZone | toZone | count |',
    '| --- | --- | --- | --- |',
    ...rows.map((row) => `| ${row.capability} | ${row.fromZone} | ${row.toZone} | ${row.count} |`),
  ];
  return table.join('\n');
}

function renderTransitions(transitions: readonly ReportTransition[] | null): string {
  if (transitions === null || transitions.length === 0) {
    return '아직 replay가 완료되지 않아 transition 표가 없습니다.';
  }
  const rows = transitions
    .filter((transition) => transition.count > 0)
    .map(
      (transition) =>
        `| ${EFFECT_LABEL[transition.from]} | ${EFFECT_LABEL[transition.to]} | ${transition.count} |`,
    );
  if (rows.length === 0) {
    return 'Effect가 바뀐 Action이 없습니다.';
  }
  return ['| 기준 정책 | 변경안 | 건수 |', '| --- | --- | --- |', ...rows].join('\n');
}

function renderGroup(group: ReportGroup): string {
  const lines = [
    `#### ${group.headline}`,
    '',
    `- 방향: ${DIRECTION_LABEL[group.direction]}`,
    `- Effect: ${EFFECT_LABEL[group.fromEffect]} → ${EFFECT_LABEL[group.toEffect]}`,
    `- Action ${group.actionCount}건`,
    `- Verdict: ${verdictLabel(group.verdict)}`,
  ];
  if (group.targetSummary.length > 0) {
    lines.push('- 주요 Target:');
    for (const target of group.targetSummary) {
      lines.push(`  - ${target.key} (${target.count}건)`);
    }
  }
  return lines.join('\n');
}

function renderGroups(groups: readonly ReportGroup[]): string {
  if (groups.length === 0) {
    return 'Effect가 바뀐 Diff Group이 없습니다.';
  }
  const widening = groups.filter((group) => group.direction === 'widening');
  const narrowing = groups.filter((group) => group.direction === 'narrowing');
  const sections: string[] = [];
  if (widening.length > 0) {
    sections.push('### 넓어진 Diff Group', '', widening.map(renderGroup).join('\n\n'));
  }
  if (narrowing.length > 0) {
    sections.push('### 좁아진 Diff Group', '', narrowing.map(renderGroup).join('\n\n'));
  }
  return sections.join('\n');
}

function renderDecision(decision: ReportDecision | null, label: DecisionLabel): string {
  if (decision === null) {
    return '아직 결정되지 않았습니다.';
  }
  return [
    `- 결정: ${label[decision.decision]}`,
    `- 검토자: ${decision.reviewerName}`,
    `- 시각: ${decision.decidedAt}`,
    `- 메모: ${decision.note === '' ? '(없음)' : decision.note}`,
    `- Decision Record sequence: ${decision.sequence}`,
    `- Decision Record hash: \`${decision.hash}\``,
  ].join('\n');
}

function renderAuditTail(tail: AuditTail | null): string {
  if (tail === null) {
    return '기록된 결정이 아직 없습니다.';
  }
  return [
    `- 보고서 생성 시점의 audit chain sequence: ${tail.sequence}`,
    `- 보고서 생성 시점의 audit chain hash: \`${tail.hash}\``,
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
    '## 정책 Version',
    '',
    `- 기준 Policy Version contentHash: \`${input.baselineContentHash}\``,
    `- 변경안 Policy Version contentHash: \`${input.candidateContentHash}\``,
    ...renderReplayHashes(input.decision),
    '',
    '## 검토 기간',
    '',
    `- ${input.windowFrom} ~ ${input.windowTo}`,
    '',
    '## 분석 규모',
    '',
    renderNoneRatio(input),
    '',
    '## Effect transition',
    '',
    renderTransitions(input.transitions),
    '',
    '## Action effect unchanged, operation-level widening',
    '',
    renderOperationWidening(input.operationWidening),
    '',
    '## Diff Group과 Verdict',
    '',
    renderGroups(input.groups),
    '',
    '## 결정',
    '',
    renderDecision(input.decision, CHANGE_DECISION_LABEL),
    '',
    '## Audit chain',
    '',
    renderAuditTail(input.auditTail),
    '',
    '## 고지',
    '',
    FIXED_NOTICE,
    '',
  ].join('\n');
}

function renderAdoptionScale(stats: AdoptionStats | null): string {
  if (stats === null) {
    return '아직 replay가 완료되지 않아 분석 수치가 없습니다.';
  }
  const none = stats.analyzability.none;
  return [
    `- 분석한 Action: ${stats.evaluatedActions}건 (전체 ${stats.totalActions}건, 제외 ${stats.excludedActions}건)`,
    `- 그중 analyzability none: ${none}건 (${ratio(none, stats.evaluatedActions)})`,
  ].join('\n');
}

function renderEffectCounts(stats: AdoptionStats | null): string {
  if (stats === null) {
    return '아직 replay가 완료되지 않아 Effect 표가 없습니다.';
  }
  const rows = EFFECTS.map((effect) => {
    const count = stats.effectCounts[effect];
    return `| ${EFFECT_LABEL[effect]} | ${count} | ${ratio(count, stats.evaluatedActions)} |`;
  });
  return ['| Effect | Action 수 | 비율 |', '| --- | --- | --- |', ...rows].join('\n');
}

function renderAdoptionGroupTable(
  groups: readonly AdoptionReportGroup[],
  effect: AdoptionEffect,
): string {
  const rows = groups.filter((group) => group.effect === effect);
  if (rows.length === 0) {
    return `'${EFFECT_LABEL[effect]}' 대상 Adoption Group이 없습니다.`;
  }
  return [
    '| Adoption Group | Action 수 | Session 수 | 주요 Target | Verdict |',
    '| --- | --- | --- | --- | --- |',
    ...rows.map((group) => {
      const targets = group.targetSummary
        .map((target) => `${target.key} (${target.count}건)`)
        .join(', ');
      return `| ${group.headline} | ${group.actionCount} | ${group.sessionCount} | ${targets} | ${verdictLabel(group.verdict)} |`;
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
    `최초 도입 검토 \`${input.changeReviewId}\``,
    '',
    '## 정책 Version',
    '',
    `- 제안 Policy Version contentHash: \`${input.candidateContentHash}\``,
    ...renderReplayHashes(input.decision),
    '',
    '## 검토 기간',
    '',
    `- ${input.windowFrom} ~ ${input.windowTo}`,
    '',
    '## 분석 규모',
    '',
    renderAdoptionScale(input.stats),
    '',
    '## 정책 적용 결과',
    '',
    renderEffectCounts(input.stats),
    '',
    '## 확인 필요 Adoption Group과 Verdict',
    '',
    renderAdoptionGroupTable(input.groups, 'ask'),
    '',
    '## 차단 Adoption Group과 Verdict',
    '',
    renderAdoptionGroupTable(input.groups, 'deny'),
    '',
    '## 결정',
    '',
    renderDecision(input.decision, ADOPTION_DECISION_LABEL),
    '',
    '## Audit chain',
    '',
    renderAuditTail(input.auditTail),
    '',
    '## 고지',
    '',
    FIXED_NOTICE,
    ADOPTION_NOTICE,
    '',
  ].join('\n');
}
