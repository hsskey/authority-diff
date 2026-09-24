corpus snapshot: transcripts-2026-09-23-1036 (2026-09-23, 1,036 files, 34,940 Actions); classifier 0.2.4; measured 2026-09-24; backlog resultHash `e5480a92…6179`

# Classifier backlog

This document ranks the next classifier hardening candidates by how many Actions each would take out of `none`.
It measures only; the classifier, the program and subcommand recognition tables, and the tool table are unchanged.
A candidate here changes how an existing rule reads a command, never which names the tables recognize.
The `none` rate is not a target: the gain column orders the work, and each candidate still has to be correct on its own.
Program names outside the public tool list are masked with the evidence legend; no paths, repositories, hosts, or raw commands appear below.

`pnpm dev:backlog <snapshot>` recomputes every table and writes `backlog.json` and `backlog.md` under `.local/backlog/`.
The run on this snapshot gave resultHash `e5480a92c8f060780528721ae3871f194450a5d96acc86bdfb75782973f46179`.

Classifier 0.2.4 landed `path_command_name`, `variable_path_command_name`, `shell_script_file`, and `command_lookup` (`docs/evidence/classifier-hardening-4.md`).
Those four still appear in the candidate table with zero `none` Operations so the predicates can be checked; they are not next work.

## Terms

- A `none` Action has at least one Operation with analyzability `none`.
- A sole-cause Action for a row is a `none` Action whose every `none` Operation belongs to that row, so resolving the row alone takes it out of `none`.
- Actions leaving `none` for a candidate counts the `none` Actions whose every `none` Operation the candidate matches.
  It is an upper bound: it assumes the changed rule gives each matched Operation `partial` or `full`.

## Totals

| measure | value |
| --- | ---: |
| evaluated Actions | 34,490 |
| `none` Actions | 6,848 (19.9%) |
| Operations | 177,690 |
| `none` Operations | 9,274 (5.2%) |

## `none` signals (top 20)

Only eight signals occur on `none` Operations, so the list is complete.
An Operation can carry two signals, so the rows overlap.

| signal | `none` Operations | `none` Actions | sole-cause Actions |
| --- | ---: | ---: | ---: |
| `inline_code` | 4,854 | 4,245 | 3,863 |
| `program_unrecognized` | 3,684 | 2,361 | 1,960 |
| `tool_unrecognized` | 526 | 526 | 526 |
| `fragment_truncated` | 179 | 121 | 107 |
| `parse_error` | 146 | 146 | 25 |
| `input_truncated` | 60 | 60 | 1 |
| `git_subcommand_unknown` | 2 | 2 | 2 |
| `remote_exec` | 2 | 2 | 2 |

## Programs by `none` Operations (top 40)

`Operations` counts every Operation of the program; `none` share is the part that is `none`.
`(no program)` is an input the classifier could not parse into a command; `(empty name)` is a command whose name is a shell expansion.
`<local-tool-NN>` is a program outside the public tool list.

| program | Operations | `none` Operations | `none` share | sole-cause Actions |
| --- | ---: | ---: | ---: | ---: |
| `python3` | 3,279 | 3,082 | 94.0% | 2,529 |
| `<local-tool-02>` | 1,204 | 1,101 | 91.4% | 885 |
| `node` | 2,040 | 874 | 42.8% | 656 |
| `<local-tool-04>` | 620 | 603 | 97.3% | 280 |
| `<local-tool-08>` | 535 | 530 | 99.1% | 362 |
| `tmux` | 509 | 509 | 100.0% | 383 |
| `StructuredOutput` | 457 | 457 | 100.0% | 457 |
| `(no program)` | 206 | 206 | 100.0% | 72 |
| `<local-tool-09>` | 212 | 203 | 95.8% | 19 |
| `<local-tool-12>` | 198 | 192 | 97.0% | 81 |
| `perl` | 203 | 185 | 91.1% | 100 |
| `(empty name)` | 116 | 94 | 81.0% | 21 |
| `sqlite3` | 69 | 56 | 81.2% | 23 |
| `claude` | 61 | 53 | 86.9% | 35 |
| `<local-tool-99>` | 47 | 47 | 100.0% | 0 |
| `<local-tool-100>` | 41 | 41 | 100.0% | 1 |
| `<local-tool-33>` | 38 | 38 | 100.0% | 9 |
| `<local-tool-101>` | 54 | 36 | 66.7% | 22 |
| `<local-tool-102>` | 57 | 36 | 63.2% | 8 |
| `Monitor` | 30 | 30 | 100.0% | 30 |
| `<local-tool-17>` | 30 | 30 | 100.0% | 4 |
| `lsof` | 27 | 27 | 100.0% | 18 |
| `<local-tool-103>` | 27 | 27 | 100.0% | 0 |
| `sh` | 42 | 26 | 61.9% | 12 |
| `<local-tool-105>` | 25 | 24 | 96.0% | 5 |
| `zsh` | 27 | 24 | 88.9% | 21 |
| `<local-tool-38>` | 23 | 23 | 100.0% | 12 |
| `<local-tool-36>` | 21 | 21 | 100.0% | 15 |
| `<local-tool-53>` | 21 | 21 | 100.0% | 10 |
| `<local-tool-106>` | 20 | 20 | 100.0% | 0 |
| `Agent` | 20 | 20 | 100.0% | 20 |
| `<local-tool-52>` | 20 | 20 | 100.0% | 18 |
| `<local-tool-26>` | 24 | 20 | 83.3% | 13 |
| `md5` | 19 | 19 | 100.0% | 8 |
| `<local-tool-107>` | 18 | 18 | 100.0% | 0 |
| `<local-tool-75>` | 17 | 17 | 100.0% | 6 |
| `<local-tool-47>` | 15 | 15 | 100.0% | 5 |
| `<local-tool-67>` | 15 | 15 | 100.0% | 0 |
| `SendMessage` | 14 | 14 | 100.0% | 14 |
| `<local-tool-93>` | 14 | 14 | 100.0% | 7 |

## Target Kind distribution

Every `none` Operation has an `unknown` Target; no Target of another kind is `none`.

| Target Kind | Operations | share | full | partial | none |
| --- | ---: | ---: | ---: | ---: | ---: |
| `path` | 156,761 | 88.2% | 143,217 | 13,544 | 0 |
| `unknown` | 18,866 | 10.6% | 0 | 9,592 | 9,274 |
| `vcs_remote` | 1,312 | 0.7% | 901 | 411 | 0 |
| `package` | 543 | 0.3% | 394 | 149 | 0 |
| `host` | 150 | 0.1% | 76 | 74 | 0 |
| `mcp` | 58 | 0.0% | 0 | 58 | 0 |

## Next hardening candidates

Ranked by Actions leaving `none`.
`matched Operations` counts the Operations the rule would reclassify at any analyzability; a redirection's own `write` Operation is never counted.

| rank | candidate | matched Operations | `none` Operations | `none` Actions | Actions leaving `none` |
| ---: | --- | ---: | ---: | ---: | ---: |
| 1 | `variable_command_name` | 79 | 78 | 30 | 19 |
| — | `command_lookup` | 73 | 0 | 0 | 0 |
| — | `shell_script_file` | 174 | 0 | 0 | 0 |
| — | `path_command_name` | 0 | 0 | 0 | 0 |
| — | `variable_path_command_name` | 0 | 0 | 0 | 0 |

`variable_command_name` alone takes 19 Actions out of `none` (0.3% of the `none` Actions).
The Action-level `none` share would fall from 19.9% to at most 19.8% of the evaluated Actions.

### 1. `variable_command_name`: a command name taken from a variable

`G=gh; $G api ...` names its program through a variable, and the classifier records the empty expansion as an unrecognized program.
The rule would resolve the name from a literal assignment earlier in the same command and classify the resolved program; any other expansion keeps `none`, under a signal that says the name was an expansion rather than `program_unrecognized`.
The upper bound counts every such Operation; only the resolved ones would leave `none`.
One matched Operation is no longer `none` because another Operation on the same command was reclassified in 0.2.4; the remaining 78 are still `none`.

## Not candidates under this scope

These rows are the larger part of `none`, but each needs a recognition table change or is intrinsic.

- Unrecognized program names without a path, `tmux` subcommands such as `capture-pane`, and tools like `StructuredOutput` and `Monitor` need new entries in the program, subcommand, or tool table.
  The `program_unrecognized` sole-cause Actions that `variable_command_name` does not cover, and all 526 `tool_unrecognized` ones, are of this kind.
- `inline_code` (3,863 sole-cause Actions) is code in another language passed through `-c`, `-e`, stdin, or a heredoc; `python3` reading code from stdin or a heredoc is its largest part.
  The classifier does not analyze it beyond the credential and URL literals it already scans.
- `fragment_truncated`, `parse_error`, and `input_truncated` (107, 25, and 1 sole-cause Actions) come from input cut at the stored length or text the shell grammar does not parse.

## Method limits

- The candidate predicates read the stored Operation fragment split on whitespace, not the shell parse tree, so a quoted command word with spaces is missed and the counts are estimates.
  The rule's own count is measured when it lands.
- Actions leaving `none` assumes each rule succeeds on every matched Operation; `variable_command_name` resolves only literal values, so its real gain is lower.

## Previous version (classifier 0.2.3)

Kept only as the baseline of the 0.2.4 measurement, on the same snapshot.
Backlog resultHash `ac28290a…2507`.

| measure | 0.2.3 |
| --- | ---: |
| `none` Actions | 9,908 (28.7%) |
| `none` Operations | 14,414 (8.1%) |
| `program_unrecognized` `none` Operations | 8,641 |
| `inline_code` `none` Operations | 5,037 |

| rank | candidate | matched Operations | `none` Operations | Actions leaving `none` |
| ---: | --- | ---: | ---: | ---: |
| 1 | `path_command_name` | 4,402 | 4,402 | 2,738 |
| 2 | `variable_path_command_name` | 501 | 501 | 206 |
| 3 | `shell_script_file` | 174 | 174 | 88 |
| 4 | `variable_command_name` | 79 | 79 | 17 |
| 5 | `command_lookup` | 73 | 55 | 14 |

All five together were estimated to take 3,077 Actions out of `none`.
Classifier 0.2.4 implemented ranks 1, 2, 3, and 5 and measured 3,060 Actions leaving `none`.
