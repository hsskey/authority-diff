import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import type {
  ChangeReviewResponse,
  DiffGroupSamplesResponse,
  ReviewDiffGroupResponse,
} from '@authority/contracts/schema';
import { routes } from '@authority/contracts/routes';
import { callRoute, describeApiError } from '../../../../shared/api-client.ts';
import { EmptyState } from '../../../../shared/components/EmptyState.tsx';
import { ErrorState } from '../../../../shared/components/ErrorState.tsx';
import { LoadingState } from '../../../../shared/components/LoadingState.tsx';
import { formatZoneTransition } from '../../../../features/change-review/format.ts';
import { VerdictSelect } from '../../../../features/change-review/VerdictSelect.tsx';

export const Route = createFileRoute('/change-reviews/$reviewId/groups/$groupKey')({
  component: DiffGroupPage,
});

type Sample = DiffGroupSamplesResponse['items'][number];
type Decision = Sample['baselineDecision'];

function DiffGroupPage() {
  const { reviewId, groupKey } = Route.useParams();

  const reviewQuery = useQuery({
    queryKey: ['change-review', reviewId],
    queryFn: async () => {
      const result = await callRoute(routes.getChangeReview, { params: { id: reviewId } });
      if (!result.ok) {
        throw new Error(describeApiError(result.error));
      }
      return result.value;
    },
  });

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

  const replayRunId = reviewQuery.data?.replaySummary.replayRunId ?? null;
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
    <section>
      <h1 className="page-title">Diff Group</h1>
      {reviewQuery.isPending || groupsQuery.isPending ? (
        <LoadingState label="Diff Group을 불러오는 중" />
      ) : null}
      {reviewQuery.isError ? (
        <ErrorState
          title="Change Review를 불러오지 못했습니다"
          message={reviewQuery.error?.message ?? '알 수 없는 오류'}
        />
      ) : null}
      {reviewQuery.isSuccess && groupsQuery.isSuccess && group === null ? (
        <EmptyState
          title="Diff Group을 찾지 못했습니다"
          message={`이 Change Review에는 group ${groupKey}이 없습니다.`}
        />
      ) : null}
      {group !== null && reviewQuery.data ? (
        <GroupSignature reviewId={reviewId} review={reviewQuery.data} group={group} />
      ) : null}
      {group !== null && reviewQuery.isSuccess ? (
        <SampleSection query={samplesQuery} replayRunId={replayRunId} />
      ) : null}
    </section>
  );
}

function GroupSignature({
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
      <p className="state-message hint">{group.headline}</p>
      <dl className="meta-grid panel">
        <div>
          <dt>Direction</dt>
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
          <dd>{formatZoneTransition(group.fromEffect, group.toEffect)}</dd>
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
            groupKey={group.groupKey}
            capability={group.capability}
            verdict={group.verdict}
          />
        </div>
      ) : null}
      <p className="state-message hint">
        검토를 마치려면 <a href={`/change-reviews/${review.id}`}>Change Review로 돌아가세요</a>.
      </p>
    </div>
  );
}

function SampleSection({
  query,
  replayRunId,
}: {
  query: UseQueryResult<readonly Sample[], Error>;
  replayRunId: string | null;
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
      {query.data.map((sample) => (
        <SampleCard key={sample.action.actionKey} sample={sample} />
      ))}
    </div>
  );
}

function SampleCard({ sample }: { sample: Sample }) {
  const { action } = sample;
  return (
    <div className="panel stack sample-card">
      <div>
        <h3 className="section-title">Tool input (redacted)</h3>
        <pre className="redacted-input">{action.toolInputRedacted}</pre>
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
              · {sample.targetKeys[position] ?? 'unknown'}
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
  rationales: Sample['baselineRuleRationales'];
}) {
  return (
    <div className="stack decision-view">
      <div className="row-between">
        <h4 className="section-title">{title}</h4>
        <span className={`effect-badge effect-${decision.effect}`}>{decision.effect}</span>
      </div>
      <table className="data-table">
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
              <td>
                <span className={`effect-badge effect-${operation.effect}`}>
                  {operation.effect}
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
