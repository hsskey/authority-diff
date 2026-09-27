# ADR-0013 V1 closes multi-policy, a Codex adapter, SSO and multi-tenant, and a settings export beyond a reference report

Status: accepted (V1). Source: docs/cutline.md chapters 4, 5, 7, 13, 14, and 17, docs/design.md 10.2 and 38, ADR-0010, and ACR-0018. The maintainers decided these items, and a person approved this record before it was added.

- Context:
  docs/cutline.md is the V1 scope, and the items outside it are spread across its chapters and the records that later narrowed them.
  One Policy per organization is fixed by ADR-0010, and docs/cutline.md chapter 5 says creating a second Policy is rejected.
  docs/cutline.md chapter 4 keeps "Codex adapter, runtime port" at Tier 3 because "One adapter is not a seam", chapter 7 attaches a Codex adapter as a parser on `trace/client.ts` and introduces a port only when adapters become 2, and chapter 13 lists "Codex parser, `TraceSource` port" as removed work.
  docs/cutline.md chapter 17 keeps "SSO and multi tenant" at Tier 3; docs/design.md 10.2 lists multi-tenant and SSO as deliberately deferred, and docs/design.md 38 lists them as not a completion condition.
  docs/cutline.md chapter 4 keeps the Claude Code settings export at Tier 3, and ACR-0018 then implemented a reduced reference-only export, so the export route exists while deployment stays out of scope.
  No single record stated that these items are closed for V1, or why.
- Decision:
  Multi-policy, a Codex adapter, SSO and multi-tenant, and the settings export as anything beyond a reference report are out of V1 scope and closed.
  No V1 work depends on any of them; docs/cutline.md chapter 14 excludes all of Tier 3 from the Definition of Done.
- Decision (multi-policy):
  The single-policy invariant closes it: an organization has one Policy.
  The policy module's `createPolicy` rejects a second Policy with `policy.organization_policy_exists` (ADR-0010), and the HTTP API returns that code as 409.
  When several Policy rows exist, the policy module does not pick one, and `/` shows an unsupported state (ADR-0010).
- Decision (Codex adapter):
  "One adapter is not a seam" closes it.
  docs/cutline.md keeps the Codex adapter and runtime port at Tier 3 and adds a `TraceSource` port only when a second adapter exists.
  Claude Code transcripts, parsed through `trace/client.ts`, are the only trace source in V1.
- Decision (SSO and multi-tenant):
  Both stay Tier 3 (docs/cutline.md chapter 17).
  V1 serves one organization and has no SSO.
- Decision (settings export):
  The settings export is a reference report only and is never deployed.
  `GET /policy-versions/{id}/exports/claude-code` returns `settings.permissions.allow`, `ask`, and `deny` always empty and lists every Rule in `unmappedRules` with a typed reason from `UnmappedRuleReasonSchema` (ACR-0018).
  Its `notice` states that the fragment is a reference and that Authority Diff does not deploy or enforce it, and Authority Diff writes the fragment to no settings file or endpoint.
  Writing the fragment to a settings file, distributing it, or deploying it is outside V1.
  ACR-0018's condition for a mapped subset (vendor-verified proof that the exported form covers exactly what the Rule covers) is unchanged.
- Alternatives:
  Leave each item's status in the notes of docs/cutline.md, ADR-0010, and ACR-0018.
  A reader then has to assemble V1 scope from several documents, and a note on a reduced implementation such as the settings export can read as the first step of a larger feature.
  Support several Policies per organization.
  `/` shows an unsupported state when there are two or more (ADR-0010), and every screen and job that reads the organization's Policy would need a rule for choosing one.
  Add a `TraceSource` port now with only the Claude Code adapter behind it.
  One adapter is not a seam, and the port's shape would be guessed from one trace format.
  Deploy the settings export.
  ACR-0018 records that no Rule has a Claude Code form of the same meaning, so a deployed fragment would either change a Rule's meaning or carry empty permission lists.
- Consequences:
  docs/cutline.md, docs/design.md, ADR-0010, and ACR-0018 are unchanged; this record points to them.
  No code, schema, contract, table, or test changes.
  A change that adds any of these items is not V1 work and needs a new record that supersedes the relevant part of this one.
- Reversal trigger:
  For the Codex adapter, a second trace adapter, which is the point docs/cutline.md chapter 7 names for introducing a port.
  For the settings export, a mapped subset stays under ACR-0018's condition, and deployment needs its own record.
