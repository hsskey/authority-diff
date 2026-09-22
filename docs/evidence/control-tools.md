# Control tool 근거

`CONTROL_TOOL_NAMES`에 넣는 이름마다 공식 문서로 "외부 상태를 바꾸지 않고 agent의 진행만 제어한다"를 확인한 근거다.
확인하지 못한 이름은 목록에 넣지 않는다(보수적으로 unknown/none 처리).
포함한 tool의 ToolCall은 Operation 0개(평가 제외), 제외한 이름은 다른 규칙(unknown이면 execute/unknown/none)으로 분류된다.

출처는 Anthropic 공식 문서만 쓴다.

- code.claude.com/docs/en/tools-reference (Claude Code tools reference)
- code.claude.com/docs/en/agent-sdk/subagents (subagent 동작)
- code.claude.com/docs/en/agent-sdk/structured-outputs

## 포함

| 이름 | 근거 문서 | 확인한 내용 |
| --- | --- | --- |
| `Skill` | tools-reference | "Executes a skill within the main conversation." skill workflow를 현재 대화 안에서 실행하며 호출 자체는 진행 제어다. 외부 효과가 있으면 별도 tool call로 남아 각각 분류된다. |
| `ToolSearch` | tools-reference | "Searches for and loads deferred tools when tool search is enabled." tool schema를 agent의 context에 load할 뿐 외부 상태를 바꾸지 않는다. |
| `AskUserQuestion` | tools-reference | "Asks multiple-choice questions to gather requirements or clarify ambiguity." 사용자 입력을 받고 진행을 멈출 뿐 외부 상태를 바꾸지 않는다. |
| `TaskOutput` | tools-reference | "Retrieves output from a background task." 자기 background task의 출력을 읽기만 한다(문서상 deprecated이나 관측되면 유지). |
| `TaskStop` | tools-reference | "Stops a running background task by ID." 자기 background 작업을 멈추는 진행 제어이고 파일·network를 바꾸지 않는다. |
| `ScheduleWakeup` | tools-reference | "Reschedules the next iteration of a self-paced /loop." 자기 loop의 시각만 제어한다. |

## 제외

| 이름 | 이유 |
| --- | --- |
| `Agent` | subagent를 띄운다. data 조건(subagent의 tool 호출이 기록에 개별로 남는가)은 parser 조사로 충족됐다(child/sidechain 호출이 parent JSONL에 `isSidechain=true`로 존재). 그러나 남은 조건인 공식 문서 근거가 "Agent 호출 자체가 외부 상태를 바꾸지 않고 진행만 제어한다"를 확증하지 못한다. subagents 문서는 "intermediate tool calls and results stay inside the subagent; only its final message returns to the parent"라고만 적어, subagent가 외부 상태를 바꾸는 주체임을 시사할 뿐 Agent가 순수 제어임을 말하지 않는다. 포함은 승인됐으나(조건 충족 시) 확증되지 않았으므로 보수적으로 제외하고 unknown 취급(execute/unknown/none)으로 둔다. |
| `Monitor` | "Runs a command in the background..." Bash와 같은 권한 규칙으로 임의 명령을 실행하므로 외부 상태를 바꿀 수 있다. |
| `SendMessage` | 다른 agent나 다른 Claude Code session에 메시지를 보낸다(기기 안팎). 외부(교차 세션/network) 상태 변경이다. |
| `StructuredOutput` | 공식 문서에 이 이름의 tool이 없다. Agent SDK의 `output_format` 옵션(최종 결과 JSON 검증)이며 control tool이 아니다. |

## 재검토 신호

- Agent의 공식 semantics가 문서화되고 subagent의 child 호출이 기록에서 개별 식별 가능함이 확인되면 Agent 포함을 재검토한다.
- tools-reference의 tool 설명이 바뀌면 해당 이름을 다시 확인한다.
