import type { Effect, IsoTimestamp } from '@authority/kernel';
import type { ChangeReviewStatus, Verdict } from '../../schema.ts';

/**
 * The two headline-wording fixes (R3) live in replay's headline rendering, so
 * this report reproduces each Diff Group's `headline` as given and never
 * rewrites it. The report deliberately carries no raw command text, `ruleId`,
 * or regex: only plain-language headlines, Target key summaries, counts,
 * transitions, Verdicts, hashes, and the reviewer (docs/cutline.md section 5,
 * item 9).
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
  readonly groups: readonly ReportGroup[];
  readonly decision: ReportDecision | null;
}

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

const DECISION_LABEL: Record<'accept' | 'reject', string> = {
  accept: '정책 변경 수락',
  reject: '정책 변경 반려',
};

const FIXED_NOTICE = [
  '> 이 기록은 정책 변경을 위 과거 기록에 비추어 검토했다는 사실을 남깁니다.',
  '> Authority Diff는 정책을 배포하거나 강제하지 않았고, runtime이 이 정책대로 동작하는지는 측정하지 않았습니다.',
].join('\n');

function ratio(part: number, whole: number): string {
  if (whole === 0) {
    return '0%';
  }
  return `${((part / whole) * 100).toFixed(1)}%`;
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
    `- Verdict: ${group.verdict === null ? '미판정' : VERDICT_LABEL[group.verdict]}`,
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

function renderDecision(decision: ReportDecision | null): string {
  if (decision === null) {
    return '아직 결정되지 않았습니다.';
  }
  return [
    `- 결정: ${DECISION_LABEL[decision.decision]}`,
    `- 검토자: ${decision.reviewerName}`,
    `- 시각: ${decision.decidedAt}`,
    `- 메모: ${decision.note === '' ? '(없음)' : decision.note}`,
  ].join('\n');
}

/** Renders a Change Review's Evidence Report as Markdown. */
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
    '## Diff Group과 Verdict',
    '',
    renderGroups(input.groups),
    '',
    '## 결정',
    '',
    renderDecision(input.decision),
    '',
    '## 고지',
    '',
    FIXED_NOTICE,
    '',
  ].join('\n');
}
