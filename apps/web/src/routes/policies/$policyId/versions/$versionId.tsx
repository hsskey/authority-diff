import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router';
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
import { effectLabel } from '../../../../features/change-review/format.ts';
import { usePageTitle } from '../../../../shared/use-page-title.ts';

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
      <h1 className="page-title">Policy Version</h1>
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
    <div className="stack">
      <VersionMeta version={version} />

      <div className="panel stack">
        <div className="row-between">
          <h2 className="section-title">정책 문서</h2>
          <span className={`status-badge status-${version.status}`}>
            {STATUS_LABEL[version.status]}
          </span>
        </div>
        <textarea
          className="json-editor"
          spellCheck={false}
          value={draftText}
          onChange={(event) => setDraftText(event.target.value)}
          readOnly={!isDraft}
          aria-label="정책 문서 JSON"
          aria-invalid={isDraft && !draft.ok}
        />
        {!isDraft ? (
          <p className="state-message hint">
            draft version만 편집할 수 있습니다. 바꾸려면 이 version에서 draft를 만드세요.
          </p>
        ) : draft.ok ? (
          <p className="state-message status-ok">문서가 계약과 맞습니다.</p>
        ) : (
          <p className="state-message status-error" role="alert">
            {draft.message}
          </p>
        )}
        <div className="actions">
          <button
            type="button"
            disabled={!isDraft || !isDirty || !draft.ok || save.isPending}
            aria-busy={save.isPending}
            onClick={() => {
              if (draft.ok) {
                save.mutate(draft.document);
              }
            }}
          >
            {save.isPending ? '저장 중…' : 'draft 저장'}
          </button>
          <button
            type="button"
            disabled={validate.isPending || isDirty}
            aria-busy={validate.isPending}
            onClick={() => validate.mutate()}
          >
            {validate.isPending ? '검증 중…' : '검증'}
          </button>
          <button
            type="button"
            disabled={createDraft.isPending}
            aria-busy={createDraft.isPending}
            onClick={() => createDraft.mutate()}
          >
            {createDraft.isPending ? '만드는 중…' : '이 version에서 draft 만들기'}
          </button>
        </div>
        {isDirty ? (
          <p className="state-message hint">
            검증은 저장된 문서를 대상으로 합니다. 검증 전에 draft를 저장하세요.
          </p>
        ) : null}
        <MutationError label="저장 실패" error={save.error} />
        <MutationError label="검증 요청 실패" error={validate.error} />
        <MutationError label="draft 생성 실패" error={createDraft.error} />
      </div>

      {validation ? <ValidationResult result={validation} /> : null}

      <RuleTable rules={ruleSource.rules} />

      <CreateReview policyId={policyId} version={version} />
    </div>
  );
}

function VersionMeta({ version }: { version: PolicyVersionResponse }) {
  return (
    <dl className="meta-grid panel">
      <div>
        <dt>Version</dt>
        <dd>#{version.versionNumber}</dd>
      </div>
      <div>
        <dt>Content hash</dt>
        <dd className="mono">{version.contentHash}</dd>
      </div>
      <div>
        <dt>수정 시각</dt>
        <dd>{version.updatedAt}</dd>
      </div>
    </dl>
  );
}

function RuleTable({ rules }: { rules: readonly PolicyRule[] }) {
  return (
    <div className="stack">
      <h2 className="section-title" id="policy-rules">
        Rule ({rules.length})
      </h2>
      {rules.length === 0 ? (
        <p className="state-message hint">
          이 문서에는 Rule이 없습니다. Rule이 없으면 모든 Operation의 Effect는 확인 필요입니다.
        </p>
      ) : (
        <div className="table-scroll">
          <table className="data-table" aria-labelledby="policy-rules">
            <thead>
              <tr>
                <th scope="col">Rule ID</th>
                <th scope="col">Capability</th>
                <th scope="col">Zone</th>
                <th scope="col">Reversibility</th>
                <th scope="col">Analyzability</th>
                <th scope="col">Effect</th>
                <th scope="col">근거</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.ruleId}>
                  <td className="mono">{rule.ruleId}</td>
                  <td>{describeMatch(rule.match.capabilities)}</td>
                  <td>{describeMatch(rule.match.zones)}</td>
                  <td>{describeMatch(rule.match.reversibility)}</td>
                  <td>{describeMatch(rule.match.analyzability)}</td>
                  <td className="nowrap">
                    <span className={`effect-badge effect-${rule.effect}`}>
                      {effectLabel(rule.effect)}
                    </span>
                  </td>
                  <td>{rule.rationale}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
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
    <div
      className={`panel stack ${result.isValid ? 'status-ok' : 'status-error'}`}
      role={result.isValid ? 'status' : 'alert'}
    >
      <h2 className="section-title">
        검증: {result.isValid ? '통과' : `문제 ${result.issues.length}건`}
      </h2>
      {result.issues.length > 0 ? (
        <ul className="issue-list">
          {result.issues.map((issue, index) => (
            <li key={`${issue.code}-${issue.ruleId ?? 'document'}-${index}`}>
              <span className="mono">{issue.ruleId ?? 'document'}</span> · {issue.code} ·{' '}
              {issue.message}
            </li>
          ))}
        </ul>
      ) : (
        <p className="state-message">
          저장된 draft에서 정적 문제를 찾지 못했습니다. 안전성 판단이 아니라 문서 검사 결과입니다.
        </p>
      )}
    </div>
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
    <div className="panel stack">
      <h2 className="section-title">{title}</h2>
      <p className="state-message hint">
        {hasAccepted
          ? '이 candidate와 채택된 기준 version을 같은 기간의 과거 Action에 대입해 달라지는 Effect를 찾습니다.'
          : '이 제안 정책을 과거 Action에 적용하면 각각 허용, 확인 필요, 차단 중 무엇이 되는지 계산합니다. 과거 runtime의 승인 여부는 복원하지 않습니다.'}
      </p>
      {openReview !== null ? (
        <p className="state-message">
          이 version의 검토가 이미 진행 중입니다.{' '}
          <Link to="/change-reviews/$reviewId" params={{ reviewId: openReview.id }}>
            {hasAccepted ? '변경 검토 열기' : '최초 도입 검토 열기'}
          </Link>
        </p>
      ) : null}
      <div className="window-inputs">
        <label>
          시작
          <input
            type="datetime-local"
            value={window.from}
            onChange={(event) => setWindow((current) => ({ ...current, from: event.target.value }))}
          />
        </label>
        <label>
          끝
          <input
            type="datetime-local"
            value={window.to}
            onChange={(event) => setWindow((current) => ({ ...current, to: event.target.value }))}
          />
        </label>
      </div>
      <div className="actions">
        <button
          type="button"
          disabled={create.isPending || !canCreate}
          aria-busy={create.isPending}
          onClick={() => create.mutate()}
        >
          {create.isPending ? '만드는 중…' : title}
        </button>
      </div>
      {version.status !== 'draft' && openReview === null ? (
        <p className="state-message hint">
          검토는 draft version에서만 만들 수 있습니다. 이 version은 {STATUS_LABEL[version.status]}{' '}
          상태입니다.
        </p>
      ) : null}
      <MutationError label={`${title} 실패`} error={create.error} />
    </div>
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
    <p className="state-message status-error" role="alert">
      {label}: {error.message}
    </p>
  );
}
