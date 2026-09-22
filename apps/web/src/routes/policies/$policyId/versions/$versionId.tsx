import { createFileRoute } from '@tanstack/react-router';
import { EmptyState } from '../../../../shared/components/EmptyState.tsx';

export const Route = createFileRoute('/policies/$policyId/versions/$versionId')({
  component: PolicyVersionPage,
});

function PolicyVersionPage() {
  const { policyId, versionId } = Route.useParams();

  return (
    <section>
      <h1 className="page-title">Policy Version</h1>
      <EmptyState
        title="Policy Version screen pending"
        message={`Policy ${policyId}, version ${versionId} content ships after the contracts merge.`}
      />
    </section>
  );
}
