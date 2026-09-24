corpus snapshot: transcripts-2026-09-23-1036 (2026-09-23, 1,036 files, 34,940 Actions); classifier 0.2.3; measured 2026-09-24; backlog resultHash `ac28290a…2507`

# Classifier backlog

This document ranks the next classifier hardening candidates by how many Actions each would take out of `none`.
It measures only; the classifier, the program and subcommand recognition tables, and the tool table are unchanged.
A candidate here changes how an existing rule reads a command, never which names the tables recognize.
The `none` rate is not a target: the gain column orders the work, and each candidate still has to be correct on its own.
Program names outside the public tool list are masked with the evidence legend; no paths, repositories, hosts, or raw commands appear below.

`pnpm dev:backlog <snapshot>` recomputes every table and writes `backlog.json` and `backlog.md` under `.local/backlog/`.
Two runs on the snapshot gave the same resultHash `ac28290a74fcb665dffd20f8cc1270e7a05a931d1f02871e1b63b64f8d7c2507`.

## Terms

- A `none` Action has at least one Operation with analyzability `none`.
- A sole-cause Action for a row is a `none` Action whose every `none` Operation belongs to that row, so resolving the row alone takes it out of `none`.
- Actions leaving `none` for a candidate counts the `none` Actions whose every `none` Operation the candidate matches.
  It is an upper bound: it assumes the changed rule gives each matched Operation `partial` or `full`.

## Totals

| measure | value |
| --- | ---: |
| evaluated Actions | 34,490 |
| `none` Actions | 9,908 (28.7%) |
| Operations | 177,690 |
| `none` Operations | 14,414 (8.1%) |

## `none` signals (top 20)

Only eight signals occur on `none` Operations, so the list is complete.
An Operation can carry two signals, so the rows overlap.

| signal | `none` Operations | `none` Actions | sole-cause Actions |
| --- | ---: | ---: | ---: |
| `program_unrecognized` | 8,641 | 5,681 | 4,914 |
| `inline_code` | 5,037 | 4,351 | 3,609 |
| `tool_unrecognized` | 526 | 526 | 526 |
| `fragment_truncated` | 216 | 158 | 130 |
| `parse_error` | 146 | 146 | 21 |
| `input_truncated` | 60 | 60 | 1 |
| `git_subcommand_unknown` | 2 | 2 | 2 |
| `remote_exec` | 2 | 2 | 2 |

## Programs by `none` Operations (top 40)

`Operations` counts every Operation of the program; `none` share is the part that is `none`.
`(no program)` is an input the classifier could not parse into a command; `(empty name)` is a command whose name is a shell expansion.
`<local-tool-NN>` is a program outside the public tool list.

| program | Operations | `none` Operations | `none` share | sole-cause Actions |
| --- | ---: | ---: | ---: | ---: |
| `python3` | 3,279 | 3,082 | 94.0% | 2,407 |
| `<local-tool-01>` | 2,473 | 2,473 | 100.0% | 1,435 |
| `<local-tool-02>` | 1,206 | 1,103 | 91.5% | 813 |
| `node` | 2,046 | 874 | 42.7% | 645 |
| `<local-tool-04>` | 622 | 612 | 98.4% | 117 |
| `<local-tool-08>` | 535 | 530 | 99.1% | 351 |
| `tmux` | 509 | 509 | 100.0% | 173 |
| `<local-tool-19>` | 462 | 462 | 100.0% | 64 |
| `StructuredOutput` | 457 | 457 | 100.0% | 457 |
| `<local-tool-10>` | 439 | 439 | 100.0% | 206 |
| `<local-tool-03>` | 424 | 424 | 100.0% | 211 |
| `(no program)` | 206 | 206 | 100.0% | 66 |
| `<local-tool-09>` | 212 | 203 | 95.8% | 19 |
| `<local-tool-12>` | 205 | 199 | 97.1% | 63 |
| `perl` | 203 | 185 | 91.1% | 99 |
| `<local-tool-07>` | 173 | 173 | 100.0% | 58 |
| `<local-tool-16>` | 171 | 171 | 100.0% | 52 |
| `bash` | 188 | 170 | 90.4% | 91 |
| `<local-tool-13>` | 161 | 161 | 100.0% | 81 |
| `(empty name)` | 123 | 105 | 85.4% | 21 |
| `<local-tool-11>` | 77 | 77 | 100.0% | 29 |
| `<local-tool-15>` | 63 | 63 | 100.0% | 47 |
| `<local-tool-25>` | 63 | 63 | 100.0% | 27 |
| `claude` | 68 | 60 | 88.2% | 39 |
| `sqlite3` | 69 | 56 | 81.2% | 23 |
| `<local-tool-18>` | 51 | 51 | 100.0% | 30 |
| `<local-tool-99>` | 47 | 47 | 100.0% | 0 |
| `<local-tool-35>` | 45 | 45 | 100.0% | 16 |
| `<local-tool-100>` | 41 | 41 | 100.0% | 1 |
| `<local-tool-33>` | 38 | 38 | 100.0% | 9 |
| `sh` | 42 | 37 | 88.1% | 14 |
| `<local-tool-101>` | 54 | 36 | 66.7% | 1 |
| `<local-tool-102>` | 57 | 36 | 63.2% | 8 |
| `<local-tool-06>` | 33 | 33 | 100.0% | 15 |
| `<local-tool-57>` | 31 | 31 | 100.0% | 13 |
| `Monitor` | 30 | 30 | 100.0% | 30 |
| `<local-tool-17>` | 30 | 30 | 100.0% | 3 |
| `lsof` | 27 | 27 | 100.0% | 18 |
| `<local-tool-103>` | 27 | 27 | 100.0% | 0 |
| `<local-tool-104>` | 26 | 26 | 100.0% | 5 |

## Target Kind distribution

Every `none` Operation has an `unknown` Target; no Target of another kind is `none`.

| Target Kind | Operations | share | full | partial | none |
| --- | ---: | ---: | ---: | ---: | ---: |
| `path` | 152,176 | 85.6% | 143,145 | 9,031 | 0 |
| `unknown` | 23,449 | 13.2% | 0 | 9,035 | 14,414 |
| `vcs_remote` | 1,313 | 0.7% | 901 | 412 | 0 |
| `package` | 544 | 0.3% | 394 | 150 | 0 |
| `host` | 150 | 0.1% | 76 | 74 | 0 |
| `mcp` | 58 | 0.0% | 0 | 58 | 0 |

## Next hardening candidates

Ranked by Actions leaving `none`.
`matched Operations` counts the Operations the rule would reclassify at any analyzability; a redirection's own `write` Operation is never counted.

| rank | candidate | matched Operations | `none` Operations | `none` Actions | Actions leaving `none` |
| ---: | --- | ---: | ---: | ---: | ---: |
| 1 | `path_command_name` | 4,402 | 4,402 | 3,353 | 2,738 |
| 2 | `variable_path_command_name` | 501 | 501 | 333 | 206 |
| 3 | `shell_script_file` | 174 | 174 | 139 | 88 |
| 4 | `variable_command_name` | 79 | 79 | 31 | 17 |
| 5 | `command_lookup` | 73 | 55 | 47 | 14 |

All five together take 3,077 Actions out of `none` (31.1% of the `none` Actions).
The Action-level `none` share would fall from 28.7% to at most 19.8% of the evaluated Actions.

### 1. `path_command_name`: a command named by a literal path

A command word that contains `/` (`bin/<script>.sh`, `./<script>`, `~/<dir>/bin/<tool>`, `/opt/<dir>/bin/<tool>`) runs that file, whether or not its basename is in the program table.
Today an unrecognized basename gives `execute`, `unknown` Target, `none`, `program_unrecognized`.
The rule would give `execute` on a `path` Target of the named file, `partial`, the analyzability an interpreter already gets when it runs a script file.
Nearly all matches are shell scripts; most are relative paths, and the rest start with `~` or `/`.
The rule never reads the file, so the effect of the script stays unknown; what it adds is where the script lives, so a Zone can tell a workspace script from one elsewhere.
Classifier hardening round 1 declined to give operator-specific wrapper scripts `execute`/`partial` by name, because that would claim a known effect.
This rule names no program, but its gain comes mostly from the same scripts, so the round that takes it must decide whether a known script location is enough for `partial`.

### 2. `variable_path_command_name`: a command path through a directory variable

The same command form with a leading expansion (`"$DIR/<tool>"`, `$HOME/bin/<tool>`).
The path is known only when the variable has a literal value earlier in the same command.
An unresolved variable would keep the Operation `none`, so the gain is lower than the upper bound shown.

### 3. `shell_script_file`: a shell given a script file

`bash`, `sh`, `dash`, `zsh`, and `ksh` are always `execute`, `unknown`, `none`, `inline_code`, even when their operand is a script file and there is no `-c`, `-s`, or heredoc.
An interpreter (`python3`, `node`, `perl`, ...) given a script file is already `execute` on a `path` Target, `partial`.
The rule would treat a shell the same way; `-c`, `-s`, stdin, and heredoc input stay `inline_code`.

### 4. `variable_command_name`: a command name taken from a variable

`G=gh; $G api ...` names its program through a variable, and the classifier records the empty expansion as an unrecognized program.
The rule would resolve the name from a literal assignment earlier in the same command and classify the resolved program; any other expansion keeps `none`, under a signal that says the name was an expansion rather than `program_unrecognized`.
The upper bound counts every such Operation; only the resolved ones would leave `none`.

### 5. `command_lookup`: `command -v` and `command -V`

`command` is stripped as a transparent wrapper, so `command -v <name>` is classified as running `<name>`.
A lookup prints where the name resolves and runs nothing, so the rule would make it a `read` with analyzability `full`.
Beyond the 55 `none` Operations, 18 matched Operations are misclassified today at `partial` or `full`: 15 as an `execute` of the looked-up program, one as a package install, one as a `send` to a remote, and one as a `read`.
Each claims more than a lookup does; none hides an effect.

## Not candidates under this scope

These rows are the larger part of `none`, but each needs a recognition table change or is intrinsic.

- Unrecognized program names without a path, `tmux` subcommands such as `capture-pane`, and tools like `StructuredOutput` and `Monitor` need new entries in the program, subcommand, or tool table.
  The `program_unrecognized` sole-cause Actions that candidates 1, 2, and 4 do not cover, and all 526 `tool_unrecognized` ones, are of this kind.
- `inline_code` (3,609 sole-cause Actions) is code in another language passed through `-c`, `-e`, stdin, or a heredoc; `python3` reading code from stdin or a heredoc is its largest part.
  The classifier does not analyze it beyond the credential and URL literals it already scans.
- `fragment_truncated`, `parse_error`, and `input_truncated` (130, 21, and 1 sole-cause Actions) come from input cut at the stored length or text the shell grammar does not parse.

## Method limits

- The candidate predicates read the stored Operation fragment split on whitespace, not the shell parse tree, so a quoted command word with spaces is missed and the counts are estimates.
  The rule's own count is measured when it lands.
- Actions leaving `none` assumes each rule succeeds on every matched Operation; candidates 2 and 4 resolve only literal values, so their real gain is lower.
