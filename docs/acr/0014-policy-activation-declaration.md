# ACR-0014 Policy Activation declaration

Status: accepted (2026-09-26).
Procedure: docs/design.md 33.3.
Scope: docs/design.md 25, 26.2, 27; docs/cutline.md 13.

An operator can record that an accepted Policy Version was applied outside Authority Diff.
docs/cutline.md chapter 13 lists `policy_activations` and `POST /policy-versions/{id}/activations` as removed work, and this adds a table in `packages/policy`, a repository method, a contract route, and an HTTP handler, so it is recorded here.

## Context

`accepted` is a review result, not a deployment status (CONTEXT.md, Policy Version).
Before this change nothing recorded whether or when an accepted version was put into managed settings.
docs/cutline.md 4 keeps activation out of V1 so accept is not read as deploy; a declaration that changes no status keeps that separation.

## Decision

- `policy_activations` (`id`, `policy_version_id`, `reason`, `actor_name`, `created_at`) lives in `packages/policy`.
  `policy_version_id` is a foreign key to `policy_versions`, and `idx_policy_activations__policy_version_id` indexes it.
  Triggers make the table append-only, the same way `review_decisions` is.
- `POST /policy-versions/{id}/activations` takes `{ reason, actorName }` and answers `201` with the stored Policy Activation (`pact_` id).
  The request is strict: an unknown field such as `kind` or `changeReviewId` is `validation.invalid_request` (422).
  A version that is not `accepted` is `policy.version_not_accepted` (409); an unknown version is `policy.version_not_found` (404).
  Declaring the same version again appends another row.
- A Policy Activation is a declaration only.
  It does not change Policy Version status, and baseline selection, replay, conformance, evaluation, and the screen do not read it.
  Nothing treats a declared version as the active or enforced one.

## Alternatives

- An `active` status after `accepted` (docs/cutline.md 7): it would let a declaration change which version replay and conformance compare against.
- `kind: 'activation' | 'rollback'` and `changeReviewId` from docs/design.md 26.2: rollback, `superseded`, `stale`, and the `review.evidence_stale` check stay out of V1, and the Change Review that accepted a version is already in `review_decisions`.
- `policy.transition_not_allowed` for a version that is not accepted: no transition happens, so a separate code says what failed.
- `Idempotency-Key` handling: `idempotency_keys` stays out of V1 (docs/cutline.md 13).

## Consequences

- `routes.createPolicyActivation` is added to the contract table; `apps/web` is unchanged.
- The rest of docs/cutline.md 13's `policy_activations` item (rollback, `superseded`, `stale`) is still not built.
