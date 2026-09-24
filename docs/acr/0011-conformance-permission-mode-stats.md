# ACR-0011 Conformance stats by permission mode

Status: proposed (2026-09-24).
Procedure: docs/design.md 33.3.

Conformance ReplayStats gains `byPermissionMode`, the run's Action and finding counts per runtime permission mode, so a reader can see how much of the observed workload ran in a mode that never asks.
This touches `packages/replay/schema.ts`, `packages/trace/schema.ts` through `ObservationForReplay`, `packages/contracts` through `ReplayStatsSchema` and `GET /conformance-findings`, the Change Review Evidence Report, and the `/conformance` screen, so it is recorded here.

## Context

ACR-0008 records `permissionMode` on every runtime observation but replay did not read it.
A `bypassPermissions` or `auto` Session executes every Action without a prompt, so an `ask` Effect has no runtime guard there, and an `under_asked` finding in such a Session says as much about the mode as about the policy.
Without the breakdown, a conformance run cannot say how much of its workload could run without a guard.

## Decision

- `ObservationForReplay` gains `permissionMode`, nullable, read from `runtime_observations.permission_mode`.
  This widens only the read DTO; the table is unchanged.
- `ReplayStats.byPermissionMode` is `{ permissionMode, actionCount, findingCount }[]`, present on conformance runs only and omitted by `version_diff`, so `version_diff` result hashes are unchanged.
  An Action's mode is the first non-null `permissionMode` among the observations paired to it in time order; an Action with no observation or no mode counts under `unknown`.
  `actionCount` covers every Action of the run and sums to `totalActions`; `findingCount` covers the Actions inside a Conformance Finding and sums to the findings' `actionCount`.
  Rows sort by `permissionMode` ascending UTF-16, and a mode with no Action has no row.
- `UNGUARDED_PERMISSION_MODES` in `packages/replay/schema.ts` names `bypassPermissions` and `auto`; the report and the screen sum those rows as the workload that could run without a guard.
  The list is a constant rather than a stats field so the definition can change without a new run.
- The field is in `stats`, so a conformance `resultHash` covers it.
  Finding definitions, `findingKey`, and Disposition derivation are unchanged.
- `GET /conformance-findings` returns `run.byPermissionMode`; the `/conformance` screen renders the breakdown and the unguarded total.
- The Change Review Evidence Report gains a section that renders the most recent completed conformance run's breakdown with that run's id, Policy Version, and window, or states that no conformance run has completed.
  The fixed notice is unchanged: the section reports observed modes, not whether the runtime follows the candidate.

## Alternatives

- Counting by finding kind per mode: a `violation` / `under_asked` / `over_asked` split per mode is derivable later from the same observations and doubles the row count now.
- Storing the unguarded total in stats: the set of modes belongs to the runtime and to the reader's question, so it stays a rendering rule.
- An enum of modes: rejected in ACR-0008 for the same reason.

## Consequences

- Conformance `resultHash` values recorded before this field differ from a recomputation, as `docs/evidence/conformance.md` will show until `pnpm evidence:remeasure` is run again.
- Stored conformance stats that omit the field parse with `byPermissionMode` undefined and are shown as an empty breakdown.
- docs/cutline.md 5 enumerates the Evidence Report's contents and reserves statements about runtime behaviour for the `/conformance` screen; the new report section adds observed permission modes to that list.
