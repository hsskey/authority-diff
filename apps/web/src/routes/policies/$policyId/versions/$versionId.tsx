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
import { effectLabel } from '../../../../features/change-review/format.ts';
import { usePageTitle } from '../../../../shared/use-page-title.ts';
import { TextLink } from '../../../../shared/components/TextLink.tsx';

export const Route = createFileRoute('/policies/$policyId/versions/$versionId')({
  component: PolicyVersionPage,
});

type PolicyDocument = PolicyVersionResponse['document'];
type PolicyRule = PolicyDocument['rules'][number];
type VersionStatus = PolicyVersionResponse['status'];

const STATUS_LABEL: Record<VersionStatus, string> = {
  draft: 'draft',
  in_review: '검토 중',
  accepted: '채택됨',
  rejected: '반려됨',
};

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
  usePageTitle('Policy Version');
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
      <PageTitle>Policy Version</PageTitle>
      {versionQuery.isPending ? <LoadingState label="Policy Version을 불러오는 중" /> : null}
      {versionQuery.isError ? (
        <ErrorState
          title="Policy Version을 불러오지 못했습니다"
          message={versionQuery.error?.message ?? '알 수 없는 오류'}
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

function parseDraft(text: string): ParsedDraft {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (cause) {
    return { ok: false, message: cause instanceof Error ? cause.message : 'JSON이 아닙니다' };
  }
  const parsed = UpdatePolicyVersionRequestSchema.safeParse({ document: json });
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const path = first?.path.join('.') ?? 'document';
    return { ok: false, message: `${path}: ${first?.message ?? '정책 문서가 올바르지 않습니다'}` };
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
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const savedText = useMemo(() => JSON.stringify(version.document, null, 2), [version.document]);
  const [draftText, setDraftText] = useState(savedText);
  const [validation, setValidation] = useState<ValidatePolicyVersionResponse | null>(null);

  const draft = parseDraft(draftText);
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
          <SectionTitle>정책 문서</SectionTitle>
          <span
            className={`inline-block rounded-full border border-current px-[0.6rem] py-[0.15rem] text-[0.75rem] font-semibold ${STATUS_TONE[version.status]}`}
          >
            {STATUS_LABEL[version.status]}
          </span>
        </div>
        <textarea
          className="min-h-80 w-full resize-y rounded-md border border-gray-300 bg-gray-50 p-3 font-mono text-[0.85rem] leading-normal text-gray-900 read-only:opacity-85 dark:border-gray-600 dark:bg-[#0b0d12] dark:text-gray-200"
          spellCheck={false}
          value={draftText}
          onChange={(event) => setDraftText(event.target.value)}
          readOnly={!isDraft}
          aria-label="정책 문서 JSON"
          aria-invalid={isDraft && !draft.ok}
        />
        {!isDraft ? (
          <Hint>draft version만 편집할 수 있습니다. 바꾸려면 이 version에서 draft를 만드세요.</Hint>
        ) : draft.ok ? (
          <p className="m-0 text-emerald-700">문서가 계약과 맞습니다.</p>
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
            {save.isPending ? '저장 중…' : 'draft 저장'}
          </PrimaryButton>
          <PrimaryButton
            disabled={validate.isPending || isDirty}
            aria-busy={validate.isPending}
            onClick={() => validate.mutate()}
          >
            {validate.isPending ? '검증 중…' : '검증'}
          </PrimaryButton>
          <PrimaryButton
            disabled={createDraft.isPending}
            aria-busy={createDraft.isPending}
            onClick={() => createDraft.mutate()}
          >
            {createDraft.isPending ? '만드는 중…' : '이 version에서 draft 만들기'}
          </PrimaryButton>
        </Actions>
        {isDirty ? (
          <Hint>검증은 저장된 문서를 대상으로 합니다. 검증 전에 draft를 저장하세요.</Hint>
        ) : null}
        <MutationError label="저장 실패" error={save.error} />
        <MutationError label="검증 요청 실패" error={validate.error} />
        <MutationError label="draft 생성 실패" error={createDraft.error} />
      </PanelStack>

      {validation ? <ValidationResult result={validation} /> : null}

      <RuleTable rules={ruleSource.rules} />

      <CreateReview policyId={policyId} version={version} />
    </Stack>
  );
}

function VersionMeta({ version }: { version: PolicyVersionResponse }) {
  return (
    <MetaGrid>
      <div>
        <dt>Version</dt>
        <dd>#{version.versionNumber}</dd>
      </div>
      <div>
        <dt>Content hash</dt>
        <dd className={MONO}>{version.contentHash}</dd>
      </div>
      <div>
        <dt>수정 시각</dt>
        <dd>{version.updatedAt}</dd>
      </div>
    </MetaGrid>
  );
}

function RuleTable({ rules }: { rules: readonly PolicyRule[] }) {
  return (
    <Stack>
      <SectionTitle id="policy-rules">Rule ({rules.length})</SectionTitle>
      {rules.length === 0 ? (
        <Hint>
          이 문서에는 Rule이 없습니다. Rule이 없으면 모든 Operation의 Effect는 확인 필요입니다.
        </Hint>
      ) : (
        <DataTable aria-labelledby="policy-rules">
          <thead>
            <tr>
              <Th scope="col">Rule ID</Th>
              <Th scope="col">Capability</Th>
              <Th scope="col">Zone</Th>
              <Th scope="col">Reversibility</Th>
              <Th scope="col">Analyzability</Th>
              <Th scope="col">Effect</Th>
              <Th scope="col">근거</Th>
            </tr>
          </thead>
          <tbody>
            {rules.map((rule) => (
              <tr key={rule.ruleId}>
                <Td className={MONO}>{rule.ruleId}</Td>
                <Td>{describeMatch(rule.match.capabilities)}</Td>
                <Td>{describeMatch(rule.match.zones)}</Td>
                <Td>{describeMatch(rule.match.reversibility)}</Td>
                <Td>{describeMatch(rule.match.analyzability)}</Td>
                <Td className="whitespace-nowrap">
                  <span
                    className={`inline-block rounded-full px-2 py-[0.1rem] text-[0.75rem] font-semibold ${EFFECT_BADGE_TONE[rule.effect]}`}
                  >
                    {effectLabel(rule.effect)}
                  </span>
                </Td>
                <Td>
                  {rule.rationale}
                  {'mandateException' in rule && rule.mandateException !== null ? (
                    <p className="mt-1 text-muted">
                      Mandate Exception: {rule.mandateException.clause}
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

function describeMatch(value: '*' | readonly string[] | null): string {
  if (value === '*' || value === null) {
    return '모두';
  }
  return value.join(', ');
}

function ValidationResult({ result }: { result: ValidatePolicyVersionResponse }) {
  return (
    <PanelStack
      className={result.isValid ? 'text-emerald-700' : 'text-red-700'}
      role={result.isValid ? 'status' : 'alert'}
    >
      <SectionTitle>
        검증: {result.isValid ? '통과' : `문제 ${result.issues.length}건`}
      </SectionTitle>
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
        <p className="m-0">
          저장된 draft에서 정적 문제를 찾지 못했습니다. 안전성 판단이 아니라 문서 검사 결과입니다.
        </p>
      )}
    </PanelStack>
  );
}

/** The review to create depends on the Policy: no accepted version means an adoption review. */
function CreateReview({ policyId, version }: { policyId: string; version: PolicyVersionResponse }) {
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
    return <LoadingState label="검토 상태를 확인하는 중" />;
  }
  if (versionsQuery.isError || reviewsQuery.isError) {
    return (
      <ErrorState
        title="검토 상태를 불러오지 못했습니다"
        message={versionsQuery.error?.message ?? reviewsQuery.error?.message ?? '알 수 없는 오류'}
      />
    );
  }

  const hasAccepted = versionsQuery.data;
  const openReview = reviewsQuery.data;
  const title = hasAccepted ? '변경 검토 만들기' : '최초 도입 검토 만들기';
  const canCreate = version.status === 'draft' && openReview === null;

  return (
    <PanelStack>
      <SectionTitle>{title}</SectionTitle>
      <Hint>
        {hasAccepted
          ? '이 candidate와 채택된 기준 version을 같은 기간의 과거 Action에 대입해 달라지는 Effect를 찾습니다.'
          : '이 제안 정책을 과거 Action에 적용하면 각각 허용, 확인 필요, 차단 중 무엇이 되는지 계산합니다. 과거 runtime의 승인 여부는 복원하지 않습니다.'}
      </Hint>
      {openReview !== null ? (
        <p className="m-0">
          이 version의 검토가 이미 진행 중입니다.{' '}
          <TextLink to="/change-reviews/$reviewId" params={{ reviewId: openReview.id }}>
            {hasAccepted ? '변경 검토 열기' : '최초 도입 검토 열기'}
          </TextLink>
        </p>
      ) : null}
      <div className="flex flex-wrap gap-4">
        <label className="grid gap-1 text-[0.85rem]">
          시작
          <input
            type="datetime-local"
            className={FIELD_INPUT}
            value={window.from}
            onChange={(event) => setWindow((current) => ({ ...current, from: event.target.value }))}
          />
        </label>
        <label className="grid gap-1 text-[0.85rem]">
          끝
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
          {create.isPending ? '만드는 중…' : title}
        </PrimaryButton>
      </Actions>
      {version.status !== 'draft' && openReview === null ? (
        <Hint>
          검토는 draft version에서만 만들 수 있습니다. 이 version은 {STATUS_LABEL[version.status]}{' '}
          상태입니다.
        </Hint>
      ) : null}
      <MutationError label={`${title} 실패`} error={create.error} />
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
