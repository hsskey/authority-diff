# ACR-0008 Runtime observation permission mode

Status: proposed (2026-09-23).
Procedure: docs/design.md 33.3.

Runtime observations record the permission mode the runtime reported in the hook input.
This touches schema.ts of trace, packages/contracts through `RuntimeObservationInputSchema`, the trace table `runtime_observations`, and the CLI hook and spool flush, so it is recorded here.

## Context

Every Claude Code hook input carries `permission_mode`, the session's permission mode when the hook fired (for example `default`, `acceptEdits`, `plan`, or `bypassPermissions`).
Without it, an observation cannot tell whether the runtime asked, or skipped asking, because of the policy or because of the mode the session ran in.

## Decision

- The hook writes `permissionMode` from `permission_mode` on every spool line: `pre_tool_use`, `permission_request`, and `session_end`.
  It is null when the input has none.
- The spool flush forwards `permissionMode`, and `RuntimeObservationSchema` gains `permissionMode`, a non-empty string that defaults to null on the wire so hook clients that predate it keep working.
- `runtime_observations` gains the nullable column `permission_mode` (migration `0007`).
  It has no check constraint, because the value set belongs to the runtime and can grow.
- `permissionMode` is not part of the observation key.
  It describes the observation rather than identifying it, so the key of an observation is the same whether or not the client sent the mode.

## Alternatives

- An enum of known modes: a new runtime mode would then fail validation and drop the observation during flush.
- Recording the mode only on `permission_request`: `pre_tool_use` is where a mode such as `bypassPermissions` or `acceptEdits` shows up as an attempt that was never asked.

## Consequences

- Replay does not read `permission_mode` yet; Disposition derivation is unchanged.
- CONTEXT.md is unchanged, because the field keeps the runtime's own term.
