# ACR-0015 Job queue and daily conformance run

Status: proposed (2026-09-25).
Procedure: docs/design.md 33.3.
Scope: docs/design.md 20, 21, 26, 27; docs/cutline.md 6, 7, 8, 13; ADR-0006.

Replay Runs execute as jobs on a `JobQueue` port backed by pg-boss, and a daily conformance run for the declared Policy Version is scheduled through the same queue.
docs/cutline.md chapter 13 lists pg-boss, the `JobQueue` port, the in-memory queue adapter, and periodic jobs as removed work, and this adds a kernel port, a third-party dependency, a platform adapter, a policy repository read, and server job wiring, so it is recorded here.

## Context

Before this change a Replay Run executed as a fire-and-forget async function in the request's process.
A run still `queued` when the process stopped stayed `queued` forever, because restart recovery only fails runs left `running`.
Nothing ran conformance unless someone asked for it, so the Conformance Findings screen showed whatever window was last requested by hand.
ADR-0006 already chose pg-boss behind a `JobQueue` port; docs/cutline.md 7 reserves the seat ("wrap the replay-run function as a handler").

## Decision

- `JobQueue` (`send`, `work`, `schedule`) is a port in `packages/kernel`, next to `Clock` and `Logger`.
  A job payload is a JSON object; a handler receives it as `unknown` and validates it with Zod, since a job payload is a schema-validation boundary (docs/design.md 27).
- `packages/platform` owns both adapters.
  `createPgBossJobQueue(config)` in `lib/infra` is the only place that imports `pg-boss`, and `.oxlintrc.json` forbids the import elsewhere.
  `createMemoryJobQueue()` in `testing.ts` runs each job in process as soon as a worker exists, and `drain()` waits until no job is pending.
- A handler that throws is retried five times with exponential backoff from 2 s up to 60 s (docs/design.md 28).
- The server starts the queue and registers every worker and schedule before it serves HTTP; if either fails, it logs `server_start_failed` and exits.
- pg-boss provisions itself.
  `start()` creates and migrates the `pgboss` schema in the database `AUTHORITY_DB_URL` names, with the same credentials; no new environment variable, compose service, or drizzle migration exists, and `pnpm db:generate` output is unchanged.
  docker-compose's `authority` role owns its database, so `docker compose up` and the `compose-smoke` job need nothing new.
- Replay: `requestReplay`, `requestConformanceReplay`, and `requestAdoptionReplay` keep their validation, `inputsHash`, and reuse behavior, insert the `queued` run, and send `replay.run` with `{ replayRunId }`.
  `runReplay(replayRunId)` is the handler.
  It claims only a `queued` run (`markRunning` becomes a conditional update that reports whether it claimed the run), so a redelivered job is a no-op.
  It re-reads the run's Policy Versions and window and recomputes `inputsHash`; when the inputs moved between request and execution the run fails with `replay.inputs_changed` instead of recording a result under a hash it does not match.
  Evaluation, grouping, `resultHash`, and stored rows are the same functions as before.
  Restart recovery still fails runs left `running` past 60 s, and now also sends the job again for every `queued` run, so a run whose job was lost (a crash between the run insert and the send, or retries exhausted while the database was down) still executes.
  `RequestReplayOutput.execution` is removed.
- Policy: `findLatestActivation()` returns the most recent Policy Activation, or null.
- Server: `apps/server/src/jobs/` wires `replay.run` and `conformance.daily`.
  `conformance.daily` is scheduled with cron `0 1 * * *` (UTC) and `missed: 'once'`.
  It reads the latest Policy Activation and requests a conformance Replay Run of that version over the previous whole UTC day.
  With no declaration it logs and does nothing; a request error is logged, not retried.
  A day already run is reused by `inputsHash`.

## What does not change

- Policy Version status, baseline selection, evaluation, and the Policy Activation record.
  A declaration still changes no status; the schedule only reads the latest one to choose which version the daily run checks.
- Conformance semantics: the scheduled run is an ordinary `conformance` Replay Run, identical to one requested through `POST /replay-runs` with the same version and window.
  The Conformance Findings screen shows the newest completed conformance run, as before, so after each daily run it shows the previous day's findings, including a day with no Actions and no findings.
  A Conformance Finding's acknowledgement belongs to its run, as it does for a requested run.
- Evidence: result hashes and `docs/evidence` figures are unchanged.
  `apps/server/tests/jobs` pins that the scheduled run's `resultHash` equals the direct request's and that the local pipeline hash is unchanged.

## Alternatives

- Keep in-process execution and add a timer: no durable queue, so a stopped process still strands `queued` runs, and two server processes would both fire the timer.
- Send the computed Action set in the job payload: payloads would carry every Action in the window, and the handler still has to reload Policy documents.
- Pass the drizzle transaction to pg-boss so enqueue commits with the run row (docs/design.md 20 "needs confirmation"): the handler ignores a duplicate job and restart recovery re-sends a missing one; transactional enqueue can come later without changing the port.
- A trailing seven-day window: consecutive runs would overlap and the latest findings would mix days; the previous whole day is deterministic and reusable by `inputsHash`.
- A `conformance_schedules` table or setting for the cron: one fixed daily run is all the product needs now.

## Consequences

- New dependency `pg-boss` in `packages/platform` (it brings `pg`, used only inside pg-boss).
  `pnpm-workspace.yaml` gives drizzle-orm `pg` as a dependency, so every package resolves the same drizzle-orm instead of a separate pg-flavored one in `packages/platform`.
- `CONTEXT.md` Policy Activation: the daily conformance schedule reads the latest declaration.
- docs/cutline.md 13's job-queue item is marked implemented; retention and other periodic jobs are still not built.
- ADR-0006's V1 note no longer says replay runs in process.
