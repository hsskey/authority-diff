corpus snapshot: transcripts-2026-09-23-1036 (2026-09-23, 1,036 files, 34,940 Actions); classifier 0.2.4; measured 2026-09-24; A vs B resultHash `6a84292d…8d3f`
<!-- evidence-numbers
snapshot.actions: 34,940
snapshot.evaluated: 34,490
analyzability.full: 17,980
analyzability.partial: 9,662
analyzability.none: 6,848
adoption.resultHash: 481ba37e…4568
gate2.a-vs-b.resultHash: 6a84292d…8d3f
gate2.a-vs-bp.resultHash: 3993dfe0…2783
gate2.a-vs-b.changed: 166
gate2.a-vs-bp.changed: 166
c1.precision: 0.926
c1.recall: 0.990
c2.risky-entries: 80
bp-scene.actions: 9
-->

# V1 metrics

The seven V1 metrics of `docs/cutline.md` chapter 14, collected in one table.
Every value is on classifier 0.2.4; each source document holds the method, the hashes, and any earlier classifier version under its own "Previous version" section.

| metric | value | source |
| --- | --- | --- |
| Analyzable Action share (`full` + `partial`) | 80.1% of 34,490 evaluated Actions (`full` 17,980 / 52.1%, `partial` 9,662 / 28.0%, `none` 6,848 / 19.9%) | [adoption-preview.md](adoption-preview.md), initial measurement in [gate1-corpus.md](gate1-corpus.md) |
| Laundering rate | 0% (0 of 80 risky entries resolve to allow; synthetic C2 corpus, CI job `laundering-rate`) | `packages/policy/tests/laundering.test.ts`; method in [classifier-benchmark.md](classifier-benchmark.md) |
| Replay determinism | Two runs per comparison give the same `resultHash`; the server review gives the local value for A vs B (`6a84292d…8d3f`) and A vs B' (`3993dfe0…2783`). The adoption run repeats on the server and equals the local value (`481ba37e…4568`) | [gate2-replay.md](gate2-replay.md), [adoption-preview.md](adoption-preview.md) |
| Compression (changed Actions / Diff Groups) | A vs B: 166 / 5; A vs B': 166 / 7 | [gate2-replay.md](gate2-replay.md) |
| Review time | 73 s from the first unexpected Verdict to the accept in the change review loop; Agent tool latency, no person measured | [adoption-preview.md](adoption-preview.md) |
| Unexpected Widening groups | 0: every Widening group of A vs B and A vs B' was on the expected list. The 2 `unknown_remote → trusted_remote` groups of A vs B' are the predicted `github.com/**` scene; their Verdict `unexpected` means the Policy needs fixing, and that review was rejected | [gate2-replay.md](gate2-replay.md), [adoption-preview.md](adoption-preview.md) |
| Classifier accuracy | precision 0.926, recall 0.990 (TP 100, FP 8, FN 1; synthetic C1 corpus, 100 entries) | `packages/action/tests/labels.test.ts`; method in [classifier-benchmark.md](classifier-benchmark.md) |

The analyzable share rises because more commands are recognized, and part of that rise is auto-allow: a script named by a path inside the workspace is `partial`, and `allow_workspace_execute` allows it without reading it ([classifier-hardening-4.md](classifier-hardening-4.md)).

## Provenance and journey grade

The `github.com/**` scene comes from recorded Actions, not from a `synthetic` fixture: 9 fetch Actions (5 `git` from one repository, 4 `gh` to four others) to other owners' repositories move ask → allow at critical severity under B'.
No synthetic fixture was imported for the demo, so every Change Review and Evidence Report in the recorded journey covers recorded Actions only.

Journey grade: **medium** (중), under the core journey criteria of `docs/cutline.md` chapter 11.
Real-record Adoption Groups and Widening groups were reviewable and stayed inside the predicted scene.
The grade is not strong because no Widening outside the expected list was found in the recorded Actions.
Verdicts and timings were given by an Agent, not a person.
The grade is recorded in the evidence documents and the README, not as a product field.

## Previous version: classifier 0.2.3

The table below is the V1 metrics as collected on classifier 0.2.3 and is kept as the record of that collection.
Its hashes are not comparable with the 0.2.4 values above.

| metric | value | source |
| --- | --- | --- |
| Analyzable Action share (`full` + `partial`) | 71.3% of 34,490 evaluated Actions (`full` 17,972 / 52.1%, `partial` 6,610 / 19.2%, `none` 9,908 / 28.7%) | [adoption-preview.md](adoption-preview.md), initial measurement in [gate1-corpus.md](gate1-corpus.md) |
| Laundering rate | 0% (0 of 77 risky entries resolve to allow; synthetic C2 corpus, CI job `laundering-rate`) | `packages/policy/tests/laundering.test.ts`; method in [classifier-benchmark.md](classifier-benchmark.md) |
| Replay determinism | Two runs per comparison give the same `resultHash`; the server review gives the local value for A vs B (`2c4577fa…a8d9`) and A vs B' (`3082d2a4…1598`). The adoption run repeats on the server and equals the local value (`8ae52329…a444`) | [gate2-replay.md](gate2-replay.md), [adoption-preview.md](adoption-preview.md) |
| Compression (changed Actions / Diff Groups) | A vs B: 139 / 5; A vs B': 139 / 7 | [gate2-replay.md](gate2-replay.md) |
| Review time | 59 s from the first unexpected Verdict to the accept in the change review loop; Agent tool latency, no person measured | [adoption-preview.md](adoption-preview.md) |
| Unexpected Widening groups | 0: every Widening group of A vs B and A vs B' was on the expected list. The 2 `unknown_remote → trusted_remote` groups of A vs B' are the predicted `github.com/**` scene; their Verdict `unexpected` means the Policy needs fixing, and that review was rejected | [gate2-replay.md](gate2-replay.md), [adoption-preview.md](adoption-preview.md) |
| Classifier accuracy | precision 0.935, recall 1.000 (TP 101, FP 7, FN 0; synthetic C1 corpus, 100 entries) | `packages/action/tests/labels.test.ts`; method in [classifier-benchmark.md](classifier-benchmark.md) |

The `github.com/**` scene on classifier 0.2.3 was 7 fetch Actions (3 `git` from one repository, 4 `gh` to four others).
