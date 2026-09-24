import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { UNGUARDED_PERMISSION_MODES } from '@authority/contracts/schema';
import type {
  ListConformanceFindingsResponse,
  PermissionModeCount,
} from '@authority/contracts/schema';
import { routes } from '@authority/contracts/routes';
import { callRoute, describeApiError } from '../shared/api-client.ts';
import { EmptyState } from '../shared/components/EmptyState.tsx';
import { ErrorState } from '../shared/components/ErrorState.tsx';
import { LoadingState } from '../shared/components/LoadingState.tsx';
import { usePageTitle } from '../shared/use-page-title.ts';

export const Route = createFileRoute('/conformance')({
  component: ConformanceFindingListPage,
});

function ConformanceFindingListPage() {
  usePageTitle('적합성');
  const findingsQuery = useQuery({
    queryKey: ['conformance-findings'],
    queryFn: async () => {
      const result = await callRoute(routes.listConformanceFindings);
      if (!result.ok) {
        throw new Error(describeApiError(result.error));
      }
      return result.value;
    },
  });

  return (
    <section>
      <h1 className="page-title">적합성</h1>
      {findingsQuery.isPending ? <LoadingState label="Conformance Finding을 불러오는 중" /> : null}
      {findingsQuery.isError ? (
        <ErrorState
          title="Conformance Finding을 불러오지 못했습니다"
          message={findingsQuery.error?.message ?? '알 수 없는 오류'}
        />
      ) : null}
      {findingsQuery.isSuccess ? <FindingList findings={findingsQuery.data} /> : null}
    </section>
  );
}

function minuteOf(timestamp: string): string {
  return `${timestamp.slice(0, 10)} ${timestamp.slice(11, 16)}`;
}

function sumActions(rows: readonly PermissionModeCount[]): number {
  return rows.reduce((sum, row) => sum + row.actionCount, 0);
}

function PermissionModeBreakdown({ rows }: { rows: readonly PermissionModeCount[] }) {
  const total = sumActions(rows);
  const unguarded = sumActions(
    rows.filter((row) => UNGUARDED_PERMISSION_MODES.includes(row.permissionMode)),
  );
  return (
    <section className="stack" aria-labelledby="permission-mode-title">
      <h2 className="section-title" id="permission-mode-title">
        permission mode별 Action
      </h2>
      {rows.length === 0 ? (
        <p className="hint">이 run에는 permission mode 집계가 없습니다.</p>
      ) : (
        <>
          <dl className="meta-grid panel">
            <div>
              <dt>guard 없이 실행될 수 있는 Action</dt>
              <dd>
                {unguarded}건 / {total}건 ({UNGUARDED_PERMISSION_MODES.join(', ')})
              </dd>
            </div>
          </dl>
          <div className="table-scroll">
            <table className="data-table">
              <caption>permission mode {rows.length}개, mode가 없는 관측은 unknown</caption>
              <thead>
                <tr>
                  <th scope="col">permission mode</th>
                  <th scope="col" className="num">
                    Action
                  </th>
                  <th scope="col" className="num">
                    finding Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.permissionMode}>
                    <td>{row.permissionMode}</td>
                    <td className="num">{row.actionCount}</td>
                    <td className="num">{row.findingCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

function FindingList({ findings }: { findings: ListConformanceFindingsResponse }) {
  if (findings.run === null) {
    return (
      <EmptyState
        title="아직 비교한 runtime 관측이 없습니다"
        message="conformance run이 runtime 관측과 Policy Version을 비교하면 finding이 여기에 나타납니다."
      />
    );
  }

  return (
    <div className="stack">
      <dl className="meta-grid panel">
        <div>
          <dt>Policy Version</dt>
          <dd className="mono">{findings.run.policyVersionId}</dd>
        </div>
        <div>
          <dt>기간</dt>
          <dd>
            {findings.run.windowFrom} → {findings.run.windowTo}
          </dd>
        </div>
        <div>
          <dt>Replay Run</dt>
          <dd className="mono">{findings.run.replayRunId}</dd>
        </div>
      </dl>

      <PermissionModeBreakdown rows={findings.run.byPermissionMode} />

      {findings.items.length === 0 ? (
        <EmptyState
          title="finding 없음"
          message="이 run에서 관측된 모든 Action이 Policy Version과 일치했습니다."
        />
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <caption>finding {findings.items.length}건, 시각은 UTC</caption>
            <thead>
              <tr>
                <th scope="col">종류</th>
                <th scope="col">Capability</th>
                <th scope="col">Zone</th>
                <th scope="col">Program</th>
                <th scope="col" className="num">
                  Action
                </th>
                <th scope="col">최초</th>
                <th scope="col">최근</th>
              </tr>
            </thead>
            <tbody>
              {findings.items.map((finding) => (
                <tr key={finding.findingKey}>
                  <td>{finding.kind}</td>
                  <td>{finding.capability}</td>
                  <td>{finding.zone}</td>
                  <td>{finding.program ?? '-'}</td>
                  <td className="num">{finding.actionCount}</td>
                  <td className="nowrap">{minuteOf(finding.firstOccurredAt)}</td>
                  <td className="nowrap">{minuteOf(finding.lastOccurredAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
