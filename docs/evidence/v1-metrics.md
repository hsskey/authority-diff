corpus snapshot: transcripts-2026-09-23-1036 (2026-09-23, 1,036 files, 34,940 Actions); classifier 0.2.2; measured 2026-09-24; A vs B resultHash `55592458…c08b`

# V1 metrics

The seven V1 metrics of `docs/cutline.md` chapter 14, collected in one table.
Every value is on classifier 0.2.2; each source document holds the method, the hashes, and any earlier classifier version under its own "Previous version" section.

| metric | value | source |
| --- | --- | --- |
| Analyzable Action share (`full` + `partial`) | 71.3% of 34,490 evaluated Actions (`full` 17,909 / 51.9%, `partial` 6,670 / 19.3%, `none` 9,911 / 28.7%) | [adoption-preview.md](adoption-preview.md), initial measurement in [gate1-corpus.md](gate1-corpus.md) |
| Laundering rate | 0% (0 of 67 risky entries resolve to allow; synthetic C2 corpus, CI job `laundering-rate`) | [classifier-benchmark.md](classifier-benchmark.md) |
| Replay determinism | Two runs per comparison give the same `resultHash`; the server review gives the local value for A vs B (`55592458…c08b`) and A vs B' (`55a0cb73…cd18`). The adoption run repeats on the server (`f6601304…e3a7`) and differs from the local value by one Session count, explained in the source | [gate2-replay.md](gate2-replay.md), [adoption-preview.md](adoption-preview.md) |
| Compression (changed Actions / Diff Groups) | A vs B: 132 / 5; A vs B': 132 / 7 | [gate2-replay.md](gate2-replay.md) |
| Review time | 114 s from the first unexpected Verdict to the accept in the change review loop; Agent tool latency, no person measured | [adoption-preview.md](adoption-preview.md) |
| Unexpected Widening groups | 0: every Widening group of A vs B and A vs B' was on the expected list. The 2 repo-02 groups of A vs B' are the predicted `github.com/**` scene; their Verdict `unexpected` means the Policy needs fixing, and that review was rejected | [gate2-replay.md](gate2-replay.md), [adoption-preview.md](adoption-preview.md) |
| Classifier accuracy | precision 0.942, recall 0.970 (TP 98, FP 6, FN 3; synthetic C1 corpus, 100 entries, per-capability table in the source) | [classifier-benchmark.md](classifier-benchmark.md) |

## Provenance and journey grade

The `github.com/**` scene comes from recorded Actions, not from a `synthetic` fixture: 6 fetch Actions (2 `git`, 4 `gh`) to another owner's repository move ask → allow at critical severity under B'.
No synthetic fixture was imported for the demo, so every Change Review and Evidence Report in the recorded journey covers recorded Actions only.

Journey grade: **medium** (중), under the core journey criteria of `docs/cutline.md` chapter 11.
Real-record Adoption Groups and Widening groups were reviewable and stayed inside the predicted scene.
The grade is not strong because no Widening outside the expected list was found in the recorded Actions.
Verdicts and timings were given by an Agent, not a person.
The grade is recorded in the evidence documents and the README, not as a product field.
