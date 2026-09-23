corpus snapshot: transcripts-2026-09-23-1036 (2026-09-23, 1,036 files, 34,940 Actions); classifier 0.2.1

# Gate 1 corpus

Gate 1 measures whether the classifier can support replay on real transcripts.
All gate evidence after Gate 2 uses one frozen snapshot of local real transcripts.
No repository names, host paths, or raw command text appear below.

## Frozen snapshot (official)

| field | value |
| --- | --- |
| label | transcripts-2026-09-23-1036 |
| date | 2026-09-23 |
| transcript files | 1,036 |
| total files in snapshot | 2,020 |
| Actions | 34,940 |
| classifier | 0.2.1 |
| Action period | 2026-09-03T02:53:39Z .. 2026-09-23T04:49:40Z |

Gate 1 (28,415 Actions) and the first Gate 2 run (34,767 Actions) used earlier snapshots, so their counts are not directly comparable.
The growth most likely comes from this project's own agent sessions since the previous day.
That is real Claude Code activity, so it is kept in the corpus, not excluded.

## Initial Gate 1 measurement (earlier snapshot)

The first Gate 1 pass ran on an earlier corpus before the snapshot was frozen.

| measure | value |
| --- | ---: |
| sessions | 815 |
| Actions | 28,415 |
| Bash share of Actions | 87.8% |
| Action-level analyzability `none` | 38.1% |
| Operation-level analyzability `none` | 12.2% |
| `full` sample check (50 Bash Actions) | 49 / 50 correct |

Against cutline section 11: Action count exceeds 2,000; Bash exceeds 500; Action `none` is between 25% and 40% (conditional GO); the `full` sample passes 45/50.
One miss was a write-as-read on a pipe-tail redirect, fixed before hardening.
Operation `none` at 12.2% is the hardening ceiling, not the Gate 1 pass threshold.

## Classifier hardening round 1

Hardening targeted `program_unrecognized`, `git_subcommand_unknown`, and `tool_unrecognized` only.
On the corpus at hardening time: 29,027 Actions, 156,437 Operations, operation-level `none` 19,101 (12.2%).
Programs, git subcommands, and tools added are listed in `classifier-hardening-1.md`.
`inline_code` and `fragment_truncated` were not touched.

## Frozen snapshot on classifier 0.2.1

On the official snapshot, every Gate 2 replay run reports total 34,940 Actions, evaluated 34,490, excluded 450.
The share of changed Actions whose signature Operation has analyzability `none` is 0 on all eight official runs.
That satisfies the replay usability check: diff groups are not filled with unanalyzable Actions.

Transcript format, parser behavior, and duplicate handling are documented in `transcript-format.md` and `replay-corpus-snapshot.md`.
