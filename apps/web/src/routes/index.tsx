import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import type { AuthorityMapResponse } from '@authority/contracts/schema';
import { routes } from '@authority/contracts/routes';
import { callRoute, describeApiError } from '../shared/api-client.ts';
import { EmptyState } from '../shared/components/EmptyState.tsx';
import { ErrorState } from '../shared/components/ErrorState.tsx';
import { LoadingState } from '../shared/components/LoadingState.tsx';

export const Route = createFileRoute('/')({
  component: ActivityShapePage,
});

type AuthorityMapCell = AuthorityMapResponse['cells'][number];
type Effect = AuthorityMapCell['effect'];

const EFFECT_ORDER: readonly Effect[] = ['allow', 'ask', 'deny'];

function ActivityShapePage() {
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
    <section>
      <h1 className="page-title">Activity Shape</h1>
      {mapQuery.isPending ? <LoadingState label="Loading the authority map" /> : null}
      {mapQuery.isError ? (
        <ErrorState
          title="Could not load the authority map"
          message={mapQuery.error?.message ?? 'An unexpected error occurred'}
        />
      ) : null}
      {mapQuery.isSuccess ? <AuthorityMap map={mapQuery.data} /> : null}
    </section>
  );
}

function AuthorityMap({ map }: { map: AuthorityMapResponse }) {
  if (map.run === null || map.cells.length === 0) {
    return (
      <EmptyState
        title="No completed run yet"
        message="The activity shape appears once a replay run completes for the accepted baseline."
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
          <dt>Baseline version</dt>
          <dd className="mono">{map.run.policyVersionId}</dd>
        </div>
        <div>
          <dt>Window</dt>
          <dd>
            {map.run.windowFrom} → {map.run.windowTo}
          </dd>
        </div>
        <div>
          <dt>Replay run</dt>
          <dd className="mono">{map.run.replayRunId}</dd>
        </div>
      </dl>

      <div className="effect-summary">
        {EFFECT_ORDER.map((effect) => {
          const count = byEffect.get(effect) ?? 0;
          const percent = total === 0 ? 0 : Math.round((count / total) * 100);
          return (
            <div key={effect} className={`panel effect-tile effect-${effect}`}>
              <span className="effect-label">{effect}</span>
              <span className="effect-count">{count}</span>
              <span className="effect-percent">{percent}%</span>
            </div>
          );
        })}
      </div>

      <table className="data-table">
        <caption>
          {total} evaluated actions across {map.cells.length} capability and zone cells
        </caption>
        <thead>
          <tr>
            <th scope="col">Capability</th>
            <th scope="col">Zone</th>
            <th scope="col">Effect</th>
            <th scope="col" className="num">
              Count
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedCells.map((cell) => (
            <tr key={`${cell.capability}-${cell.zone}-${cell.effect}`}>
              <td>{cell.capability}</td>
              <td>{cell.zone}</td>
              <td>
                <span className={`effect-badge effect-${cell.effect}`}>{cell.effect}</span>
              </td>
              <td className="num">{cell.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
