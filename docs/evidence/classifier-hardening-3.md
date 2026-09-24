corpus snapshot: transcripts-2026-09-23-1036 (2026-09-23, 1,036 files, 34,940 Actions); classifier 0.2.3; measured 2026-09-24; A vs B resultHash `2c4577fa…a8d9`

# Classifier hardening round 3

This round fixes three sources of wrong Targets: the repository a `gh` command names, git refspec operands read as remote URLs, and home-directory paths compared against a `~` workspace root.
It also adds the source read of a copy and the package install of `cargo add` and `go get`.
The program and subcommand recognition tables are unchanged, and the `none` rate is not a target.
Only aggregate counts appear below; no repository names, host paths, or raw commands.

## Changes

1. A `gh` Target takes its Remote Key from the repository the arguments name: `-R`/`--repo`, the `repos/<owner>/<repo>` path of `gh api` (with `--hostname`), the repository operand of `gh repo`, or the repository in a `gh pr`/`gh issue` URL.
   An argument that names no resolvable repository (`gh api user`, `gh api graphql`, `gh repo create <name>`, a shell expansion) leaves the Remote Key unresolved.
   A `gh repo` operand names a repository only with an owner (`owner/repo`, `host/owner/repo`, or a URL), because option values are not told apart from operands.
   The Session `origin` remote applies only when no argument names a repository, including the `{owner}/{repo}` placeholders gh fills from the current repository.
   Before, every `gh api` call and every `gh repo`/`gh pr` repository operand was attributed to the Session `origin`.
2. A `git clone`, `fetch`, `pull`, `ls-remote`, or `push` reads its operands in order: the first is the repository, the rest are refspecs (`refs/heads/main`, `+refs/*:refs/*`, `HEAD:main`).
   Option values (`--branch <name>`, `--depth <n>`, `-o <option>`) are not operands.
   Only the repository operand is tested as a URL, and `looksLikeRemoteUrl` accepts only a scheme URL, an scp-like `user@host:path`, or `host/owner/repo` whose host contains a dot.
   A repository operand from a shell expansion, or a `host:path` form without a user, leaves the remote unnamed instead of falling back to `origin`.
3. The trace parser derives each Session's home directory from the transcript `cwd` (`/Users/<name>`, `/home/<name>`, or `/root`) and folds exactly that prefix to `~` in the stored tool input, at path boundaries.
   Another user's home stays absolute, and the server process home is never consulted.
   The classifier resolves a `~/...` path against a `~/...` workspace root, so a path under the workspace is inside it; `..` segments are collapsed first.
   Display-layer folding on the review surfaces is unchanged.
4. `cp` and `mv` read every source operand before writing the destination; `scp`, `rsync`, and `sftp` read their local source operands before sending to or writing the destination.
5. `cargo add` and `go get` install a package, like `cargo install` and `go install`.

## Effect on the corpus

Operations: 177,690 (1,828 source reads added by change 4; 18 fewer `execute` Operations in inputs the fold shortened, explained below).

### Home-directory paths

| measure | value |
| --- | ---: |
| path Operations inside the workspace | 134,353 |
| path Operations outside the workspace | 17,823 |
| path Operations that moved from outside to inside | 53,181 |
| path Operations in the `host` Zone (policy A) | 17,390 |
| path Operations in the `workspace` Zone (policy A) | 133,857 |
| Target keys that contain a home-directory user name | 0 |

The moved count covers Actions whose path Operations line up one to one before and after; seven Actions whose parse changed are left out.

The fold also shortens stored input text.
Three inputs no longer cross the 16,000-character cut and four fragments no longer cross the 2,000-character cut, so their parse changes; on those inputs the net count of `none` Operations falls by 17.

### `gh` Remote Keys

140 `gh` Operations no longer take the Session `origin`.

| measure | value |
| --- | ---: |
| Remote Key from the named repository, different from `origin` | 79 |
| Remote Key from the named repository, same as `origin` (now `full`) | 48 |
| argument names no resolvable repository, Remote Key unresolved | 13 |

### git operands

| measure | value |
| --- | ---: |
| `ls-remote` Operations with a refspec operand, remote now named `origin` | 74 |
| of which the Remote Key resolves | 40 |
| of which it stays unresolved because git ran with `-C` outside the workspace | 34 |
| of the 74, Operations whose Remote Key was the refspec | 5 |
| `clone` Operations whose `--branch` value was taken as the repository, now a `path` Target | 2 |
| `fetch` Operations whose repository operand is a command substitution, no longer `origin` | 2 |
| `remote_unparsed` signals | 13 |

No `push` Operation changes on the snapshot; its refspec pushes already name `origin` first.

### Copies and installs

| measure | value |
| --- | ---: |
| copy source reads added | 1,828 |
| of which in the `host` Zone | 1,403 |
| of which in the `workspace` Zone | 417 |
| of which in the `agent_config` Zone | 8 |
| `cargo add` and `go get` Operations | 0 |

## Effect on policy A (local pipeline, same scope as the adoption preview)

| measure | value |
| --- | ---: |
| evaluated Actions | 34,490 |
| allow | 15,242 (44.2%) |
| ask | 19,228 (55.7%) |
| deny | 20 (0.1%) |

7,036 Actions move from ask to allow and 11 from allow to ask.
Of the 7,036, 7,035 are Actions whose only asking Operations were workspace paths classified outside the workspace; the other is a `gh` call whose argument names a trusted repository while the Session `origin` is untrusted.
All 11 moves to ask are `cp` reads of a source outside the workspace.
No Action moves to or from deny.

## Effect on Gate 2 replay (A vs B, policies v2)

| measure | value |
| --- | ---: |
| changed Actions | 139 |
| widening groups | 5 |
| critical groups | 5 |
| resultHash identical across two runs | yes |

The five widening groups keep their identity (same signature and group key).
The `git` fetch group `unknown_remote → unknown_remote` has 46 Actions in 28 Sessions.
Ten of its 12 new Actions were already `unknown_remote` fetches whose other Operations were workspace paths in `host`; with those paths in the workspace, policy B's `allow_unknown_remote_fetch` now decides the Action.
The other two are the fetches whose repository operand is a command substitution, no longer attributed to `origin`, and one Action left because its `ls-remote` refspec no longer hides the resolved `origin`.
The `gh` group has 32 Actions in 18 Sessions: seven Actions left because their argument names a public (six) or trusted (one) repository, and three joined because their argument names an untrusted repository or none.
The curl, WebFetch, and WebSearch groups are unchanged in Actions and Sessions.
A vs B' keeps its seven widening groups and has 139 changed Actions.

The Gate 2, adoption preview, and conformance documents remain labelled classifier 0.2.2 and are not re-run in this round.
The conformance `host` Zone `under_asked` volume is expected to move into `workspace` with change 3.

## Adversarial corpus

`tests/corpus/adversarial.json` gains eight cases: two for `gh` argument repositories, one for `gh api graphql`, one force-push refspec, two for `~` paths against a `~` root (a `..` escape to a credential and a sibling directory sharing the root prefix), one credential copy, and one `cargo add`.
The two refspec cases that carried `skip` now run as expected results.
The laundering rate stays 0.
The probe does not read classifier output, and its tests pass unchanged.

## Follow-up

- The skip note in `docs/evidence/classifier-benchmark.md` still describes the refspec miss as open.
- `gh api graphql` and `gh api` with `-f` fields default to GET, so they are `fetch` rather than `send`.
- `scp <host>:<path> .` is a download but stays a `send` to the host.
- `mv` reads its sources but does not emit a `delete` for them, so a Rule on deleting workspace files is not evaluated for `mv`.
- A `gh api` path that contains a shell expansion anywhere leaves the Remote Key unresolved, even when its owner and repository are literal.

## Result

- CLASSIFIER_VERSION: 0.2.3.
- Stored Target keys fold the Session home, so a new import and replay produce new `resultHash` values; stored Replay Runs keep theirs.

## Previous version (classifier 0.2.2)

Kept only as the baseline of the changes above, on the same snapshot.

| measure | 0.2.2 |
| --- | ---: |
| Operations | 175,880 |
| path Operations inside / outside the workspace | 80,754 / 69,881 |
| path Operations in `host` / `workspace` (policy A) | 69,250 / 80,463 |
| Target keys that contain a home-directory user name | 63,436 |
| `ls-remote` Operations whose Remote Key was a refspec | 5 |
| `remote_unparsed` signals | 87 |
| policy A allow / ask / deny | 8,217 / 26,253 / 20 |
| A vs B changed Actions | 132 |
| A vs B `git` fetch group | 35 Actions, 21 Sessions |
| A vs B `gh` group | 36 Actions, 17 Sessions |
| A vs B resultHash | `55592458…c08b` |
