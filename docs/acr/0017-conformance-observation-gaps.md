# ACR-0017 Conformance observation gaps

Status: accepted (2026-09-26).
Procedure: docs/design.md 33.3.
Scope: docs/design.md 12.6, 31.2, 31.3; ACR-0011.

The `/conformance` screen and the Change Review Evidence Report state each period of 24 hours or more in the latest conformance run's window with no runtime observation.
This touches `packages/trace` through a new `ActionReader` read, `packages/replay/schema.ts`, `packages/contracts` through `GET /conformance-findings`, the Evidence Report, and the `/conformance` screen, so it is recorded here.

## Context

docs/design.md 12.6 lists the observation gap on the `/conformance` screen, and 31.2 says a quiet omission must read as "no observation", not as healthy.
Before this change the screen and the report showed only the run's window, so a hook outage inside the window looked the same as a quiet, conforming period.
docs/evidence/conformance-limitations.md records such an outage found by hand.

## Decision

- An observation gap is a period of 24 hours or more inside the run's window with no stored runtime observation.
  The window start and end bound the first and last period, so a window with no observation at all is one gap when it lasts 24 hours or more.
  The window includes its end millisecond, so the last period is measured to 1 ms past the window end, and a whole UTC day (00:00:00.000 to 23:59:59.999) with no observation is a gap.
  `from` is the window start or the observation before the period; `to` is the observation after it or the window end.
- The gaps are computed when the findings are listed, from `runtime_observations` as stored at that time.
  No column or stats field is added, so conformance `inputsHash`, `resultHash`, and `findingKey` are unchanged; a test pins a conformance `resultHash`.
- `ActionReader.listObservationTimes(window)` returns the distinct observation times inside the window, ascending.
  `findObservationGaps` in replay's domain turns them into gaps.
  lib/domain may not use `Date`, so it reads the epoch offset from the fixed `IsoTimestamp` layout.
- `ObservationGapSchema` (`{ from, to }`) is in `packages/replay/schema.ts`; `GET /conformance-findings` returns `run.observationGaps`, ascending.
- The screen renders one line per gap above the run details, and nothing when there is none.
  The report adds `- No observations from <from> to <to>.` per gap under the observation window line.

## Alternatives

- Storing the gaps in the run's stats: consistent with the run's inputs, but a new stored field, and observations flushed from the spool later would not show.
- Computing the gaps in SQL: returns fewer rows, but the in-memory store would need a second implementation of the same rule.
- Reusing `listObservationSessions` and `getObservations`: no new read, but it loads every observation of each Session on every listing.

## Consequences

- A gap can close after the run when a spool is flushed later; the run's findings still reflect the observations it read.
- The listing reads every distinct observation time in the window; a long window with many observations reads more rows.
- The `authority_observation_gap_seconds` gauge (docs/design.md 31.3) is not built.
