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
import { effectLabel, formatShare } from '../features/change-review/format.ts';

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
const ANALYZABILITY_LABEL: Record<AnalyzabilityLevel, string> = {
  full: '완전 분석',
  partial: '부분 분석',
  none: '분석 불가',
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
const TARGET_KIND_LABEL: Record<TargetKind, string> = {
  workspace_path: '작업 공간 경로',
  other_path: '작업 공간 밖 경로',
  vcs_remote: 'VCS 원격',
  host: 'host',
  package: 'package',
  mcp: 'MCP tool',
  deploy_target: '배포 대상',
  unknown: '인식 안 됨',
};

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
    <section className="stack">
      <h1 className="page-title">활동 분포</h1>
      {overviewQuery.isPending ? <LoadingState label="가져온 활동을 집계하는 중" /> : null}
      {overviewQuery.isError ? (
        <ErrorState
          title="활동 개요를 불러오지 못했습니다"
          message={overviewQuery.error?.message ?? '알 수 없는 오류'}
        />
      ) : null}
      {overviewQuery.isSuccess ? <ActivityOverview overview={overviewQuery.data} /> : null}

      {policiesQuery.isPending ? <LoadingState label="정책을 확인하는 중" /> : null}
      {policiesQuery.isError ? (
        <ErrorState
          title="정책을 불러오지 못했습니다"
          message={policiesQuery.error?.message ?? '알 수 없는 오류'}
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
  const evaluable = overview.evaluableActionCount;
  const capabilities = rankedCounts(CAPABILITIES, overview.capabilityCounts);
  const targetKinds = rankedCounts(TARGET_KINDS, overview.targetKindCounts);
  const operationCount = CAPABILITIES.reduce(
    (sum, capability) => sum + overview.capabilityCounts[capability],
    0,
  );

  return (
    <div className="stack" aria-labelledby="activity-overview-title">
      <h2 className="section-title" id="activity-overview-title">
        가져온 활동 개요 (최근 {overview.windowDays}일)
      </h2>
      <p className="state-message hint">
        transcript에서 가져온 Action만 집계합니다. Effect와 Zone은 정책이 있어야 계산됩니다.
      </p>
      <dl className="meta-grid panel">
        <div>
          <dt>기간</dt>
          <dd>
            {overview.windowFrom} → {overview.windowTo}
          </dd>
        </div>
        <div>
          <dt>Session</dt>
          <dd>{overview.sessionCount}</dd>
        </div>
        <div>
          <dt>Action (중복 제거)</dt>
          <dd>{overview.actionCount}</dd>
        </div>
        <div>
          <dt>평가 가능 Action</dt>
          <dd>{evaluable}</dd>
        </div>
      </dl>

      {overview.actionCount === 0 ? (
        <EmptyState
          title="이 기간에 가져온 Action이 없습니다"
          message="authority import로 transcript를 가져오면 여기에 활동이 집계됩니다."
        />
      ) : (
        <>
          <h3 className="section-title">분석 가능성 (Action 기준)</h3>
          <div className="effect-summary" data-testid="overview-analyzability">
            {ANALYZABILITY_ORDER.map((level) => {
              const count = overview.analyzability[level];
              return (
                <div
                  key={level}
                  className={`panel effect-tile effect-${ANALYZABILITY_EFFECT_CLASS[level]}`}
                >
                  <span className="effect-label">{ANALYZABILITY_LABEL[level]}</span>
                  <span className="effect-count">{count}</span>
                  <span className="effect-percent">{formatShare(count, evaluable)}</span>
                </div>
              );
            })}
          </div>

          <div className="two-column">
            <table className="data-table">
              <caption>Capability 분포 (Operation {operationCount}건)</caption>
              <thead>
                <tr>
                  <th scope="col">Capability</th>
                  <th scope="col" className="num">
                    Operation
                  </th>
                  <th scope="col" className="num">
                    비율
                  </th>
                </tr>
              </thead>
              <tbody>
                {capabilities.map((entry) => (
                  <tr key={entry.key}>
                    <td>{entry.key}</td>
                    <td className="num">{entry.count}</td>
                    <td className="num">{formatShare(entry.count, operationCount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <table className="data-table">
              <caption>Target 종류 분포 (Operation 기준)</caption>
              <thead>
                <tr>
                  <th scope="col">Target 종류</th>
                  <th scope="col" className="num">
                    Operation
                  </th>
                  <th scope="col" className="num">
                    비율
                  </th>
                </tr>
              </thead>
              <tbody>
                {targetKinds.map((entry) => (
                  <tr key={entry.key}>
                    <td>{TARGET_KIND_LABEL[entry.key]}</td>
                    <td className="num">{entry.count}</td>
                    <td className="num">{formatShare(entry.count, operationCount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="two-column">
            <TopPrograms programs={overview.topPrograms} />
            <RemoteHosts remoteKeys={overview.topRemoteKeys} />
          </div>
        </>
      )}
    </div>
  );
}

function TopPrograms({ programs }: { programs: ActivityOverviewResponse['topPrograms'] }) {
  return (
    <table className="data-table">
      <caption>자주 쓴 program 상위 {programs.length}개</caption>
      <thead>
        <tr>
          <th scope="col">Program</th>
          <th scope="col" className="num">
            Operation
          </th>
        </tr>
      </thead>
      <tbody>
        {programs.length === 0 ? (
          <tr>
            <td colSpan={2} className="hint">
              program을 인식한 Operation이 없습니다.
            </td>
          </tr>
        ) : (
          programs.map((entry) => (
            <tr key={entry.program}>
              <td className="mono">{entry.program}</td>
              <td className="num">{entry.count}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

/** Remote Keys are shown by host only: owner and repository names stay off this screen. */
function RemoteHosts({ remoteKeys }: { remoteKeys: ActivityOverviewResponse['topRemoteKeys'] }) {
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
    <table className="data-table">
      <caption>
        VCS 원격 host (상위 {remoteKeys.length}개 Remote Key 기준, 저장소 이름은 가림)
      </caption>
      <thead>
        <tr>
          <th scope="col">Host</th>
          <th scope="col" className="num">
            저장소
          </th>
          <th scope="col" className="num">
            Operation
          </th>
        </tr>
      </thead>
      <tbody>
        {hosts.length === 0 ? (
          <tr>
            <td colSpan={3} className="hint">
              Remote Key를 인식한 Operation이 없습니다.
            </td>
          </tr>
        ) : (
          hosts.map(([host, entry]) => (
            <tr key={host}>
              <td className="mono">{host}</td>
              <td className="num">{entry.remotes}</td>
              <td className="num">{entry.count}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

function PolicyState({
  policies,
  hasMore,
}: {
  policies: readonly PolicyResponse[];
  hasMore: boolean;
}) {
  const [policy, ...rest] = policies;
  if (policy === undefined) {
    return <FirstPolicyPanel />;
  }
  if (rest.length > 0 || hasMore) {
    return (
      <div className="panel stack status-error" role="alert">
        <h2 className="section-title">지원하지 않는 상태: 조직 정책이 2개 이상입니다</h2>
        <p className="state-message">
          Authority Diff는 조직 정책 하나만 다룹니다. 어느 정책도 자동으로 고르지 않으며, 정책을
          하나만 남긴 뒤 다시 시작하세요.
        </p>
      </div>
    );
  }
  return <SinglePolicyState policy={policy} />;
}

function FirstPolicyPanel() {
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
    <div className="panel stack">
      <h2 className="section-title">아직 조직 정책이 없습니다</h2>
      <p className="state-message hint">
        기본 template으로 첫 정책의 draft version 1을 만들고 편집 화면으로 이동합니다. 채택 전에는
        어떤 판정도 내리지 않습니다.
      </p>
      <div className="actions">
        <button type="button" disabled={create.isPending} onClick={() => create.mutate()}>
          {create.isPending ? '만드는 중…' : '첫 조직 정책 만들기'}
        </button>
      </div>
      {create.error ? (
        <p className="state-message status-error" role="alert">
          정책 생성 실패: {create.error.message}
        </p>
      ) : null}
    </div>
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
    return <LoadingState label="정책 version을 확인하는 중" />;
  }
  if (versionsQuery.isError) {
    return (
      <ErrorState
        title="정책 version을 불러오지 못했습니다"
        message={versionsQuery.error?.message ?? '알 수 없는 오류'}
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
    <div className="panel stack">
      <h2 className="section-title">채택된 정책도 열린 draft도 없습니다</h2>
      <p className="state-message hint">
        최초 도입 검토가 반려된 상태입니다. 마지막 version에서 새 draft를 만들어 다시 검토하세요.
      </p>
      {latest !== null ? (
        <Link
          to="/policies/$policyId/versions/$versionId"
          params={{ policyId: policy.id, versionId: latest.id }}
        >
          version #{latest.versionNumber} 보기
        </Link>
      ) : null}
    </div>
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
  const reviewQuery = useOpenReview(policy.id, candidate.id);

  return (
    <div className="panel stack">
      <h2 className="section-title">최초 정책 설정 진행 중</h2>
      <p className="state-message hint">
        draft version #{candidate.versionNumber}이 있고 채택된 version은 아직 없습니다. 제안 정책을
        과거 Action에 적용해 보고 확인 필요·차단 group을 판정한 뒤 채택합니다.
      </p>
      <div className="actions">
        <Link
          className="button-link"
          to="/policies/$policyId/versions/$versionId"
          params={{ policyId: policy.id, versionId: candidate.id }}
        >
          최초 정책 설정 계속하기
        </Link>
      </div>
      <h3 className="section-title">도입 preview</h3>
      {reviewQuery.isPending ? <LoadingState label="도입 검토를 확인하는 중" /> : null}
      {reviewQuery.isError ? (
        <ErrorState
          title="도입 검토를 불러오지 못했습니다"
          message={reviewQuery.error?.message ?? '알 수 없는 오류'}
        />
      ) : null}
      {reviewQuery.isSuccess ? <AdoptionPreview review={reviewQuery.data} /> : null}
    </div>
  );
}

function AdoptionPreview({ review }: { review: ChangeReviewResponse | null }) {
  const runId = review?.replaySummary.replayRunId ?? null;
  const runQuery = useQuery({
    queryKey: ['replay-run', runId],
    enabled: runId !== null && review?.status === 'ready',
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

  if (review === null) {
    return (
      <p className="state-message hint">
        아직 최초 도입 검토를 만들지 않았습니다. draft 편집 화면에서 "최초 도입 검토 만들기"를
        누르면 제안 정책 적용 결과가 여기에 나타납니다.
      </p>
    );
  }
  if (review.status === 'computing') {
    return (
      <p className="state-message hint" role="status">
        제안 정책을 과거 Action에 적용하는 중입니다.{' '}
        <Link to="/change-reviews/$reviewId" params={{ reviewId: review.id }}>
          검토 화면 열기
        </Link>
      </p>
    );
  }
  return (
    <div className="stack">
      {runQuery.isSuccess ? <AdoptionEffectTiles run={runQuery.data} /> : null}
      {runQuery.isError ? (
        <ErrorState
          title="적용 결과를 불러오지 못했습니다"
          message={runQuery.error?.message ?? '알 수 없는 오류'}
        />
      ) : null}
      <Link className="button-link" to="/change-reviews/$reviewId" params={{ reviewId: review.id }}>
        최초 도입 검토 계속하기
      </Link>
    </div>
  );
}

function AdoptionEffectTiles({ run }: { run: ReplayRunResponse }) {
  if (run.kind !== 'adoption' || run.stats === null) {
    return null;
  }
  const { effectCounts, evaluatedActions } = run.stats;
  return (
    <div className="stack">
      <p className="state-message hint">
        제안 정책을 적용하면 평가한 Action {evaluatedActions}건이 각각 아래 Effect를 받습니다.
      </p>
      <div className="effect-summary" data-testid="adoption-preview">
        {EFFECT_ORDER.map((effect) => (
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

function AcceptedPolicyState({
  policy,
  accepted,
  candidate,
}: {
  policy: PolicyResponse;
  accepted: PolicyVersionResponse;
  candidate: PolicyVersionResponse | null;
}) {
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
    <div className="stack">
      <div className="panel stack">
        <h2 className="section-title">채택된 정책: version #{accepted.versionNumber}</h2>
        <p className="state-message hint">
          채택은 검토 기록입니다. runtime에 반영하는 일은 Authority Diff 밖에서 이루어집니다.
        </p>
        <div className="actions">
          <Link
            className="button-link"
            to="/policies/$policyId/versions/$versionId"
            params={{ policyId: policy.id, versionId: accepted.id }}
          >
            채택된 version 보기
          </Link>
          {candidate !== null ? (
            <Link
              className="button-link"
              to="/policies/$policyId/versions/$versionId"
              params={{ policyId: policy.id, versionId: candidate.id }}
            >
              변경 draft #{candidate.versionNumber} 계속하기
            </Link>
          ) : null}
        </div>
      </div>
      <h2 className="section-title">채택된 정책 기준 활동 분포</h2>
      {mapQuery.isPending ? <LoadingState label="활동 분포를 불러오는 중" /> : null}
      {mapQuery.isError ? (
        <ErrorState
          title="활동 분포를 불러오지 못했습니다"
          message={mapQuery.error?.message ?? '알 수 없는 오류'}
        />
      ) : null}
      {mapQuery.isSuccess ? <AuthorityMap map={mapQuery.data} /> : null}
    </div>
  );
}

function AuthorityMap({ map }: { map: AuthorityMapResponse }) {
  if (map.run === null || map.cells.length === 0) {
    return (
      <EmptyState
        title="완료된 replay run이 없습니다"
        message="채택된 version을 candidate로 한 replay run이 완료되면 Effect 분포가 여기에 나타납니다."
      />
    );
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
    <div className="stack">
      <dl className="meta-grid panel">
        <div>
          <dt>기준 version</dt>
          <dd className="mono">{map.run.policyVersionId}</dd>
        </div>
        <div>
          <dt>기간</dt>
          <dd>
            {map.run.windowFrom} → {map.run.windowTo}
          </dd>
        </div>
        <div>
          <dt>Replay Run</dt>
          <dd className="mono">{map.run.replayRunId}</dd>
        </div>
      </dl>

      <div className="effect-summary" data-testid="map-effects">
        {EFFECT_ORDER.map((effect) => {
          const count = byEffect.get(effect) ?? 0;
          return (
            <div key={effect} className={`panel effect-tile effect-${effect}`}>
              <span className="effect-label">{effectLabel(effect)}</span>
              <span className="effect-count">{count}</span>
              <span className="effect-percent">{formatShare(count, total)}</span>
            </div>
          );
        })}
      </div>

      <h3 className="section-title">분석 가능성 (평가한 Action 기준)</h3>
      <div className="effect-summary" data-testid="map-analyzability">
        {ANALYZABILITY_ORDER.map((level) => {
          const count = map.analyzability[level];
          const effectClass = ANALYZABILITY_EFFECT_CLASS[level];
          return (
            <div key={level} className={`panel effect-tile effect-${effectClass}`}>
              <span className="effect-label">{ANALYZABILITY_LABEL[level]}</span>
              <span className="effect-count">{count}</span>
              <span className="effect-percent">{formatShare(count, total)}</span>
            </div>
          );
        })}
      </div>

      <table className="data-table">
        <caption>
          평가한 Action {total}건, Capability × Zone cell {map.cells.length}개
        </caption>
        <thead>
          <tr>
            <th scope="col">Capability</th>
            <th scope="col">Zone</th>
            <th scope="col">Effect</th>
            <th scope="col" className="num">
              Action
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedCells.map((cell) => (
            <tr key={`${cell.capability}-${cell.zone}-${cell.effect}`}>
              <td>{cell.capability}</td>
              <td>{cell.zone}</td>
              <td className="nowrap">
                <span className={`effect-badge effect-${cell.effect}`}>
                  {effectLabel(cell.effect)}
                </span>
              </td>
              <td className="num">{cell.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
