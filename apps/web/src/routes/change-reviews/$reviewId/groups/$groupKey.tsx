import type { ReactNode } from 'react';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
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
  adoptionGroupHeadline,
  adoptionGroupLabel,
  diffGroupHeadline,
  diffGroupLabel,
  formatZoneTransition,
} from '../../../../features/change-review/format.ts';
import { VerdictSelect } from '../../../../features/change-review/VerdictSelect.tsx';
import { usePageTitle } from '../../../../shared/use-page-title.ts';
import { TextLink } from '../../../../shared/components/TextLink.tsx';
import { useT } from '../../../../shared/i18n/use-t.ts';

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
  allow: 'bg-[#047857]/12 text-[#047857]',
  ask: 'bg-[#b45309]/12 text-[#b45309]',
  deny: 'bg-[#b91c1c]/12 text-[#b91c1c]',
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
        severity === 'critical' ? 'text-[#b91c1c]' : 'text-[#6b7280]',
      )}
    >
      {severity}
    </span>
  );
}

function IssueList({ children }: { children: ReactNode }) {
  return <ul className="m-0 grid list-disc gap-[0.35rem] pl-5 text-[0.9rem]">{children}</ul>;
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
      <dt className="text-[0.75rem] tracking-[0.04em] text-[#6b7280] uppercase">{label}</dt>
      <dd className="mx-0 mt-1 mb-0">{children}</dd>
    </div>
  );
}

function TableHeadCell({ children, numeric = false }: { children: ReactNode; numeric?: boolean }) {
  return (
    <th
      scope="col"
      className={cx(
        'border-b border-gray-200 px-[0.6rem] py-2 text-left align-top text-[0.75rem] tracking-[0.04em] text-[#6b7280] uppercase whitespace-nowrap dark:border-gray-700',
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
  const t = useT();
  const reviewQuery = useReview(reviewId);
  const pendingTitle =
    reviewQuery.data === undefined
      ? t.group.title
      : reviewQuery.data.kind === 'adoption'
        ? t.group.adoptionTitle
        : t.group.diffTitle;
  usePageTitle(pendingTitle);

  if (reviewQuery.isPending) {
    return (
      <section>
        <PageTitle>{t.group.title}</PageTitle>
        <LoadingState label={t.review.loading} />
      </section>
    );
  }
  if (reviewQuery.isError) {
    return (
      <section>
        <PageTitle>{t.group.title}</PageTitle>
        <ErrorState
          title={t.review.loadFailed}
          message={reviewQuery.error?.message ?? t.common.unknownError}
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
  const t = useT();
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
        throw new Error(t.common.replayRunNotLinked);
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
      <PageTitle>{t.group.diffTitle}</PageTitle>
      {groupsQuery.isPending ? <LoadingState label={t.group.loadingDiff} /> : null}
      {groupsQuery.isError ? (
        <ErrorState
          title={t.group.diffLoadFailed}
          message={groupsQuery.error?.message ?? t.common.unknownError}
        />
      ) : null}
      {groupsQuery.isSuccess && group === null ? (
        <EmptyState title={t.group.diffNotFound} message={t.group.diffNotFoundMessage(groupKey)} />
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
  const t = useT();
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
        throw new Error(t.common.replayRunNotLinked);
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
      <PageTitle>{t.group.adoptionTitle}</PageTitle>
      {groupsQuery.isPending ? <LoadingState label={t.group.loadingAdoption} /> : null}
      {groupsQuery.isError ? (
        <ErrorState
          title={t.group.adoptionLoadFailed}
          message={groupsQuery.error?.message ?? t.common.unknownError}
        />
      ) : null}
      {groupsQuery.isSuccess && group === null ? (
        <EmptyState
          title={t.group.adoptionNotFound}
          message={t.group.adoptionNotFoundMessage(groupKey)}
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
  const t = useT();
  return (
    <Stack>
      <Hint>{diffGroupHeadline(t, group)}</Hint>
      <MetaGrid>
        <MetaField label={t.group.direction}>
          {group.direction} <SeverityBadge severity={group.severity} />
        </MetaField>
        <MetaField label={t.group.capability}>{group.capability}</MetaField>
        <MetaField label={t.group.zone}>
          {formatZoneTransition(group.fromZone, group.toZone)}
        </MetaField>
        <MetaField label={t.group.effect}>
          {formatZoneTransition(t.effect[group.fromEffect], t.effect[group.toEffect])}
        </MetaField>
        <MetaField label={t.group.program}>{group.program ?? '-'}</MetaField>
        <MetaField label={t.group.actionSession}>
          {group.actionCount} / {group.sessionCount}
        </MetaField>
      </MetaGrid>
      {group.direction === 'widening' ? (
        <PanelRow>
          <SectionTitle as="span">{t.verdict.label}</SectionTitle>
          <VerdictSelect
            reviewId={reviewId}
            kind="change"
            groupKey={group.groupKey}
            groupLabel={diffGroupLabel(t, group)}
            verdict={group.verdict}
            disabled={review.status !== 'ready'}
          />
        </PanelRow>
      ) : null}
      <Hint>
        {t.group.backPrefix}
        <TextLink to="/change-reviews/$reviewId" params={{ reviewId: review.id }}>
          {t.group.backToChange}
        </TextLink>
        {t.group.backSuffix}
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
  const t = useT();
  return (
    <Stack>
      <Hint>{adoptionGroupHeadline(t, group)}</Hint>
      <MetaGrid>
        <MetaField label={t.group.effect}>
          <EffectBadge effect={group.effect}>{t.effect[group.effect]}</EffectBadge>
        </MetaField>
        <MetaField label={t.group.capability}>{group.capability}</MetaField>
        <MetaField label={t.group.zone}>{group.zone}</MetaField>
        <MetaField label={t.group.actionSession}>
          {group.actionCount} / {group.sessionCount}
        </MetaField>
        <MetaField label={t.group.notAnalyzable}>{group.analyzabilityNoneCount}</MetaField>
        <MetaField label={t.common.period}>
          {group.firstOccurredAt} → {group.lastOccurredAt}
        </MetaField>
      </MetaGrid>
      <ProgramMix group={group} />
      <PanelRow>
        <SectionTitle as="span">{t.verdict.label}</SectionTitle>
        <VerdictSelect
          reviewId={reviewId}
          kind="adoption"
          groupKey={group.groupKey}
          groupLabel={adoptionGroupLabel(t, group)}
          verdict={group.verdict}
          disabled={review.status !== 'ready'}
        />
      </PanelRow>
      <Hint>
        {t.group.backPrefix}
        <TextLink to="/change-reviews/$reviewId" params={{ reviewId: review.id }}>
          {t.group.backToAdoption}
        </TextLink>
        {t.group.backSuffix}
      </Hint>
    </Stack>
  );
}

/** The programs mixed into one group: the signature carries none, so the mix is shown here. */
function ProgramMix({ group }: { group: ReviewAdoptionGroupResponse }) {
  const t = useT();
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[0.9rem]">
        <caption className="pb-2 text-left text-[0.85rem] text-[#6b7280]">
          {t.group.programMixCaption(group.distinctProgramCount, group.programSummary.length)}
        </caption>
        <thead>
          <tr>
            <TableHeadCell>{t.group.program}</TableHeadCell>
            <TableHeadCell numeric>{t.review.action}</TableHeadCell>
          </tr>
        </thead>
        <tbody>
          {group.programSummary.map((entry) => (
            <tr key={entry.program ?? '__none__'}>
              <TableCell muted={entry.program === null} mono={entry.program !== null}>
                {entry.program ?? t.group.unrecognized}
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
  const t = useT();
  if (replayRunId === null) {
    return <EmptyState title={t.group.noSamples} message={t.group.noReplayRun} />;
  }
  if (query.isPending) {
    return <LoadingState label={t.group.loadingSamples} />;
  }
  if (query.isError) {
    return (
      <ErrorState
        title={t.group.samplesLoadFailed}
        message={query.error?.message ?? t.common.unknownError}
      />
    );
  }
  if (!query.isSuccess || query.data.length === 0) {
    return <EmptyState title={t.group.noSamples} message={t.group.samplesExpired} />;
  }

  return (
    <Stack>
      <SectionTitle>{t.group.samplesTitle(query.data.length)}</SectionTitle>
      {query.data.map(render)}
    </Stack>
  );
}

function ChangeSampleCard({ sample }: { sample: DiffSample }) {
  const t = useT();
  const { action } = sample;
  return (
    <SampleCard>
      <div>
        <SectionTitle as="h3">{t.group.toolInput}</SectionTitle>
        <RedactedInput>{foldHomePaths(action.toolInputRedacted)}</RedactedInput>
      </div>
      <div>
        <SectionTitle as="h3">{t.group.operationsTitle(action.operations.length)}</SectionTitle>
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
          title={t.group.baselineDecision}
          decision={sample.baselineDecision}
          rationales={sample.baselineRuleRationales}
        />
        <DecisionView
          title={t.group.candidateDecision}
          decision={sample.candidateDecision}
          rationales={sample.candidateRuleRationales}
        />
      </DecisionPair>
    </SampleCard>
  );
}

function AdoptionSampleCard({ sample }: { sample: AdoptionSample }) {
  const t = useT();
  const { action } = sample;
  return (
    <SampleCard>
      <div>
        <SectionTitle as="h3">{t.group.toolInput}</SectionTitle>
        <RedactedInput>{foldHomePaths(action.toolInputRedacted)}</RedactedInput>
      </div>
      <div>
        <SectionTitle as="h3">{t.group.operationsTitle(action.operations.length)}</SectionTitle>
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
          title={t.group.proposedDecision}
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
  const t = useT();
  return (
    <Stack className="content-start">
      <RowBetween>
        <SectionTitle as="h4">{title}</SectionTitle>
        <EffectBadge effect={decision.effect}>{t.effect[decision.effect]}</EffectBadge>
      </RowBetween>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[0.9rem]">
          <caption className="pb-2 text-left text-[0.85rem] text-[#6b7280]">
            {t.group.perOperation}
          </caption>
          <thead>
            <tr>
              <TableHeadCell>{t.group.operation}</TableHeadCell>
              <TableHeadCell>{t.group.zone}</TableHeadCell>
              <TableHeadCell>{t.group.reversibility}</TableHeadCell>
              <TableHeadCell>{t.group.effect}</TableHeadCell>
              <TableHeadCell>{t.group.rationale}</TableHeadCell>
            </tr>
          </thead>
          <tbody>
            {decision.operations.map((operation) => (
              <tr key={operation.operationIndex}>
                <TableCell mono>#{operation.operationIndex}</TableCell>
                <TableCell>{operation.zone}</TableCell>
                <TableCell>{operation.reversibility}</TableCell>
                <TableCell nowrap>
                  <EffectBadge effect={operation.effect}>{t.effect[operation.effect]}</EffectBadge>
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
        <summary>{t.group.technicalDetails}</summary>
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
