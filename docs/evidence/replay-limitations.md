corpus snapshot: transcripts-2026-09-23-1036 (2026-09-23, 1,036 files, 35,136 tool calls); classifier 0.2.2; measured 2026-09-24

# Replay known limitations

## Remote resolution depends on the disk at import time

The trace parser performs no I/O.
`repoRemotes` are read with `git remote -v` from each recorded workspace root when a transcript is imported (`authority import`) or replayed locally (`replay-local`), not when the Action happened.
A workspace root that no longer exists on disk, for example a deleted worktree, resolves no remotes.
Every named remote of that Session keeps its name with a null Remote Key, its Zone is `unknown_remote`, and the Target Summary shows the remote name.

The same transcripts therefore give different Operations, Diff Groups, and `resultHash` on different days or on another machine.
Determinism holds only for a fixed snapshot on a fixed disk state, and every replay number in `docs/evidence/` is tied to the date it was measured.
Recording remotes at trace time, in the hook, would remove the dependence; it is not in V1.

Measured on the snapshot on 2026-09-24:

| measure | value |
| --- | ---: |
| tool calls | 35,136 |
| tool calls whose workspace root resolved no remotes | 7,744 (22.0%) |
| of which the workspace root was missing on disk | 7,628 |
| distinct workspace roots | 169 |
| distinct workspace roots missing on disk | 88 |
| `gh` Actions left on the unresolved `origin` remote because the root is missing | 69 |

The Gate 2 `gh` widening group (32 `origin` Actions in `docs/evidence/gate2-replay.md`) consists of these missing-root Sessions and cannot be resolved by any later replay.

## Directory comparison against the recorded workspace root

The parser records a home-directory workspace root as `~/...`, while command text keeps the absolute form.
Since classifier 0.2.2 the remote-resolution check compares the current directory in both forms, so `cd <absolute root> && git fetch origin` and `git -C <absolute subdirectory> fetch origin` resolve the Session remote.
On the snapshot this moved 302 `git` and `gh` Operations from an unresolved remote to a resolved Remote Key.
Two cases stay unresolved by design: a directory that comes from a shell expansion (99 Operations), and a `cd` into another repository (50 Operations).
One recorded Session had a workspace root below its repository root, so a `cd` to the repository root left the workspace; that single Action stays unresolved because the classifier has no repository root to compare against.

Path Targets still compare the two forms literally.
An absolute home path under a `~/...` workspace root is classified outside the workspace, which places its Operation in the `host` Zone.
On the snapshot, 53,205 path Operations fall in this case (43,374 Bash reads, 3,591 Bash executes, 2,289 tool reads, 1,479 tool writes, 1,366 commits, 916 Bash writes, 175 deletes, 15 rewrites, 1 fetch).
Changing that comparison moves most of the `host` Zone `under_asked` volume in `docs/evidence/conformance.md` into `workspace`; it is left for a separate classifier change.
