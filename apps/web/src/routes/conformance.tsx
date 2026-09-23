import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import type { ListConformanceFindingsResponse } from '@authority/contracts/schema';
import { routes } from '@authority/contracts/routes';
import { callRoute, describeApiError } from '../shared/api-client.ts';
import { EmptyState } from '../shared/components/EmptyState.tsx';
import { ErrorState } from '../shared/components/ErrorState.tsx';
import { LoadingState } from '../shared/components/LoadingState.tsx';

export const Route = createFileRoute('/conformance')({
  component: ConformanceFindingListPage,
});

function ConformanceFindingListPage() {
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
      <h1 className="page-title">Conformance</h1>
      {findingsQuery.isPending ? <LoadingState label="Loading conformance findings" /> : null}
      {findingsQuery.isError ? (
        <ErrorState
          title="Could not load conformance findings"
          message={findingsQuery.error?.message ?? 'An unexpected error occurred'}
        />
      ) : null}
      {findingsQuery.isSuccess ? <FindingList findings={findingsQuery.data} /> : null}
    </section>
  );
}

function minuteOf(timestamp: string): string {
  return `${timestamp.slice(0, 10)} ${timestamp.slice(11, 16)}`;
}

function FindingList({ findings }: { findings: ListConformanceFindingsResponse }) {
  if (findings.run === null) {
    return (
      <EmptyState
        title="No observations compared yet"
        message="Findings appear once a conformance run compares runtime observations with a policy version."
      />
    );
  }

  return (
    <div className="stack">
      <dl className="meta-grid panel">
        <div>
          <dt>Policy version</dt>
          <dd className="mono">{findings.run.policyVersionId}</dd>
        </div>
        <div>
          <dt>Window</dt>
          <dd>
            {findings.run.windowFrom} → {findings.run.windowTo}
          </dd>
        </div>
        <div>
          <dt>Replay run</dt>
          <dd className="mono">{findings.run.replayRunId}</dd>
        </div>
      </dl>

      {findings.items.length === 0 ? (
        <EmptyState
          title="No findings"
          message="Every observed action matched the policy version in this run."
        />
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <caption>{findings.items.length} findings, times in UTC</caption>
            <thead>
              <tr>
                <th scope="col">Kind</th>
                <th scope="col">Capability</th>
                <th scope="col">Zone</th>
                <th scope="col">Program</th>
                <th scope="col" className="num">
                  Actions
                </th>
                <th scope="col">First seen</th>
                <th scope="col">Last seen</th>
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
