import type {
  ChangeReviewResponse,
  DiffGroupSamplesResponse,
  ReviewDiffGroupResponse,
} from '@authority/contracts/schema';

type SampleAction = DiffGroupSamplesResponse['items'][number]['action'];
export type Operation = SampleAction['operations'][number];
type Target = Operation['target'];

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

const BLOCKER_LABEL: Record<GateBlocker['code'], string> = {
  replay_incomplete: 'replay가 아직 끝나지 않음',
  replay_failed: 'replay가 실패함',
  widening_unreviewed: '판정이 없는 widening group이 있음',
  widening_investigate: '조사 필요로 남은 group이 있음',
  widening_unexpected: '예상 밖으로 판정된 group이 있음',
};

export function blockerLabel(code: GateBlocker['code']): string {
  return BLOCKER_LABEL[code];
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

export function formatTarget(target: Target): string {
  switch (target.kind) {
    case 'path':
      return `path: ${target.path}${target.isInsideWorkspace ? ' (workspace)' : ''}`;
    case 'host':
      return `host: ${target.scheme ? `${target.scheme}://` : ''}${target.host}`;
    case 'vcs_remote':
      return `vcs remote: ${target.remoteName ?? target.remoteKey ?? 'unknown'}${
        target.branch ? `@${target.branch}` : ''
      }`;
    case 'package':
      return `package: ${target.ecosystem}${target.source ? ` (${target.source})` : ''}`;
    case 'mcp':
      return `mcp: ${target.server}/${target.tool}`;
    case 'deploy_target':
      return `deploy: ${target.label ?? 'unknown'}`;
    case 'unknown':
      return 'unknown target';
  }
}

export function operationSummary(operation: Operation): string {
  return `${operation.capability} · ${formatTarget(operation.target)} · analyzability: ${operation.analyzability}`;
}

/**
 * Change Review를 승인 근거 기록으로 내려받을 수 있게 Markdown 보고서로 만든다.
 * raw command text는 어디에도 담지 않는다. Diff Group의 집계 수치와 판정만 쓴다.
 */
export function buildReviewReport(
  review: ChangeReviewResponse,
  groups: readonly ReviewDiffGroupResponse[],
): string {
  const stats = review.replaySummary.stats;
  const widening = groups.filter((group) => group.direction === 'widening');
  const narrowing = groups.filter((group) => group.direction === 'narrowing');
  const wideningActions = widening.reduce((sum, group) => sum + group.actionCount, 0);
  const narrowingActions = narrowing.reduce((sum, group) => sum + group.actionCount, 0);

  const lines: string[] = [
    `# Change Review ${review.id}`,
    '',
    `- 상태: ${review.status}`,
    `- Policy: ${review.policyId}`,
    `- Baseline version: ${review.baselineVersionId}`,
    `- Candidate version: ${review.candidateVersionId}`,
    `- Window: ${review.windowFrom} → ${review.windowTo}`,
    '',
    '## 요약',
    `- 평가한 action 수: ${stats ? stats.evaluatedActions : '계산 중'}`,
    `- 넓어진 action ${wideningActions}건, widening group ${widening.length}개`,
    `- 좁아진 action ${narrowingActions}건, narrowing group ${narrowing.length}개`,
    '',
    '## Gate',
    review.gate.isOpen
      ? '- gate 열림: blocker 없음'
      : review.gate.blockers
          .map((blocker) => `- ${blockerLabel(blocker.code)} (${blocker.count})`)
          .join('\n'),
    '',
    '## Widening group',
  ];

  for (const group of [...widening].sort(bySeverityThenImpact)) {
    lines.push(
      `- [${group.severity}] ${group.capability} · ${formatZoneTransition(group.fromZone, group.toZone)} · ${formatZoneTransition(group.fromEffect, group.toEffect)} · action ${group.actionCount} · 판정 ${verdictLabel(group.verdict)}`,
    );
  }

  if (review.status === 'accepted' || review.status === 'rejected') {
    lines.push(
      '',
      '## 결정',
      `- 결정: ${review.status}`,
      `- 결정자: ${review.decidedBy ?? '기록 없음'}`,
      `- 시각: ${review.decidedAt ?? '기록 없음'}`,
      `- 사유: ${review.decisionNote ?? '기록 없음'}`,
    );
  }

  return `${lines.join('\n')}\n`;
}
