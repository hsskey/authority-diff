# Classifier hardening round 1

Gate 1 measured the classifier over the local real transcripts (read-only).
This round targets only the correctable `none` signals: `program_unrecognized`,
`git_subcommand_unknown`, and `tool_unrecognized`.
It does not touch `inline_code` or `fragment_truncated`, which are intrinsic
`none`.
The goal is correct classification, not a lower `none` rate.

Only program, git-subcommand, and tool names appear below, with counts.
Paths, repositories, hosts, and raw commands are not recorded here.

## Step 0: what was unrecognized (operation level)

Totals: 29,027 Actions, 156,437 Operations, operation-level `none` 19,101 (12.2%).

### program_unrecognized (top general programs)

| program | count |
| --- | --- |
| corepack | 3607 |
| tmux | 509 |
| shasum | 305 |
| break | 274 |
| pgrep | 184 |
| sysctl | 152 |
| read | 139 |
| mktemp | 98 |
| continue | 85 |
| claude | 57 |
| exit | 55 |
| eval | 35 |
| sqlite3 | 36 |
| kill | 31 |

Two large groups in the raw top 40 are deliberately excluded from the table
(see "Not added" below): operator-specific tooling wrappers (session, crew, and
package-manager helper scripts, together roughly 5,600 operations) and shell
control words or parser artifacts surfacing as command names (`OK`, `-`, an
empty token, `run`, `chk`, `probe`, `brk`, together roughly 1,000).

### git_subcommand_unknown (top)

| subcommand | count |
| --- | --- |
| merge-base | 296 |
| ls-remote | 99 |
| check-ignore | 83 |
| ls-tree | 69 |
| check-attr | 9 |
| hash-object | 9 |
| archive | 6 |
| init | 6 |
| commit-tree | 2 |
| update-ref | 2 |
| format-patch | 1 |
| merge-tree | 1 |
| show-ref | 1 |

### tool_unrecognized (all)

| tool | count |
| --- | --- |
| StructuredOutput | 251 |
| Monitor | 30 |
| SendMessage | 14 |
| Agent | 12 |
| Artifact | 3 |
| ListAgents | 1 |
| SendFeedback | 1 |

## Step 1: programs added

- Read (no code argument, no filesystem mutation): `shasum`, `pgrep`, `sysctl`,
  `read`, `break`, `continue`, `exit`.
- Execute, workspace path, partial (toolchain managers / runners): `corepack`,
  `nvm`, `volta`.
- Execute, unknown, none (take inner code or a command that cannot be re-parsed
  here): `tmux`, `screen`, `sqlite3`, `psql`, `mysql`, `claude`, `eval`. These
  are never dropped to `read`.
- Execute, partial (signals a running process): `kill`, `pkill`, `killall`.
- Write, partial (creates a file): `mktemp`.

Each has at least one literal test in `packages/action/tests/hardening.test.ts`,
and adversarial corpus entries cover the dangerous forms (`tmux send-keys`,
`xargs -I{} sh -c`, `env`-prefixed `curl` credential exfiltration).

## Step 2: git subcommands added

- Read: `merge-base`, `check-ignore`, `check-attr`, `ls-tree`, `hash-object`,
  `show-ref`, `merge-tree`, `archive`.
- Fetch (contacts a remote): `ls-remote`.
- Commit (local repository state or working-tree files): `init`, `commit-tree`,
  `update-ref`, `format-patch`. `format-patch` writes `NNNN-*.patch` files to the
  working directory by default, so it is not a `read`.

An unknown git subcommand still classifies `execute`/`none` with signal
`git_subcommand_unknown`, never `read`.

## Step 3: non-Bash tools

The tools the classifier already maps (`Read`, `Write`, `Edit`, `MultiEdit`,
`NotebookEdit`, `Glob`, `Grep`, `LS`, `WebFetch`, `WebSearch`) did not appear in
the unrecognized list. Every unrecognized tool is an agent-framework tool.
`Monitor`, `SendMessage`, and `Agent` are already excluded from
`CONTROL_TOOL_NAMES` with an official-docs basis in `control-tools.md` (Monitor
runs Bash-equivalent commands; SendMessage crosses agents; Agent spawns
subagents). `StructuredOutput`, `Artifact`, `ListAgents`, and `SendFeedback`
have no official-docs basis establishing they change no external state, so per
the round's rule they stay `execute`/unknown/`none` rather than being added to
`CONTROL_TOOL_NAMES`. No non-Bash tool mapping changed.

## Not added, with reasons

- Operator-specific tooling wrappers (session, crew, and package-manager helper
  scripts; roughly 5,600 operations). These are environment-specific opaque
  wrappers that run arbitrary work; `execute`/`none` is already the correct
  classification, and recognizing them as `execute`/partial would falsely claim
  a known effect. They are not general programs.
- Shell control words and parser artifacts (`OK`, `-`, an empty token, `run`,
  `chk`, `probe`, `brk`; roughly 1,000). These are not programs; adding them
  would encode parser noise.

## Known limitations

- A read-only program's non-file operand can be captured as a path. For example
  `tr` with control-character arguments resolves to `read` on a workspace path.
  This is safe: the capability stays `read` and no write, send, or delete is
  hidden.
- A bare redirection with no command (for example `> file`) currently
  classifies `execute`/`none`. This is conservative and passes I4; making it a
  `write` on the target is a future refinement.

## Result

- CLASSIFIER_VERSION: 0.2.0.
- Before/after real-corpus `none` rate (operation and action level): recorded in
  the PR body from a re-run of `measure`; only aggregate numbers are published.
