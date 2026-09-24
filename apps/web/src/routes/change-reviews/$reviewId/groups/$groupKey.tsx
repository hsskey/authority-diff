import type { ReactNode } from 'react';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { Link, createFileRoute } from '@tanstack/react-router';
import type {
  AdoptionGroupSamplesResponse,
  ChangeReviewResponse,
  DiffGroupSamplesResponse,
  ReviewAdoptionGroupResponse,
  ReviewDiffGroupResponse,
} from '@authority/contracts/schema';
import { routes } from '@authority/contracts/routes';
import { foldHomePaths } from '@authority/kernel';
import { callRoute, describeApiError } from '../../../../shared/api-client.ts';
import { EmptyState } from '../../../../shared/components/EmptyState.tsx';
import { ErrorState } from '../../../../shared/components/ErrorState.tsx';
import { LoadingState } from '../../../../shared/components/LoadingState.tsx';
import {
  adoptionGroupLabel,
  diffGroupLabel,
  effectLabel,
  formatZoneTransition,
} from '../../../../features/change-review/format.ts';
import { VerdictSelect } from '../../../../features/change-review/VerdictSelect.tsx';
import { usePageTitle } from '../../../../shared/use-page-title.ts';

export const Route = createFileRoute('/change-reviews/$reviewId/groups/$groupKey')({
  component: DiffGroupPage,
});

type DiffSample = DiffGroupSamplesResponse['items'][number];
type AdoptionSample = AdoptionGroupSamplesResponse['items'][number];
type Decision = DiffSample['baselineDecision'];
type Rationales = DiffSample['baselineRuleRationales'];

function useReview(reviewId: string) {
  return useQuery({
    queryKey: ['change-review', reviewId],
    queryFn: async () => {
      const result = await callRoute(routes.getChangeReview, { params: { id: reviewId } });
      if (!result.ok) {
        throw new Error(describeApiError(result.error));
      }
      return result.value;
    },
  });
}

function DiffGroupPage() {
  const { reviewId, groupKey } = Route.useParams();
  const reviewQuery = useReview(reviewId);
  const pendingTitle =
    reviewQuery.data === undefined
      ? 'Group'
      : reviewQuery.data.kind === 'adoption'
        ? 'Adoption Group'
        : 'Diff Group';
  usePageTitle(pendingTitle);

  if (reviewQuery.isPending) {
    return (
      <section>
        <h1 className="page-title">Group</h1>
        <LoadingState label="검토를 불러오는 중" />
      </section>
    );
  }
  if (reviewQuery.isError) {
    return (
      <section>
        <h1 className="page-title">Group</h1>
        <ErrorState
          title="검토를 불러오지 못했습니다"
          message={reviewQuery.error?.message ?? '알 수 없는 오류'}
        />
      </section>
    );
  }
  const review = reviewQuery.data;
  return review.kind === 'adoption' ? (
    <AdoptionGroupPage reviewId={reviewId} groupKey={groupKey} review={review} />
  ) : (
    <ChangeGroupPage reviewId={reviewId} groupKey={groupKey} review={review} />
  );
}

function ChangeGroupPage({
  reviewId,
  groupKey,
  review,
}: {
  reviewId: string;
  groupKey: string;
  review: ChangeReviewResponse;
}) {
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
  });

  const replayRunId = review.replaySummary.replayRunId;
  const samplesQuery = useQuery({
    queryKey: ['diff-group-samples', replayRunId, groupKey],
    enabled: replayRunId !== null,
    queryFn: async () => {
      if (replayRunId === null) {
        throw new Error('replay run이 아직 연결되지 않았습니다');
      }
      const result = await callRoute(routes.getDiffGroupSamples, {
        params: { runId: replayRunId, groupKey },
      });
      if (!result.ok) {
        throw new Error(describeApiError(result.error));
      }
      return result.value.items;
    },
  });

  const group = groupsQuery.data?.find((candidate) => candidate.groupKey === groupKey) ?? null;

  return (
    <section className="stack">
      <h1 className="page-title">Diff Group</h1>
      {groupsQuery.isPending ? <LoadingState label="Diff Group을 불러오는 중" /> : null}
      {groupsQuery.isError ? (
        <ErrorState
          title="Diff Group을 불러오지 못했습니다"
          message={groupsQuery.error?.message ?? '알 수 없는 오류'}
        />
      ) : null}
      {groupsQuery.isSuccess && group === null ? (
        <EmptyState
          title="Diff Group을 찾지 못했습니다"
          message={`이 변경 검토에는 group ${groupKey}이 없습니다.`}
        />
      ) : null}
      {group !== null ? (
        <>
          <ChangeGroupSignature reviewId={reviewId} review={review} group={group} />
          <SampleSection
            query={samplesQuery}
            replayRunId={replayRunId}
            render={(sample) => <ChangeSampleCard key={sample.action.actionKey} sample={sample} />}
          />
        </>
      ) : null}
    </section>
  );
}

function AdoptionGroupPage({
  reviewId,
  groupKey,
  review,
}: {
  reviewId: string;
  groupKey: string;
  review: ChangeReviewResponse;
}) {
  const groupsQuery = useQuery({
    queryKey: ['change-review-adoption-groups', reviewId],
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
  });

  const replayRunId = review.replaySummary.replayRunId;
  const samplesQuery = useQuery({
    queryKey: ['adoption-group-samples', replayRunId, groupKey],
    enabled: replayRunId !== null,
    queryFn: async () => {
      if (replayRunId === null) {
        throw new Error('replay run이 아직 연결되지 않았습니다');
      }
      const result = await callRoute(routes.getAdoptionGroupSamples, {
        params: { runId: replayRunId, groupKey },
      });
      if (!result.ok) {
        throw new Error(describeApiError(result.error));
      }
      return result.value.items;
    },
  });

  const group = groupsQuery.data?.find((candidate) => candidate.groupKey === groupKey) ?? null;

  return (
    <section className="stack">
      <h1 className="page-title">Adoption Group</h1>
      {groupsQuery.isPending ? <LoadingState label="Adoption Group을 불러오는 중" /> : null}
      {groupsQuery.isError ? (
        <ErrorState
          title="Adoption Group을 불러오지 못했습니다"
          message={groupsQuery.error?.message ?? '알 수 없는 오류'}
        />
      ) : null}
      {groupsQuery.isSuccess && group === null ? (
        <EmptyState
          title="Adoption Group을 찾지 못했습니다"
          message={`이 최초 도입 검토에는 group ${groupKey}이 없습니다.`}
        />
      ) : null}
      {group !== null ? (
        <>
          <AdoptionGroupSignature reviewId={reviewId} review={review} group={group} />
          <SampleSection
            query={samplesQuery}
            replayRunId={replayRunId}
            render={(sample) => (
              <AdoptionSampleCard key={sample.action.actionKey} sample={sample} />
            )}
          />
        </>
      ) : null}
    </section>
  );
}

function ChangeGroupSignature({
  reviewId,
  review,
  group,
}: {
  reviewId: string;
  review: ChangeReviewResponse;
  group: ReviewDiffGroupResponse;
}) {
  return (
    <div className="stack">
      <p className="state-message hint">{foldHomePaths(group.headline)}</p>
      <dl className="meta-grid panel">
        <div>
          <dt>방향</dt>
          <dd>
            {group.direction}{' '}
            <span className={`severity-badge severity-${group.severity}`}>{group.severity}</span>
          </dd>
        </div>
        <div>
          <dt>Capability</dt>
          <dd>{group.capability}</dd>
        </div>
        <div>
          <dt>Zone</dt>
          <dd>{formatZoneTransition(group.fromZone, group.toZone)}</dd>
        </div>
        <div>
          <dt>Effect</dt>
          <dd>
            {formatZoneTransition(effectLabel(group.fromEffect), effectLabel(group.toEffect))}
          </dd>
        </div>
        <div>
          <dt>Program</dt>
          <dd>{group.program ?? '-'}</dd>
        </div>
        <div>
          <dt>Action / Session</dt>
          <dd>
            {group.actionCount} / {group.sessionCount}
          </dd>
        </div>
      </dl>
      {group.direction === 'widening' ? (
        <div className="panel row-between">
          <span className="section-title">판정</span>
          <VerdictSelect
            reviewId={reviewId}
            kind="change"
            groupKey={group.groupKey}
            groupLabel={diffGroupLabel(group)}
            verdict={group.verdict}
            disabled={review.status !== 'ready'}
          />
        </div>
      ) : null}
      <p className="state-message hint">
        검토를 마치려면{' '}
        <Link to="/change-reviews/$reviewId" params={{ reviewId: review.id }}>
          변경 검토로 돌아가세요
        </Link>
        .
      </p>
    </div>
  );
}

function AdoptionGroupSignature({
  reviewId,
  review,
  group,
}: {
  reviewId: string;
  review: ChangeReviewResponse;
  group: ReviewAdoptionGroupResponse;
}) {
  return (
    <div className="stack">
      <p className="state-message hint">{foldHomePaths(group.headline)}</p>
      <dl className="meta-grid panel">
        <div>
          <dt>Effect</dt>
          <dd>
            <span className={`effect-badge effect-${group.effect}`}>
              {effectLabel(group.effect)}
            </span>
          </dd>
        </div>
        <div>
          <dt>Capability</dt>
          <dd>{group.capability}</dd>
        </div>
        <div>
          <dt>Zone</dt>
          <dd>{group.zone}</dd>
        </div>
        <div>
          <dt>Action / Session</dt>
          <dd>
            {group.actionCount} / {group.sessionCount}
          </dd>
        </div>
        <div>
          <dt>분석 불가 Action</dt>
          <dd>{group.analyzabilityNoneCount}</dd>
        </div>
        <div>
          <dt>기간</dt>
          <dd>
            {group.firstOccurredAt} → {group.lastOccurredAt}
          </dd>
        </div>
      </dl>
      <ProgramMix group={group} />
      <div className="panel row-between">
        <span className="section-title">판정</span>
        <VerdictSelect
          reviewId={reviewId}
          kind="adoption"
          groupKey={group.groupKey}
          groupLabel={adoptionGroupLabel(group)}
          verdict={group.verdict}
          disabled={review.status !== 'ready'}
        />
      </div>
      <p className="state-message hint">
        검토를 마치려면{' '}
        <Link to="/change-reviews/$reviewId" params={{ reviewId: review.id }}>
          최초 도입 검토로 돌아가세요
        </Link>
        .
      </p>
    </div>
  );
}

/** The programs mixed into one group: the signature carries none, so the mix is shown here. */
function ProgramMix({ group }: { group: ReviewAdoptionGroupResponse }) {
  return (
    <div className="table-scroll">
      <table className="data-table">
        <caption>
          Program 구성: 서로 다른 program {group.distinctProgramCount}개, 상위{' '}
          {group.programSummary.length}개 표시
        </caption>
        <thead>
          <tr>
            <th scope="col">Program</th>
            <th scope="col" className="num">
              Action
            </th>
          </tr>
        </thead>
        <tbody>
          {group.programSummary.map((entry) => (
            <tr key={entry.program ?? '__none__'}>
              <td className={entry.program === null ? 'hint' : 'mono'}>
                {entry.program ?? '인식 안 됨'}
              </td>
              <td className="num">{entry.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SampleSection<S extends { action: { actionKey: string } }>({
  query,
  replayRunId,
  render,
}: {
  query: UseQueryResult<readonly S[], Error>;
  replayRunId: string | null;
  render: (sample: S) => ReactNode;
}) {
  if (replayRunId === null) {
    return (
      <EmptyState
        title="샘플 없음"
        message="replay run이 연결되기 전에는 sample을 볼 수 없습니다."
      />
    );
  }
  if (query.isPending) {
    return <LoadingState label="Sample을 불러오는 중" />;
  }
  if (query.isError) {
    return (
      <ErrorState
        title="Sample을 불러오지 못했습니다"
        message={query.error?.message ?? '알 수 없는 오류'}
      />
    );
  }
  if (!query.isSuccess || query.data.length === 0) {
    return (
      <EmptyState title="샘플 없음" message="보존 기간이 지나 action이 삭제되었을 수 있습니다." />
    );
  }

  return (
    <div className="stack">
      <h2 className="section-title">Sample ({query.data.length})</h2>
      {query.data.map(render)}
    </div>
  );
}

function ChangeSampleCard({ sample }: { sample: DiffSample }) {
  const { action } = sample;
  return (
    <div className="panel stack sample-card">
      <div>
        <h3 className="section-title">도구 입력(가림 처리)</h3>
        <pre className="redacted-input">{foldHomePaths(action.toolInputRedacted)}</pre>
      </div>
      <div>
        <h3 className="section-title">Operations ({action.operations.length})</h3>
        <ul className="issue-list">
          {action.operations.map((operation, position) => (
            <li key={operation.index}>
              #{operation.index} {operation.capability} ·{' '}
              {formatZoneTransition(
                zoneOf(sample.baselineDecision, operation.index),
                zoneOf(sample.candidateDecision, operation.index),
              )}{' '}
              · {foldHomePaths(sample.targetKeys[position] ?? 'unknown')}
            </li>
          ))}
        </ul>
      </div>
      <div className="decision-pair">
        <DecisionView
          title="Baseline 결정"
          decision={sample.baselineDecision}
          rationales={sample.baselineRuleRationales}
        />
        <DecisionView
          title="Candidate 결정"
          decision={sample.candidateDecision}
          rationales={sample.candidateRuleRationales}
        />
      </div>
    </div>
  );
}

function AdoptionSampleCard({ sample }: { sample: AdoptionSample }) {
  const { action } = sample;
  return (
    <div className="panel stack sample-card">
      <div>
        <h3 className="section-title">도구 입력(가림 처리)</h3>
        <pre className="redacted-input">{foldHomePaths(action.toolInputRedacted)}</pre>
      </div>
      <div>
        <h3 className="section-title">Operations ({action.operations.length})</h3>
        <ul className="issue-list">
          {action.operations.map((operation, position) => (
            <li key={operation.index}>
              #{operation.index} {operation.capability} ·{' '}
              {zoneOf(sample.candidateDecision, operation.index)} ·{' '}
              {foldHomePaths(sample.targetKeys[position] ?? 'unknown')}
            </li>
          ))}
        </ul>
      </div>
      <div className="decision-pair">
        <DecisionView
          title="제안 정책 결정"
          decision={sample.candidateDecision}
          rationales={sample.candidateRuleRationales}
        />
      </div>
    </div>
  );
}

function zoneOf(decision: Decision, operationIndex: number): string {
  return (
    decision.operations.find((operation) => operation.operationIndex === operationIndex)?.zone ??
    'unknown'
  );
}

function DecisionView({
  title,
  decision,
  rationales,
}: {
  title: string;
  decision: Decision;
  rationales: Rationales;
}) {
  return (
    <div className="stack decision-view">
      <div className="row-between">
        <h4 className="section-title">{title}</h4>
        <span className={`effect-badge effect-${decision.effect}`}>
          {effectLabel(decision.effect)}
        </span>
      </div>
      <div className="table-scroll">
        <table className="data-table">
          <caption>Operation별 결정</caption>
          <thead>
            <tr>
              <th scope="col">Op</th>
              <th scope="col">Zone</th>
              <th scope="col">Reversibility</th>
              <th scope="col">Effect</th>
              <th scope="col">근거</th>
            </tr>
          </thead>
          <tbody>
            {decision.operations.map((operation) => (
              <tr key={operation.operationIndex}>
                <td className="mono">#{operation.operationIndex}</td>
                <td>{operation.zone}</td>
                <td>{operation.reversibility}</td>
                <td className="nowrap">
                  <span className={`effect-badge effect-${operation.effect}`}>
                    {effectLabel(operation.effect)}
                  </span>
                </td>
                <td>
                  {operation.decidingRuleId === null
                    ? '-'
                    : (rationales[operation.decidingRuleId] ?? '-')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <details>
        <summary>기술 세부</summary>
        <ul className="issue-list">
          {decision.operations.map((operation) => (
            <li key={operation.operationIndex} className="mono">
              #{operation.operationIndex} {operation.decidingRuleId ?? '-'}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
