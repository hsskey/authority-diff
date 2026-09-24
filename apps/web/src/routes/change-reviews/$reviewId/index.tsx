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
  blockerLabel,
  bySeverityThenImpact,
  diffGroupLabel,
  effectLabel,
  formatShare,
  formatZoneTransition,
  traceSourcesLabel,
} from '../../../features/change-review/format.ts';
import { VerdictSelect } from '../../../features/change-review/VerdictSelect.tsx';
import { usePageTitle } from '../../../shared/use-page-title.ts';

export const Route = createFileRoute('/change-reviews/$reviewId/')({
  component: ChangeReviewPage,
});

type Effect = ReviewDiffGroupResponse['fromEffect'];
type ReviewKind = ChangeReviewResponse['kind'];
type ReviewStatus = ChangeReviewResponse['status'];
type Severity = ReviewDiffGroupResponse['severity'];

const EFFECTS: readonly Effect[] = ['allow', 'ask', 'deny'];

const PAGE_TITLE: Record<ReviewKind, string> = {
  change: '변경 검토',
  adoption: '최초 도입 검토',
};

const STATUS_LABEL: Record<ReviewStatus, string> = {
  computing: '계산 중',
  ready: '판정 대기',
  accepted: '채택됨',
  rejected: '반려됨',
  failed: '실패',
  withdrawn: '철회됨',
};

const DECISION_LABEL: Record<ReviewKind, { accept: string; reject: string; title: string }> = {
  change: { accept: '정책 변경 수락', reject: '정책 변경 반려', title: '정책 변경 결정' },
  adoption: { accept: '최초 정책 채택', reject: '최초 정책 반려', title: '최초 정책 채택 결정' },
};

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
  'inline-block rounded-full border border-current px-[0.6rem] py-[0.15rem] text-xs font-semibold';
const SEVERITY_BADGE =
  'inline-block rounded-full border border-current px-2 py-[0.1rem] text-xs font-semibold';
const PRIMARY_BUTTON =
  'cursor-pointer rounded-md border border-gray-800 bg-gray-900 px-[0.9rem] py-2 text-white disabled:cursor-not-allowed disabled:opacity-50';
const SECONDARY_BUTTON =
  'cursor-pointer rounded-md border border-gray-800 bg-transparent px-[0.9rem] py-2 text-inherit disabled:cursor-not-allowed disabled:opacity-50';
const BUTTON_LINK =
  'inline-block justify-self-start rounded-md border border-gray-800 bg-gray-900 px-[0.9rem] py-2 text-white no-underline';
const FIELD = 'grid max-w-96 gap-1 text-[0.85rem]';
const FIELD_INPUT =
  'rounded-md border border-gray-300 bg-white px-[0.6rem] py-[0.4rem] text-inherit dark:border-gray-600 dark:bg-gray-900';
const ISSUE_LIST = 'm-0 grid gap-[0.35rem] pl-5 text-[0.9rem]';
const META_GRID = 'm-0 grid grid-cols-[repeat(auto-fit,minmax(14rem,1fr))] gap-4';
const META_TERM = 'text-xs uppercase tracking-[0.04em] text-muted';
const META_VALUE = 'mx-0 mt-1 mb-0';
const SUMMARY_LINES =
  'm-0 grid gap-[0.4rem] rounded-lg border border-border bg-panel py-4 pr-5 pl-10 text-base';

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
    <h2 className="m-0 text-lg" id={id}>
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
      ? 'border-b border-gray-200 px-[0.6rem] py-2 text-left align-top font-semibold tracking-normal dark:border-gray-700'
      : 'whitespace-nowrap border-b border-gray-200 px-[0.6rem] py-2 text-left align-top text-xs uppercase tracking-[0.04em] text-muted dark:border-gray-700';
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
  usePageTitle(kind === undefined ? '검토' : PAGE_TITLE[kind]);

  return (
    <section>
      <h1 className="m-0 mb-4 text-2xl">{kind === undefined ? '검토' : PAGE_TITLE[kind]}</h1>
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
    <Stack>
      <TraceSources review={review} />
      {review.status === 'computing' ? (
        <PanelMessage muted role="status">
          과거 Action에 두 version을 대입하는 중입니다. 완료되면 화면이 갱신됩니다.
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
      <WithdrawPanel reviewId={reviewId} review={review} />
      <ReportDownload reviewId={reviewId} kind={review.kind} />
    </Stack>
  );
}

function TraceSources({ review }: { review: ChangeReviewResponse }) {
  return (
    <PanelMessage testId="trace-sources">{traceSourcesLabel(review.traceSources)}</PanelMessage>
  );
}

function ReviewMeta({ review }: { review: ChangeReviewResponse }) {
  return (
    <dl className={`${META_GRID} rounded-lg border border-border bg-panel px-5 py-4`}>
      <div>
        <dt className={META_TERM}>검토</dt>
        <dd className={`${META_VALUE} ${MONO}`}>{review.id}</dd>
      </div>
      <div>
        <dt className={META_TERM}>상태</dt>
        <dd className={META_VALUE}>
          <StatusBadge status={review.status} label={STATUS_LABEL[review.status]} />
        </dd>
      </div>
      <div>
        <dt className={META_TERM}>
          {review.kind === 'adoption' ? '제안 version' : '변경안 version'}
        </dt>
        <dd className={`${META_VALUE} ${MONO}`}>{review.candidateVersionId}</dd>
      </div>
      <div>
        <dt className={META_TERM}>기준 version</dt>
        <dd className={review.baselineVersionId === null ? META_VALUE : `${META_VALUE} ${MONO}`}>
          {review.baselineVersionId ?? '없음 (최초 도입)'}
        </dd>
      </div>
      <div>
        <dt className={META_TERM}>기간</dt>
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
  const stats = review.replaySummary.stats;
  const wideningActions = widening.reduce((sum, group) => sum + group.actionCount, 0);
  const narrowingActions = narrowing.reduce((sum, group) => sum + group.actionCount, 0);

  return (
    <ol className={SUMMARY_LINES}>
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
      <PanelMessage muted role="status">
        제안 정책을 과거 Action에 적용하는 중입니다. 완료되면 화면이 갱신됩니다.
      </PanelMessage>
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
    <Stack>
      <ol className={SUMMARY_LINES}>
        <li>
          평가한 action <strong>{evaluatedActions}</strong>건 (전체 {totalActions}건, Operation이
          없어 제외 {excludedActions}건)
        </li>
        <li>
          분석 불가(analyzability none) action <strong>{analyzability.none}</strong>건 (
          {formatShare(analyzability.none, evaluatedActions)})
        </li>
      </ol>
      <SectionTitle>제안 정책 적용 시 Effect</SectionTitle>
      <Hint>
        과거 Action에 제안 정책을 적용한 결과입니다. 과거 runtime의 승인 여부를 복원한 것이
        아닙니다.
      </Hint>
      <div className="grid grid-cols-3 gap-3" data-testid="adoption-effects">
        {EFFECTS.map((effect) => (
          <div
            key={effect}
            className={`grid gap-[0.15rem] rounded-lg border bg-panel px-5 py-4 text-center ${EFFECT_TONE[effect]}`}
          >
            <span className="text-[0.7rem] tracking-[0.05em] text-muted uppercase">
              {effectLabel(effect)}
            </span>
            <span className="text-2xl font-semibold tabular-nums">{effectCounts[effect]}</span>
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
      <SectionTitle id="effect-transitions">Effect 전이</SectionTitle>
      <DataTable labelledBy="effect-transitions">
        <thead>
          <tr>
            <HeaderCell>기준 \ 변경안</HeaderCell>
            {EFFECTS.map((to) => (
              <HeaderCell key={to} numeric>
                {effectLabel(to)}
              </HeaderCell>
            ))}
          </tr>
        </thead>
        <tbody>
          {EFFECTS.map((from) => (
            <tr key={from}>
              <HeaderCell scope="row">{effectLabel(from)}</HeaderCell>
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
  const sorted = [...groups].sort(bySeverityThenImpact);

  return (
    <Stack>
      <SectionTitle id="widening-groups">Widening group ({groups.length})</SectionTitle>
      {sorted.length === 0 ? (
        <Hint>넓어진 group이 없습니다.</Hint>
      ) : (
        <TableScroll>
          <DataTable labelledBy="widening-groups">
            <thead>
              <tr>
                <HeaderCell>Severity</HeaderCell>
                <HeaderCell>Capability</HeaderCell>
                <HeaderCell>Zone</HeaderCell>
                <HeaderCell>Effect</HeaderCell>
                <HeaderCell>Program</HeaderCell>
                <HeaderCell numeric>Action</HeaderCell>
                <HeaderCell numeric>Session</HeaderCell>
                <HeaderCell>판정</HeaderCell>
                <HeaderCell>상세</HeaderCell>
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
                    {formatZoneTransition(
                      effectLabel(group.fromEffect),
                      effectLabel(group.toEffect),
                    )}
                  </Cell>
                  <Cell>{group.program ?? '-'}</Cell>
                  <Cell numeric>{group.actionCount}</Cell>
                  <Cell numeric>{group.sessionCount}</Cell>
                  <Cell nowrap>
                    <VerdictSelect
                      reviewId={reviewId}
                      kind="change"
                      groupKey={group.groupKey}
                      groupLabel={diffGroupLabel(group)}
                      verdict={group.verdict}
                      disabled={!canJudge}
                    />
                  </Cell>
                  <Cell nowrap>
                    <Link
                      to="/change-reviews/$reviewId/groups/$groupKey"
                      params={{ reviewId, groupKey: group.groupKey }}
                    >
                      보기
                    </Link>
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
  if (groups.length === 0) {
    return null;
  }
  return (
    <Stack>
      <SectionTitle id="narrowing-groups">Narrowing group ({groups.length})</SectionTitle>
      <TableScroll>
        <DataTable labelledBy="narrowing-groups">
          <thead>
            <tr>
              <HeaderCell>Capability</HeaderCell>
              <HeaderCell>Zone</HeaderCell>
              <HeaderCell>Effect</HeaderCell>
              <HeaderCell numeric>Action</HeaderCell>
              <HeaderCell>상세</HeaderCell>
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <tr key={group.groupKey}>
                <Cell>{group.capability}</Cell>
                <Cell nowrap>{formatZoneTransition(group.fromZone, group.toZone)}</Cell>
                <Cell nowrap>
                  {formatZoneTransition(effectLabel(group.fromEffect), effectLabel(group.toEffect))}
                </Cell>
                <Cell numeric>{group.actionCount}</Cell>
                <Cell nowrap>
                  <Link
                    to="/change-reviews/$reviewId/groups/$groupKey"
                    params={{ reviewId, groupKey: group.groupKey }}
                  >
                    보기
                  </Link>
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
  return (
    <Stack>
      <SectionTitle id={`adoption-groups-${effect}`}>
        {title} ({groups.length})
      </SectionTitle>
      {groups.length === 0 ? (
        <Hint>이 정책에서 '{effectLabel(effect)}' 대상이 되는 group이 없습니다.</Hint>
      ) : (
        <TableScroll>
          <DataTable labelledBy={`adoption-groups-${effect}`}>
            <thead>
              <tr>
                <HeaderCell>Capability</HeaderCell>
                <HeaderCell>Zone</HeaderCell>
                <HeaderCell numeric>Program 수</HeaderCell>
                <HeaderCell numeric>Action</HeaderCell>
                <HeaderCell numeric>Session</HeaderCell>
                <HeaderCell>판정</HeaderCell>
                <HeaderCell>상세</HeaderCell>
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
                      groupLabel={adoptionGroupLabel(group)}
                      verdict={group.verdict}
                      disabled={!canJudge}
                    />
                  </Cell>
                  <Cell nowrap>
                    <Link
                      to="/change-reviews/$reviewId/groups/$groupKey"
                      params={{ reviewId, groupKey: group.groupKey }}
                    >
                      보기
                    </Link>
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
  const { gate } = review;
  return (
    <PanelStack role="status" tone={gate.isOpen ? 'ok' : 'error'}>
      <SectionTitle>
        Gate: {gate.isOpen ? '열림' : `blocker ${gate.blockers.length}건`}
      </SectionTitle>
      {gate.isOpen ? (
        <p className="m-0">승인을 막는 blocker가 없습니다.</p>
      ) : (
        <ul className={ISSUE_LIST}>
          {gate.blockers.map((blocker) => (
            <li key={blocker.code}>{blockerLabel(blocker.code, blocker.count)}</li>
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

  if (review.status === 'withdrawn') {
    return null;
  }
  const isDecided = review.status === 'accepted' || review.status === 'rejected';
  if (isDecided) {
    return (
      <PanelStack>
        <SectionTitle>결정 기록</SectionTitle>
        <dl className={META_GRID}>
          <div>
            <dt className={META_TERM}>결정</dt>
            <dd className={META_VALUE}>
              <StatusBadge
                status={review.status}
                label={review.status === 'accepted' ? labels.accept : labels.reject}
              />
            </dd>
          </div>
          <div>
            <dt className={META_TERM}>결정자</dt>
            <dd className={META_VALUE}>{review.decidedBy ?? '기록 없음'}</dd>
          </div>
          <div>
            <dt className={META_TERM}>시각</dt>
            <dd className={META_VALUE}>{review.decidedAt ?? '기록 없음'}</dd>
          </div>
          <div>
            <dt className={META_TERM}>사유</dt>
            <dd className={META_VALUE}>{review.decisionNote ?? '기록 없음'}</dd>
          </div>
        </dl>
        {review.kind === 'adoption' && review.status === 'accepted' ? (
          <Hint>
            채택은 검토 기록입니다. runtime 설정 반영은 Authority Diff 밖에서 이루어집니다.
          </Hint>
        ) : null}
      </PanelStack>
    );
  }

  const canSubmit = reviewerName.trim().length > 0 && !decide.isPending;

  return (
    <PanelStack>
      <SectionTitle>{labels.title}</SectionTitle>
      <label className={FIELD}>
        검토자 이름
        <input
          type="text"
          className={FIELD_INPUT}
          value={reviewerName}
          onChange={(event) => setReviewerName(event.target.value)}
        />
      </label>
      <label className={FIELD}>
        사유
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
            <li key={blocker.code}>{blockerLabel(blocker.code, blocker.count)}</li>
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
      {decide.error ? <ErrorMessage>결정 실패: {decide.error.message}</ErrorMessage> : null}
    </PanelStack>
  );
}

function WithdrawPanel({ reviewId, review }: { reviewId: string; review: ChangeReviewResponse }) {
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
        <SectionTitle>검토 철회됨</SectionTitle>
        <Hint>
          이 검토는 결정 없이 닫혔고 version이 draft로 돌아갔습니다. draft를 고친 뒤 새 검토를 만들
          수 있습니다.
        </Hint>
        <Actions>
          <Link
            className={BUTTON_LINK}
            to="/policies/$policyId/versions/$versionId"
            params={{ policyId: review.policyId, versionId: review.candidateVersionId }}
          >
            draft version 열기
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
      <SectionTitle>검토 철회</SectionTitle>
      <Hint>결정 없이 이 검토를 닫고 version을 draft로 되돌립니다. 결정 기록은 남지 않습니다.</Hint>
      <Actions>
        <button
          type="button"
          className={SECONDARY_BUTTON}
          disabled={withdraw.isPending}
          aria-busy={withdraw.isPending}
          onClick={() => withdraw.mutate()}
        >
          검토 철회
        </button>
      </Actions>
      {withdraw.error ? <ErrorMessage>철회 실패: {withdraw.error.message}</ErrorMessage> : null}
    </PanelStack>
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
    <PanelStack>
      <SectionTitle>보고서</SectionTitle>
      <Hint>결정 근거로 남길 Evidence Report를 Markdown으로 내려받습니다.</Hint>
      <Actions>
        <button
          type="button"
          className={PRIMARY_BUTTON}
          disabled={download.isPending}
          aria-busy={download.isPending}
          onClick={() => download.mutate()}
        >
          보고서 다운로드
        </button>
      </Actions>
      {download.error ? (
        <ErrorMessage>보고서 다운로드 실패: {download.error.message}</ErrorMessage>
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
