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

`credentials` is the first Zone in resolution order and is decided by the path alone.
A `Read(path)` rule covers the file-reading tools and the Bash file commands and redirections Claude Code recognizes; an `Edit(path)` rule covers every built-in tool that edits a file.
Deny, ask, and allow are evaluated deny first, then ask, then allow, independent of rule order, which is the same Effect order as a Decision.

## Decision

- A Rule is mapped only when all of these hold; otherwise it is listed in `unmappedRules` with the first reason that applies:
  - no Mandate Exception (`mandate_exception`);
  - `zones` is exactly `['credentials']` (`zone_not_expressible`);
  - `capabilities` lists only `read` and `write` (`capability_not_expressible`);
  - `reversibility` is null (`reversibility_condition`);
  - `analyzability` is null (`analyzability_condition`);
  - every `credentialPaths` pattern has a gitignore form (`path_pattern_not_expressible`).
- A mapped Rule adds `Read(<pattern>)` for `read` and `Edit(<pattern>)` for `write` to the list named by its Effect, once per `credentialPaths` pattern.
  A pattern starting with `/` becomes `//<rest>`, one starting with `~/` is kept, and one starting with `**/` or equal to `**` becomes `//` followed by the pattern.
  A pattern is not translated when it starts any other way, when a `**` is not a whole first or last path segment, or when it contains `[`, `]`, `\`, `!`, `#`, or leading or trailing white space, because gitignore reads those differently from the whole-value glob.
- Each of `allow`, `ask`, and `deny` is sorted in UTF-16 code-unit order without duplicates, so the same document always gives the same fragment.
  `unmappedRules` keeps document order.
- The response is `{ notice, settings: { permissions: { allow, ask, deny } }, unmappedRules: [{ ruleId, reason }] }`.
  `notice` states that the fragment is a reference, is not deployed, and is not enforced by Authority Diff.
  The fragment carries no `defaultMode`: tool calls no mapped rule matches follow the runtime's own permission mode, not the Policy's default `ask`.
- `ClaudeCodeSettingsExportSchema` and `UnmappedRuleReasonSchema` are in `packages/policy/schema.ts`; `PolicyModule.exportClaudeCodeSettings(id)` reads the stored version and calls the pure `exportClaudeCodeSettings(document)` from `@authority/policy`.
  `routes.exportClaudeCodeSettings` is added to the contract table.
  An unknown version is `policy.version_not_found` (404).
- The export is a read.
  It writes no row and does not change a stored document, `contentHash`, replay `inputsHash` or `resultHash`, adoption or conformance output, or an evidence figure; a test pins existing `resultHash` values across an export.

## Alternatives

- Export the expressible part of a Rule, such as `Read` and `Edit` deny rules for `deny_credentials_access`, and list the rest: docs/design.md 31.2 forbids exporting a Rule whose meaning changed, and a Rule that is both exported and unmapped is ambiguous.
- `Bash(<program> *)` rules per Capability: the classifier and a command prefix disagree on wrappers, interpreters, and compound commands, so the rule would not mean the same thing.
- `WebFetch(domain:<host>)` for `fetch` on a remote Zone: `fetch` also covers `git clone`, `curl`, and package installs, which `WebFetch` rules do not match.
- `suggestedProse` on each unmapped Rule (docs/design.md 26.2): text for an instruction file shapes what the Agent tries but is not a permission rule, and it is not needed to list what was left out.
- An `export-claude-code.ts` package-root entry (docs/cutline.md 7): the server reads the version through `PolicyModule`, and no pure-entry consumer needs it yet.

## Consequences

- The default template maps no Rule: each of its Rules has a Zone, a Capability, or a condition listed above.
  A Rule such as `deny` on `read` and `write` in `credentials` maps.
- The fragment is a reference for an operator; Authority Diff does not write it to any settings file or endpoint.
- `apps/web` and `apps/cli` are unchanged.
- OpenAPI generation stays out of V1 (docs/cutline.md 13), so the route's contract description is its TSDoc in `packages/contracts`.
