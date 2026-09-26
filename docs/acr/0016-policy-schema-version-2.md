# ACR-0016 PolicyDocument schemaVersion 2 with Mandate Exception

Status: accepted (2026-09-26).
Procedure: docs/design.md 33.3.
Scope: docs/design.md 13.5, 24.4, and Appendix A rows ask_production_deploy (now carries a Mandate Exception) and ask_irreversible_local (deploy dropped); docs/cutline.md 6, 12; ADR-0009, ADR-0011.

`PolicyDocument` gains schemaVersion 2, whose Rules carry `mandateException`, and `Decision` records whether its `ask` rests only on Rules with a Mandate Exception.
This changes `packages/policy/schema.ts` (`PolicyDocumentSchema`, `PolicyRuleSchema`, `OperationDecisionSchema`, `DecisionSchema`), the `packages/contracts` wire shapes built from them, and `CONTEXT.md`, so it is recorded here.

## Context

ADR-0009 dropped `PolicyRule.mandateException` and `Decision.isMandateDependent` from schemaVersion 1 and named an explicit schemaVersion 2 migration as the way back.
ADR-0011 (draft) describes that migration.
The exploratory probe (docs/evidence/probe-exploratory.md) could not test a Mandate-dependent sentence because the default template had none, so none of the three expansion conditions in docs/cutline.md 12 could be met.

## Decision

- `PolicyDocumentSchema` is a discriminated union on `schemaVersion`.
  A schemaVersion 1 Rule is unchanged and has no `mandateException` key, so a stored schemaVersion 1 document parses to the same canonical JSON and its `contentHash` does not move.
  A schemaVersion 2 Rule has `mandateException: { clause: string(10..300) } | null`; it is required, and a non-null value is valid only when the Rule's Effect is `ask`.
- `OperationDecision.isMandateDependent` is true when the Operation's Effect is `ask`, at least one `ask` Rule matched, and every matched `ask` Rule has a Mandate Exception.
  `Decision.isMandateDependent` is true when the Action's Effect is `ask` and every `ask` Operation is Mandate-dependent.
  Replay does not evaluate the clause (ADR-0005); the Effect stays `ask`.
- `isMandateDependent` is recorded on Decision only.
  It does not enter `resultHash`, a Diff Group, an Adoption Group, or the Gate, and no group carries a `mandateDependentCount`.
- `decidingRuleId` selection keeps ruleId lexical order.
  docs/design.md 13.5 prefers a Rule without a Mandate Exception; that preference is not restored, because group `decidingRuleIds` are hashed and a Mandate Exception would then move `resultHash`.
- A schemaVersion 1 document is never rewritten.
  `upgradePolicyDocument` is a pure function that adds `mandateException: null` to every Rule.
  `createDraftVersion` writes the upgraded base document, so the upgrade happens only as a new `draft` with its own `contentHash`, and that draft reaches `accepted` only through a Change Review.
  Updating an open draft accepts either schemaVersion.
- The default template is schemaVersion 2.
  `ask_external_disclosure` and `ask_production_deploy` carry a Mandate Exception; `ask_agent_config_change` keeps none as the control.
- `ask_irreversible_local` in the default template no longer lists deploy.
  Deploy is irreversible only in `protected`, where `ask_production_deploy` asks; while `ask_irreversible_local` also matched, a production deploy was decided by it and could never be Mandate-dependent.
  The empty template is schemaVersion 2 with no Rules.
- `renderPolicyProse` renders each Rule's reversibility and analyzability conditions and its Mandate Exception clause.
- The policy version screen shows a Rule's Mandate Exception clause under its rationale.
- `CONTEXT.md` gains Mandate, Mandate Exception, and Mandate-dependent.

## Alternatives

- Extend schemaVersion 1 in place: every stored `contentHash`, Replay Run `inputsHash`, and Decision Record hash chain entry that references one would break (ADR-0011).
- An optional `mandateException` in one Rule schema: a schemaVersion 1 document could then carry the field, and "absent" and "null" would be two spellings of the same thing.
- Restore the design 13.5 `decidingRuleId` preference: attaching a clause would change Diff Group and Adoption Group content and `resultHash` while no Effect changed.
- Carry `mandateDependentCount` on groups (ADR-0011 draft): it would make the clause part of the hashed replay result.
- An explicit upgrade request on `POST /policies/{id}/versions`: every new draft would still need a schemaVersion decision, and a new schemaVersion 1 draft has no use once schemaVersion 2 exists.

## Consequences

- `pnpm db:generate` produces no migration: `policy_versions.document` is `jsonb`.
- A Change Review from a schemaVersion 1 baseline to its upgraded draft has no Effect change and no groups.
- The invariant is per document: for a fixed document, a Mandate Exception never changes a Replay Run result, a Diff Group, an Adoption Group, or the Gate, and a test compares the default template with and without its clauses.
- schemaVersion 1 documents and stored versions evaluate exactly as before; a test pins `resultHash` for schemaVersion 1 inputs, including the frozen schemaVersion 1 default template (`tests/fixtures/default-policy-v1.json`), to the values computed before this change.
- The schemaVersion 2 default template is a different document from the schemaVersion 1 default template, and this is an intentional replay-contract difference.
  A production deploy keeps Effect `ask` and the same Adoption Group `groupKey`, but its deciding Rule moves from `ask_irreversible_local` to `ask_production_deploy`.
  Adoption Group `decidingRuleIds` are hashed, so the adoption `resultHash` of any Action set with a production deploy differs between the two templates; a test pins both the moved deciding Rule and the changed `resultHash`.
  On Action sets without a production deploy the two templates give the same `resultHash`.
- No committed figure depends on the default template deciding a production deploy.
  The adoption and change-review journeys (`tools/local-pipeline/lib/evidence-journey.ts`) replace the default-template draft with policy A before any replay, so README, `docs/demo.md`, and `docs/evidence/` figures come from policy A.
  The only direct use of the default template is the S1 measurement (`tools/local-pipeline/lib/s1-measure.ts`), and no S1 archetype (`tests/workloads/s1-seed.ts`) has the deploy capability.
- Golden set, calibration, probe tables, and the probe gate blocker from ADR-0011 stay out (docs/cutline.md 13).
