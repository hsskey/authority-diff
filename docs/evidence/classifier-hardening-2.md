corpus snapshot: transcripts-2026-09-23-1036 (2026-09-23, 1,036 files, 34,940 Actions); classifier 0.2.1 → 0.2.2; measured 2026-09-24

# Classifier hardening round 2

This round changes two classification rules that Gate 2 review surfaced (`docs/evidence/gate2-replay.md`).
Only aggregate counts appear below; no repository names, host paths, or raw commands.

## Changes

1. A `git fetch`, `clone`, `pull`, `ls-remote`, or `push` whose repository operand is a local path (`/`, `./`, `../`, `~`, `file://`) targets that `path` with analyzability `full`.
   Before, the path became the `remoteName` of a `vcs_remote` Target with a null Remote Key, which placed a fetch from a sibling checkout in the `unknown_remote` Zone at critical severity.
2. Remote resolution compares the current directory with the recorded workspace root in both the `~` form the parser records and the absolute form command text keeps (`homeToTilde` in `@authority/kernel`).
   Before, `cd <absolute root> && git fetch origin` and `git -C <absolute subdirectory> gh ...` were treated as running outside the Session repository and kept an unresolved `origin`.
   Path Target classification is unchanged; see `docs/evidence/replay-limitations.md`.

## Effect on the corpus

| measure | 0.2.1 | 0.2.2 |
| --- | ---: | ---: |
| `git` fetch Operations whose repository operand is a local path, classified `vcs_remote` | 38 | 0 |
| `git` and `gh` Operations on an unresolved `origin` while the Session remotes were readable | 352 | 50 |

The 50 that remain unresolved are a directory taken from a shell expansion (`-C "$DIR"`, `cd "$DIR"`) or a `cd` into another repository, plus one Session whose recorded root was a subdirectory of its repository.

## Effect on Gate 2 replay (A vs B, policies v2)

| measure | 0.2.1 (official) | 0.2.2 |
| --- | ---: | ---: |
| changed Actions | 149 | 132 |
| widening groups | 5 | 5 |
| critical groups | 5 | 5 |
| resultHash identical across two runs | yes | yes |

The five widening groups keep their identity (same signature and group key).
The 17 Actions that left the changed set were all in the `git` fetch group `unknown_remote → unknown_remote`: each is a fetch whose repository operand was a local path and is now a `path` Target outside the workspace, so policy B's `allow_unknown_remote_fetch` no longer reaches it.
That group falls from 52 Actions in 34 Sessions to 35 in 21.
The `gh`, WebFetch, curl, and WebSearch groups are unchanged in Actions and Sessions.
A vs B' keeps its seven widening groups.

The official Gate 2 tables in `docs/evidence/gate2-replay.md` remain labelled classifier 0.2.1 and are not re-run in this round.

## Result

- CLASSIFIER_VERSION: 0.2.2.
- Stored Replay Runs keep their resultHash; a new run over re-classified Actions produces a new one.
