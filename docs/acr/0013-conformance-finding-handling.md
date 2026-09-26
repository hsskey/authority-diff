# ACR-0013 Conformance Finding acknowledgement and draft from a finding

Status: accepted (2026-09-26).
Procedure: docs/design.md 33.3.
Scope: docs/design.md 24.5, 25, 26.2, 27; ACR-0007.

A Conformance Finding can be acknowledged with a note, and a Policy Version draft can be created from a finding with a Rule for that Capability and Zone added.
This touches `packages/replay/schema.ts`, `packages/replay` app and infra, `packages/review` app, `packages/contracts`, HTTP handlers, and `conformance_findings` columns, so it is recorded here.

## Context

ACR-0007 stored Conformance Findings per Replay Run and listed them. Finding status, acknowledgement, and a path from a finding to a Policy Version draft were left out.
docs/design.md 26.2 names `PUT /conformance-findings/{id}` with `{ status, note }` and `replay.finding_not_found`.
The `{id}` in V1 is `findingKey` (sha256), matching Action Key and Group Key rather than a `cfnd_` ULID.

## Decision

- `conformance_findings` gains `status` (`open` | `acknowledged`, default `open`) and `note` (text, default empty).
  Computed findings and `resultHash` stay unchanged: acknowledgement is stored state, not part of the run hash.
- `GET /conformance-findings` returns those fields on each item of the latest completed conformance run.
  Missing values on a stored row parse as `open` and `""`.
- `PUT /conformance-findings/{id}` takes `{ status: "acknowledged", note }` and is idempotent.
  `{id}` is the `findingKey` of a finding on that latest run. Unknown or malformed keys are `replay.finding_not_found` (404).
- `POST /conformance-findings/{id}/policy-drafts` takes `{ effect }` with no default and creates a new draft Policy Version from the run's candidate, then adds one Rule whose match is that finding's Capability and Zone.
  Allowed Effect by kind: `over_asked` → `ask` or `deny`; `under_asked` → `allow`, `ask`, or `deny`; `violation` → `ask` or `deny`.
  `violation` with `allow` is `replay.finding_effect_not_allowed` (422): a violation is a target for fixing the runtime configuration, not for relaxing the policy.
  An `under_asked` draft with `allow` is widening; Change Review still requires a Verdict.
  An open draft still yields `policy.draft_exists` (409).
  The Rule rationale is `review candidate created from finding {findingKey}; adoption is decided in change review.`
- Acknowledgement lives in `replay`. Draft-from-finding lives in `review`, which already depends on replay and policy.

## Alternatives

- A `cfnd_` ULID as `{id}`: V1 identifies grouped replay results by content hash (`findingKey`, `groupKey`, `actionKey`).
- Copying acknowledgement onto a later run with the same `findingKey`: findings remain per run; a new run starts `open`.
- Mapping Effect from finding kind automatically: the Principal names Effect on the request.
- Editing the existing matching Rule instead of appending: evaluation is most-restrictive, so a new Rule is a draft the Principal then edits. Tightening (`ask` or `deny` on an `over_asked` finding) takes effect immediately; an `allow` Rule on a finding that already matches `ask` still needs the existing Rule changed.

## Consequences

- `GET /conformance-findings` items gain `status` and `note`; clients that ignore unknown fields keep working.
- `apps/web` is unchanged in this change; the screen still lists findings.
- ACR-0007's limitation that acknowledgement is not built is lifted for status and note, not for runtime-version grouping.
