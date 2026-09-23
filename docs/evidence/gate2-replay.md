corpus snapshot: transcripts-2026-09-23-1036 (2026-09-23, 1,036 files, 34,940 Actions); classifier 0.2.1

# Gate 2 replay

Official Gate 2 evidence from classifier 0.2.1 on the frozen snapshot and corrected environment profile (policy v2).
Every number below is labelled **classifier 0.2.1, official**.
No repository names, host paths, or raw command text appear below.

## Discarded 0.2.0 incomplete-profile run

The first 0.2.0 run used an incomplete environment profile (one GitHub repository in `publicRemotes`, registry-only `trustedRemotes`).
Those outputs were moved on 2026-09-23 and are **discarded**.
The corrected profile re-run on 2026-09-23 is the official evidence.
0.2.0 policy files, the frozen snapshot, and the environment-profile files were not modified.

| run | official changed | official widening | official critical | discarded 0.2.0 changed / widening / critical |
| --- | ---: | ---: | ---: | --- |
| A vs B | 149 | 5 | 5 | 270 / 5 / 5 |
| A vs B' | 149 | 7 | 7 | 270 / 7 / 7 |
| A vs P | 0 | 0 | 0 | 2 / 1 / 0 |
| A vs P' | 6 | 2 | 2 | 191 / 4 / 3 |

All eight official runs: total 34,940, evaluated 34,490, excluded 450, analyzability `none` share of changed = 0.
No narrowing. No transition into or out of deny except deny→deny 20. No allow→ask.
Each pair of runs gave identical `resultHash` and `diff -rq` found no difference.

## Official five-case tables

### Run identity

| run | changed | widening | critical | resultHash identical across two runs |
| --- | ---: | ---: | ---: | --- |
| A vs B | 149 | 5 | 5 | yes |
| A vs B' | 149 | 7 | 7 | yes |
| A vs P | 0 | 0 | 0 | yes |
| A vs P' | 6 | 2 | 2 | yes |

### Top summary

| run | changed | widening | critical | allow→allow | ask→allow | ask→ask | deny→deny | none / changed |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| A vs B | 149 | 5 | 5 | 8,217 | 149 | 26,104 | 20 | 0 / 149 |
| A vs B' | 149 | 7 | 7 | 8,217 | 149 | 26,104 | 20 | 0 / 149 |
| A vs P | 0 | 0 | 0 | 8,217 | 0 | 26,253 | 20 | 0 / 0 |
| A vs P' | 6 | 2 | 2 | 8,217 | 6 | 26,247 | 20 | 0 / 6 |

### Widening groups: A vs B

| group | program | capability | fromZone → toZone | effect | severity | actions | sessions | none |
| --- | --- | --- | --- | --- | --- | ---: | ---: | ---: |
| 5f151a90 | git | fetch | unknown_remote → unknown_remote | ask → allow | critical | 52 | 34 | 0 |
| 3f356e8f | gh | fetch | unknown_remote → unknown_remote | ask → allow | critical | 36 | 17 | 0 |
| 9eb5d1f8 | WebFetch | fetch | unknown_remote → unknown_remote | ask → allow | critical | 34 | 11 | 0 |
| 0318937f | curl | fetch | unknown_remote → unknown_remote | ask → allow | critical | 15 | 12 | 0 |
| 56e9d01e | WebSearch | fetch | unknown_remote → unknown_remote | ask → allow | critical | 12 | 4 | 0 |

Top targets (masked): git — origin (unresolved) 28, local-path-01 13, unknown 5, local-path-02 2, repo-02 2.
gh — origin (unresolved) 32, repo-02 4.
WebFetch, curl, and WebSearch targets match the discarded run exactly.

### Widening groups: A vs B'

Same five groups as B, plus two trusted-remote groups:

| group | program | capability | fromZone → toZone | effect | severity | actions | sessions | none |
| --- | --- | --- | --- | --- | --- | ---: | ---: | ---: |
| b391c32d | gh | fetch | unknown_remote → trusted_remote | ask → allow | critical | 4 | 2 | 0 |
| b3807c02 | git | fetch | unknown_remote → trusted_remote | ask → allow | critical | 2 | 2 | 0 |

Top targets for the trusted groups: repo-02 only (4 gh, 2 git).

### Widening groups: A vs P

No groups.

### Widening groups: A vs P'

| group | program | capability | fromZone → toZone | effect | severity | actions | sessions | none |
| --- | --- | --- | --- | --- | --- | ---: | ---: | ---: |
| b391c32d | gh | fetch | unknown_remote → trusted_remote | ask → allow | critical | 4 | 2 | 0 |
| b3807c02 | git | fetch | unknown_remote → trusted_remote | ask → allow | critical | 2 | 2 | 0 |

No push group. The discarded 0.2.0 P' group for repo-01 push (33 Actions, critical) does not exist on the corrected profile.

## B' scene (Gate 3 core)

Appending one `github.com/**` line to `trustedRemotes` made an unlisted other-owner repository trusted.
Under B' and P', six recorded fetch Actions flipped from ask to allow at critical severity: 2 git and 4 gh, all repo-02, `unknown_remote → trusted_remote`.
The discarded incomplete-profile run showed 30 git fetches to repo-02 in one group; classifier 0.2.1 refuses to resolve named remotes when git runs outside the workspace (`remote_dir_mismatch`), so 28 of those git fetches stay `unknown_remote` even under `github.com/**`.

## Diff review criteria (A vs B)

| criterion | result | verdict |
| --- | --- | --- |
| Effect-changed Actions | 149 (≥ 10) | pass |
| Widening group count | 5 (≤ 25) | pass |
| Compression | 5 groups = 149 / 149 = 100% | pass |
| Understandability | 1 group cannot be fully described without raw commands (WebSearch, target always unknown) | pass (< 3) |
| Determinism | identical `resultHash` on two runs per case | pass |
| Changed-action analyzability `none` | 0 / 149 | pass |

## Review timing (auxiliary)

A vs B has five critical Widening groups covering 149 changed Actions.
A vs B' adds two more trusted-remote groups (seven Widening groups total).
In a timed review of all seven groups from headline, target summary, and up to three samples each, the elapsed wall time was on the order of minutes, well inside the ten-minute cutline budget.
This measures a single reviewer's reading speed, not a product guarantee.

## Journey grade

**Medium** — real-record Widening groups were reviewable and all fell within the expected range.
No unexpected Widening group appeared on the official run.
The B' trusted-remote scene is real-record, not synthetic.
