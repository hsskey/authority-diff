import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { HealthzResponseSchema } from '@authority/contracts/schema';
import { apiClient, type ApiClientError } from '../shared/api-client.ts';
import { EmptyState } from '../shared/components/EmptyState.tsx';
import { ErrorState } from '../shared/components/ErrorState.tsx';
import { LoadingState } from '../shared/components/LoadingState.tsx';

function describeApiError(error: ApiClientError): string {
  if (error.kind === 'network' || error.kind === 'validation') {
    return error.message;
  }

  return `${error.status}: ${error.envelope.error.message}`;
}

export const Route = createFileRoute('/')({
  component: ActivityShapePage,
});

function ActivityShapePage() {
  const healthQuery = useQuery({
    queryKey: ['healthz'],
    queryFn: async () => {
      const result = await apiClient.get('/healthz', HealthzResponseSchema);
      if (!result.ok) {
        throw new Error(describeApiError(result.error));
      }
      return result.value;
    },
  });

  return (
    <section>
      <h1 className="page-title">Activity Shape</h1>
      <ConnectionStatus
        isPending={healthQuery.isPending}
        isError={healthQuery.isError}
        error={healthQuery.error}
        data={healthQuery.data}
      />
      <EmptyState
        title="Screen content pending"
        message="Detailed Activity Shape views ship after the contracts merge."
      />
    </section>
  );
}

function ConnectionStatus({
  isPending,
  isError,
  error,
  data,
}: {
  isPending: boolean;
  isError: boolean;
  error: Error | null;
  data: { status: 'ok' } | undefined;
}) {
  if (isPending) {
    return <LoadingState label="Checking server connection" />;
  }

  if (isError) {
    return (
      <ErrorState
        title="Server connection failed"
        message={error?.message ?? 'An unexpected error occurred'}
      />
    );
  }

  return (
    <div className="panel">
      <p className="state-message status-ok">Connected to server ({data?.status ?? 'unknown'})</p>
    </div>
  );
}
