import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router';
import type {
  ActivityOverviewResponse,
  AuthorityMapResponse,
  ChangeReviewResponse,
  PolicyResponse,
  PolicyVersionResponse,
  ReplayRunResponse,
} from '@authority/contracts/schema';
import { routes } from '@authority/contracts/routes';
import { callRoute, describeApiError } from '../shared/api-client.ts';
import { EmptyState } from '../shared/components/EmptyState.tsx';
import { ErrorState } from '../shared/components/ErrorState.tsx';
import { LoadingState } from '../shared/components/LoadingState.tsx';
import { usePageTitle } from '../shared/use-page-title.ts';
import {
  BUTTON_LINK,
  Actions,
  DataTable,
  EffectBadge,
  EffectSummary,
  EffectTile,
  Hint,
  MetaGrid,
  Mono,
  Panel,
  PrimaryButton,
  SectionTitle,
  Stack,
  StateMessage,
  TableCaption,
  Td,
  Th,
  TwoColumn,
} from '../features/activity-overview/ui.tsx';
import { formatShare } from '../features/change-review/format.ts';
import { useT } from '../shared/i18n/use-t.ts';
import { TextLink } from '../shared/components/TextLink.tsx';

export const Route = createFileRoute('/')({
  component: ActivityShapePage,
});

const WINDOW_DAYS = 30;
const ORG_POLICY_NAME = 'org-default';

type AuthorityMapCell = AuthorityMapResponse['cells'][number];
type Effect = AuthorityMapCell['effect'];
type AnalyzabilityLevel = keyof AuthorityMapResponse['analyzability'];
type Capability = keyof ActivityOverviewResponse['capabilityCounts'];
type TargetKind = keyof ActivityOverviewResponse['targetKindCounts'];

const EFFECT_ORDER: readonly Effect[] = ['allow', 'ask', 'deny'];
const ANALYZABILITY_ORDER: readonly AnalyzabilityLevel[] = ['full', 'partial', 'none'];
const ANALYZABILITY_EFFECT_CLASS: Record<AnalyzabilityLevel, Effect> = {
  full: 'allow',
  partial: 'ask',
  none: 'deny',
};
const CAPABILITIES: readonly Capability[] = [
  'read',
  'write',
  'delete',
  'execute',
  'install',
  'fetch',
  'send',
  'commit',
  'push',
  'rewrite',
  'deploy',
];
const TARGET_KINDS: readonly TargetKind[] = [
  'workspace_path',
  'other_path',
  'vcs_remote',
  'host',
  'package',
  'mcp',
  'deploy_target',
  'unknown',
];

function rankedCounts<K extends string>(
  keys: readonly K[],
  counts: Readonly<Record<K, number>>,
): { key: K; count: number }[] {
  return keys
    .map((key) => ({ key, count: counts[key] }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

function ActivityShapePage() {
  const t = useT();
  usePageTitle(t.overview.title);
  const overviewQuery = useQuery({
    queryKey: ['activity-overview', WINDOW_DAYS],
    queryFn: async () => {
      const result = await callRoute(routes.getActivityOverview, {
        query: { windowDays: WINDOW_DAYS },
      });
      if (!result.ok) {
        throw new Error(describeApiError(result.error));
      }
      return result.value;
    },
  });

  const policiesQuery = useQuery({
    queryKey: ['policies'],
    queryFn: async () => {
      const result = await callRoute(routes.listPolicies, { query: { limit: 2 } });
      if (!result.ok) {
        throw new Error(describeApiError(result.error));
      }
      return result.value;
    },
  });

  return (
    <section className="grid gap-5">
      <h1 className="m-0 mb-4 text-2xl leading-normal">{t.overview.title}</h1>
      {overviewQuery.isPending ? <LoadingState label={t.overview.loadingOverview} /> : null}
      {overviewQuery.isError ? (
        <ErrorState
          title={t.overview.overviewLoadFailed}
          message={overviewQuery.error?.message ?? t.common.unknownError}
        />
      ) : null}
      {overviewQuery.isSuccess ? <ActivityOverview overview={overviewQuery.data} /> : null}

      {policiesQuery.isPending ? <LoadingState label={t.overview.loadingPolicies} /> : null}
      {policiesQuery.isError ? (
        <ErrorState
          title={t.overview.policiesLoadFailed}
          message={policiesQuery.error?.message ?? t.common.unknownError}
        />
      ) : null}
      {policiesQuery.isSuccess ? (
        <PolicyState
          policies={policiesQuery.data.items}
          hasMore={policiesQuery.data.nextCursor !== null}
        />
      ) : null}
    </section>
  );
}

function ActivityOverview({ overview }: { overview: ActivityOverviewResponse }) {
  const t = useT();
  const evaluable = overview.evaluableActionCount;
  const capabilities = rankedCounts(CAPABILITIES, overview.capabilityCounts);
  const targetKinds = rankedCounts(TARGET_KINDS, overview.targetKindCounts);
  const operationCount = CAPABILITIES.reduce(
    (sum, capability) => sum + overview.capabilityCounts[capability],
    0,
  );

  return (
    <Stack aria-labelledby="activity-overview-title">
      <SectionTitle id="activity-overview-title">
        {t.overview.overviewTitle(overview.windowDays)}
      </SectionTitle>
      <Hint>{t.overview.overviewHint}</Hint>
      <MetaGrid>
        <div>
          <dt>{t.common.period}</dt>
          <dd>
            {overview.windowFrom} → {overview.windowTo}
          </dd>
        </div>
        <div>
          <dt>{t.overview.sessions}</dt>
          <dd>{overview.sessionCount}</dd>
        </div>
        <div>
          <dt>{t.overview.actionsDeduplicated}</dt>
          <dd>{overview.actionCount}</dd>
        </div>
        <div>
          <dt>{t.overview.evaluableActions}</dt>
          <dd>{evaluable}</dd>
        </div>
      </MetaGrid>

      {overview.actionCount === 0 ? (
        <EmptyState title={t.overview.emptyTitle} message={t.overview.emptyMessage} />
      ) : (
        <>
          <SectionTitle as="h3">{t.overview.analyzabilityTitle}</SectionTitle>
          <EffectSummary data-testid="overview-analyzability">
            {ANALYZABILITY_ORDER.map((level) => {
              const count = overview.analyzability[level];
              return (
                <EffectTile
                  key={level}
                  effect={ANALYZABILITY_EFFECT_CLASS[level]}
                  label={t.overview.analyzability[level]}
                  count={count}
                  percent={formatShare(count, evaluable)}
                />
              );
            })}
          </EffectSummary>

          <TwoColumn>
            <DataTable>
              <TableCaption>{t.overview.capabilityCaption(operationCount)}</TableCaption>
              <thead>
                <tr>
                  <Th scope="col">{t.overview.capability}</Th>
                  <Th scope="col" numeric>
                    {t.overview.operation}
                  </Th>
                  <Th scope="col" numeric>
                    {t.overview.share}
                  </Th>
                </tr>
              </thead>
              <tbody>
                {capabilities.map((entry) => (
                  <tr key={entry.key}>
                    <Td>{entry.key}</Td>
                    <Td numeric>{entry.count}</Td>
                    <Td numeric>{formatShare(entry.count, operationCount)}</Td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
            <DataTable>
              <TableCaption>{t.overview.targetKindCaption}</TableCaption>
              <thead>
                <tr>
                  <Th scope="col">{t.overview.targetKindHeader}</Th>
                  <Th scope="col" numeric>
                    {t.overview.operation}
                  </Th>
                  <Th scope="col" numeric>
                    {t.overview.share}
                  </Th>
                </tr>
              </thead>
              <tbody>
                {targetKinds.map((entry) => (
                  <tr key={entry.key}>
                    <Td>{t.overview.targetKind[entry.key]}</Td>
                    <Td numeric>{entry.count}</Td>
                    <Td numeric>{formatShare(entry.count, operationCount)}</Td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </TwoColumn>

          <TwoColumn>
            <TopPrograms programs={overview.topPrograms} />
            <RemoteHosts remoteKeys={overview.topRemoteKeys} />
          </TwoColumn>
        </>
      )}
    </Stack>
  );
}

function TopPrograms({ programs }: { programs: ActivityOverviewResponse['topPrograms'] }) {
  const t = useT();
  return (
    <DataTable>
      <TableCaption>{t.overview.topProgramsCaption(programs.length)}</TableCaption>
      <thead>
        <tr>
          <Th scope="col">{t.overview.program}</Th>
          <Th scope="col" numeric>
            {t.overview.operation}
          </Th>
        </tr>
      </thead>
      <tbody>
        {programs.length === 0 ? (
          <tr>
            <Td colSpan={2} muted>
              {t.overview.noPrograms}
            </Td>
          </tr>
        ) : (
          programs.map((entry) => (
            <tr key={entry.program}>
              <Td mono>{entry.program}</Td>
              <Td numeric>{entry.count}</Td>
            </tr>
          ))
        )}
      </tbody>
    </DataTable>
  );
}

/** Remote Keys are shown by host only: owner and repository names stay off this screen. */
function RemoteHosts({ remoteKeys }: { remoteKeys: ActivityOverviewResponse['topRemoteKeys'] }) {
  const t = useT();
  const byHost = new Map<string, { remotes: number; count: number }>();
  for (const entry of remoteKeys) {
    const host = entry.remoteKey.split('/')[0] ?? entry.remoteKey;
    const current = byHost.get(host) ?? { remotes: 0, count: 0 };
    byHost.set(host, { remotes: current.remotes + 1, count: current.count + entry.count });
  }
  const hosts = [...byHost.entries()].sort(
    (a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]),
  );

  return (
    <DataTable>
      <TableCaption>{t.overview.remoteHostsCaption(remoteKeys.length)}</TableCaption>
      <thead>
        <tr>
          <Th scope="col">{t.overview.host}</Th>
          <Th scope="col" numeric>
            {t.overview.repositories}
          </Th>
          <Th scope="col" numeric>
            {t.overview.operation}
          </Th>
        </tr>
      </thead>
      <tbody>
        {hosts.length === 0 ? (
          <tr>
            <Td colSpan={3} muted>
              {t.overview.noRemotes}
            </Td>
          </tr>
        ) : (
          hosts.map(([host, entry]) => (
            <tr key={host}>
              <Td mono>{host}</Td>
              <Td numeric>{entry.remotes}</Td>
              <Td numeric>{entry.count}</Td>
            </tr>
          ))
        )}
      </tbody>
    </DataTable>
  );
}

function PolicyState({
  policies,
  hasMore,
}: {
  policies: readonly PolicyResponse[];
  hasMore: boolean;
}) {
  const t = useT();
  const [policy, ...rest] = policies;
  if (policy === undefined) {
    return <FirstPolicyPanel />;
  }
  if (rest.length > 0 || hasMore) {
    return (
      <Panel className="grid gap-5 text-red-700" role="alert">
        <SectionTitle>{t.overview.multiplePoliciesTitle}</SectionTitle>
        <StateMessage>{t.overview.multiplePoliciesMessage}</StateMessage>
      </Panel>
    );
  }
  return <SinglePolicyState policy={policy} />;
}

function FirstPolicyPanel() {
  const t = useT();
  const navigate = useNavigate();
  const create = useMutation({
    mutationFn: async () => {
      const result = await callRoute(routes.createPolicy, {
        body: { name: ORG_POLICY_NAME, template: 'default' },
      });
      if (!result.ok) {
        throw new Error(describeApiError(result.error));
      }
      return result.value;
    },
    onSuccess: (created) => {
      void navigate({
        to: '/policies/$policyId/versions/$versionId',
        params: { policyId: created.policy.id, versionId: created.initialVersion.id },
      });
    },
  });

  return (
    <Panel className="grid gap-5">
      <SectionTitle>{t.overview.firstPolicyTitle}</SectionTitle>
      <Hint>{t.overview.firstPolicyHint}</Hint>
      <Actions>
        <PrimaryButton
          type="button"
          disabled={create.isPending}
          aria-busy={create.isPending}
          onClick={() => create.mutate()}
        >
          {create.isPending ? t.common.creating : t.overview.createFirstPolicy}
        </PrimaryButton>
      </Actions>
      {create.error ? (
        <StateMessage className="text-red-700" role="alert">
          {t.overview.createPolicyFailed}: {create.error.message}
        </StateMessage>
      ) : null}
    </Panel>
  );
}

function latestOf(
  versions: readonly PolicyVersionResponse[],
  statuses: readonly PolicyVersionResponse['status'][],
): PolicyVersionResponse | null {
  return versions
    .filter((version) => statuses.includes(version.status))
    .reduce<PolicyVersionResponse | null>(
      (latest, version) =>
        latest === null || version.versionNumber > latest.versionNumber ? version : latest,
      null,
    );
}

function SinglePolicyState({ policy }: { policy: PolicyResponse }) {
  const t = useT();
  const versionsQuery = useQuery({
    queryKey: ['policy-versions', policy.id],
    queryFn: async () => {
      const result = await callRoute(routes.listPolicyVersions, {
        params: { policyId: policy.id },
        query: { limit: 200 },
      });
      if (!result.ok) {
        throw new Error(describeApiError(result.error));
      }
      return result.value.items;
    },
  });

  if (versionsQuery.isPending) {
    return <LoadingState label={t.overview.loadingVersions} />;
  }
  if (versionsQuery.isError) {
    return (
      <ErrorState
        title={t.overview.versionsLoadFailed}
        message={versionsQuery.error?.message ?? t.common.unknownError}
      />
    );
  }
  const versions = versionsQuery.data;
  const accepted = latestOf(versions, ['accepted']);
  const candidate = latestOf(versions, ['draft', 'in_review']);

  if (accepted !== null) {
    return <AcceptedPolicyState policy={policy} accepted={accepted} candidate={candidate} />;
  }
  if (candidate !== null) {
    return <InitialSetupState policy={policy} candidate={candidate} />;
  }
  const latest = latestOf(versions, ['rejected']);
  return (
    <Panel className="grid gap-5">
      <SectionTitle>{t.overview.noPolicyStateTitle}</SectionTitle>
      <Hint>{t.overview.noPolicyStateHint}</Hint>
      {latest !== null ? (
        <TextLink
          to="/policies/$policyId/versions/$versionId"
          params={{ policyId: policy.id, versionId: latest.id }}
        >
          {t.overview.viewVersion(latest.versionNumber)}
        </TextLink>
      ) : null}
    </Panel>
  );
}

function useOpenReview(policyId: string, candidateVersionId: string) {
  return useQuery({
    queryKey: ['policy-change-reviews', policyId],
    queryFn: async () => {
      const result = await callRoute(routes.listChangeReviews, {
        query: { policyId, limit: 50 },
      });
      if (!result.ok) {
        throw new Error(describeApiError(result.error));
      }
      return result.value.items;
    },
    select: (items) =>
      items.find(
        (review) =>
          review.candidateVersionId === candidateVersionId &&
          (review.status === 'computing' || review.status === 'ready'),
      ) ?? null,
    refetchInterval: (query) =>
      query.state.data?.some(
        (review) =>
          review.candidateVersionId === candidateVersionId && review.status === 'computing',
      )
        ? 3000
        : false,
  });
}

function InitialSetupState({
  policy,
  candidate,
}: {
  policy: PolicyResponse;
  candidate: PolicyVersionResponse;
}) {
  const t = useT();
  const reviewQuery = useOpenReview(policy.id, candidate.id);

  return (
    <Panel className="grid gap-5">
      <SectionTitle>{t.overview.initialSetupTitle}</SectionTitle>
      <Hint>{t.overview.initialSetupHint(candidate.versionNumber)}</Hint>
      <Actions>
        <Link
          className={BUTTON_LINK}
          to="/policies/$policyId/versions/$versionId"
          params={{ policyId: policy.id, versionId: candidate.id }}
        >
          {t.overview.continueInitialSetup}
        </Link>
      </Actions>
      <SectionTitle as="h3">{t.overview.adoptionPreview}</SectionTitle>
      {reviewQuery.isPending ? <LoadingState label={t.overview.loadingAdoptionReview} /> : null}
      {reviewQuery.isError ? (
        <ErrorState
          title={t.overview.adoptionReviewLoadFailed}
          message={reviewQuery.error?.message ?? t.common.unknownError}
        />
      ) : null}
      {reviewQuery.isSuccess ? <AdoptionPreview review={reviewQuery.data} /> : null}
    </Panel>
  );
}

function AdoptionPreview({ review }: { review: ChangeReviewResponse | null }) {
  const t = useT();
  const runId = review?.replaySummary.replayRunId ?? null;
  const runQuery = useQuery({
    queryKey: ['replay-run', runId],
    enabled: runId !== null && review?.status === 'ready',
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

  if (review === null) {
    return <Hint>{t.overview.noAdoptionReview}</Hint>;
  }
  if (review.status === 'computing') {
    return (
      <Hint role="status">
        {t.overview.applyingProposedPolicy}{' '}
        <TextLink to="/change-reviews/$reviewId" params={{ reviewId: review.id }}>
          {t.overview.openReview}
        </TextLink>
      </Hint>
    );
  }
  return (
    <Stack>
      {runQuery.isSuccess ? <AdoptionEffectTiles run={runQuery.data} /> : null}
      {runQuery.isError ? (
        <ErrorState
          title={t.overview.resultsLoadFailed}
          message={runQuery.error?.message ?? t.common.unknownError}
        />
      ) : null}
      <Link className={BUTTON_LINK} to="/change-reviews/$reviewId" params={{ reviewId: review.id }}>
        {t.overview.continueAdoptionReview}
      </Link>
    </Stack>
  );
}

function AdoptionEffectTiles({ run }: { run: ReplayRunResponse }) {
  const t = useT();
  if (run.kind !== 'adoption' || run.stats === null) {
    return null;
  }
  const { effectCounts, evaluatedActions } = run.stats;
  return (
    <Stack>
      <Hint>{t.overview.adoptionTilesHint(evaluatedActions)}</Hint>
      <EffectSummary data-testid="adoption-preview">
        {EFFECT_ORDER.map((effect) => (
          <EffectTile
            key={effect}
            effect={effect}
            label={t.effect[effect]}
            count={effectCounts[effect]}
            percent={formatShare(effectCounts[effect], evaluatedActions)}
          />
        ))}
      </EffectSummary>
    </Stack>
  );
}

function AcceptedPolicyState({
  policy,
  accepted,
  candidate,
}: {
  policy: PolicyResponse;
  accepted: PolicyVersionResponse;
  candidate: PolicyVersionResponse | null;
}) {
  const t = useT();
  const mapQuery = useQuery({
    queryKey: ['authority-map'],
    queryFn: async () => {
      const result = await callRoute(routes.getAuthorityMap);
      if (!result.ok) {
        throw new Error(describeApiError(result.error));
      }
      return result.value;
    },
  });

  return (
    <Stack>
      <Panel className="grid gap-5">
        <SectionTitle>{t.overview.acceptedTitle(accepted.versionNumber)}</SectionTitle>
        <Hint>{t.overview.acceptedHint}</Hint>
        <Actions>
          <Link
            className={BUTTON_LINK}
            to="/policies/$policyId/versions/$versionId"
            params={{ policyId: policy.id, versionId: accepted.id }}
          >
            {t.overview.viewAccepted}
          </Link>
          {candidate !== null ? (
            <Link
              className={BUTTON_LINK}
              to="/policies/$policyId/versions/$versionId"
              params={{ policyId: policy.id, versionId: candidate.id }}
            >
              {t.overview.continueChangeDraft(candidate.versionNumber)}
            </Link>
          ) : null}
        </Actions>
      </Panel>
      <SectionTitle>{t.overview.mapTitle}</SectionTitle>
      {mapQuery.isPending ? <LoadingState label={t.overview.loadingMap} /> : null}
      {mapQuery.isError ? (
        <ErrorState
          title={t.overview.mapLoadFailed}
          message={mapQuery.error?.message ?? t.common.unknownError}
        />
      ) : null}
      {mapQuery.isSuccess ? <AuthorityMap map={mapQuery.data} /> : null}
    </Stack>
  );
}

function AuthorityMap({ map }: { map: AuthorityMapResponse }) {
  const t = useT();
  if (map.run === null || map.cells.length === 0) {
    return <EmptyState title={t.overview.mapEmptyTitle} message={t.overview.mapEmptyMessage} />;
  }

  const total = map.cells.reduce((sum, cell) => sum + cell.count, 0);
  const byEffect = new Map<Effect, number>();
  for (const cell of map.cells) {
    byEffect.set(cell.effect, (byEffect.get(cell.effect) ?? 0) + cell.count);
  }

  const sortedCells = [...map.cells].sort(
    (a, b) =>
      b.count - a.count || a.capability.localeCompare(b.capability) || a.zone.localeCompare(b.zone),
  );

  return (
    <Stack>
      <MetaGrid>
        <div>
          <dt>{t.common.baselineVersion}</dt>
          <Mono>{map.run.policyVersionId}</Mono>
        </div>
        <div>
          <dt>{t.common.period}</dt>
          <dd>
            {map.run.windowFrom} → {map.run.windowTo}
          </dd>
        </div>
        <div>
          <dt>{t.overview.replayRun}</dt>
          <Mono>{map.run.replayRunId}</Mono>
        </div>
      </MetaGrid>

      <EffectSummary data-testid="map-effects">
        {EFFECT_ORDER.map((effect) => {
          const count = byEffect.get(effect) ?? 0;
          return (
            <EffectTile
              key={effect}
              effect={effect}
              label={t.effect[effect]}
              count={count}
              percent={formatShare(count, total)}
            />
          );
        })}
      </EffectSummary>

      <SectionTitle as="h3">{t.overview.mapAnalyzabilityTitle}</SectionTitle>
      <EffectSummary data-testid="map-analyzability">
        {ANALYZABILITY_ORDER.map((level) => {
          const count = map.analyzability[level];
          return (
            <EffectTile
              key={level}
              effect={ANALYZABILITY_EFFECT_CLASS[level]}
              label={t.overview.analyzability[level]}
              count={count}
              percent={formatShare(count, total)}
            />
          );
        })}
      </EffectSummary>

      <DataTable>
        <TableCaption>{t.overview.mapCaption(total, map.cells.length)}</TableCaption>
        <thead>
          <tr>
            <Th scope="col">{t.overview.capability}</Th>
            <Th scope="col">{t.overview.zone}</Th>
            <Th scope="col">{t.overview.effect}</Th>
            <Th scope="col" numeric>
              {t.overview.action}
            </Th>
          </tr>
        </thead>
        <tbody>
          {sortedCells.map((cell) => (
            <tr key={`${cell.capability}-${cell.zone}-${cell.effect}`}>
              <Td>{cell.capability}</Td>
              <Td>{cell.zone}</Td>
              <Td nowrap>
                <EffectBadge effect={cell.effect}>{t.effect[cell.effect]}</EffectBadge>
              </Td>
              <Td numeric>{cell.count}</Td>
            </tr>
          ))}
        </tbody>
      </DataTable>
    </Stack>
  );
}
