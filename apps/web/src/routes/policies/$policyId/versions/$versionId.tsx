import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import {
  UpdatePolicyVersionRequestSchema,
  type PolicyVersionResponse,
  type ValidatePolicyVersionResponse,
} from '@authority/contracts/schema';
import { routes } from '@authority/contracts/routes';
import { callRoute, describeApiError, type ApiClientError } from '../../../../shared/api-client.ts';
import { ErrorState } from '../../../../shared/components/ErrorState.tsx';
import { LoadingState } from '../../../../shared/components/LoadingState.tsx';

export const Route = createFileRoute('/policies/$policyId/versions/$versionId')({
  component: PolicyVersionPage,
});

type PolicyDocument = PolicyVersionResponse['document'];
type PolicyRule = PolicyDocument['rules'][number];

function PolicyVersionPage() {
  const { policyId, versionId } = Route.useParams();
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
      {versionQuery.isPending ? <LoadingState label="Loading the policy version" /> : null}
      {versionQuery.isError ? (
        <ErrorState
          title="Could not load the policy version"
          message={versionQuery.error?.message ?? 'An unexpected error occurred'}
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
    return { ok: false, message: cause instanceof Error ? cause.message : 'invalid JSON' };
  }
  const parsed = UpdatePolicyVersionRequestSchema.safeParse({ document: json });
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const path = first?.path.join('.') ?? 'document';
    return { ok: false, message: `${path}: ${first?.message ?? 'invalid policy document'}` };
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
          <h2 className="section-title">Document</h2>
          <span className={`status-badge status-${version.status}`}>{version.status}</span>
        </div>
        <textarea
          className="json-editor"
          spellCheck={false}
          value={draftText}
          onChange={(event) => setDraftText(event.target.value)}
          readOnly={!isDraft}
          aria-label="Policy document JSON"
        />
        {!isDraft ? (
          <p className="state-message hint">
            Only a draft version can be edited. Create a draft to make changes.
          </p>
        ) : draft.ok ? (
          <p className="state-message status-ok">Document is valid against the contract.</p>
        ) : (
          <p className="state-message status-error" role="alert">
            {draft.message}
          </p>
        )}
        <div className="actions">
          <button
            type="button"
            disabled={!isDraft || !isDirty || !draft.ok || save.isPending}
            onClick={() => {
              if (draft.ok) {
                save.mutate(draft.document);
              }
            }}
          >
            {save.isPending ? 'Saving…' : 'Save draft'}
          </button>
          <button
            type="button"
            disabled={validate.isPending || isDirty}
            onClick={() => validate.mutate()}
          >
            {validate.isPending ? 'Validating…' : 'Validate'}
          </button>
          <button
            type="button"
            disabled={createDraft.isPending}
            onClick={() => createDraft.mutate()}
          >
            {createDraft.isPending ? 'Creating…' : 'Create draft from this version'}
          </button>
        </div>
        {isDirty ? (
          <p className="state-message hint">
            Save the draft before validating; validation runs against the stored document.
          </p>
        ) : null}
        <MutationError label="Save failed" error={save.error} />
        <MutationError label="Validation request failed" error={validate.error} />
        <MutationError label="Create draft failed" error={createDraft.error} />
      </div>

      {validation ? <ValidationResult result={validation} /> : null}

      <RuleTable rules={ruleSource.rules} />

      <CreateChangeReview candidateVersionId={version.id} />
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
        <dt>Updated</dt>
        <dd>{version.updatedAt}</dd>
      </div>
    </dl>
  );
}

function RuleTable({ rules }: { rules: readonly PolicyRule[] }) {
  return (
    <div className="stack">
      <h2 className="section-title">Rules ({rules.length})</h2>
      {rules.length === 0 ? (
        <p className="state-message hint">This document has no rules.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Rule ID</th>
              <th scope="col">Capabilities</th>
              <th scope="col">Zones</th>
              <th scope="col">Reversibility</th>
              <th scope="col">Analyzability</th>
              <th scope="col">Effect</th>
              <th scope="col">Rationale</th>
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
                <td>
                  <span className={`effect-badge effect-${rule.effect}`}>{rule.effect}</span>
                </td>
                <td>{rule.rationale}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function describeMatch(value: '*' | readonly string[] | null): string {
  if (value === '*' || value === null) {
    return 'any';
  }
  return value.join(', ');
}

function ValidationResult({ result }: { result: ValidatePolicyVersionResponse }) {
  return (
    <div className={`panel stack ${result.isValid ? 'status-ok' : 'status-error'}`}>
      <h2 className="section-title">
        Validation: {result.isValid ? 'passed' : `${result.issues.length} issue(s)`}
      </h2>
      {result.issues.length > 0 ? (
        <ul className="issue-list">
          {result.issues.map((issue, index) => (
            <li key={`${issue.code}-${issue.ruleId ?? 'document'}-${index}`}>
              <span className="mono">{issue.ruleId ?? 'document'}</span> · {issue.code} —{' '}
              {issue.message}
            </li>
          ))}
        </ul>
      ) : (
        <p className="state-message">No static issues found in the saved draft.</p>
      )}
    </div>
  );
}

function CreateChangeReview({ candidateVersionId }: { candidateVersionId: string }) {
  const navigate = useNavigate();
  const [window, setWindow] = useState(defaultWindow);

  const create = useMutation({
    mutationFn: async () => {
      const result = await callRoute(routes.createChangeReview, {
        body: {
          candidateVersionId,
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

  return (
    <div className="panel stack">
      <h2 className="section-title">Create Change Review</h2>
      <p className="state-message hint">
        Replays this candidate against the accepted baseline over the window.
      </p>
      <div className="window-inputs">
        <label>
          From
          <input
            type="datetime-local"
            value={window.from}
            onChange={(event) => setWindow((current) => ({ ...current, from: event.target.value }))}
          />
        </label>
        <label>
          To
          <input
            type="datetime-local"
            value={window.to}
            onChange={(event) => setWindow((current) => ({ ...current, to: event.target.value }))}
          />
        </label>
      </div>
      <div className="actions">
        <button type="button" disabled={create.isPending} onClick={() => create.mutate()}>
          {create.isPending ? 'Creating…' : 'Create Change Review'}
        </button>
      </div>
      <MutationError label="Create Change Review failed" error={create.error} />
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
