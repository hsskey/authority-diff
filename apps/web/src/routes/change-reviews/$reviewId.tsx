import { createFileRoute } from '@tanstack/react-router';
import { EmptyState } from '../../shared/components/EmptyState.tsx';

export const Route = createFileRoute('/change-reviews/$reviewId')({
  component: ChangeReviewPage,
});

function ChangeReviewPage() {
  const { reviewId } = Route.useParams();

  return (
    <section>
      <h1 className="page-title">Change Review</h1>
      <EmptyState
        title="Change Review screen pending"
        message={`Review ${reviewId} content ships after the contracts merge.`}
      />
    </section>
  );
}
