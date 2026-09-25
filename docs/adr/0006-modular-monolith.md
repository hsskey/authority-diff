# ADR-0006 Modular monolith, PostgreSQL job queue, state tables are canonical

Status: accepted. V1 note: pg-boss behind a `JobQueue` port was added by ACR-0015 (docs/acr/0015-job-queue.md). The modular monolith and PostgreSQL decisions stand. Source: docs/design.md chapter 34.

- Context: Ingest peaks at 7 per second, replay takes tens of seconds, and external calls are 2,800 per month.
- Decision: 1 process, 1 PostgreSQL, pg-boss. Do not use event sourcing or a message broker. Audit is a separate hash-chain table.
- Alternatives: Split services plus Kafka/Redis. A single SQLite file.
- Consequences: Two operational targets. No structural change until 20× growth. Not using SQLite means install requires docker compose.
- Reversal trigger: Split the running process and add partitions when monthly Actions exceed 5 million or replay exceeds 10 minutes.
- V1 note: Replay runs as a pg-boss job since ACR-0015; before it, replay ran as an async function in the same process. The audit hash chain in V1 is implemented on `review_decisions` instead of a separate `audit_events` table (docs/acr/0006-review-decision-hash-chain.md).
