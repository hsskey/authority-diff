# ACR-0018 Claude Code settings export

Status: proposed (2026-09-26).
Procedure: docs/design.md 33.3.
Scope: docs/design.md 8, 26.2, 31.2; docs/cutline.md 7, 13.

`GET /policy-versions/{id}/exports/claude-code` returns a stored Policy Version as a Claude Code settings fragment.
docs/cutline.md chapter 13 lists `exportClaudeCodeSettings` and this route as removed work, and this adds a type to `packages/policy/schema.ts`, a module method, a contract route, and an HTTP handler, so it is recorded here.

## Context

docs/design.md 8 keeps one piece of the compiler direction: an export that emits only deterministic rules as a Claude Code settings fragment.
docs/design.md 31.2 makes the export fail-closed: a Rule that cannot be converted goes to `unmappedRules` and is not put in the fragment, so no Rule is exported with a changed meaning.
The vendor syntax below comes from the Claude Code permissions documentation (https://code.claude.com/docs/en/permissions), read on 2026-09-26.

A Rule matches classified Operations by Capability, Zone, Reversibility, and Analyzability.
A Claude Code permission rule matches a tool call by tool name and a specifier: command text for `Bash`, a gitignore-style path for `Read` and `Edit`, a host for `WebFetch`.
Most Capability and Zone pairs have no documented Claude Code form:

- `delete`, `execute`, `install`, `fetch`, `send`, `commit`, `push`, `rewrite`, and `deploy` are recognized from command text by the classifier.
  A `Bash` rule matches command text by prefix and wildcard and, as the documentation says, is not a security boundary around a program.
- `workspace` and `host` depend on the Session's workspace root, and a path inside the workspace that matches `credentialPaths` or `agentConfigPaths` is not `workspace`.
  No Claude Code path rule excludes those paths.
- `agent_config` excludes paths that also match `credentialPaths`.
- Remote Zones, `protected`, Reversibility, Analyzability, and a Mandate Exception have no Claude Code rule form.

`credentials` is the first Zone in resolution order and is decided by the path alone, so `read` and `write` on `credentials` are the closest candidates: `Read(path)` and `Edit(path)` rules on each `credentialPaths` pattern.
The documentation shows that even these cover more or less than the Rule:

- A `Read` deny rule also blocks the Edit and Write tools on the same path (https://code.claude.com/docs/en/errors, "File is covered by a Read deny rule"), so a Rule that denies only `read` would also deny `write`.
- A deny rule applies when either a symlink path or its target matches, and a deny or ask rule written through a symlinked directory also applies at the directory's real location.
  An allow rule applies only when both the symlink path and its target match.
  The classifier matches the path written in the command and does not resolve symlinks, so a deny or ask rule covers more paths than the Rule and an allow rule covers fewer.
- The documentation does not say whether an ask or allow `Read` rule also affects the Edit and Write tools on the same path.
- gitignore patterns read `**`, a trailing `/`, and several special characters differently from the whole-value glob of `credentialPaths`.

## Decision

- No Rule is mapped: `settings.permissions.allow`, `ask`, and `deny` are always present and always empty, and every Rule is listed in `unmappedRules` in document order.
- Each unmapped Rule carries the first reason that applies, from the most specific to the most general:
  - it has a Mandate Exception (`mandate_exception`);
  - `zones` is not exactly `['credentials']` (`zone_not_expressible`);
  - `capabilities` lists a Capability other than `read` and `write` (`capability_not_expressible`);
  - `reversibility` is not null (`reversibility_condition`);
  - `analyzability` is not null (`analyzability_condition`);
  - otherwise the Rule has a candidate `Read` or `Edit` form whose documented vendor semantics differ from the Rule, as listed in Context (`vendor_semantics_differ`).
- A mapped subset may be reopened later only with vendor-verified proof that the exported form covers exactly what the Rule covers.
- The response is `{ notice, settings: { permissions: { allow, ask, deny } }, unmappedRules: [{ ruleId, reason }] }`.
  The shape keeps the permission lists so a later mapped subset does not change the contract.
  `notice` states that the fragment is a reference, is not deployed, and is not enforced by Authority Diff.
- `ClaudeCodeSettingsExportSchema` and `UnmappedRuleReasonSchema` are in `packages/policy/schema.ts`; `PolicyModule.exportClaudeCodeSettings(id)` reads the stored version and calls the pure `exportClaudeCodeSettings(document)` from `@authority/policy`.
  `routes.exportClaudeCodeSettings` is added to the contract table.
  An unknown version is `policy.version_not_found` (404).
- The export is a read.
  It writes no row and does not change a stored document, `contentHash`, replay `inputsHash` or `resultHash`, adoption or conformance output, or an evidence figure; a test pins existing `resultHash` values across an export.

## Alternatives

- Map `read` and `write` on `credentials` to `Read` and `Edit` rules and list only the other Rules: the documented vendor semantics in Context make those rules wider or narrower than the Rule, which docs/design.md 31.2 forbids.
- Export the expressible part of a Rule, such as `Read` and `Edit` deny rules for `deny_credentials_access`, and list the rest: docs/design.md 31.2 forbids exporting a Rule whose meaning changed, and a Rule that is both exported and unmapped is ambiguous.
- `Bash(<program> *)` rules per Capability: the classifier and a command prefix disagree on wrappers, interpreters, and compound commands, so the rule would not mean the same thing.
- `WebFetch(domain:<host>)` for `fetch` on a remote Zone: `fetch` also covers `git clone`, `curl`, and package installs, which `WebFetch` rules do not match.
- `suggestedProse` on each unmapped Rule (docs/design.md 26.2): text for an instruction file shapes what the Agent tries but is not a permission rule, and it is not needed to list what was left out.
- An `export-claude-code.ts` package-root entry (docs/cutline.md 7): the server reads the version through `PolicyModule`, and no pure-entry consumer needs it yet.

## Consequences

- Every export, including one of the default template, has empty permission lists; `unmappedRules` tells an operator which Rules to write by hand and why none was exported.
- The fragment is a reference for an operator; Authority Diff does not write it to any settings file or endpoint.
- `apps/web` and `apps/cli` are unchanged.
- OpenAPI generation stays out of V1 (docs/cutline.md 13), so the route's contract description is its TSDoc in `packages/contracts`.
