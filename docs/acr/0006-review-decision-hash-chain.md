# ACR-0006 Review decision hash chain

Status: accepted (2026-09-23).
Procedure: docs/design.md 33.3.
Scope: docs/cutline.md 17 (audit hash chain over `review_decisions`), docs/design.md 30.3.

`review_decisions` becomes a tamper-evident chain instead of a separate `audit` package.
This narrows docs/design.md 30.3, which chains `audit_events`, to the one table V1 records decisions in.

## Context

docs/cutline.md 17 schedules the audit hash chain on top of `review_decisions` with `prev_hash`, `hash`, and a verification command, without a new package.
Changing the review table and its store, the review entry point, and the CLI dispatch falls under items 2, 4, and 7 of docs/design.md 33.3.

## Decision

- `review_decisions` gains `sequence` (bigserial, unique), `prev_hash` (unique), and `hash`.
- `hash = sha256(prev_hash + canonicalJson(record))`, where the record is every other column of the row and the first row chains from 64 zeros.
- The decide transaction appends through `packages/review/lib/infra/audit-chain.ts`, which takes `LOCK TABLE review_decisions IN SHARE ROW EXCLUSIVE MODE` before reading the tail, so concurrent decisions serialize and the unique `prev_hash` rejects any fork.
- A trigger rejects UPDATE, DELETE, and TRUNCATE on `review_decisions`.
- The migration backfills rows recorded before the chain existed in `(decided_at, change_review_id)` order with the same formula.
- `@authority/review` exports `verifyAuditChain` and `createReviewStore`; `GET /api/v1/audit/verification` and `authority verify-audit` return `{ isIntact, checkedCount, firstBrokenSequence }` and the CLI exits 1 unless the chain is intact.

## Consequences

- Changing a recorded decision, or deleting one other than the last, makes verification report the first row whose hash no longer chains.
- The hash formula and record fields are now part of the stored data; changing either invalidates every existing hash and needs a new migration that rechains.
- Decision writes are serialized across the whole table, which is acceptable at human review rates.
- Verification reads the whole table in one query.
