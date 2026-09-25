import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { UNGUARDED_PERMISSION_MODES } from '@authority/contracts/schema';
import type {
  ListConformanceFindingsResponse,
  ObservationGap,
  PermissionModeCount,
} from '@authority/contracts/schema';
import { routes } from '@authority/contracts/routes';
import { callRoute, describeApiError } from '../shared/api-client.ts';
import { EmptyState } from '../shared/components/EmptyState.tsx';
import { ErrorState } from '../shared/components/ErrorState.tsx';
import { LoadingState } from '../shared/components/LoadingState.tsx';
import { PageTitle } from '../shared/components/PageTitle.tsx';
import { DataTable, TableCaption, Td, Th } from '../shared/components/DataTable.tsx';
import { MetaGrid, MONO } from '../shared/components/MetaGrid.tsx';
import { Panel } from '../shared/components/Panel.tsx';
import { SectionTitle } from '../shared/components/SectionTitle.tsx';
import { Stack } from '../shared/components/Stack.tsx';
import { usePageTitle } from '../shared/use-page-title.ts';
import { useT } from '../shared/i18n/use-t.ts';

export const Route = createFileRoute('/conformance')({
  component: ConformanceFindingListPage,
});

function ConformanceFindingListPage() {
  const t = useT();
  usePageTitle(t.conformance.title);
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
      <PageTitle>{t.conformance.title}</PageTitle>
      {findingsQuery.isPending ? <LoadingState label={t.conformance.loading} /> : null}
      {findingsQuery.isError ? (
        <ErrorState
          title={t.conformance.loadFailed}
          message={findingsQuery.error?.message ?? t.common.unknownError}
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
  const t = useT();
  const total = sumActions(rows);
  const unguarded = sumActions(
    rows.filter((row) => UNGUARDED_PERMISSION_MODES.includes(row.permissionMode)),
  );
  return (
    <Stack as="section" aria-labelledby="permission-mode-title">
      <SectionTitle id="permission-mode-title">{t.conformance.permissionModeTitle}</SectionTitle>
      {rows.length === 0 ? (
        <p className="my-[1em] text-[0.9rem] text-muted">{t.conformance.noPermissionModes}</p>
      ) : (
        <>
          <MetaGrid>
            <div>
              <dt>{t.conformance.unguarded}</dt>
              <dd>
                {t.conformance.unguardedValue(
                  unguarded,
                  total,
                  UNGUARDED_PERMISSION_MODES.join(', '),
                )}
              </dd>
            </div>
          </MetaGrid>
          <DataTable>
            <TableCaption>{t.conformance.permissionModeCaption(rows.length)}</TableCaption>
            <thead>
              <tr>
                <Th scope="col">{t.conformance.permissionMode}</Th>
                <Th scope="col" numeric>
                  {t.conformance.action}
                </Th>
                <Th scope="col" numeric>
                  {t.conformance.findingAction}
                </Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.permissionMode}>
                  <Td>{row.permissionMode}</Td>
                  <Td numeric>{row.actionCount}</Td>
                  <Td numeric>{row.findingCount}</Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </>
      )}
    </Stack>
  );
}

function ObservationGaps({ gaps }: { gaps: readonly ObservationGap[] }) {
  const t = useT();
  if (gaps.length === 0) {
    return null;
  }
  return (
    <Panel role="status">
      {gaps.map((gap) => (
        <p key={gap.from} className="m-0">
          {t.conformance.noObservations(gap.from, gap.to)}
        </p>
      ))}
    </Panel>
  );
}

function FindingList({ findings }: { findings: ListConformanceFindingsResponse }) {
  const t = useT();
  if (findings.run === null) {
    return <EmptyState title={t.conformance.noRunTitle} message={t.conformance.noRunMessage} />;
  }

  return (
    <Stack>
      <ObservationGaps gaps={findings.run.observationGaps} />
      <MetaGrid>
        <div>
          <dt>{t.conformance.policyVersion}</dt>
          <dd className={MONO}>{findings.run.policyVersionId}</dd>
        </div>
        <div>
          <dt>{t.common.period}</dt>
          <dd>
            {findings.run.windowFrom} → {findings.run.windowTo}
          </dd>
        </div>
        <div>
          <dt>{t.conformance.replayRun}</dt>
          <dd className={MONO}>{findings.run.replayRunId}</dd>
        </div>
      </MetaGrid>

      <PermissionModeBreakdown rows={findings.run.byPermissionMode} />

      {findings.items.length === 0 ? (
        <EmptyState
          title={t.conformance.noFindingsTitle}
          message={t.conformance.noFindingsMessage}
        />
      ) : (
        <DataTable>
          <TableCaption>{t.conformance.findingsCaption(findings.items.length)}</TableCaption>
          <thead>
            <tr>
              <Th scope="col">{t.conformance.kind}</Th>
              <Th scope="col">{t.conformance.capability}</Th>
              <Th scope="col">{t.conformance.zone}</Th>
              <Th scope="col">{t.conformance.program}</Th>
              <Th scope="col" numeric>
                {t.conformance.action}
              </Th>
              <Th scope="col">{t.conformance.first}</Th>
              <Th scope="col">{t.conformance.last}</Th>
            </tr>
          </thead>
          <tbody>
            {findings.items.map((finding) => (
              <tr key={finding.findingKey}>
                <Td>{finding.kind}</Td>
                <Td>{finding.capability}</Td>
                <Td>{finding.zone}</Td>
                <Td>{finding.program ?? '-'}</Td>
                <Td numeric>{finding.actionCount}</Td>
                <Td className="whitespace-nowrap">{minuteOf(finding.firstOccurredAt)}</Td>
                <Td className="whitespace-nowrap">{minuteOf(finding.lastOccurredAt)}</Td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
    </Stack>
  );
}
