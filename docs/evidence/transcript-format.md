# Transcript format survey (Claude Code)

This document records the Claude Code transcript (JSONL) format that is the input to the `ParseTranscript` implementation.
It is the result of a read-only survey of real records locally; it does not carry contents, paths, repository names, or host names, only field names, structure, and aggregate figures.
The figures are an aggregate at one point in time and can shift a little as the sample grows.

## Survey sample

- 726 JSONL files, 329,084 non-empty lines, 0 lines that failed `JSON.parse`.
- The survey target is one person's single-runtime (`claude_code`) record.

## Line structure

Each line is one independent JSON object.
The `type` field distinguishes the kind of line.

The only two kinds of line that hold an Action are the two that have a `message` object.

- `type: "assistant"` (about 49,700 lines): `message.role` is `"assistant"`, `message.content` is a block array. Tool calls (`tool_use` blocks) live here.
- `type: "user"` (about 28,600 lines): `message.role` is `"user"`, `message.content` is a block array or a string. Tool results (`tool_result` blocks) live here.

Other line kinds (`system`, `attachment`, `file-history-snapshot`, `file-history-delta`, and various status/UI lines the harness leaves) do not hold `tool_use` or `tool_result` blocks, so the parser does not make an Action from them.
The parser does not branch on `type`; it finds tool calls and results from `message.role` and the content block's `type`.

### content block type

When `message.content` is an array, block `type` values and approximate counts:

- `tool_use` about 25,860
- `tool_result` about 25,850
- `thinking` about 15,400
- `text` about 8,800
- `image` 3

A `user` line's `message.content` is sometimes a string rather than an array (about 2,400).
Those lines have no `tool_result`.

### id that joins tool_use and tool_result

- A `tool_use` block has an `id` string (schema `toolUseId`).
- A `tool_result` block points at the matching `tool_use` with a `tool_use_id` string.
- A `user` line also has a top-level `toolUseResult` field that summarizes the result, but the join rests on the block's `tool_use_id`.
- In the sample, `tool_use` with no matching `tool_result` was 11, and `tool_result` that appeared without a `tool_use` was 0.

### timestamp

- Top-level `timestamp` field; the form is UTC ISO 8601 and the fractional part is always 3 millisecond digits (`...T..:..:..\.\d{3}Z`).
- 100% of timestamps in the sample were this form. No other precision or offset notation was observed.
- The "normalize to 3 millisecond digits" the schema requires is effectively an identity on this sample, but the parser still normalizes defensively.

## Session meta fields

`cwd`, `gitBranch`, `version`, `isSidechain` exist as top-level fields (observed on 262,813 lines each).

- `cwd` -> source of `workspaceRoot`. A home prefix is rewritten to `~`.
- `gitBranch` -> `gitBranch`.
- `version` -> `runtimeVersion`.
- `isSidechain` -> per-line `isSidechain` (whether it is a subagent).
- Also present: `sessionId`, `uuid`, `parentUuid`, `userType`, `isMeta`, `requestId`, `leafUuid`.
- A session id inside the line is not used. `sessionExternalId` is passed by the caller as the file-name stem (schema contract).

## Human rejection and approval prompts

A trace that a person rejected a tool run remains as a fixed phrase inside a `tool_result` with `is_error: true`.

- There was one kind of rejection phrase; 7 in the sample, in 7 different files.
- The phrase is a runtime-generated string to the effect of <!-- ko-product-output -->"사용자가 이 tool 사용을 진행하기를 원하지 않는다. tool 사용이 거절되었다" (it starts with `The user doesn't want to proceed with this tool use. The tool use was rejected`).
- When an `is_error` result starts with this marker, `observedOutcome` is `rejected_by_human`.

There is no separate field in the record that marks an approval prompt that appeared and that a person then approved.

- An approved call simply runs and remains as an ordinary `tool_result`.
- A trace of an approval request remains only as the rejection phrase above (when it was rejected).
- There is a status line that records a permission-mode change, but it does not carry whether an approval prompt occurred per call.

## Markers of calls the runtime blocked

A call the runtime stopped before execution remains as a fixed prefix on a `tool_result` with `is_error: true`.
Of 458 `is_error` `tool_result` rows, block markers were 121.

- Results that start with `<tool_use_error>Blocked:` (command guard) 58.
- Form `PreToolUse:<tool> hook error:` (pre-execution hook refusal) 62.
- `Dangerous rm operation detected` (pre-execution guard) 1.

When an `is_error` result starts with one of these markers, `observedOutcome` is `blocked_by_runtime`.
The same strings inside a successful result, such as a read of a file that quotes them, are output, not markers.

A `PostToolUse` hook error is after the tool already ran, so it is not treated as a block.
`<tool_use_error>` that is not a block, such as `<tool_use_error>InputValidationError` (about 20), and results where the program ran and exited abnormally (`Exit code`, traceback, and so on, about 330) are not blocks.

## observedOutcome derivation rules

After the matching `tool_result` is found, judge in this order.

1. If `is_error` is not true, `executed`.
2. Else if the result starts with the rejection phrase, `rejected_by_human`.
3. Else if the result starts with a block marker, `blocked_by_runtime`.
4. Else `executed` (it ran even though the command failed and `is_error` is set).
5. If there is no `tool_result`, `unknown`.

## Why the same tool_use id appears more than once

The same `tool_use` id appeared more than once in 196 cases (same as the baseline aggregate).

Measured facts:

- All 196 appeared across two different files, not inside the same file (0 duplicates inside the same file).
- The second appearance was 100% in the front half of that file (relative-position median about 0.19).
- All 196 involved a file that had a status line indicating session continuation.
- Duplicates involving a subagent (`isSidechain: true`) were only 1.

Reading:

- In this sample the cause of duplicates is verified as previous tool records being copied to the front of the next transcript file on session continuation.
- Duplicates inside the same file from compaction, and duplicates from subagent copying, were not observed in this sample.
- The basis is the per-file continuation marker and the position distribution; there is no field that directly marks the cause per id. A case that does not match the distribution above is left as cause unknown.

This duplicate is removed by the consumer (`buildActionsForReplay`), not the parser.
When the same `actionKey` appears in several sessions, keep the earliest `occurredAt`, and on a tie keep the first by `sessionExternalId` UTF-16 code unit ascending.

## Where tool calls a subagent (sidechain) ran live

- Tool calls a subagent ran are recorded in the parent transcript file with `isSidechain: true`, not in a separate file.
- Sidechain tool calls in the sample were about 173.
- `ParsedToolCall` carries this value as-is. Whether to exclude the Action (0 Operations) is a judgement for the classifier and the consumer; the parser only records.

## Known limits

If JSON sits inside a `Write` or `Edit` `content` string, the inside is handled by regex rather than structural masking, so the inner JSON shape can break.
Secrets are removed and the classifier reads only `file_path`, so there is no V1 impact.
