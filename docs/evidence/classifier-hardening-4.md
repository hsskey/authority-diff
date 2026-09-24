corpus snapshot: transcripts-2026-09-23-1036 (2026-09-23, 1,036 files, 34,940 Actions); classifier 0.2.4; measured 2026-09-24; move-count resultHash `1e6e5dd0…bc39`

# Classifier hardening round 4

This round classifies a command named by a path, and a shell given a script file, as `execute` on that path with analyzability `partial`.
A path through a directory variable is `execute` on an `unknown` Target with analyzability `partial`.
`command -v`/`-V`, `type`, and `which` are `read` with analyzability `full`.
A command name taken only from a variable (`$CMD`) stays `execute`, `unknown`, `none`.
The program and subcommand recognition tables are unchanged, and the `none` rate is not a target.
Only aggregate counts appear below; no repository names, host paths, or raw commands.

## Changes

1. A command word that contains `/` or starts with `~` (`./<script>`, `bin/<script>.sh`, `~/<dir>/bin/<tool>`, `/opt/<dir>/bin/<tool>`) and whose basename is not in the program table is `execute` on a `path` Target of that file, `partial`, signal `script_by_path`.
   The rule does not read the file, so the script's effect stays unknown; a Zone can tell a workspace script from one elsewhere.
2. The same command form with a leading expansion (`"$DIR/<tool>"`, `$HOME/bin/<tool>`) is `execute` on an `unknown` Target, `partial`, signal `script_by_variable_path`.
   Literal assignments earlier in the command are not resolved.
3. `bash`, `sh`, `dash`, `zsh`, and `ksh` given a script file, with no `-c`, `-s`, or heredoc, are classified the same way as (1) or (2).
   `-c`, `-s`, stdin, a lone `-`, and heredoc input stay `inline_code`.
4. `command -v` and `command -V` (including clustered forms such as `-pv`) are a lookup: `read` of the working directory, `full`.
   `type` and `which` were already `read`/`full`.
   `command` without `-v`/`-V` is still stripped as a transparent wrapper.
   `$CMD` and `$CMD --help` stay `execute`/`unknown`/`none` and are never `read`.

## Effect on the corpus

Operations: 177,690 (unchanged).

| measure | 0.2.3 | 0.2.4 |
| --- | ---: | ---: |
| `none` Actions | 9,908 (28.7%) | 6,848 (19.9%) |
| `none` Operations | 14,414 (8.1%) | 9,274 (5.2%) |
| path Operations | 152,176 | 156,761 |
| unknown Operations | 23,449 | 18,866 |
| path Operations at `partial` | 9,031 | 13,544 |
| unknown Operations at `partial` | 9,035 | 9,592 |
| path Operations at `full` | 143,145 | 143,217 |

3,060 Actions leave `none`.
5,140 Operations leave `none`.

### Moves by rule

| rule | Operations | Actions | `none` Operations on 0.2.3 (estimate) |
| --- | ---: | ---: | ---: |
| `path_command_name` | 4,403 | 3,354 | 4,402 |
| `variable_path_command_name` | 557 | 376 | 501 |
| `shell_script_file` (literal path) | 125 | 100 | 174 (literal and variable operands together) |
| `command_lookup` | 73 | 61 | 55 `none`; 18 already `partial` or `full` |

`script_by_path` covers the 4,403 path-form commands and the 125 literal shell script files (4,528 Operations).
The 0.2.3 `shell_script_file` estimate of 174 also counted expansion operands; those 49 land in `variable_path_command_name`.
The whitespace candidate predicates under-counted variable paths (501 vs 557) by a few dozen quoted command words.

All 73 `command -v`/`-V` Operations are `read`/`full`.
Of the 18 that were not `none` on 0.2.3, 15 were an `execute` of the looked-up program, one a package install, one a `send` to a remote, and one a `read`.
path `full` rises by 72; `package` and `vcs_remote` each fall by one.

## Adversarial corpus

`tests/corpus/adversarial.json` gains three cases: a path-form script piped to `sh` (the pipe stays `execute`/`unknown`/`none`), a home-directory path-form command chained with `curl`, and `$CMD --help` (stays `execute`/`unknown`/`none`, never `read`).
The existing host-executable case now expects `execute`/`path` for the decoded file.
The laundering rate stays 0.
The probe does not read classifier output, and its tests pass unchanged.

## Follow-up

- A command name taken from a variable (`$G api ...`) still classifies as an empty unrecognized program (`docs/evidence/classifier-backlog.md`).
- The Gate 2, adoption preview, and conformance documents were not re-run in this round.

## Result

- CLASSIFIER_VERSION: 0.2.4.

## Previous version (classifier 0.2.3)

Kept only as the baseline of the changes above, on the same snapshot.

| measure | 0.2.3 |
| --- | ---: |
| `none` Actions | 9,908 (28.7%) |
| `none` Operations | 14,414 (8.1%) |
| path / unknown Operations | 152,176 / 23,449 |
| path `partial` / unknown `partial` | 9,031 / 9,035 |
| path `full` | 143,145 |
| `command_lookup` Operations classified as running the looked-up program | 15 |
