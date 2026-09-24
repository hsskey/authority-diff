corpus snapshot: transcripts-2026-09-23-1036 (2026-09-23, 1,036 files, 34,940 Actions); classifier 0.2.4; measured 2026-09-24; backlog resultHash `971c1dcb…fe36`

# Classifier backlog

This document ranks what keeps Actions in `none` and how many Actions resolving each item would take out of it.
It lists the `none` signals, the unrecognized programs, and the unrecognized harness tool names, then the rule candidates.
Every expected gain is a count of Actions; Operation counts appear only in the totals, the Target Kind distribution, and the candidate match columns.
It measures only; the classifier, the program and subcommand recognition tables, and the tool table are unchanged.
The `none` rate is not a target: the gain column orders the work, and each item still has to be correct on its own.
Program names outside the public tool list are masked with the evidence legend; no paths, repositories, hosts, or raw commands appear below.

`pnpm dev:backlog <snapshot>` recomputes every table and writes `backlog.json` and `backlog.md` under `.local/backlog/`.
The run on this snapshot gave resultHash `971c1dcba65f64d8bb5cb7660ac461b546dc98ef135483241304313fa57ffe36`.

Classifier 0.2.4 landed `path_command_name`, `variable_path_command_name`, `shell_script_file`, and `command_lookup` (`docs/evidence/classifier-hardening-4.md`).
Those four still appear in the candidate table with zero `none` Operations so the predicates can be checked; they are not next work.

## Terms

- A `none` Action has at least one Operation with analyzability `none`.
- `none` Actions for a row counts the `none` Actions with at least one `none` Operation in that row.
- Actions leaving `none` is the expected gain of a row: its sole-cause Actions, the `none` Actions whose every `none` Operation belongs to that row, so resolving the row alone takes them out of `none`.
  It is an upper bound: it assumes resolving the row gives each of its Operations `partial` or `full`.

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

| signal | `none` Actions | Actions leaving `none` |
| --- | ---: | ---: |
| `inline_code` | 4,245 | 3,863 |
| `program_unrecognized` | 2,361 | 1,960 |
| `tool_unrecognized` | 526 | 526 |
| `fragment_truncated` | 121 | 107 |
| `parse_error` | 146 | 25 |
| `git_subcommand_unknown` | 2 | 2 |
| `remote_exec` | 2 | 2 |
| `input_truncated` | 60 | 1 |

## Unrecognized programs (top 40)

Programs on `program_unrecognized` Operations, ranked by Actions leaving `none` if the program table recognized that name.
`(empty name)` is a command whose name is a shell expansion, which `variable_command_name` below addresses instead of a table entry.
`<local-tool-NN>` is a program outside the public tool list.

| program | `none` Actions | Actions leaving `none` |
| --- | ---: | ---: |
| `<local-tool-02>` | 935 | 885 |
| `<local-tool-08>` | 408 | 362 |
| `<local-tool-04>` | 407 | 280 |
| `<local-tool-12>` | 142 | 81 |
| `(empty name)` | 42 | 21 |
| `<local-tool-09>` | 55 | 19 |
| `lsof` | 22 | 18 |
| `<local-tool-52>` | 19 | 18 |
| `<local-tool-36>` | 16 | 15 |
| `<local-tool-26>` | 15 | 13 |
| `<local-tool-38>` | 22 | 12 |
| `<local-tool-53>` | 16 | 10 |
| `<local-tool-33>` | 16 | 9 |
| `md5` | 10 | 8 |
| `<local-tool-102>` | 10 | 8 |
| `<local-tool-93>` | 12 | 7 |
| `<local-tool-61>` | 12 | 7 |
| `<local-tool-75>` | 16 | 6 |
| `codex` | 9 | 6 |
| `<local-tool-105>` | 21 | 5 |
| `<local-tool-47>` | 7 | 5 |
| `<local-tool-46>` | 6 | 5 |
| `<local-tool-21>` | 6 | 5 |
| `<local-tool-17>` | 6 | 4 |
| `<local-tool-59>` | 3 | 3 |
| `<local-tool-108>` | 3 | 3 |
| `<local-tool-37>` | 3 | 3 |
| `<local-tool-58>` | 9 | 2 |
| `<local-tool-109>` | 6 | 2 |
| `<local-tool-74>` | 5 | 2 |
| `<local-tool-84>` | 4 | 2 |
| `<local-tool-87>` | 4 | 2 |
| `<local-tool-110>` | 3 | 2 |
| `<local-tool-81>` | 2 | 2 |
| `<local-tool-111>` | 2 | 2 |
| `<local-tool-73>` | 2 | 2 |
| `<local-tool-112>` | 2 | 2 |
| `<local-tool-113>` | 2 | 2 |
| `open` | 2 | 2 |
| `<local-tool-114>` | 2 | 2 |

The 40 rows take 1,844 Actions out of `none` together, out of 1,960 `program_unrecognized` sole-cause Actions; the first four take 1,608.
The other 116 are programs below rank 40 or Actions with two or more unrecognized programs.
`tmux`, `python3`, `node`, `perl`, `sqlite3`, and `claude` are recognized; their `none` Operations are `inline_code`.

## Unrecognized harness tool names

Every tool name on a `tool_unrecognized` Operation, ranked by Actions leaving `none` if the tool table recognized it.
The gains add up to all 526 `tool_unrecognized` sole-cause Actions.

| harness tool | `none` Actions | Actions leaving `none` |
| --- | ---: | ---: |
| `StructuredOutput` | 457 | 457 |
| `Monitor` | 30 | 30 |
| `Agent` | 20 | 20 |
| `SendMessage` | 14 | 14 |
| `Artifact` | 3 | 3 |
| `ListAgents` | 1 | 1 |
| `SendFeedback` | 1 | 1 |

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

- The unrecognized programs and harness tool names above need new entries in the program or tool table.
  The `program_unrecognized` sole-cause Actions that `variable_command_name` does not cover, and all 526 `tool_unrecognized` ones, are of this kind.
- `inline_code` (3,863 sole-cause Actions) is code in another language passed through `-c`, `-e`, stdin, a heredoc, or `tmux send-keys`; `python3` reading code from stdin or a heredoc is its largest part.
  The classifier does not analyze it beyond the credential and URL literals it already scans.
- `fragment_truncated`, `parse_error`, and `input_truncated` (107, 25, and 1 sole-cause Actions) come from input cut at the stored length or text the shell grammar does not parse.

## Method limits

- The candidate predicates read the stored Operation fragment split on whitespace, not the shell parse tree, so a quoted command word with spaces is missed and the counts are estimates.
  The rule's own count is measured when it lands.
- Actions leaving `none` assumes each rule succeeds on every matched Operation; `variable_command_name` resolves only literal values, so its real gain is lower.
- A program or tool gain assumes the new table entry classifies every Operation of that name; an entry that leaves some subcommands unknown gains less.

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
