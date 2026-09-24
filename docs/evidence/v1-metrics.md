corpus snapshot: transcripts-2026-09-23-1036 (2026-09-23, 1,036 files, 34,940 Actions); classifier 0.2.3; measured 2026-09-24; A vs B resultHash `2c4577fa…a8d9`
<!-- evidence-numbers
snapshot.actions: 34,940
snapshot.evaluated: 34,490
analyzability.full: 17,972
analyzability.partial: 6,610
analyzability.none: 9,908
adoption.resultHash: 8ae52329…a444
gate2.a-vs-b.resultHash: 2c4577fa…a8d9
gate2.a-vs-bp.resultHash: 3082d2a4…1598
gate2.a-vs-b.changed: 139
gate2.a-vs-bp.changed: 139
review-loop.time: 59 s
c1.precision: 0.935
c1.recall: 1.000
c2.risky-entries: 77
bp-scene.actions: 7
-->

# V1 metrics

The seven V1 metrics of `docs/cutline.md` chapter 14, collected in one table.
Every value is on classifier 0.2.3; each source document holds the method, the hashes, and any earlier classifier version under its own "Previous version" section.

| metric | value | source |
| --- | --- | --- |
| Analyzable Action share (`full` + `partial`) | 71.3% of 34,490 evaluated Actions (`full` 17,972 / 52.1%, `partial` 6,610 / 19.2%, `none` 9,908 / 28.7%) | [adoption-preview.md](adoption-preview.md), initial measurement in [gate1-corpus.md](gate1-corpus.md) |
| Laundering rate | 0% (0 of 77 risky entries resolve to allow; synthetic C2 corpus, CI job `laundering-rate`) | `packages/policy/tests/laundering.test.ts`; method in [classifier-benchmark.md](classifier-benchmark.md) |
| Replay determinism | Two runs per comparison give the same `resultHash`; the server review gives the local value for A vs B (`2c4577fa…a8d9`) and A vs B' (`3082d2a4…1598`). The adoption run repeats on the server and equals the local value (`8ae52329…a444`) | [gate2-replay.md](gate2-replay.md), [adoption-preview.md](adoption-preview.md) |
| Compression (changed Actions / Diff Groups) | A vs B: 139 / 5; A vs B': 139 / 7 | [gate2-replay.md](gate2-replay.md) |
| Review time | 59 s from the first unexpected Verdict to the accept in the change review loop; Agent tool latency, no person measured | [adoption-preview.md](adoption-preview.md) |
| Unexpected Widening groups | 0: every Widening group of A vs B and A vs B' was on the expected list. The 2 `unknown_remote → trusted_remote` groups of A vs B' are the predicted `github.com/**` scene; their Verdict `unexpected` means the Policy needs fixing, and that review was rejected | [gate2-replay.md](gate2-replay.md), [adoption-preview.md](adoption-preview.md) |
| Classifier accuracy | precision 0.935, recall 1.000 (TP 101, FP 7, FN 0; synthetic C1 corpus, 100 entries) | `packages/action/tests/labels.test.ts`; method in [classifier-benchmark.md](classifier-benchmark.md) |

## Provenance and journey grade

The `github.com/**` scene comes from recorded Actions, not from a `synthetic` fixture: 7 fetch Actions (3 `git` from one repository, 4 `gh` to four others) to other owners' repositories move ask → allow at critical severity under B'.
No synthetic fixture was imported for the demo, so every Change Review and Evidence Report in the recorded journey covers recorded Actions only.

Journey grade: **medium** (중), under the core journey criteria of `docs/cutline.md` chapter 11.
Real-record Adoption Groups and Widening groups were reviewable and stayed inside the predicted scene.
The grade is not strong because no Widening outside the expected list was found in the recorded Actions.
Verdicts and timings were given by an Agent, not a person.
The grade is recorded in the evidence documents and the README, not as a product field.
