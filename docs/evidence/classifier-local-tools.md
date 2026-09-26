corpus snapshot: transcripts-2026-09-23-1036 (2026-09-23, 1,036 files, 34,940 Actions); classifier 0.2.6; origin/main `fc4f89b`; measured 2026-09-26; backlog resultHash `daf23b2da3df8441cc1826a2b7c1a2475a03486959e24258d95e90499e7324f4`
<!-- evidence-numbers
snapshot.evaluated: 34,033
analyzability.none: 6,009
-->

# Classifier local tools

This document measures how many `none` Actions the operator's local tools hold on classifier 0.2.6.
It measures only; the classifier and the program table are unchanged.
Program names outside the public tool list are masked with the evidence legend; no paths, repositories, hosts, or raw commands appear below.

`pnpm dev:backlog <snapshot> --legend <file>` on the frozen snapshot with the evidence legend recomputes these figures and writes `backlog.json` and `backlog.md` under `.local/backlog/`.
The run gave resultHash `daf23b2da3df8441cc1826a2b7c1a2475a03486959e24258d95e90499e7324f4`.
Actions leaving `none` is the expected gain of a row as defined in `docs/evidence/classifier-backlog.md`: the `none` Actions whose every `none` Operation belongs to that row.

## Totals

| measure | value |
| --- | ---: |
| evaluated Actions | 34,033 |
| `none` Actions | 6,009 (17.7%) |

## Local tools

The three unrecognized programs with the most Actions leaving `none` are local tools, and they are the only unrecognized programs at 200 or more.

| program | Actions leaving `none` |
| --- | ---: |
| `<local-tool-02>` | 885 |
| `<local-tool-08>` | 363 |
| `<local-tool-04>` | 320 |

The three sole-cause sets are disjoint, so together they hold 1,568 of the 6,009 `none` Actions.

These are why the local tools are left out of the program table (`docs/evidence/classifier-limitations.md`, "The operator's local tools are left out of the program table").
