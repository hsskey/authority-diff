# ACR-0009 Operation-level widening stats

Status: proposed (2026-09-23).
Procedure: docs/design.md 33.3.

ReplayStats gains `operationWidening` so a Change Review can show Operations whose Effect widened while the Action Effect stayed the same. This touches `packages/replay/schema.ts`, `packages/contracts` through `ReplayStatsSchema`, replay.md, and the Change Review Evidence Report.

## Context

Action Effect is the most restrictive Operation Effect. A compound Action can stay `ask` while push or publish Operations inside it become `allow`. Those Operations would be `allow` if each ran as its own Action, but Diff Groups and Verdicts stay Action-level, so the widening is invisible in `changedActions`.

## Decision

- `ReplayStats.operationWidening` is `{ capability, fromZone, toZone, count }[]`, counting Operations whose Effect widened while their Action's Effect did not change.
- Rows sort by capability, fromZone, then toZone, ascending UTF-16. Count is positive; absent rows are omitted and an empty array is stored.
- The field is in `stats`, so `resultHash` covers it. Diff Groups, groupKey, and Verdicts are unchanged.
- replay.md and the Change Review Evidence Report render the table under "Action effect unchanged, operation-level widening".
- Stored stats that omit the field parse as `[]` (expand-contract).

## Alternatives

- Diff Groups and Verdicts at Operation level: would change the review unit and gate.
- Counting Operation widening inside changed Actions as well: those Operations already have an Action-level group.

## Consequences

- Recomputing `resultHash` after this field exists differs from hashes produced before it, including when the array is empty.
- Conformance ReplayStats carries an empty `operationWidening`: Disposition is Action-level.
