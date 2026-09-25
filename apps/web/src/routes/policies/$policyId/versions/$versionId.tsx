import { useMemo, useState, type ComponentPropsWithoutRef, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import {
  UpdatePolicyVersionRequestSchema,
  type ChangeReviewResponse,
  type PolicyVersionResponse,
  type ValidatePolicyVersionResponse,
} from '@authority/contracts/schema';
import { routes } from '@authority/contracts/routes';
import { callRoute, describeApiError, type ApiClientError } from '../../../../shared/api-client.ts';
import { ErrorState } from '../../../../shared/components/ErrorState.tsx';
import { LoadingState } from '../../../../shared/components/LoadingState.tsx';
import { PageTitle } from '../../../../shared/components/PageTitle.tsx';
import { DataTable, Td, Th } from '../../../../shared/components/DataTable.tsx';
import { MetaGrid, MONO } from '../../../../shared/components/MetaGrid.tsx';
import { PanelStack } from '../../../../shared/components/Panel.tsx';
import { SectionTitle } from '../../../../shared/components/SectionTitle.tsx';
import { Stack } from '../../../../shared/components/Stack.tsx';
import { usePageTitle } from '../../../../shared/use-page-title.ts';
import { TextLink } from '../../../../shared/components/TextLink.tsx';
import type { Messages } from '../../../../shared/i18n/en.ts';
import { useT } from '../../../../shared/i18n/use-t.ts';

export const Route = createFileRoute('/policies/$policyId/versions/$versionId')({
  component: PolicyVersionPage,
});

type PolicyDocument = PolicyVersionResponse['document'];
type PolicyRule = PolicyDocument['rules'][number];
type VersionStatus = PolicyVersionResponse['status'];

const STATUS_TONE: Record<VersionStatus, string> = {
  draft: 'text-amber-700',
  in_review: 'text-blue-700',
  accepted: 'text-emerald-700',
  rejected: 'text-red-700',
};

const EFFECT_BADGE_TONE: Record<PolicyRule['effect'], string> = {
  allow: 'bg-emerald-700/12 text-emerald-700',
  ask: 'bg-amber-700/12 text-amber-700',
  deny: 'bg-red-700/12 text-red-700',
};

const FIELD_INPUT =
  'rounded-md border border-gray-300 bg-white px-[0.6rem] py-[0.4rem] text-inherit dark:border-gray-600 dark:bg-gray-900';

function Hint({ children }: { children: ReactNode }) {
  return <p className="m-0 text-[0.9rem] text-muted">{children}</p>;
}

function ErrorMessage({ children }: { children: ReactNode }) {
  return (
    <p className="m-0 text-red-700" role="alert">
      {children}
    </p>
  );
}

function Actions({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-3">{children}</div>;
}

function PrimaryButton(props: Omit<ComponentPropsWithoutRef<'button'>, 'className' | 'type'>) {
  return (
    <button
      type="button"
      className="cursor-pointer rounded-md border border-gray-800 bg-gray-900 px-[0.9rem] py-2 text-white disabled:cursor-not-allowed disabled:opacity-50"
      {...props}
    />
  );
}

function PolicyVersionPage() {
  const { policyId, versionId } = Route.useParams();
  const t = useT();
  usePageTitle(t.policy.title);
  const versionQuery = useQuery({
    queryKey: ['policy-version', versionId],
    queryFn: async () => {
      const result = await callRoute(routes.getPolicyVersion, { params: { id: versionId } });
      if (!result.ok) {
        throw new Error(describeApiError(result.error));
      }
      return result.value;
    },
  });

  return (
    <section>
      <PageTitle>{t.policy.title}</PageTitle>
      {versionQuery.isPending ? <LoadingState label={t.policy.loading} /> : null}
      {versionQuery.isError ? (
        <ErrorState
          title={t.policy.loadFailed}
          message={versionQuery.error?.message ?? t.common.unknownError}
        />
      ) : null}
      {versionQuery.isSuccess ? (
        <PolicyVersionEditor policyId={policyId} version={versionQuery.data} />
      ) : null}
    </section>
  );
}

type ParsedDraft =
  | { readonly ok: true; readonly document: PolicyDocument }
  | { readonly ok: false; readonly message: string };

function parseDraft(t: Messages, text: string): ParsedDraft {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (cause) {
    return { ok: false, message: cause instanceof Error ? cause.message : t.policy.notJson };
  }
  const parsed = UpdatePolicyVersionRequestSchema.safeParse({ document: json });
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const path = first?.path.join('.') ?? 'document';
    return { ok: false, message: `${path}: ${first?.message ?? t.policy.invalidDocument}` };
  }
  return { ok: true, document: parsed.data.document };
}

function PolicyVersionEditor({
  policyId,
  version,
}: {
  policyId: string;
  version: PolicyVersionResponse;
}) {
  const t = useT();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const savedText = useMemo(() => JSON.stringify(version.document, null, 2), [version.document]);
  const [draftText, setDraftText] = useState(savedText);
  const [validation, setValidation] = useState<ValidatePolicyVersionResponse | null>(null);

  const draft = parseDraft(t, draftText);
  const isDraft = version.status === 'draft';
  const isDirty = draftText !== savedText;
  const ruleSource = draft.ok ? draft.document : version.document;

  const save = useMutation({
    mutationFn: async (document: PolicyDocument) => {
      const result = await callRoute(routes.updatePolicyVersion, {
        params: { id: version.id },
        headers: { 'If-Match': version.contentHash },
        body: { document },
      });
      if (!result.ok) {
        throw new ApiError(result.error);
      }
      return result.value;
    },
    onSuccess: (updated) => {
      setDraftText(JSON.stringify(updated.document, null, 2));
      setValidation(null);
      void queryClient.invalidateQueries({ queryKey: ['policy-version', version.id] });
    },
  });

  const validate = useMutation({
    mutationFn: async () => {
      const result = await callRoute(routes.validatePolicyVersion, { params: { id: version.id } });
      if (!result.ok) {
        throw new ApiError(result.error);
      }
      return result.value;
    },
    onSuccess: (data) => setValidation(data),
  });

  const createDraft = useMutation({
    mutationFn: async () => {
      const result = await callRoute(routes.createPolicyVersion, {
        params: { policyId },
        body: { baseVersionId: version.id },
      });
      if (!result.ok) {
        throw new ApiError(result.error);
      }
      return result.value;
    },
    onSuccess: (created) => {
      void navigate({
        to: '/policies/$policyId/versions/$versionId',
        params: { policyId, versionId: created.id },
      });
    },
  });

  return (
    <Stack>
      <VersionMeta version={version} />

      <PanelStack>
        <div className="flex items-center justify-between gap-4">
          <SectionTitle>{t.policy.document}</SectionTitle>
          <span
            className={`inline-block rounded-full border border-current px-[0.6rem] py-[0.15rem] text-[0.75rem] font-semibold ${STATUS_TONE[version.status]}`}
          >
            {t.policy.status[version.status]}
          </span>
        </div>
        <textarea
          className="min-h-80 w-full resize-y rounded-md border border-gray-300 bg-gray-50 p-3 font-mono text-[0.85rem] leading-normal text-gray-900 read-only:opacity-85 dark:border-gray-600 dark:bg-[#0b0d12] dark:text-gray-200"
          spellCheck={false}
          value={draftText}
          onChange={(event) => setDraftText(event.target.value)}
          readOnly={!isDraft}
          aria-label={t.policy.documentJson}
          aria-invalid={isDraft && !draft.ok}
        />
        {!isDraft ? (
          <Hint>{t.policy.readOnlyHint}</Hint>
        ) : draft.ok ? (
          <p className="m-0 text-emerald-700">{t.policy.documentValid}</p>
        ) : (
          <ErrorMessage>{draft.message}</ErrorMessage>
        )}
        <Actions>
          <PrimaryButton
            disabled={!isDraft || !isDirty || !draft.ok || save.isPending}
            aria-busy={save.isPending}
            onClick={() => {
              if (draft.ok) {
                save.mutate(draft.document);
              }
            }}
          >
            {save.isPending ? t.policy.saving : t.policy.saveDraft}
          </PrimaryButton>
          <PrimaryButton
            disabled={validate.isPending || isDirty}
            aria-busy={validate.isPending}
            onClick={() => validate.mutate()}
          >
            {validate.isPending ? t.policy.validating : t.policy.validate}
          </PrimaryButton>
          <PrimaryButton
            disabled={createDraft.isPending}
            aria-busy={createDraft.isPending}
            onClick={() => createDraft.mutate()}
          >
            {createDraft.isPending ? t.common.creating : t.policy.createDraft}
          </PrimaryButton>
        </Actions>
        {isDirty ? <Hint>{t.policy.dirtyHint}</Hint> : null}
        <MutationError label={t.policy.saveFailed} error={save.error} />
        <MutationError label={t.policy.validateFailed} error={validate.error} />
        <MutationError label={t.policy.createDraftFailed} error={createDraft.error} />
      </PanelStack>

      {validation ? <ValidationResult result={validation} /> : null}

      <RuleTable rules={ruleSource.rules} />

      <CreateReview policyId={policyId} version={version} />
    </Stack>
  );
}

function VersionMeta({ version }: { version: PolicyVersionResponse }) {
  const t = useT();
  return (
    <MetaGrid>
      <div>
        <dt>{t.policy.version}</dt>
        <dd>#{version.versionNumber}</dd>
      </div>
      <div>
        <dt>{t.policy.contentHash}</dt>
        <dd className={MONO}>{version.contentHash}</dd>
      </div>
      <div>
        <dt>{t.policy.updatedAt}</dt>
        <dd>{version.updatedAt}</dd>
      </div>
    </MetaGrid>
  );
}

function RuleTable({ rules }: { rules: readonly PolicyRule[] }) {
  const t = useT();
  return (
    <Stack>
      <SectionTitle id="policy-rules">{t.policy.rulesTitle(rules.length)}</SectionTitle>
      {rules.length === 0 ? (
        <Hint>{t.policy.noRules}</Hint>
      ) : (
        <DataTable aria-labelledby="policy-rules">
          <thead>
            <tr>
              <Th scope="col">{t.policy.ruleId}</Th>
              <Th scope="col">{t.policy.capability}</Th>
              <Th scope="col">{t.policy.zone}</Th>
              <Th scope="col">{t.policy.reversibility}</Th>
              <Th scope="col">{t.policy.analyzability}</Th>
              <Th scope="col">{t.policy.effect}</Th>
              <Th scope="col">{t.policy.rationale}</Th>
            </tr>
          </thead>
          <tbody>
            {rules.map((rule) => (
              <tr key={rule.ruleId}>
                <Td className={MONO}>{rule.ruleId}</Td>
                <Td>{describeMatch(t, rule.match.capabilities)}</Td>
                <Td>{describeMatch(t, rule.match.zones)}</Td>
                <Td>{describeMatch(t, rule.match.reversibility)}</Td>
                <Td>{describeMatch(t, rule.match.analyzability)}</Td>
                <Td className="whitespace-nowrap">
                  <span
                    className={`inline-block rounded-full px-2 py-[0.1rem] text-[0.75rem] font-semibold ${EFFECT_BADGE_TONE[rule.effect]}`}
                  >
                    {t.effect[rule.effect]}
                  </span>
                </Td>
                <Td>
                  {rule.rationale}
                  {'mandateException' in rule && rule.mandateException !== null ? (
                    <p className="mt-1 text-muted">
                      {t.policy.mandateException}: {rule.mandateException.clause}
                    </p>
                  ) : null}
                </Td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
    </Stack>
  );
}

function describeMatch(t: Messages, value: '*' | readonly string[] | null): string {
  if (value === '*' || value === null) {
    return t.policy.any;
  }
  return value.join(', ');
}

function ValidationResult({ result }: { result: ValidatePolicyVersionResponse }) {
  const t = useT();
  return (
    <PanelStack
      className={result.isValid ? 'text-emerald-700' : 'text-red-700'}
      role={result.isValid ? 'status' : 'alert'}
    >
      <SectionTitle>{t.policy.validationTitle(result.isValid, result.issues.length)}</SectionTitle>
      {result.issues.length > 0 ? (
        <ul className="m-0 grid list-disc gap-[0.35rem] pl-5 text-[0.9rem]">
          {result.issues.map((issue, index) => (
            <li key={`${issue.code}-${issue.ruleId ?? 'document'}-${index}`}>
              <span className={MONO}>{issue.ruleId ?? 'document'}</span> · {issue.code} ·{' '}
              {issue.message}
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0">{t.policy.noIssues}</p>
      )}
    </PanelStack>
  );
}

/** The review to create depends on the Policy: no accepted version means an adoption review. */
function CreateReview({ policyId, version }: { policyId: string; version: PolicyVersionResponse }) {
  const t = useT();
  const navigate = useNavigate();
  const [window, setWindow] = useState(defaultWindow);

  const versionsQuery = useQuery({
    queryKey: ['policy-versions', policyId],
    queryFn: async () => {
      const result = await callRoute(routes.listPolicyVersions, {
        params: { policyId },
        query: { limit: 200 },
      });
      if (!result.ok) {
        throw new Error(describeApiError(result.error));
      }
      return result.value.items;
    },
    select: (versions) => versions.some((entry) => entry.status === 'accepted'),
  });

  const reviewsQuery = useQuery({
    queryKey: ['policy-change-reviews', policyId],
    queryFn: async () => {
      const result = await callRoute(routes.listChangeReviews, {
        query: { policyId, limit: 50 },
      });
      if (!result.ok) {
        throw new Error(describeApiError(result.error));
      }
      return result.value.items;
    },
    select: (reviews): ChangeReviewResponse | null =>
      reviews.find(
        (review) =>
          review.candidateVersionId === version.id &&
          (review.status === 'computing' || review.status === 'ready'),
      ) ?? null,
  });

  const create = useMutation({
    mutationFn: async () => {
      const result = await callRoute(routes.createChangeReview, {
        body: {
          candidateVersionId: version.id,
          windowFrom: new Date(window.from).toISOString(),
          windowTo: new Date(window.to).toISOString(),
        },
      });
      if (!result.ok) {
        throw new ApiError(result.error);
      }
      return result.value;
    },
    onSuccess: (review) => {
      void navigate({ to: '/change-reviews/$reviewId', params: { reviewId: review.id } });
    },
  });

  if (versionsQuery.isPending || reviewsQuery.isPending) {
    return <LoadingState label={t.policy.loadingReviewState} />;
  }
  if (versionsQuery.isError || reviewsQuery.isError) {
    return (
      <ErrorState
        title={t.policy.reviewStateLoadFailed}
        message={
          versionsQuery.error?.message ?? reviewsQuery.error?.message ?? t.common.unknownError
        }
      />
    );
  }

  const hasAccepted = versionsQuery.data;
  const openReview = reviewsQuery.data;
  const title = hasAccepted ? t.policy.createChangeReview : t.policy.createAdoptionReview;
  const canCreate = version.status === 'draft' && openReview === null;

  return (
    <PanelStack>
      <SectionTitle>{title}</SectionTitle>
      <Hint>{hasAccepted ? t.policy.changeReviewHint : t.policy.adoptionReviewHint}</Hint>
      {openReview !== null ? (
        <p className="m-0">
          {t.policy.reviewInProgress}{' '}
          <TextLink to="/change-reviews/$reviewId" params={{ reviewId: openReview.id }}>
            {hasAccepted ? t.policy.openChangeReview : t.policy.openAdoptionReview}
          </TextLink>
        </p>
      ) : null}
      <div className="flex flex-wrap gap-4">
        <label className="grid gap-1 text-[0.85rem]">
          {t.policy.windowStart}
          <input
            type="datetime-local"
            className={FIELD_INPUT}
            value={window.from}
            onChange={(event) => setWindow((current) => ({ ...current, from: event.target.value }))}
          />
        </label>
        <label className="grid gap-1 text-[0.85rem]">
          {t.policy.windowEnd}
          <input
            type="datetime-local"
            className={FIELD_INPUT}
            value={window.to}
            onChange={(event) => setWindow((current) => ({ ...current, to: event.target.value }))}
          />
        </label>
      </div>
      <Actions>
        <PrimaryButton
          disabled={create.isPending || !canCreate}
          aria-busy={create.isPending}
          onClick={() => create.mutate()}
        >
          {create.isPending ? t.common.creating : title}
        </PrimaryButton>
      </Actions>
      {version.status !== 'draft' && openReview === null ? (
        <Hint>{t.policy.draftOnly(t.policy.status[version.status])}</Hint>
      ) : null}
      <MutationError label={t.policy.failed(title)} error={create.error} />
    </PanelStack>
  );
}

function defaultWindow(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { from: toLocalInput(from), to: toLocalInput(to) };
}

function toLocalInput(date: Date): string {
  const offset = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

class ApiError extends Error {
  constructor(error: ApiClientError) {
    super(describeApiError(error));
    this.name = 'ApiError';
  }
}

function MutationError({ label, error }: { label: string; error: Error | null }) {
  if (error === null) {
    return null;
  }
  return (
    <ErrorMessage>
      {label}: {error.message}
    </ErrorMessage>
  );
}
