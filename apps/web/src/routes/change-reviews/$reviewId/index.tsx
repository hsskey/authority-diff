import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, createFileRoute } from '@tanstack/react-router';
import type { ChangeReviewResponse, ReviewDiffGroupResponse } from '@authority/contracts/schema';
import { routes } from '@authority/contracts/routes';
import { callRoute, describeApiError } from '../../../shared/api-client.ts';
import { ErrorState } from '../../../shared/components/ErrorState.tsx';
import { LoadingState } from '../../../shared/components/LoadingState.tsx';
import {
  blockerLabel,
  bySeverityThenImpact,
  effectLabel,
  formatZoneTransition,
} from '../../../features/change-review/format.ts';
import { VerdictSelect } from '../../../features/change-review/VerdictSelect.tsx';

export const Route = createFileRoute('/change-reviews/$reviewId/')({
  component: ChangeReviewPage,
});

type Effect = ReviewDiffGroupResponse['fromEffect'];

const EFFECTS: readonly Effect[] = ['allow', 'ask', 'deny'];

function ChangeReviewPage() {
  const { reviewId } = Route.useParams();

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

  const isComputing = reviewQuery.data?.status === 'computing';

  const groupsQuery = useQuery({
    queryKey: ['change-review-diff-groups', reviewId],
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

  return (
    <section>
      <h1 className="page-title">Change Review</h1>
      {reviewQuery.isPending || groupsQuery.isPending ? (
        <LoadingState label="Change Review를 불러오는 중" />
      ) : null}
      {reviewQuery.isError ? (
        <ErrorState
          title="Change Review를 불러오지 못했습니다"
          message={reviewQuery.error?.message ?? '알 수 없는 오류'}
        />
      ) : null}
      {groupsQuery.isError ? (
        <ErrorState
          title="Diff Group을 불러오지 못했습니다"
          message={groupsQuery.error?.message ?? '알 수 없는 오류'}
        />
      ) : null}
      {reviewQuery.isSuccess && groupsQuery.isSuccess ? (
        <ChangeReviewDetail
          reviewId={reviewId}
          review={reviewQuery.data}
          groups={groupsQuery.data}
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
      <WideningGroups
        reviewId={reviewId}
        groups={widening}
        computing={review.status === 'computing'}
      />
      <NarrowingGroups reviewId={reviewId} groups={narrowing} />
      <GateBlockers review={review} />
      <DecisionPanel reviewId={reviewId} review={review} />
      <ReportDownload reviewId={reviewId} />
    </div>
  );
}

function ReviewMeta({ review }: { review: ChangeReviewResponse }) {
  return (
    <dl className="meta-grid panel">
      <div>
        <dt>Review</dt>
        <dd className="mono">{review.id}</dd>
      </div>
      <div>
        <dt>Status</dt>
        <dd>
          <span className={`status-badge status-${review.status}`}>{review.status}</span>
        </dd>
      </div>
      <div>
        <dt>Candidate version</dt>
        <dd className="mono">{review.candidateVersionId}</dd>
      </div>
      <div>
        <dt>Baseline version</dt>
        <dd className="mono">{review.baselineVersionId}</dd>
      </div>
      <div>
        <dt>Window</dt>
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
            <th scope="col">baseline \ candidate</th>
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
  computing,
}: {
  reviewId: string;
  groups: readonly ReviewDiffGroupResponse[];
  computing: boolean;
}) {
  const sorted = [...groups].sort(bySeverityThenImpact);

  return (
    <div className="stack">
      <h2 className="section-title">Widening group ({groups.length})</h2>
      {sorted.length === 0 ? (
        <p className="state-message hint">넓어진 group이 없습니다.</p>
      ) : (
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
                <td>
                  <span className={`severity-badge severity-${group.severity}`}>
                    {group.severity}
                  </span>
                </td>
                <td>{group.capability}</td>
                <td>{formatZoneTransition(group.fromZone, group.toZone)}</td>
                <td>{formatZoneTransition(group.fromEffect, group.toEffect)}</td>
                <td>{group.program ?? '-'}</td>
                <td className="num">{group.actionCount}</td>
                <td className="num">{group.sessionCount}</td>
                <td>
                  <VerdictSelect
                    reviewId={reviewId}
                    groupKey={group.groupKey}
                    capability={group.capability}
                    verdict={group.verdict}
                    disabled={computing}
                  />
                </td>
                <td>
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
              <td>{formatZoneTransition(group.fromZone, group.toZone)}</td>
              <td>{formatZoneTransition(group.fromEffect, group.toEffect)}</td>
              <td className="num">{group.actionCount}</td>
              <td>
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
              <span className={`status-badge status-${review.status}`}>{review.status}</span>
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
      </div>
    );
  }

  const canSubmit = reviewerName.trim().length > 0 && !decide.isPending;

  return (
    <div className="panel stack">
      <h2 className="section-title">정책 변경 결정</h2>
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
          disabled={!canSubmit || !review.gate.isOpen || review.status === 'computing'}
          onClick={() => decide.mutate('accept')}
        >
          정책 변경 수락
        </button>
        <button
          type="button"
          className="button-secondary"
          disabled={!canSubmit}
          onClick={() => decide.mutate('reject')}
        >
          정책 변경 반려
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

function ReportDownload({ reviewId }: { reviewId: string }) {
  const download = useMutation({
    mutationFn: async () => {
      const result = await callRoute(routes.getChangeReviewReport, { params: { id: reviewId } });
      if (!result.ok) {
        throw new Error(describeApiError(result.error));
      }
      saveReport(reviewId, result.value);
    },
  });

  return (
    <div className="panel stack">
      <h2 className="section-title">보고서</h2>
      <p className="state-message hint">
        승인 근거로 남길 Evidence Report를 Markdown으로 내려받습니다.
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

function saveReport(reviewId: string, report: string): void {
  const blob = new Blob([report], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `change-review-${reviewId}.md`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
