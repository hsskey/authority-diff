import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, createFileRoute } from '@tanstack/react-router';
import type {
  ChangeReviewResponse,
  ReplayRunResponse,
  ReviewAdoptionGroupResponse,
  ReviewDiffGroupResponse,
} from '@authority/contracts/schema';
import { routes } from '@authority/contracts/routes';
import { callRoute, describeApiError } from '../../../shared/api-client.ts';
import { ErrorState } from '../../../shared/components/ErrorState.tsx';
import { LoadingState } from '../../../shared/components/LoadingState.tsx';
import {
  blockerLabel,
  bySeverityThenImpact,
  effectLabel,
  formatShare,
  formatZoneTransition,
} from '../../../features/change-review/format.ts';
import { VerdictSelect } from '../../../features/change-review/VerdictSelect.tsx';

export const Route = createFileRoute('/change-reviews/$reviewId/')({
  component: ChangeReviewPage,
});

type Effect = ReviewDiffGroupResponse['fromEffect'];
type ReviewKind = ChangeReviewResponse['kind'];
type ReviewStatus = ChangeReviewResponse['status'];

const EFFECTS: readonly Effect[] = ['allow', 'ask', 'deny'];

const PAGE_TITLE: Record<ReviewKind, string> = {
  change: 'Change Review',
  adoption: '최초 도입 검토',
};

const STATUS_LABEL: Record<ReviewStatus, string> = {
  computing: '계산 중',
  ready: '판정 대기',
  accepted: '채택됨',
  rejected: '반려됨',
  failed: '실패',
};

const DECISION_LABEL: Record<ReviewKind, { accept: string; reject: string; title: string }> = {
  change: { accept: '정책 변경 수락', reject: '정책 변경 반려', title: '정책 변경 결정' },
  adoption: { accept: '최초 정책 채택', reject: '최초 정책 반려', title: '최초 정책 채택 결정' },
};

function ChangeReviewPage() {
  const { reviewId } = Route.useParams();
  const queryClient = useQueryClient();

  const reviewQuery = useQuery({
    queryKey: ['change-review', reviewId],
    queryFn: async () => {
      const result = await callRoute(routes.getChangeReview, { params: { id: reviewId } });
      if (!result.ok) {
        throw new Error(describeApiError(result.error));
      }
      return result.value;
    },
    refetchInterval: (query) => (query.state.data?.status === 'computing' ? 3000 : false),
  });

  const reviewStatus = reviewQuery.data?.status;
  const kind = reviewQuery.data?.kind;
  const isComputing = reviewStatus === 'computing';

  const diffGroupsQuery = useQuery({
    queryKey: ['change-review-diff-groups', reviewId],
    enabled: kind === 'change',
    queryFn: async () => {
      const result = await callRoute(routes.listReviewDiffGroups, {
        params: { id: reviewId },
        query: { limit: 200 },
      });
      if (!result.ok) {
        throw new Error(describeApiError(result.error));
      }
      return result.value.items;
    },
    refetchInterval: isComputing ? 3000 : false,
  });

  const adoptionGroupsQuery = useQuery({
    queryKey: ['change-review-adoption-groups', reviewId],
    enabled: kind === 'adoption',
    queryFn: async () => {
      const result = await callRoute(routes.listReviewAdoptionGroups, {
        params: { id: reviewId },
        query: { limit: 200 },
      });
      if (!result.ok) {
        throw new Error(describeApiError(result.error));
      }
      return result.value.items;
    },
    refetchInterval: isComputing ? 3000 : false,
  });

  useEffect(() => {
    if (reviewStatus && reviewStatus !== 'computing') {
      void queryClient.invalidateQueries({ queryKey: ['change-review-diff-groups', reviewId] });
      void queryClient.invalidateQueries({
        queryKey: ['change-review-adoption-groups', reviewId],
      });
    }
  }, [reviewStatus, reviewId, queryClient]);

  const groupsQuery = kind === 'adoption' ? adoptionGroupsQuery : diffGroupsQuery;
  const isPending = reviewQuery.isPending || (kind !== undefined && groupsQuery.isPending);

  return (
    <section>
      <h1 className="page-title">{kind === undefined ? '검토' : PAGE_TITLE[kind]}</h1>
      {isPending ? <LoadingState label="검토를 불러오는 중" /> : null}
      {reviewQuery.isError ? (
        <ErrorState
          title="검토를 불러오지 못했습니다"
          message={reviewQuery.error?.message ?? '알 수 없는 오류'}
        />
      ) : null}
      {groupsQuery.isError ? (
        <ErrorState
          title="group을 불러오지 못했습니다"
          message={groupsQuery.error?.message ?? '알 수 없는 오류'}
        />
      ) : null}
      {reviewQuery.isSuccess && reviewQuery.data.kind === 'change' && diffGroupsQuery.isSuccess ? (
        <ChangeReviewDetail
          reviewId={reviewId}
          review={reviewQuery.data}
          groups={diffGroupsQuery.data}
        />
      ) : null}
      {reviewQuery.isSuccess &&
      reviewQuery.data.kind === 'adoption' &&
      adoptionGroupsQuery.isSuccess ? (
        <AdoptionReviewDetail
          reviewId={reviewId}
          review={reviewQuery.data}
          groups={adoptionGroupsQuery.data}
        />
      ) : null}
    </section>
  );
}

function ChangeReviewDetail({
  reviewId,
  review,
  groups,
}: {
  reviewId: string;
  review: ChangeReviewResponse;
  groups: readonly ReviewDiffGroupResponse[];
}) {
  const widening = groups.filter((group) => group.direction === 'widening');
  const narrowing = groups.filter((group) => group.direction === 'narrowing');

  return (
    <div className="stack">
      <ReviewMeta review={review} />
      <SummaryLines review={review} widening={widening} narrowing={narrowing} />
      <TransitionMatrix review={review} />
      <WideningGroups reviewId={reviewId} groups={widening} canJudge={review.status === 'ready'} />
      <NarrowingGroups reviewId={reviewId} groups={narrowing} />
      <GateBlockers review={review} />
      <DecisionPanel reviewId={reviewId} review={review} />
      <ReportDownload reviewId={reviewId} kind={review.kind} />
    </div>
  );
}

function AdoptionReviewDetail({
  reviewId,
  review,
  groups,
}: {
  reviewId: string;
  review: ChangeReviewResponse;
  groups: readonly ReviewAdoptionGroupResponse[];
}) {
  const ask = groups.filter((group) => group.effect === 'ask');
  const deny = groups.filter((group) => group.effect === 'deny');
  const canJudge = review.status === 'ready';

  return (
    <div className="stack">
      <ReviewMeta review={review} />
      <AdoptionSummary review={review} />
      <AdoptionGroups
        reviewId={reviewId}
        title="확인 필요 group"
        effect="ask"
        groups={ask}
        canJudge={canJudge}
      />
      <AdoptionGroups
        reviewId={reviewId}
        title="차단 group"
        effect="deny"
        groups={deny}
        canJudge={canJudge}
      />
      <GateBlockers review={review} />
      <DecisionPanel reviewId={reviewId} review={review} />
      <ReportDownload reviewId={reviewId} kind={review.kind} />
    </div>
  );
}

function ReviewMeta({ review }: { review: ChangeReviewResponse }) {
  return (
    <dl className="meta-grid panel">
      <div>
        <dt>검토</dt>
        <dd className="mono">{review.id}</dd>
      </div>
      <div>
        <dt>상태</dt>
        <dd>
          <span className={`status-badge status-${review.status}`}>
            {STATUS_LABEL[review.status]}
          </span>
        </dd>
      </div>
      <div>
        <dt>{review.kind === 'adoption' ? '제안 version' : 'Candidate version'}</dt>
        <dd className="mono">{review.candidateVersionId}</dd>
      </div>
      <div>
        <dt>기준 version</dt>
        <dd className={review.baselineVersionId === null ? '' : 'mono'}>
          {review.baselineVersionId ?? '없음 (최초 도입)'}
        </dd>
      </div>
      <div>
        <dt>기간</dt>
        <dd>
          {review.windowFrom} → {review.windowTo}
        </dd>
      </div>
    </dl>
  );
}

function SummaryLines({
  review,
  widening,
  narrowing,
}: {
  review: ChangeReviewResponse;
  widening: readonly ReviewDiffGroupResponse[];
  narrowing: readonly ReviewDiffGroupResponse[];
}) {
  const stats = review.replaySummary.stats;
  const wideningActions = widening.reduce((sum, group) => sum + group.actionCount, 0);
  const narrowingActions = narrowing.reduce((sum, group) => sum + group.actionCount, 0);

  return (
    <ol className="summary-lines panel">
      <li>
        평가한 action <strong>{stats ? stats.evaluatedActions : '계산 중'}</strong>건
      </li>
      <li>
        넓어진 action <strong>{wideningActions}</strong>건, widening group{' '}
        <strong>{widening.length}</strong>개
      </li>
      <li>
        좁아진 action <strong>{narrowingActions}</strong>건, narrowing group{' '}
        <strong>{narrowing.length}</strong>개
      </li>
    </ol>
  );
}

/** An adoption review's counts live on its replay run, not on the review summary. */
function AdoptionSummary({ review }: { review: ChangeReviewResponse }) {
  const runId = review.replaySummary.replayRunId;
  const runQuery = useQuery({
    queryKey: ['replay-run', runId],
    enabled: runId !== null && review.status !== 'computing',
    queryFn: async () => {
      if (runId === null) {
        throw new Error('replay run이 아직 연결되지 않았습니다');
      }
      const result = await callRoute(routes.getReplayRun, { params: { id: runId } });
      if (!result.ok) {
        throw new Error(describeApiError(result.error));
      }
      return result.value;
    },
  });

  if (review.status === 'computing') {
    return (
      <p className="state-message hint panel" role="status">
        제안 정책을 과거 Action에 적용하는 중입니다. 완료되면 화면이 갱신됩니다.
      </p>
    );
  }
  if (runQuery.isPending) {
    return <LoadingState label="적용 결과를 불러오는 중" />;
  }
  if (runQuery.isError) {
    return (
      <ErrorState
        title="적용 결과를 불러오지 못했습니다"
        message={runQuery.error?.message ?? '알 수 없는 오류'}
      />
    );
  }
  return <AdoptionStats run={runQuery.data} />;
}

function AdoptionStats({ run }: { run: ReplayRunResponse }) {
  if (run.kind !== 'adoption' || run.stats === null) {
    return null;
  }
  const { effectCounts, evaluatedActions, totalActions, excludedActions, analyzability } =
    run.stats;
  return (
    <div className="stack">
      <ol className="summary-lines panel">
        <li>
          평가한 action <strong>{evaluatedActions}</strong>건 (전체 {totalActions}건, Operation이
          없어 제외 {excludedActions}건)
        </li>
        <li>
          분석 불가(analyzability none) action <strong>{analyzability.none}</strong>건 (
          {formatShare(analyzability.none, evaluatedActions)})
        </li>
      </ol>
      <h2 className="section-title">제안 정책 적용 시 Effect</h2>
      <p className="state-message hint">
        과거 Action에 제안 정책을 적용한 결과입니다. 과거 runtime의 승인 여부를 복원한 것이
        아닙니다.
      </p>
      <div className="effect-summary" data-testid="adoption-effects">
        {EFFECTS.map((effect) => (
          <div key={effect} className={`panel effect-tile effect-${effect}`}>
            <span className="effect-label">{effectLabel(effect)}</span>
            <span className="effect-count">{effectCounts[effect]}</span>
            <span className="effect-percent">
              {formatShare(effectCounts[effect], evaluatedActions)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TransitionMatrix({ review }: { review: ChangeReviewResponse }) {
  const stats = review.replaySummary.stats;
  if (stats === null) {
    return null;
  }
  const counts = new Map<string, number>();
  for (const transition of stats.transitions) {
    counts.set(`${transition.from}->${transition.to}`, transition.count);
  }

  return (
    <div className="stack">
      <h2 className="section-title">Effect 전이</h2>
      <table className="data-table transition-matrix">
        <thead>
          <tr>
            <th scope="col">기준 \ 변경안</th>
            {EFFECTS.map((to) => (
              <th key={to} scope="col" className="num">
                {effectLabel(to)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {EFFECTS.map((from) => (
            <tr key={from}>
              <th scope="row">{effectLabel(from)}</th>
              {EFFECTS.map((to) => {
                const count = counts.get(`${from}->${to}`) ?? 0;
                const isDiagonal = from === to;
                return (
                  <td key={to} className={`num${isDiagonal ? '' : ' transition-changed'}`}>
                    {count}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WideningGroups({
  reviewId,
  groups,
  canJudge,
}: {
  reviewId: string;
  groups: readonly ReviewDiffGroupResponse[];
  canJudge: boolean;
}) {
  const sorted = [...groups].sort(bySeverityThenImpact);

  return (
    <div className="stack">
      <h2 className="section-title">Widening group ({groups.length})</h2>
      {sorted.length === 0 ? (
        <p className="state-message hint">넓어진 group이 없습니다.</p>
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Severity</th>
                <th scope="col">Capability</th>
                <th scope="col">Zone</th>
                <th scope="col">Effect</th>
                <th scope="col">Program</th>
                <th scope="col" className="num">
                  Action
                </th>
                <th scope="col" className="num">
                  Session
                </th>
                <th scope="col">판정</th>
                <th scope="col">상세</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((group) => (
                <tr key={group.groupKey}>
                  <td className="nowrap">
                    <span className={`severity-badge severity-${group.severity}`}>
                      {group.severity}
                    </span>
                  </td>
                  <td>{group.capability}</td>
                  <td className="nowrap">{formatZoneTransition(group.fromZone, group.toZone)}</td>
                  <td className="nowrap">
                    {formatZoneTransition(
                      effectLabel(group.fromEffect),
                      effectLabel(group.toEffect),
                    )}
                  </td>
                  <td>{group.program ?? '-'}</td>
                  <td className="num">{group.actionCount}</td>
                  <td className="num">{group.sessionCount}</td>
                  <td className="nowrap">
                    <VerdictSelect
                      reviewId={reviewId}
                      kind="change"
                      groupKey={group.groupKey}
                      capability={group.capability}
                      verdict={group.verdict}
                      disabled={!canJudge}
                    />
                  </td>
                  <td className="nowrap">
                    <Link
                      to="/change-reviews/$reviewId/groups/$groupKey"
                      params={{ reviewId, groupKey: group.groupKey }}
                    >
                      보기
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function NarrowingGroups({
  reviewId,
  groups,
}: {
  reviewId: string;
  groups: readonly ReviewDiffGroupResponse[];
}) {
  if (groups.length === 0) {
    return null;
  }
  return (
    <div className="stack">
      <h2 className="section-title">Narrowing group ({groups.length})</h2>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Capability</th>
              <th scope="col">Zone</th>
              <th scope="col">Effect</th>
              <th scope="col" className="num">
                Action
              </th>
              <th scope="col">상세</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <tr key={group.groupKey}>
                <td>{group.capability}</td>
                <td className="nowrap">{formatZoneTransition(group.fromZone, group.toZone)}</td>
                <td className="nowrap">
                  {formatZoneTransition(effectLabel(group.fromEffect), effectLabel(group.toEffect))}
                </td>
                <td className="num">{group.actionCount}</td>
                <td className="nowrap">
                  <Link
                    to="/change-reviews/$reviewId/groups/$groupKey"
                    params={{ reviewId, groupKey: group.groupKey }}
                  >
                    보기
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AdoptionGroups({
  reviewId,
  title,
  effect,
  groups,
  canJudge,
}: {
  reviewId: string;
  title: string;
  effect: 'ask' | 'deny';
  groups: readonly ReviewAdoptionGroupResponse[];
  canJudge: boolean;
}) {
  return (
    <div className="stack">
      <h2 className="section-title">
        {title} ({groups.length})
      </h2>
      {groups.length === 0 ? (
        <p className="state-message hint">
          이 정책에서 '{effectLabel(effect)}' 대상이 되는 group이 없습니다.
        </p>
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Capability</th>
                <th scope="col">Zone</th>
                <th scope="col" className="num">
                  Program 수
                </th>
                <th scope="col" className="num">
                  Action
                </th>
                <th scope="col" className="num">
                  Session
                </th>
                <th scope="col">판정</th>
                <th scope="col">상세</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <tr key={group.groupKey}>
                  <td>{group.capability}</td>
                  <td>{group.zone}</td>
                  <td className="num">{group.distinctProgramCount}</td>
                  <td className="num">{group.actionCount}</td>
                  <td className="num">{group.sessionCount}</td>
                  <td className="nowrap">
                    <VerdictSelect
                      reviewId={reviewId}
                      kind="adoption"
                      groupKey={group.groupKey}
                      capability={group.capability}
                      verdict={group.verdict}
                      disabled={!canJudge}
                    />
                  </td>
                  <td className="nowrap">
                    <Link
                      to="/change-reviews/$reviewId/groups/$groupKey"
                      params={{ reviewId, groupKey: group.groupKey }}
                    >
                      보기
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function GateBlockers({ review }: { review: ChangeReviewResponse }) {
  const { gate } = review;
  return (
    <div className={`panel stack ${gate.isOpen ? 'status-ok' : 'status-error'}`}>
      <h2 className="section-title">
        Gate: {gate.isOpen ? '열림' : `blocker ${gate.blockers.length}건`}
      </h2>
      {gate.isOpen ? (
        <p className="state-message">승인을 막는 blocker가 없습니다.</p>
      ) : (
        <ul className="issue-list">
          {gate.blockers.map((blocker) => (
            <li key={blocker.code}>{blockerLabel(blocker.code, blocker.count)}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DecisionPanel({ reviewId, review }: { reviewId: string; review: ChangeReviewResponse }) {
  const queryClient = useQueryClient();
  const [reviewerName, setReviewerName] = useState('');
  const [note, setNote] = useState('');
  const labels = DECISION_LABEL[review.kind];

  const decide = useMutation({
    mutationFn: async (decision: 'accept' | 'reject') => {
      const result = await callRoute(routes.decideChangeReview, {
        params: { id: reviewId },
        body: { decision, note, reviewerName },
      });
      if (!result.ok) {
        throw new Error(describeApiError(result.error));
      }
      return result.value;
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(['change-review', reviewId], updated);
      void queryClient.invalidateQueries({ queryKey: ['change-review', reviewId] });
      void queryClient.invalidateQueries({ queryKey: ['policy-versions', updated.policyId] });
      void queryClient.invalidateQueries({ queryKey: ['policy-change-reviews', updated.policyId] });
    },
  });

  const isDecided = review.status === 'accepted' || review.status === 'rejected';
  if (isDecided) {
    return (
      <div className="panel stack">
        <h2 className="section-title">결정 기록</h2>
        <dl className="meta-grid">
          <div>
            <dt>결정</dt>
            <dd>
              <span className={`status-badge status-${review.status}`}>
                {review.status === 'accepted' ? labels.accept : labels.reject}
              </span>
            </dd>
          </div>
          <div>
            <dt>결정자</dt>
            <dd>{review.decidedBy ?? '기록 없음'}</dd>
          </div>
          <div>
            <dt>시각</dt>
            <dd>{review.decidedAt ?? '기록 없음'}</dd>
          </div>
          <div>
            <dt>사유</dt>
            <dd>{review.decisionNote ?? '기록 없음'}</dd>
          </div>
        </dl>
        {review.kind === 'adoption' && review.status === 'accepted' ? (
          <p className="state-message hint">
            채택은 검토 기록입니다. runtime 설정 반영은 Authority Diff 밖에서 이루어집니다.
          </p>
        ) : null}
      </div>
    );
  }

  const canSubmit = reviewerName.trim().length > 0 && !decide.isPending;

  return (
    <div className="panel stack">
      <h2 className="section-title">{labels.title}</h2>
      <label className="field">
        검토자 이름
        <input
          type="text"
          value={reviewerName}
          onChange={(event) => setReviewerName(event.target.value)}
        />
      </label>
      <label className="field">
        사유
        <input type="text" value={note} onChange={(event) => setNote(event.target.value)} />
      </label>
      {!review.gate.isOpen ? (
        <ul className="issue-list">
          {review.gate.blockers.map((blocker) => (
            <li key={blocker.code}>{blockerLabel(blocker.code, blocker.count)}</li>
          ))}
        </ul>
      ) : null}
      <div className="actions">
        <button
          type="button"
          disabled={!canSubmit || !review.gate.isOpen || review.status !== 'ready'}
          onClick={() => decide.mutate('accept')}
        >
          {labels.accept}
        </button>
        <button
          type="button"
          className="button-secondary"
          disabled={!canSubmit || review.status !== 'ready'}
          onClick={() => decide.mutate('reject')}
        >
          {labels.reject}
        </button>
      </div>
      {decide.error ? (
        <p className="state-message status-error" role="alert">
          결정 실패: {decide.error.message}
        </p>
      ) : null}
    </div>
  );
}

function ReportDownload({ reviewId, kind }: { reviewId: string; kind: ReviewKind }) {
  const download = useMutation({
    mutationFn: async () => {
      const result = await callRoute(routes.getChangeReviewReport, { params: { id: reviewId } });
      if (!result.ok) {
        throw new Error(describeApiError(result.error));
      }
      saveReport(`${kind}-review-${reviewId}.md`, result.value);
    },
  });

  return (
    <div className="panel stack">
      <h2 className="section-title">보고서</h2>
      <p className="state-message hint">
        결정 근거로 남길 Evidence Report를 Markdown으로 내려받습니다.
      </p>
      <div className="actions">
        <button type="button" disabled={download.isPending} onClick={() => download.mutate()}>
          보고서 다운로드
        </button>
      </div>
      {download.error ? (
        <p className="state-message status-error" role="alert">
          보고서 다운로드 실패: {download.error.message}
        </p>
      ) : null}
    </div>
  );
}

function saveReport(fileName: string, report: string): void {
  const blob = new Blob([report], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
