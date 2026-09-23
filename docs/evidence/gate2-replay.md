corpus snapshot: transcripts-2026-09-23-1036 (2026-09-23, 1,036 files, 34,940 Actions); classifier 0.2.2; measured 2026-09-24; A vs B resultHash `55592458…c08b`

# Gate 2 replay

Gate 2 evidence from classifier 0.2.2 on the frozen snapshot and the corrected environment profile (policy v2), measured with `pnpm dev:replay-local` on 2026-09-24.
Every number in the main sections is labelled **classifier 0.2.2**; the earlier 0.2.1 measurement is kept unchanged under "Previous version" at the end.
No repository names, host paths, or raw command text appear below; repo-02 is a GitHub repository of a different owner that is in neither remote list.
Remote resolution happens at import or replay time, so these numbers are tied to the snapshot and the disk state of the measurement date (`docs/evidence/replay-limitations.md`).

## Comparisons (classifier 0.2.2)

Four candidate documents against policy A, each run twice:
B (`allow_unknown_remote_fetch`), B' (B plus a host-wide `github.com/**` in `trustedRemotes`), P (`push` + `trusted_remote` → allow), P' (P plus the same `github.com/**`).
All eight runs: total 34,940, evaluated 34,490, excluded 450, analyzability `none` share of changed = 0.

### Run identity

| run | candidate | resultHash (run 1 = run 2) | changed | widening | critical | `diff -rq` |
| --- | --- | --- | ---: | ---: | ---: | --- |
| A vs B | policy-b.v2.json | `55592458180a8de7cb8fca698b2a70c0c23bf5906e6c9d93a41ebc27ef02c08b` | 132 | 5 | 5 | identical |
| A vs B' | policy-bp.v2.json | `55a0cb73e6be97e51e12d26aad4f44677ab835692c20608df3499e09eae6cd18` | 132 | 7 | 7 | identical |
| A vs P | policy-p.v2.json | `3cdec9f51c93453e87d4c1e2ec7370fa016c3968ce8e5f05636d67695f86b517` | 0 | 0 | 0 | identical |
| A vs P' | policy-pp.v2.json | `e03cf456a1705f99ef46edd94568d1c0ed4b36adc0d1222b914a207799e7191f` | 6 | 2 | 2 | identical |

### Top summary

| run | changed | widening | critical | allow→allow | ask→allow | ask→ask | deny→deny | none / changed |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| A vs B | 132 | 5 | 5 | 8,217 | 132 | 26,121 | 20 | 0 / 132 |
| A vs B' | 132 | 7 | 7 | 8,217 | 132 | 26,121 | 20 | 0 / 132 |
| A vs P | 0 | 0 | 0 | 8,217 | 0 | 26,253 | 20 | 0 / 0 |
| A vs P' | 6 | 2 | 2 | 8,217 | 6 | 26,247 | 20 | 0 / 6 |

All other transition cells are 0 in every run: no narrowing, no allow→ask, and no transition into or out of deny.

### Widening groups: A vs B

| group | program | capability | fromZone → toZone | effect | severity | actions | sessions | none | top targets (masked) |
| --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | --- |
| 3f356e8f | gh | fetch | unknown_remote → unknown_remote | ask → allow | critical | 36 | 17 | 0 | origin (unresolved)(32), repo-02(4) |
| 5f151a90 | git | fetch | unknown_remote → unknown_remote | ask → allow | critical | 35 | 21 | 0 | origin (unresolved)(28), unknown(4), repo-02(2), named remote (unresolved)(1) |
| 9eb5d1f8 | WebFetch | fetch | unknown_remote → unknown_remote | ask → allow | critical | 34 | 11 | 0 | raw.githubusercontent.com(9), code.claude.com(8), developers.figma.com(3), docs.claude.com(3), www.figma.com(3) |
| 0318937f | curl | fetch | unknown_remote → unknown_remote | ask → allow | critical | 15 | 12 | 0 | unknown(6), platform.claude.com(4), raw.githubusercontent.com(2), api.github.com(1), example.com(1) |
| 56e9d01e | WebSearch | fetch | unknown_remote → unknown_remote | ask → allow | critical | 12 | 4 | 0 | unknown(12) |

Operation-level widening while the Action Effect is unchanged: fetch unknown_remote → unknown_remote 277.

### Widening groups: A vs B'

| group | program | capability | fromZone → toZone | effect | severity | actions | sessions | none | top targets (masked) |
| --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | --- |
| 9eb5d1f8 | WebFetch | fetch | unknown_remote → unknown_remote | ask → allow | critical | 34 | 11 | 0 | raw.githubusercontent.com(9), code.claude.com(8), developers.figma.com(3), docs.claude.com(3), www.figma.com(3) |
| 5f151a90 | git | fetch | unknown_remote → unknown_remote | ask → allow | critical | 33 | 20 | 0 | origin (unresolved)(28), unknown(4), named remote (unresolved)(1) |
| 3f356e8f | gh | fetch | unknown_remote → unknown_remote | ask → allow | critical | 32 | 15 | 0 | origin (unresolved)(32) |
| 0318937f | curl | fetch | unknown_remote → unknown_remote | ask → allow | critical | 15 | 12 | 0 | unknown(6), platform.claude.com(4), raw.githubusercontent.com(2), api.github.com(1), example.com(1) |
| 56e9d01e | WebSearch | fetch | unknown_remote → unknown_remote | ask → allow | critical | 12 | 4 | 0 | unknown(12) |
| b391c32d | gh | fetch | unknown_remote → trusted_remote | ask → allow | critical | 4 | 2 | 0 | repo-02(4) |
| b3807c02 | git | fetch | unknown_remote → trusted_remote | ask → allow | critical | 2 | 2 | 0 | repo-02(2) |

Operation-level widening while the Action Effect is unchanged: fetch unknown_remote → trusted_remote 10; fetch unknown_remote → unknown_remote 267.

### Widening groups: A vs P

No groups. resultHash `3cdec9f5…b517`.

Operation-level widening while the Action Effect is unchanged: push trusted_remote → trusted_remote 3.

### Widening groups: A vs P'

| group | program | capability | fromZone → toZone | effect | severity | actions | sessions | none | top targets (masked) |
| --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | --- |
| b391c32d | gh | fetch | unknown_remote → trusted_remote | ask → allow | critical | 4 | 2 | 0 | repo-02(4) |
| b3807c02 | git | fetch | unknown_remote → trusted_remote | ask → allow | critical | 2 | 2 | 0 | repo-02(2) |

Operation-level widening while the Action Effect is unchanged: fetch unknown_remote → trusted_remote 11; push trusted_remote → trusted_remote 3.

## Change from classifier 0.2.1

| measure | 0.2.1 | 0.2.2 |
| --- | ---: | ---: |
| A vs B changed Actions | 149 | 132 |
| A vs B' changed Actions | 149 | 132 |
| A vs P changed Actions | 0 | 0 |
| A vs P' changed Actions | 6 | 6 |
| widening / critical groups (B, B', P, P') | 5/5, 7/7, 0/0, 2/2 | 5/5, 7/7, 0/0, 2/2 |
| `git` group 5f151a90 under B | 52 Actions / 34 Sessions | 35 / 21 |

The 17 Actions that left the changed set were `git` fetches whose repository operand is a local path; classifier 0.2.2 makes them `path` Targets, so policy B's `allow_unknown_remote_fetch` no longer reaches them (`docs/evidence/classifier-hardening-2.md`).
Every group keeps its identity (same signature and group key); the `gh`, WebFetch, curl, and WebSearch groups are unchanged in Actions and Sessions.
A `resultHash` is comparable only within one classifier version and one stats schema: the 0.2.1 hashes below were recorded before Operation-level widening entered `stats` (`docs/acr/0009-operation-widening-stats.md`), so even the 0.2.1 classifier on the current code gives a different hash for the same Actions.

## B' scene (Gate 3 core)

Appending one `github.com/**` line to `trustedRemotes` made an unlisted other-owner repository trusted.
Under B' and P', six recorded fetch Actions flip from ask to allow at critical severity: 2 git and 4 gh, all repo-02, `unknown_remote → trusted_remote`.
The scene is unchanged from 0.2.1: the named remotes used outside the Action workspace still do not resolve a Remote Key and stay `unknown_remote` even under `github.com/**`.

## Diff review criteria (A vs B, classifier 0.2.2)

| criterion | result | verdict |
| --- | --- | --- |
| Effect-changed Actions | 132 (≥ 10) | pass |
| Widening group count | 5 (≤ 25) | pass |
| Compression | 5 groups = 132 / 132 = 100% | pass |
| Understandability | 1 group cannot be fully described without raw commands (WebSearch, target always unknown) | pass (< 3) |
| Determinism | identical `resultHash` on two runs per case | pass |
| Changed-action analyzability `none` | 0 / 132 | pass |

## Journey grade

**Medium** (중): real-record Widening groups were reviewable and all fell within the expected range.
No unexpected Widening group appeared.
The B' trusted-remote scene is real-record, not synthetic.
Verdicts and timing in the recorded journey were given by an Agent, not a person.

## Previous version: classifier 0.2.1 (official at the time, not re-run)

The section below is the Gate 2 evidence as measured on classifier 0.2.1 and is kept as the record of that measurement.
Its `resultHash` values are not comparable with the 0.2.2 values above (see "Change from classifier 0.2.1").

Official Gate 2 evidence from classifier 0.2.1 on the frozen snapshot and corrected environment profile (policy v2).
Every number below is labelled **classifier 0.2.1, official**.
No repository names, host paths, or raw command text appear below.

### Discarded 0.2.0 incomplete-profile run

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

### Official five-case tables

#### Run identity

| run | changed | widening | critical | resultHash identical across two runs |
| --- | ---: | ---: | ---: | --- |
| A vs B | 149 | 5 | 5 | yes |
| A vs B' | 149 | 7 | 7 | yes |
| A vs P | 0 | 0 | 0 | yes |
| A vs P' | 6 | 2 | 2 | yes |

#### Top summary

| run | changed | widening | critical | allow→allow | ask→allow | ask→ask | deny→deny | none / changed |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| A vs B | 149 | 5 | 5 | 8,217 | 149 | 26,104 | 20 | 0 / 149 |
| A vs B' | 149 | 7 | 7 | 8,217 | 149 | 26,104 | 20 | 0 / 149 |
| A vs P | 0 | 0 | 0 | 8,217 | 0 | 26,253 | 20 | 0 / 0 |
| A vs P' | 6 | 2 | 2 | 8,217 | 6 | 26,247 | 20 | 0 / 6 |

#### Widening groups: A vs B

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

#### Widening groups: A vs B'

Same five groups as B, plus two trusted-remote groups:

| group | program | capability | fromZone → toZone | effect | severity | actions | sessions | none |
| --- | --- | --- | --- | --- | --- | ---: | ---: | ---: |
| b391c32d | gh | fetch | unknown_remote → trusted_remote | ask → allow | critical | 4 | 2 | 0 |
| b3807c02 | git | fetch | unknown_remote → trusted_remote | ask → allow | critical | 2 | 2 | 0 |

Top targets for the trusted groups: repo-02 only (4 gh, 2 git).

#### Widening groups: A vs P

No groups.

#### Widening groups: A vs P'

| group | program | capability | fromZone → toZone | effect | severity | actions | sessions | none |
| --- | --- | --- | --- | --- | --- | ---: | ---: | ---: |
| b391c32d | gh | fetch | unknown_remote → trusted_remote | ask → allow | critical | 4 | 2 | 0 |
| b3807c02 | git | fetch | unknown_remote → trusted_remote | ask → allow | critical | 2 | 2 | 0 |

No push group. The discarded 0.2.0 P' group for repo-01 push (33 Actions, critical) does not exist on the corrected profile.

### B' scene (Gate 3 core)

Appending one `github.com/**` line to `trustedRemotes` made an unlisted other-owner repository trusted.
Under B' and P', six recorded fetch Actions flipped from ask to allow at critical severity: 2 git and 4 gh, all repo-02, `unknown_remote → trusted_remote`.
The discarded incomplete-profile run showed 30 git fetches to repo-02 in one group; classifier 0.2.1 refuses to resolve named remotes when git runs outside the workspace (`remote_dir_mismatch`), so 28 of those git fetches stay `unknown_remote` even under `github.com/**`.

### Diff review criteria (A vs B)

| criterion | result | verdict |
| --- | --- | --- |
| Effect-changed Actions | 149 (≥ 10) | pass |
| Widening group count | 5 (≤ 25) | pass |
| Compression | 5 groups = 149 / 149 = 100% | pass |
| Understandability | 1 group cannot be fully described without raw commands (WebSearch, target always unknown) | pass (< 3) |
| Determinism | identical `resultHash` on two runs per case | pass |
| Changed-action analyzability `none` | 0 / 149 | pass |

### Review timing (auxiliary)

A vs B has five critical Widening groups covering 149 changed Actions.
A vs B' adds two more trusted-remote groups (seven Widening groups total).
In a timed review of all seven groups from headline, target summary, and up to three samples each, the elapsed wall time was on the order of minutes, well inside the ten-minute cutline budget.
This measures a single reviewer's reading speed, not a product guarantee.

### Journey grade

**Medium** — real-record Widening groups were reviewable and all fell within the expected range.
No unexpected Widening group appeared on the official run.
The B' trusted-remote scene is real-record, not synthetic.
