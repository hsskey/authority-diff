# ACR-0007 Observed runtime conformance

Status: proposed (2026-09-23).
Procedure: docs/design.md 33.3.
Scope: docs/cutline.md 17 (conformance replay, reduced), docs/design.md 16.2, 24.5, 25.

Replay gains the `observed_runtime` Decision Source so a run can compare what the runtime actually did with a Policy Version.
This touches schema.ts of trace and replay, packages/contracts, the trace table `runtime_observations`, CONTEXT.md, and the CLI spool flush, so it is recorded here.

## Context

The hook already records `pre_tool_use`, `permission_request`, and `session_end` lines in the local spool, with the runtime `tool_use_id` when the hook input carries one.
The server accepted only `permission_request` and `session_end`, dropped `toolUseId`, and the spool flush filtered the rest out, so no observation could be joined to an Action.
The transcript Action Key is derived from the same `tool_use_id`, which makes it the natural join key.

The PermissionRequest hook input carries no `tool_use_id`.
The `/hooks` help screen of Claude Code mentions `tool_use_id` for this event, but the payloads recorded in the spool did not contain it.
A `permission_request` therefore arrives with a null `actionKey` and cannot be joined by `tool_use_id`.
The PreToolUse hook input does carry `tool_use_id`.

## Decision

- `runtime_observations` gains `tool_use_id`, `hook_decision` (`allow` or `deny`, from a decision already present in the hook input), and a server-derived `action_key` computed with DeriveActionKey from the runtime and `tool_use_id`.
  The event check adds `pre_tool_use`.
  `toolUseId` and `hookDecision` default to null on the wire so hook clients that predate them keep working.
- `ActionReader.getObservations(sessionExternalIds)` returns every observation of the given Sessions.
  `ObservationForReplay` carries a nullable `actionKey` plus `sessionExternalId`, `toolName`, `toolInputHash`, and `occurredAt`.
  This widens only the read DTO; the `runtime_observations` table and its migrations are unchanged.
- Permission request pairing is `pairPermissionRequests` in packages/replay/lib/domain, a pure function run at derive time before `deriveDisposition`.
  A `permission_request` without an `actionKey` pairs with the closest earlier `pre_tool_use` that has the same `sessionExternalId`, `toolName`, and `toolInputHash` and is not paired yet, and inherits its `actionKey`.
  A `pre_tool_use` at the same instant counts as earlier.
  A `permission_request` without such a `pre_tool_use` stays unjoined and is counted as unpaired.
  The count is stored as `unpairedPermissionRequests` in the run's `stats` jsonb and returned as `run.unpairedPermissionRequests` by `GET /conformance-findings`.
- `replay_runs.kind` is added with default `version_diff`; `conformance` marks a run whose baseline is `observed_runtime`, and `baseline_version_id` is null exactly for those runs.
- Disposition derivation is `deriveDisposition` in packages/replay/lib/domain:
  a runtime block marker in tool_result is `blocked`;
  a `permission_request` whose hook input carried `allow` is `hook_approved`, `deny` is `blocked`, no decision is `prompted`;
  a human refusal is `prompted`;
  only `pre_tool_use` is `auto_executed`;
  no observation is `executed_prompt_unknown`.
- Findings follow docs/design.md 16.2: `violation` (candidate `deny`, transcript shows the Action executed), `under_asked` (candidate `ask`, Disposition `auto_executed`), `over_asked` (candidate `allow`, Disposition `prompted`).
  They are grouped by `[kind, capability, zone, program]` of the lowest-index Operation carrying the candidate Effect and stored in `conformance_findings`.
- `POST /replay-runs` accepts `kind: "conformance"` without a baseline, and `GET /conformance-findings` returns the findings of the most recent completed conformance run.
  The web `/conformance` screen lists them.
- The CLI spool flush forwards `pre_tool_use` lines, `toolUseId`, and `hookDecision`, validating each line against the contract schema.

## Alternatives

- Joining Actions by (`sessionExternalId`, `toolName`, `toolInputHash`): the transcript keeps only the redacted input, so the hash cannot be recomputed server side.
  Pairing a `permission_request` with a `pre_tool_use` uses these fields only between two hook observations, whose hashes the hook computed from the same raw input.
- Storing the paired `actionKey` at ingestion: the `pre_tool_use` may arrive in a later spool flush than its `permission_request`, and the pairing would become a stored fact that a rule change could not revisit.
- A `DecisionSource` union on the run: only two shapes exist, and a `kind` column with a nullable baseline is the reduced form docs/cutline.md 7 reserved.

## Consequences

- The authority map reads only `version_diff` runs.
- Finding status, acknowledgement, and runtime version grouping from docs/design.md 24.5 are not built; the screen is a list.
- CONTEXT.md adds Disposition, Decision Source, and Conformance Finding.

## Limitations

In V1, execution after a permission_request cannot be distinguished between human approval and plugin approval.
`hook_approved` is recorded only when the hook input carries a decision, and it is not observed in the current Claude Code environment.
PermissionRequest hooks run in parallel, and this hook's stdin carries only tool information, not other plugins' decisions, so `hook_approved` effectively never fires.
An execution auto-approved by another plugin is therefore recorded as a `permission_request` plus an executed outcome, that is `prompted`.
This is a V1 limitation, not a defect.
`over_asked` still holds, because it depends only on the runtime having asked, not on who answered.
