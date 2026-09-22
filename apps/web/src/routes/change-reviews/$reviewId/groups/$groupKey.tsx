import { createFileRoute } from '@tanstack/react-router';
import { EmptyState } from '../../../../shared/components/EmptyState.tsx';

export const Route = createFileRoute('/change-reviews/$reviewId/groups/$groupKey')({
  component: DiffGroupPage,
});

function DiffGroupPage() {
  const { reviewId, groupKey } = Route.useParams();

  return (
    <section>
      <h1 className="page-title">Diff Group</h1>
      <EmptyState
        title="Diff Group screen pending"
        message={`Review ${reviewId}, group ${groupKey} content ships after the contracts merge.`}
      />
    </section>
  );
}
