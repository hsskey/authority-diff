# Control-tool basis

For each name put in `CONTROL_TOOL_NAMES`, this is the basis that official docs confirm "it does not change external state; it only controls the agent's progress".
A name that could not be confirmed is not put on the list (conservatively treated as unknown/none).
A ToolCall of an included tool is 0 Operations (excluded from evaluation); an excluded name is classified by other rules (unknown becomes execute/unknown/none).

Sources are Anthropic official docs only.

- code.claude.com/docs/en/tools-reference (Claude Code tools reference)
- code.claude.com/docs/en/agent-sdk/subagents (subagent behavior)
- code.claude.com/docs/en/agent-sdk/structured-outputs

## Included

| name | basis doc | what was confirmed |
| --- | --- | --- |
| `Skill` | tools-reference | "Executes a skill within the main conversation." It runs a skill workflow inside the current conversation; the call itself is progress control. If there is an external effect it remains as a separate tool call and is classified on its own. |
| `ToolSearch` | tools-reference | "Searches for and loads deferred tools when tool search is enabled." It only loads a tool schema into the agent's context and does not change external state. |
| `AskUserQuestion` | tools-reference | "Asks multiple-choice questions to gather requirements or clarify ambiguity." It takes user input and pauses progress; it does not change external state. |
| `TaskOutput` | tools-reference | "Retrieves output from a background task." It only reads output from its own background task (deprecated in the docs; kept if observed). |
| `TaskStop` | tools-reference | "Stops a running background task by ID." Progress control that stops its own background work; it does not change files or the network. |
| `ScheduleWakeup` | tools-reference | "Reschedules the next iteration of a self-paced /loop." It only controls the time of its own loop. |

## Excluded

| name | reason |
| --- | --- |
| `Agent` | It starts a subagent. The data condition (whether the subagent's tool calls remain as separate records) was met by the parser survey (child/sidechain calls exist on the parent JSONL with `isSidechain=true`). The remaining condition, official-doc basis that "the Agent call itself does not change external state and only controls progress", is not confirmed. The subagents doc only says "intermediate tool calls and results stay inside the subagent; only its final message returns to the parent", which suggests the subagent is the subject that changes external state and does not say Agent is pure control. Inclusion was approved (when conditions are met) but not confirmed, so it is conservatively excluded and treated as unknown (execute/unknown/none). |
| `Monitor` | "Runs a command in the background..." It runs an arbitrary command under the same permission rules as Bash, so it can change external state. |
| `SendMessage` | It sends a message to another agent or another Claude Code session (on or off the machine). That is an external (cross-session/network) state change. |
| `StructuredOutput` | Official docs have no tool of this name. It is the Agent SDK `output_format` option (JSON validation of the final result), not a control tool. |

## Revisit signals

- Revisit including Agent when Agent's official semantics are documented and it is confirmed that a subagent's child calls can be identified individually in the record.
- Recheck the name when the tools-reference tool description changes.
