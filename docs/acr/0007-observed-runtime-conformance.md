# ACR-0007 Observed runtime conformance

Status: proposed (2026-09-23).
Procedure: docs/design.md 33.3.
Scope: docs/cutline.md 17 (conformance replay, reduced), docs/design.md 16.2, 24.5, 25.

Replay gains the `observed_runtime` Decision Source so a run can compare what the runtime actually did with a Policy Version.
This touches schema.ts of trace and replay, packages/contracts, the trace table `runtime_observations`, CONTEXT.md, and the CLI spool flush, so it is recorded here.

## Context

The hook already records `pre_tool_use`, `permission_request`, and `session_end` lines with the runtime `tool_use_id` in the local spool.
The server accepted only `permission_request` and `session_end`, dropped `toolUseId`, and the spool flush filtered the rest out, so no observation could be joined to an Action.
The transcript Action Key is derived from the same `tool_use_id`, which makes it the natural join key.

## Decision

- `runtime_observations` gains `tool_use_id`, `hook_decision` (`allow` or `deny`, from a decision already present in the hook input), and a server-derived `action_key` computed with DeriveActionKey from the runtime and `tool_use_id`.
  The event check adds `pre_tool_use`.
  `toolUseId` and `hookDecision` default to null on the wire so hook clients that predate them keep working.
- `ActionReader.getObservations(actionKeys)` returns the observations joined to Actions by `action_key`.
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

- Joining by (`sessionExternalId`, `toolName`, `toolInputHash`): the transcript keeps only the redacted input, so the hash cannot be recomputed server side.
- A `DecisionSource` union on the run: only two shapes exist, and a `kind` column with a nullable baseline is the reduced form docs/cutline.md 7 reserved.

## Consequences

- The authority map reads only `version_diff` runs.
- Finding status, acknowledgement, and runtime version grouping from docs/design.md 24.5 are not built; the screen is a list.
- CONTEXT.md adds Disposition, Decision Source, and Conformance Finding.
