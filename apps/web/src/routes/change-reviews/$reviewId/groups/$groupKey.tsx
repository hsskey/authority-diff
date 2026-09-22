import { createFileRoute } from '@tanstack/react-router';
import { EmptyState } from '../../../../shared/components/EmptyState.tsx';

export const Route = createFileRoute('/change-reviews/$reviewId/groups/$groupKey')({
  component: DiffGroupPage,
});

// The Diff Group screen renders GET /diff-groups/:runId/:groupKey/samples
// (routes.getDiffGroupSamples, DiffGroupSamplesResponse) once that server route
// exists. Samples show only action.toolInputRedacted, never raw command text.
function DiffGroupPage() {
  const { reviewId, groupKey } = Route.useParams();

  return (
    <section>
      <h1 className="page-title">Diff Group</h1>
      <EmptyState
        title="Diff Group samples wire with the change-review API"
        message={`Review ${reviewId}, group ${groupKey} renders once the change-review routes are available.`}
      />
    </section>
  );
}
