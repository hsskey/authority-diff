# ACR-0015 PolicyDocument schemaVersion 2 with Mandate Exception

Status: proposed (2026-09-25).
Procedure: docs/design.md 33.3.
Scope: docs/design.md 13.5, 24.4; docs/cutline.md 6, 12; ADR-0009, ADR-0011.

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
- A test pins `resultHash` for schemaVersion 1 inputs to the values computed before this change, and pins that the schemaVersion 2 default template yields the same adoption `resultHash` as the schemaVersion 1 template it replaces.
- Golden set, calibration, probe tables, and the probe gate blocker from ADR-0011 stay out (docs/cutline.md 13).
