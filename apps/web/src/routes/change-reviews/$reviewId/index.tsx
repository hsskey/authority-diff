import { useEffect, useState, type ReactNode } from 'react';
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
  adoptionGroupLabel,
  bySeverityThenImpact,
  diffGroupLabel,
  formatShare,
  formatZoneTransition,
} from '../../../features/change-review/format.ts';
import { VerdictSelect } from '../../../features/change-review/VerdictSelect.tsx';
import { usePageTitle } from '../../../shared/use-page-title.ts';
import { TextLink } from '../../../shared/components/TextLink.tsx';
import { EmphasizedText } from '../../../shared/components/EmphasizedText.tsx';
import { useT } from '../../../shared/i18n/use-t.ts';

export const Route = createFileRoute('/change-reviews/$reviewId/')({
  component: ChangeReviewPage,
});

type Effect = ReviewDiffGroupResponse['fromEffect'];
type ReviewKind = ChangeReviewResponse['kind'];
type ReviewStatus = ChangeReviewResponse['status'];
type Severity = ReviewDiffGroupResponse['severity'];

const EFFECTS: readonly Effect[] = ['allow', 'ask', 'deny'];

const STATUS_TONE: Record<ReviewStatus, string> = {
  computing: 'text-blue-700',
  ready: 'text-blue-700',
  accepted: 'text-emerald-700',
  rejected: 'text-red-700',
  failed: 'text-red-700',
  withdrawn: 'text-muted',
};

const SEVERITY_TONE: Record<Severity, string> = {
  critical: 'text-red-700',
  normal: 'text-muted',
};

const EFFECT_TONE: Record<Effect, string> = {
  allow: 'border-emerald-700 text-emerald-700',
  ask: 'border-amber-700 text-amber-700',
  deny: 'border-red-700 text-red-700',
};

const MONO = 'break-all font-mono text-[0.85em]';
const BADGE =
  'inline-block rounded-full border border-current px-[0.6rem] py-[0.15rem] text-[0.75rem] font-semibold';
const SEVERITY_BADGE =
  'inline-block rounded-full border border-current px-2 py-[0.1rem] text-[0.75rem] font-semibold';
const PRIMARY_BUTTON =
  'cursor-pointer rounded-md border border-gray-800 bg-gray-900 px-[0.9rem] py-2 text-white disabled:cursor-not-allowed disabled:opacity-50';
const SECONDARY_BUTTON =
  'cursor-pointer rounded-md border border-gray-800 bg-transparent px-[0.9rem] py-2 text-inherit disabled:cursor-not-allowed disabled:opacity-50';
const BUTTON_LINK =
  'inline-block justify-self-start rounded-md border border-gray-800 bg-gray-900 px-[0.9rem] py-2 text-white no-underline';
const FIELD = 'grid max-w-96 gap-1 text-[0.85rem]';
const FIELD_INPUT =
  'rounded-md border border-gray-300 bg-white px-[0.6rem] py-[0.4rem] text-inherit dark:border-gray-600 dark:bg-gray-900';
const ISSUE_LIST = 'm-0 grid list-disc gap-[0.35rem] pl-5 text-[0.9rem]';
const META_GRID = 'm-0 grid grid-cols-[repeat(auto-fit,minmax(14rem,1fr))] gap-4';
const META_TERM = 'text-[0.75rem] uppercase tracking-[0.04em] text-muted';
const META_VALUE = 'mx-0 mt-1 mb-0';
const SUMMARY_LINES =
  'm-0 grid list-decimal gap-[0.4rem] rounded-lg border border-border bg-panel py-4 pr-5 pl-10 text-base';

function Stack({ children }: { children: ReactNode }) {
  return <div className="grid gap-5">{children}</div>;
}

function PanelStack({
  children,
  role,
  tone,
}: {
  children: ReactNode;
  role?: 'status';
  tone?: 'ok' | 'error';
}) {
  const toneClass = tone === 'ok' ? 'text-emerald-700' : tone === 'error' ? 'text-red-700' : '';
  return (
    <div
      className={`grid gap-5 rounded-lg border border-border bg-panel px-5 py-4${toneClass ? ` ${toneClass}` : ''}`}
      role={role}
    >
      {children}
    </div>
  );
}

function PanelMessage({
  children,
  muted = false,
  role,
  testId,
}: {
  children: ReactNode;
  muted?: boolean;
  role?: 'status';
  testId?: string;
}) {
  return (
    <p
      className={`m-0 rounded-lg border border-border bg-panel px-5 py-4${muted ? ' text-[0.9rem] text-muted' : ''}`}
      role={role}
      data-testid={testId}
    >
      {children}
    </p>
  );
}

function SectionTitle({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h2 className="m-0 text-[1.125rem]" id={id}>
      {children}
    </h2>
  );
}

function Hint({ children }: { children: ReactNode }) {
  return <p className="m-0 text-[0.9rem] text-muted">{children}</p>;
}

function ErrorMessage({ children }: { children: ReactNode }) {
  return (
    <p className="m-0 text-red-700" role="alert">
      {children}
    </p>
  );
}

function Actions({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-3">{children}</div>;
}

function TableScroll({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto">{children}</div>;
}

function DataTable({ labelledBy, children }: { labelledBy: string; children: ReactNode }) {
  return (
    <table className="w-full border-collapse text-[0.9rem]" aria-labelledby={labelledBy}>
      {children}
    </table>
  );
}

function HeaderCell({
  children,
  numeric = false,
  scope = 'col',
}: {
  children: ReactNode;
  numeric?: boolean;
  scope?: 'col' | 'row';
}) {
  const base =
    scope === 'row'
      ? 'border-b border-gray-200 px-[0.6rem] py-2 text-left align-top text-[0.75rem] font-semibold tracking-normal dark:border-gray-700'
      : 'whitespace-nowrap border-b border-gray-200 px-[0.6rem] py-2 text-left align-top text-[0.75rem] uppercase tracking-[0.04em] text-muted dark:border-gray-700';
  return (
    <th scope={scope} className={numeric ? `${base} text-right tabular-nums` : base}>
      {children}
    </th>
  );
}

function Cell({
  children,
  numeric = false,
  nowrap = false,
  changed = false,
}: {
  children: ReactNode;
  numeric?: boolean;
  nowrap?: boolean;
  changed?: boolean;
}) {
  const numericClass = numeric ? ' text-right tabular-nums' : '';
  const nowrapClass = nowrap ? ' whitespace-nowrap' : '';
  const changedClass = changed ? ' font-semibold text-amber-700' : '';
  return (
    <td
      className={`border-b border-gray-200 px-[0.6rem] py-2 text-left align-top dark:border-gray-700${numericClass}${nowrapClass}${changedClass}`}
    >
      {children}
    </td>
  );
}

function StatusBadge({ status, label }: { status: ReviewStatus; label: string }) {
  return <span className={`${BADGE} ${STATUS_TONE[status]}`}>{label}</span>;
}

function ChangeReviewPage() {
  const { reviewId } = Route.useParams();
  const t = useT();
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
  const title = kind === undefined ? t.review.pendingTitle : t.review.title[kind];
  usePageTitle(title);

  return (
    <section>
      <h1 className="m-0 mb-4 text-[1.5rem]">{title}</h1>
      {isPending ? <LoadingState label={t.review.loading} /> : null}
      {reviewQuery.isError ? (
        <ErrorState
          title={t.review.loadFailed}
          message={reviewQuery.error?.message ?? t.common.unknownError}
        />
      ) : null}
      {groupsQuery.isError ? (
        <ErrorState
          title={t.review.groupsLoadFailed}
          message={groupsQuery.error?.message ?? t.common.unknownError}
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
  const t = useT();
  const widening = groups.filter((group) => group.direction === 'widening');
  const narrowing = groups.filter((group) => group.direction === 'narrowing');

  return (
    <Stack>
      <TraceSources review={review} />
      {review.status === 'computing' ? (
        <PanelMessage muted role="status">
          {t.review.computingChange}
        </PanelMessage>
      ) : null}
      <ReviewMeta review={review} />
      <SummaryLines review={review} widening={widening} narrowing={narrowing} />
      <TransitionMatrix review={review} />
      <WideningGroups reviewId={reviewId} groups={widening} canJudge={review.status === 'ready'} />
      <NarrowingGroups reviewId={reviewId} groups={narrowing} />
      <GateBlockers review={review} />
      <DecisionPanel reviewId={reviewId} review={review} />
      <WithdrawPanel reviewId={reviewId} review={review} />
      <ReportDownload reviewId={reviewId} kind={review.kind} />
    </Stack>
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
  const t = useT();
  const ask = groups.filter((group) => group.effect === 'ask');
  const deny = groups.filter((group) => group.effect === 'deny');
  const canJudge = review.status === 'ready';

  return (
    <Stack>
      <TraceSources review={review} />
      <ReviewMeta review={review} />
      <AdoptionSummary review={review} />
      <AdoptionGroups
        reviewId={reviewId}
        title={t.review.askGroups}
        effect="ask"
        groups={ask}
        canJudge={canJudge}
      />
      <AdoptionGroups
        reviewId={reviewId}
        title={t.review.denyGroups}
        effect="deny"
        groups={deny}
        canJudge={canJudge}
      />
      <GateBlockers review={review} />
      <DecisionPanel reviewId={reviewId} review={review} />
      <WithdrawPanel reviewId={reviewId} review={review} />
      <ReportDownload reviewId={reviewId} kind={review.kind} />
    </Stack>
  );
}

function TraceSources({ review }: { review: ChangeReviewResponse }) {
  const t = useT();
  return <PanelMessage testId="trace-sources">{t.traceSources(review.traceSources)}</PanelMessage>;
}

function ReviewMeta({ review }: { review: ChangeReviewResponse }) {
  const t = useT();
  return (
    <dl className={`${META_GRID} rounded-lg border border-border bg-panel px-5 py-4`}>
      <div>
        <dt className={META_TERM}>{t.review.meta.review}</dt>
        <dd className={`${META_VALUE} ${MONO}`}>{review.id}</dd>
      </div>
      <div>
        <dt className={META_TERM}>{t.review.meta.status}</dt>
        <dd className={META_VALUE}>
          <StatusBadge status={review.status} label={t.review.status[review.status]} />
        </dd>
      </div>
      <div>
        <dt className={META_TERM}>
          {review.kind === 'adoption'
            ? t.review.meta.proposedVersion
            : t.review.meta.candidateVersion}
        </dt>
        <dd className={`${META_VALUE} ${MONO}`}>{review.candidateVersionId}</dd>
      </div>
      <div>
        <dt className={META_TERM}>{t.common.baselineVersion}</dt>
        <dd className={review.baselineVersionId === null ? META_VALUE : `${META_VALUE} ${MONO}`}>
          {review.baselineVersionId ?? t.review.meta.noBaseline}
        </dd>
      </div>
      <div>
        <dt className={META_TERM}>{t.common.period}</dt>
        <dd className={META_VALUE}>
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
  const t = useT();
  const stats = review.replaySummary.stats;
  const wideningActions = widening.reduce((sum, group) => sum + group.actionCount, 0);
  const narrowingActions = narrowing.reduce((sum, group) => sum + group.actionCount, 0);

  return (
    <ol className={SUMMARY_LINES}>
      <li>
        <EmphasizedText
          parts={t.review.evaluatedActions(stats ? stats.evaluatedActions : t.review.computing)}
        />
      </li>
      <li>
        <EmphasizedText parts={t.review.widenedActions(wideningActions, widening.length)} />
      </li>
      <li>
        <EmphasizedText parts={t.review.narrowedActions(narrowingActions, narrowing.length)} />
      </li>
    </ol>
  );
}

/** An adoption review's counts live on its replay run, not on the review summary. */
function AdoptionSummary({ review }: { review: ChangeReviewResponse }) {
  const t = useT();
  const runId = review.replaySummary.replayRunId;
  const runQuery = useQuery({
    queryKey: ['replay-run', runId],
    enabled: runId !== null && review.status !== 'computing',
    queryFn: async () => {
      if (runId === null) {
        throw new Error(t.common.replayRunNotLinked);
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
      <PanelMessage muted role="status">
        {t.review.computingAdoption}
      </PanelMessage>
    );
  }
  if (runQuery.isPending) {
    return <LoadingState label={t.review.loadingResults} />;
  }
  if (runQuery.isError) {
    return (
      <ErrorState
        title={t.review.resultsLoadFailed}
        message={runQuery.error?.message ?? t.common.unknownError}
      />
    );
  }
  return <AdoptionStats run={runQuery.data} />;
}

function AdoptionStats({ run }: { run: ReplayRunResponse }) {
  const t = useT();
  if (run.kind !== 'adoption' || run.stats === null) {
    return null;
  }
  const { effectCounts, evaluatedActions, totalActions, excludedActions, analyzability } =
    run.stats;
  return (
    <Stack>
      <ol className={SUMMARY_LINES}>
        <li>
          <EmphasizedText
            parts={t.review.adoptionEvaluated(evaluatedActions, totalActions, excludedActions)}
          />
        </li>
        <li>
          <EmphasizedText
            parts={t.review.adoptionNotAnalyzable(
              analyzability.none,
              formatShare(analyzability.none, evaluatedActions),
            )}
          />
        </li>
      </ol>
      <SectionTitle>{t.review.adoptionEffectsTitle}</SectionTitle>
      <Hint>{t.review.adoptionEffectsHint}</Hint>
      <div className="grid grid-cols-3 gap-3" data-testid="adoption-effects">
        {EFFECTS.map((effect) => (
          <div
            key={effect}
            className={`grid gap-[0.15rem] rounded-lg border bg-panel px-5 py-4 text-center ${EFFECT_TONE[effect]}`}
          >
            <span className="text-[0.7rem] tracking-[0.05em] text-muted uppercase">
              {t.effect[effect]}
            </span>
            <span className="text-[1.5rem] font-semibold tabular-nums">{effectCounts[effect]}</span>
            <span className="text-[0.8rem] text-muted">
              {formatShare(effectCounts[effect], evaluatedActions)}
            </span>
          </div>
        ))}
      </div>
    </Stack>
  );
}

function TransitionMatrix({ review }: { review: ChangeReviewResponse }) {
  const t = useT();
  const stats = review.replaySummary.stats;
  if (stats === null) {
    return null;
  }
  const counts = new Map<string, number>();
  for (const transition of stats.transitions) {
    counts.set(`${transition.from}->${transition.to}`, transition.count);
  }

  return (
    <Stack>
      <SectionTitle id="effect-transitions">{t.review.transitionsTitle}</SectionTitle>
      <DataTable labelledBy="effect-transitions">
        <thead>
          <tr>
            <HeaderCell>{t.review.transitionsCorner}</HeaderCell>
            {EFFECTS.map((to) => (
              <HeaderCell key={to} numeric>
                {t.effect[to]}
              </HeaderCell>
            ))}
          </tr>
        </thead>
        <tbody>
          {EFFECTS.map((from) => (
            <tr key={from}>
              <HeaderCell scope="row">{t.effect[from]}</HeaderCell>
              {EFFECTS.map((to) => {
                const count = counts.get(`${from}->${to}`) ?? 0;
                const isDiagonal = from === to;
                return (
                  <Cell key={to} numeric changed={!isDiagonal}>
                    {count}
                  </Cell>
                );
              })}
            </tr>
          ))}
        </tbody>
      </DataTable>
    </Stack>
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
  const t = useT();
  const sorted = [...groups].sort(bySeverityThenImpact);

  return (
    <Stack>
      <SectionTitle id="widening-groups">{t.review.wideningTitle(groups.length)}</SectionTitle>
      {sorted.length === 0 ? (
        <Hint>{t.review.noWidening}</Hint>
      ) : (
        <TableScroll>
          <DataTable labelledBy="widening-groups">
            <thead>
              <tr>
                <HeaderCell>{t.review.severity}</HeaderCell>
                <HeaderCell>{t.review.capability}</HeaderCell>
                <HeaderCell>{t.review.zone}</HeaderCell>
                <HeaderCell>{t.review.effect}</HeaderCell>
                <HeaderCell>{t.review.program}</HeaderCell>
                <HeaderCell numeric>{t.review.action}</HeaderCell>
                <HeaderCell numeric>{t.review.session}</HeaderCell>
                <HeaderCell>{t.review.verdict}</HeaderCell>
                <HeaderCell>{t.review.detail}</HeaderCell>
              </tr>
            </thead>
            <tbody>
              {sorted.map((group) => (
                <tr key={group.groupKey}>
                  <Cell nowrap>
                    <span className={`${SEVERITY_BADGE} ${SEVERITY_TONE[group.severity]}`}>
                      {group.severity}
                    </span>
                  </Cell>
                  <Cell>{group.capability}</Cell>
                  <Cell nowrap>{formatZoneTransition(group.fromZone, group.toZone)}</Cell>
                  <Cell nowrap>
                    {formatZoneTransition(t.effect[group.fromEffect], t.effect[group.toEffect])}
                  </Cell>
                  <Cell>{group.program ?? '-'}</Cell>
                  <Cell numeric>{group.actionCount}</Cell>
                  <Cell numeric>{group.sessionCount}</Cell>
                  <Cell nowrap>
                    <VerdictSelect
                      reviewId={reviewId}
                      kind="change"
                      groupKey={group.groupKey}
                      groupLabel={diffGroupLabel(t, group)}
                      verdict={group.verdict}
                      disabled={!canJudge}
                    />
                  </Cell>
                  <Cell nowrap>
                    <TextLink
                      to="/change-reviews/$reviewId/groups/$groupKey"
                      params={{ reviewId, groupKey: group.groupKey }}
                    >
                      {t.common.view}
                    </TextLink>
                  </Cell>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </TableScroll>
      )}
    </Stack>
  );
}

function NarrowingGroups({
  reviewId,
  groups,
}: {
  reviewId: string;
  groups: readonly ReviewDiffGroupResponse[];
}) {
  const t = useT();
  if (groups.length === 0) {
    return null;
  }
  return (
    <Stack>
      <SectionTitle id="narrowing-groups">{t.review.narrowingTitle(groups.length)}</SectionTitle>
      <TableScroll>
        <DataTable labelledBy="narrowing-groups">
          <thead>
            <tr>
              <HeaderCell>{t.review.capability}</HeaderCell>
              <HeaderCell>{t.review.zone}</HeaderCell>
              <HeaderCell>{t.review.effect}</HeaderCell>
              <HeaderCell numeric>{t.review.action}</HeaderCell>
              <HeaderCell>{t.review.detail}</HeaderCell>
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <tr key={group.groupKey}>
                <Cell>{group.capability}</Cell>
                <Cell nowrap>{formatZoneTransition(group.fromZone, group.toZone)}</Cell>
                <Cell nowrap>
                  {formatZoneTransition(t.effect[group.fromEffect], t.effect[group.toEffect])}
                </Cell>
                <Cell numeric>{group.actionCount}</Cell>
                <Cell nowrap>
                  <TextLink
                    to="/change-reviews/$reviewId/groups/$groupKey"
                    params={{ reviewId, groupKey: group.groupKey }}
                  >
                    {t.common.view}
                  </TextLink>
                </Cell>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </TableScroll>
    </Stack>
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
  const t = useT();
  return (
    <Stack>
      <SectionTitle id={`adoption-groups-${effect}`}>
        {title} ({groups.length})
      </SectionTitle>
      {groups.length === 0 ? (
        <Hint>{t.review.noAdoptionGroups(t.effect[effect])}</Hint>
      ) : (
        <TableScroll>
          <DataTable labelledBy={`adoption-groups-${effect}`}>
            <thead>
              <tr>
                <HeaderCell>{t.review.capability}</HeaderCell>
                <HeaderCell>{t.review.zone}</HeaderCell>
                <HeaderCell numeric>{t.review.programs}</HeaderCell>
                <HeaderCell numeric>{t.review.action}</HeaderCell>
                <HeaderCell numeric>{t.review.session}</HeaderCell>
                <HeaderCell>{t.review.verdict}</HeaderCell>
                <HeaderCell>{t.review.detail}</HeaderCell>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <tr key={group.groupKey}>
                  <Cell>{group.capability}</Cell>
                  <Cell>{group.zone}</Cell>
                  <Cell numeric>{group.distinctProgramCount}</Cell>
                  <Cell numeric>{group.actionCount}</Cell>
                  <Cell numeric>{group.sessionCount}</Cell>
                  <Cell nowrap>
                    <VerdictSelect
                      reviewId={reviewId}
                      kind="adoption"
                      groupKey={group.groupKey}
                      groupLabel={adoptionGroupLabel(t, group)}
                      verdict={group.verdict}
                      disabled={!canJudge}
                    />
                  </Cell>
                  <Cell nowrap>
                    <TextLink
                      to="/change-reviews/$reviewId/groups/$groupKey"
                      params={{ reviewId, groupKey: group.groupKey }}
                    >
                      {t.common.view}
                    </TextLink>
                  </Cell>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </TableScroll>
      )}
    </Stack>
  );
}

function GateBlockers({ review }: { review: ChangeReviewResponse }) {
  const t = useT();
  const { gate } = review;
  return (
    <PanelStack role="status" tone={gate.isOpen ? 'ok' : 'error'}>
      <SectionTitle>{t.review.gateTitle(gate.isOpen, gate.blockers.length)}</SectionTitle>
      {gate.isOpen ? (
        <p className="m-0">{t.review.gateOpen}</p>
      ) : (
        <ul className={ISSUE_LIST}>
          {gate.blockers.map((blocker) => (
            <li key={blocker.code}>{t.blocker[blocker.code](blocker.count)}</li>
          ))}
        </ul>
      )}
    </PanelStack>
  );
}

function DecisionPanel({ reviewId, review }: { reviewId: string; review: ChangeReviewResponse }) {
  const queryClient = useQueryClient();
  const [reviewerName, setReviewerName] = useState('');
  const [note, setNote] = useState('');
  const t = useT();
  const labels = t.review.decision[review.kind];

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

  if (review.status === 'withdrawn') {
    return null;
  }
  const isDecided = review.status === 'accepted' || review.status === 'rejected';
  if (isDecided) {
    return (
      <PanelStack>
        <SectionTitle>{t.review.decisionRecord}</SectionTitle>
        <dl className={META_GRID}>
          <div>
            <dt className={META_TERM}>{t.review.decisionTerm}</dt>
            <dd className={META_VALUE}>
              <StatusBadge
                status={review.status}
                label={review.status === 'accepted' ? labels.accept : labels.reject}
              />
            </dd>
          </div>
          <div>
            <dt className={META_TERM}>{t.review.decidedBy}</dt>
            <dd className={META_VALUE}>{review.decidedBy ?? t.review.notRecorded}</dd>
          </div>
          <div>
            <dt className={META_TERM}>{t.review.decidedAt}</dt>
            <dd className={META_VALUE}>{review.decidedAt ?? t.review.notRecorded}</dd>
          </div>
          <div>
            <dt className={META_TERM}>{t.review.reason}</dt>
            <dd className={META_VALUE}>{review.decisionNote ?? t.review.notRecorded}</dd>
          </div>
        </dl>
        {review.kind === 'adoption' && review.status === 'accepted' ? (
          <Hint>{t.review.adoptionAcceptedHint}</Hint>
        ) : null}
      </PanelStack>
    );
  }

  const canSubmit = reviewerName.trim().length > 0 && !decide.isPending;

  return (
    <PanelStack>
      <SectionTitle>{labels.title}</SectionTitle>
      <label className={FIELD}>
        {t.review.reviewerName}
        <input
          type="text"
          className={FIELD_INPUT}
          value={reviewerName}
          onChange={(event) => setReviewerName(event.target.value)}
        />
      </label>
      <label className={FIELD}>
        {t.review.reason}
        <input
          type="text"
          className={FIELD_INPUT}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </label>
      {!review.gate.isOpen ? (
        <ul className={ISSUE_LIST}>
          {review.gate.blockers.map((blocker) => (
            <li key={blocker.code}>{t.blocker[blocker.code](blocker.count)}</li>
          ))}
        </ul>
      ) : null}
      <Actions>
        <button
          type="button"
          className={PRIMARY_BUTTON}
          disabled={!canSubmit || !review.gate.isOpen || review.status !== 'ready'}
          aria-busy={decide.isPending}
          onClick={() => decide.mutate('accept')}
        >
          {labels.accept}
        </button>
        <button
          type="button"
          className={SECONDARY_BUTTON}
          disabled={!canSubmit || review.status !== 'ready'}
          aria-busy={decide.isPending}
          onClick={() => decide.mutate('reject')}
        >
          {labels.reject}
        </button>
      </Actions>
      {decide.error ? (
        <ErrorMessage>
          {t.review.decisionFailed}: {decide.error.message}
        </ErrorMessage>
      ) : null}
    </PanelStack>
  );
}

function WithdrawPanel({ reviewId, review }: { reviewId: string; review: ChangeReviewResponse }) {
  const t = useT();
  const queryClient = useQueryClient();

  const withdraw = useMutation({
    mutationFn: async () => {
      const result = await callRoute(routes.withdrawChangeReview, { params: { id: reviewId } });
      if (!result.ok) {
        throw new Error(describeApiError(result.error));
      }
      return result.value;
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(['change-review', reviewId], updated);
      void queryClient.invalidateQueries({ queryKey: ['change-review', reviewId] });
      void queryClient.invalidateQueries({
        queryKey: ['policy-version', updated.candidateVersionId],
      });
      void queryClient.invalidateQueries({ queryKey: ['policy-versions', updated.policyId] });
      void queryClient.invalidateQueries({ queryKey: ['policy-change-reviews', updated.policyId] });
    },
  });

  if (review.status === 'withdrawn') {
    return (
      <PanelStack>
        <SectionTitle>{t.review.withdrawnTitle}</SectionTitle>
        <Hint>{t.review.withdrawnHint}</Hint>
        <Actions>
          <Link
            className={BUTTON_LINK}
            to="/policies/$policyId/versions/$versionId"
            params={{ policyId: review.policyId, versionId: review.candidateVersionId }}
          >
            {t.review.openDraft}
          </Link>
        </Actions>
      </PanelStack>
    );
  }
  if (review.status !== 'computing' && review.status !== 'ready') {
    return null;
  }

  return (
    <PanelStack>
      <SectionTitle>{t.review.withdrawTitle}</SectionTitle>
      <Hint>{t.review.withdrawHint}</Hint>
      <Actions>
        <button
          type="button"
          className={SECONDARY_BUTTON}
          disabled={withdraw.isPending}
          aria-busy={withdraw.isPending}
          onClick={() => withdraw.mutate()}
        >
          {t.review.withdraw}
        </button>
      </Actions>
      {withdraw.error ? (
        <ErrorMessage>
          {t.review.withdrawFailed}: {withdraw.error.message}
        </ErrorMessage>
      ) : null}
    </PanelStack>
  );
}

function ReportDownload({ reviewId, kind }: { reviewId: string; kind: ReviewKind }) {
  const t = useT();
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
    <PanelStack>
      <SectionTitle>{t.review.reportTitle}</SectionTitle>
      <Hint>{t.review.reportHint}</Hint>
      <Actions>
        <button
          type="button"
          className={PRIMARY_BUTTON}
          disabled={download.isPending}
          aria-busy={download.isPending}
          onClick={() => download.mutate()}
        >
          {t.review.downloadReport}
        </button>
      </Actions>
      {download.error ? (
        <ErrorMessage>
          {t.review.downloadFailed}: {download.error.message}
        </ErrorMessage>
      ) : null}
    </PanelStack>
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
