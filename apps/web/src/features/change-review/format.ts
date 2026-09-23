import type { ChangeReviewResponse, ReviewDiffGroupResponse } from '@authority/contracts/schema';

type Verdict = ReviewDiffGroupResponse['verdict'];
type NonNullVerdict = Exclude<Verdict, null>;
type GateBlocker = ChangeReviewResponse['gate']['blockers'][number];
type Severity = ReviewDiffGroupResponse['severity'];
type Effect = ReviewDiffGroupResponse['fromEffect'];

const EFFECT_LABEL: Record<Effect, string> = {
  allow: '허용',
  ask: '확인 필요',
  deny: '차단',
};

export function effectLabel(effect: Effect): string {
  return EFFECT_LABEL[effect];
}

export const VERDICT_OPTIONS: readonly NonNullVerdict[] = ['expected', 'investigate', 'unexpected'];

const VERDICT_LABEL: Record<NonNullVerdict, string> = {
  expected: '예상된 변화',
  investigate: '조사 필요',
  unexpected: '예상 밖',
};

export function verdictLabel(verdict: Verdict): string {
  return verdict === null ? '미판정' : VERDICT_LABEL[verdict];
}

const BLOCKER_LABEL: Record<GateBlocker['code'], (count: number) => string> = {
  replay_incomplete: (count) => `replay가 아직 끝나지 않음 (${count})`,
  replay_failed: (count) => `replay가 실패함 (${count})`,
  widening_unreviewed: (count) => `판정하지 않은 group ${count}개`,
  widening_investigate: (count) => `investigate로 남은 group ${count}개`,
  widening_unexpected: (count) =>
    `예상 밖으로 판정된 group ${count}개. 정책을 고쳐 새 review를 만드세요`,
  adoption_unreviewed: (count) => `판정하지 않은 group ${count}개`,
  adoption_investigate: (count) => `보류로 남은 group ${count}개`,
  adoption_unexpected: (count) =>
    `정책 수정 필요로 판정된 group ${count}개. 정책을 고쳐 새 review를 만드세요`,
};

export function blockerLabel(code: GateBlocker['code'], count: number): string {
  return BLOCKER_LABEL[code](count);
}

/** critical group을 먼저, 같은 severity 안에서는 action 수가 많은 순으로 정렬한다. */
const SEVERITY_RANK: Record<Severity, number> = { critical: 0, normal: 1 };

export function bySeverityThenImpact(
  a: ReviewDiffGroupResponse,
  b: ReviewDiffGroupResponse,
): number {
  return (
    SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
    b.actionCount - a.actionCount ||
    a.groupKey.localeCompare(b.groupKey)
  );
}

export function formatZoneTransition(from: string, to: string): string {
  return from === to ? from : `${from} → ${to}`;
}
