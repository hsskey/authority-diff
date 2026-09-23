import { createFileRoute } from '@tanstack/react-router';
import { EmptyState } from '../../shared/components/EmptyState.tsx';

export const Route = createFileRoute('/change-reviews/$reviewId')({
  component: ChangeReviewPage,
});

// Renders GET /change-reviews/:id (routes.getChangeReview, ChangeReviewResponse)
// once that server route exists. Kept a placeholder rather than run against mock
// data; the decision actions use the terms 정책 변경 수락 / 반려.
function ChangeReviewPage() {
  const { reviewId } = Route.useParams();

  return (
    <section>
      <h1 className="page-title">Change Review</h1>
      <EmptyState
        title="Change Review screen wires with the change-review API"
        message={`Review ${reviewId} renders once the change-review routes are available. Its DTOs are already fixed in @authority/contracts.`}
      />
    </section>
  );
}
