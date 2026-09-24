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
type Effect = ReviewDiffGroupResponse['fromEffect'];
type Severity = ReviewDiffGroupResponse['severity'];

function cx(...parts: Array<string | false | undefined>): string {
  return parts
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .join(' ');
}

function PageTitle({ children }: { children: ReactNode }) {
  return <h1 className="m-0 mb-4 text-[1.5rem]">{children}</h1>;
}

function Stack({
  as: Tag = 'div',
  className,
  children,
}: {
  as?: 'div' | 'section';
  className?: string;
  children: ReactNode;
}) {
  return <Tag className={cx('grid gap-5', className)}>{children}</Tag>;
}

function Panel({
  as: Tag = 'div',
  className,
  children,
}: {
  as?: 'div' | 'dl';
  className?: string;
  children: ReactNode;
}) {
  return (
    <Tag className={cx('rounded-lg border border-border bg-panel px-5 py-4', className)}>
      {children}
    </Tag>
  );
}

function SectionTitle({
  as: Tag = 'h2',
  children,
}: {
  as?: 'h2' | 'h3' | 'h4' | 'span';
  children: ReactNode;
}) {
  return <Tag className="m-0 text-[1.125rem]">{children}</Tag>;
}

function Hint({ children }: { children: ReactNode }) {
  return <p className="m-0 text-[0.9rem] text-muted">{children}</p>;
}

function RowBetween({ children }: { children: ReactNode }) {
  return <div className="flex items-center justify-between gap-4">{children}</div>;
}

function PanelRow({ children }: { children: ReactNode }) {
  return <Panel className="flex items-center justify-between gap-4">{children}</Panel>;
}

function SampleCard({ children }: { children: ReactNode }) {
  return <Panel className="grid gap-5">{children}</Panel>;
}

const EFFECT_BADGE_TONE: Record<Effect, string> = {
  allow: 'bg-emerald-700/12 text-emerald-700',
  ask: 'bg-amber-700/12 text-amber-700',
  deny: 'bg-red-700/12 text-red-700',
};

function EffectBadge({ effect, children }: { effect: Effect; children: ReactNode }) {
  return (
    <span
      className={cx(
        'inline-block rounded-full px-2 py-[0.1rem] text-[0.75rem] font-semibold',
        EFFECT_BADGE_TONE[effect],
      )}
    >
      {children}
    </span>
  );
}

function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span
      className={cx(
        'inline-block rounded-full border border-current px-2 py-[0.1rem] text-[0.75rem] font-semibold',
        severity === 'critical' ? 'text-red-700' : 'text-muted',
      )}
    >
      {severity}
    </span>
  );
}

function IssueList({ children }: { children: ReactNode }) {
  return <ul className="m-0 grid gap-[0.35rem] pl-5 text-[0.9rem]">{children}</ul>;
}

function RedactedInput({ children }: { children: ReactNode }) {
  return (
    <pre className="mx-0 mt-2 mb-0 overflow-x-auto rounded-md border border-border bg-gray-50 p-3 font-mono text-[0.8rem] leading-normal break-all whitespace-pre-wrap text-fg dark:border-gray-600 dark:bg-[#0b0d12] dark:text-gray-200">
      {children}
    </pre>
  );
}

function MetaGrid({ children }: { children: ReactNode }) {
  return (
    <Panel as="dl" className="m-0 grid grid-cols-[repeat(auto-fit,minmax(14rem,1fr))] gap-4">
      {children}
    </Panel>
  );
}

function DecisionPair({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(18rem,1fr))] gap-4">{children}</div>
  );
}

function MetaField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[0.75rem] tracking-[0.04em] text-muted uppercase">{label}</dt>
      <dd className="mx-0 mt-1 mb-0">{children}</dd>
    </div>
  );
}

function TableHeadCell({ children, numeric = false }: { children: ReactNode; numeric?: boolean }) {
  return (
    <th
      scope="col"
      className={cx(
        'border-b border-gray-200 px-[0.6rem] py-2 text-left align-top text-[0.75rem] tracking-[0.04em] text-muted uppercase whitespace-nowrap dark:border-gray-700',
        numeric && 'text-right tabular-nums',
      )}
    >
      {children}
    </th>
  );
}

function TableCell({
  children,
  numeric = false,
  nowrap = false,
  mono = false,
  muted = false,
}: {
  children: ReactNode;
  numeric?: boolean;
  nowrap?: boolean;
  mono?: boolean;
  muted?: boolean;
}) {
  return (
    <td
      className={cx(
        'border-b border-gray-200 px-[0.6rem] py-2 text-left align-top dark:border-gray-700',
        numeric && 'text-right tabular-nums',
        nowrap && 'whitespace-nowrap',
        mono && 'break-all font-mono text-[0.85em]',
        muted && 'text-[0.9rem] text-muted',
      )}
    >
      {children}
    </td>
  );
}

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
        <PageTitle>Group</PageTitle>
        <LoadingState label="검토를 불러오는 중" />
      </section>
    );
  }
  if (reviewQuery.isError) {
    return (
      <section>
        <PageTitle>Group</PageTitle>
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
    <Stack as="section">
      <PageTitle>Diff Group</PageTitle>
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
    </Stack>
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
    <Stack as="section">
      <PageTitle>Adoption Group</PageTitle>
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
    </Stack>
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
    <Stack>
      <Hint>{foldHomePaths(group.headline)}</Hint>
      <MetaGrid>
        <MetaField label="방향">
          {group.direction} <SeverityBadge severity={group.severity} />
        </MetaField>
        <MetaField label="Capability">{group.capability}</MetaField>
        <MetaField label="Zone">{formatZoneTransition(group.fromZone, group.toZone)}</MetaField>
        <MetaField label="Effect">
          {formatZoneTransition(effectLabel(group.fromEffect), effectLabel(group.toEffect))}
        </MetaField>
        <MetaField label="Program">{group.program ?? '-'}</MetaField>
        <MetaField label="Action / Session">
          {group.actionCount} / {group.sessionCount}
        </MetaField>
      </MetaGrid>
      {group.direction === 'widening' ? (
        <PanelRow>
          <SectionTitle as="span">판정</SectionTitle>
          <VerdictSelect
            reviewId={reviewId}
            kind="change"
            groupKey={group.groupKey}
            groupLabel={diffGroupLabel(group)}
            verdict={group.verdict}
            disabled={review.status !== 'ready'}
          />
        </PanelRow>
      ) : null}
      <Hint>
        검토를 마치려면{' '}
        <Link to="/change-reviews/$reviewId" params={{ reviewId: review.id }}>
          변경 검토로 돌아가세요
        </Link>
        .
      </Hint>
    </Stack>
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
    <Stack>
      <Hint>{foldHomePaths(group.headline)}</Hint>
      <MetaGrid>
        <MetaField label="Effect">
          <EffectBadge effect={group.effect}>{effectLabel(group.effect)}</EffectBadge>
        </MetaField>
        <MetaField label="Capability">{group.capability}</MetaField>
        <MetaField label="Zone">{group.zone}</MetaField>
        <MetaField label="Action / Session">
          {group.actionCount} / {group.sessionCount}
        </MetaField>
        <MetaField label="분석 불가 Action">{group.analyzabilityNoneCount}</MetaField>
        <MetaField label="기간">
          {group.firstOccurredAt} → {group.lastOccurredAt}
        </MetaField>
      </MetaGrid>
      <ProgramMix group={group} />
      <PanelRow>
        <SectionTitle as="span">판정</SectionTitle>
        <VerdictSelect
          reviewId={reviewId}
          kind="adoption"
          groupKey={group.groupKey}
          groupLabel={adoptionGroupLabel(group)}
          verdict={group.verdict}
          disabled={review.status !== 'ready'}
        />
      </PanelRow>
      <Hint>
        검토를 마치려면{' '}
        <Link to="/change-reviews/$reviewId" params={{ reviewId: review.id }}>
          최초 도입 검토로 돌아가세요
        </Link>
        .
      </Hint>
    </Stack>
  );
}

/** The programs mixed into one group: the signature carries none, so the mix is shown here. */
function ProgramMix({ group }: { group: ReviewAdoptionGroupResponse }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[0.9rem]">
        <caption className="pb-2 text-left text-[0.85rem] text-muted">
          Program 구성: 서로 다른 program {group.distinctProgramCount}개, 상위{' '}
          {group.programSummary.length}개 표시
        </caption>
        <thead>
          <tr>
            <TableHeadCell>Program</TableHeadCell>
            <TableHeadCell numeric>Action</TableHeadCell>
          </tr>
        </thead>
        <tbody>
          {group.programSummary.map((entry) => (
            <tr key={entry.program ?? '__none__'}>
              <TableCell muted={entry.program === null} mono={entry.program !== null}>
                {entry.program ?? '인식 안 됨'}
              </TableCell>
              <TableCell numeric>{entry.count}</TableCell>
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
    <Stack>
      <SectionTitle>Sample ({query.data.length})</SectionTitle>
      {query.data.map(render)}
    </Stack>
  );
}

function ChangeSampleCard({ sample }: { sample: DiffSample }) {
  const { action } = sample;
  return (
    <SampleCard>
      <div>
        <SectionTitle as="h3">도구 입력(가림 처리)</SectionTitle>
        <RedactedInput>{foldHomePaths(action.toolInputRedacted)}</RedactedInput>
      </div>
      <div>
        <SectionTitle as="h3">Operations ({action.operations.length})</SectionTitle>
        <IssueList>
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
        </IssueList>
      </div>
      <DecisionPair>
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
      </DecisionPair>
    </SampleCard>
  );
}

function AdoptionSampleCard({ sample }: { sample: AdoptionSample }) {
  const { action } = sample;
  return (
    <SampleCard>
      <div>
        <SectionTitle as="h3">도구 입력(가림 처리)</SectionTitle>
        <RedactedInput>{foldHomePaths(action.toolInputRedacted)}</RedactedInput>
      </div>
      <div>
        <SectionTitle as="h3">Operations ({action.operations.length})</SectionTitle>
        <IssueList>
          {action.operations.map((operation, position) => (
            <li key={operation.index}>
              #{operation.index} {operation.capability} ·{' '}
              {zoneOf(sample.candidateDecision, operation.index)} ·{' '}
              {foldHomePaths(sample.targetKeys[position] ?? 'unknown')}
            </li>
          ))}
        </IssueList>
      </div>
      <DecisionPair>
        <DecisionView
          title="제안 정책 결정"
          decision={sample.candidateDecision}
          rationales={sample.candidateRuleRationales}
        />
      </DecisionPair>
    </SampleCard>
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
    <Stack className="content-start">
      <RowBetween>
        <SectionTitle as="h4">{title}</SectionTitle>
        <EffectBadge effect={decision.effect}>{effectLabel(decision.effect)}</EffectBadge>
      </RowBetween>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[0.9rem]">
          <caption className="pb-2 text-left text-[0.85rem] text-muted">Operation별 결정</caption>
          <thead>
            <tr>
              <TableHeadCell>Op</TableHeadCell>
              <TableHeadCell>Zone</TableHeadCell>
              <TableHeadCell>Reversibility</TableHeadCell>
              <TableHeadCell>Effect</TableHeadCell>
              <TableHeadCell>근거</TableHeadCell>
            </tr>
          </thead>
          <tbody>
            {decision.operations.map((operation) => (
              <tr key={operation.operationIndex}>
                <TableCell mono>#{operation.operationIndex}</TableCell>
                <TableCell>{operation.zone}</TableCell>
                <TableCell>{operation.reversibility}</TableCell>
                <TableCell nowrap>
                  <EffectBadge effect={operation.effect}>
                    {effectLabel(operation.effect)}
                  </EffectBadge>
                </TableCell>
                <TableCell>
                  {operation.decidingRuleId === null
                    ? '-'
                    : (rationales[operation.decidingRuleId] ?? '-')}
                </TableCell>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <details>
        <summary>기술 세부</summary>
        <IssueList>
          {decision.operations.map((operation) => (
            <li key={operation.operationIndex} className="break-all font-mono text-[0.85em]">
              #{operation.operationIndex} {operation.decidingRuleId ?? '-'}
            </li>
          ))}
        </IssueList>
      </details>
    </Stack>
  );
}
