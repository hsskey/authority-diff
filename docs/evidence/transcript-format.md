# Transcript 형식 조사 (Claude Code)

이 문서는 `ParseTranscript` 구현의 입력이 되는 Claude Code transcript(JSONL) 형식을 기록한다.
실제 기록을 local에서 읽기 전용으로 조사한 결과이며, 내용, 경로, 저장소와 host 이름은 담지 않고 field 이름과 구조와 집계 수치만 담는다.
수치는 한 시점의 aggregate이고 표본이 커지면 조금씩 달라질 수 있다.

## 조사 표본

- JSONL 파일 726개, 비어 있지 않은 줄 329,084개, `JSON.parse` 실패 줄 0개.
- 조사 대상은 한 사람의 단일 runtime(`claude_code`) 기록이다.

## 줄(line) 구조

각 줄은 독립된 JSON object 하나다.
`type` field가 줄의 종류를 가른다.

Action이 담기는 줄은 `message` object를 가진 두 종류뿐이다.

- `type: "assistant"` (약 49,700줄): `message.role`이 `"assistant"`, `message.content`는 block 배열. tool 호출(`tool_use` block)이 여기 담긴다.
- `type: "user"` (약 28,600줄): `message.role`이 `"user"`, `message.content`는 block 배열 또는 문자열. tool 결과(`tool_result` block)가 여기 담긴다.

나머지 줄 종류(`system`, `attachment`, `file-history-snapshot`, `file-history-delta`, 그리고 harness가 남기는 여러 상태/UI 줄)는 `tool_use`나 `tool_result` block을 담지 않으므로 parser가 Action을 만들지 않는다.
parser는 `type`을 분기 기준으로 삼지 않고 `message.role`과 content block의 `type`으로 tool 호출과 결과를 찾는다.

### content block의 type

`message.content`가 배열일 때 block의 `type` 값과 대략적 건수:

- `tool_use` 약 25,860
- `tool_result` 약 25,850
- `thinking` 약 15,400
- `text` 약 8,800
- `image` 3

`user` 줄의 `message.content`가 배열이 아니라 문자열인 경우도 있다(약 2,400).
그런 줄에는 `tool_result`가 없다.

### tool_use와 tool_result를 잇는 id

- `tool_use` block은 `id` 문자열을 가진다(schema의 `toolUseId`).
- `tool_result` block은 `tool_use_id` 문자열로 대응하는 `tool_use`를 가리킨다.
- `user` 줄에는 top-level `toolUseResult` field가 함께 있어 결과를 요약하지만, 연결의 근거는 block의 `tool_use_id`다.
- 표본에서 대응하는 `tool_result`가 없는 `tool_use`는 11건이었고, `tool_use` 없이 나타난 `tool_result`는 0건이었다.

### timestamp

- top-level `timestamp` field, 형식은 UTC ISO 8601이고 소수 자리는 항상 밀리초 3자리다(`...T..:..:..\.\d{3}Z`).
- 표본의 timestamp는 100% 이 형식이었다. 다른 정밀도나 offset 표기는 관측되지 않았다.
- schema가 요구하는 "밀리초 3자리로 정규화"는 이 표본에서 사실상 항등이지만, parser는 방어적으로 정규화한다.

## Session 메타 field

`cwd`, `gitBranch`, `version`, `isSidechain`은 top-level field로 존재한다(각 262,813줄에서 관측).

- `cwd` -> `workspaceRoot`의 출처. home 접두는 `~`로 바꾼다.
- `gitBranch` -> `gitBranch`.
- `version` -> `runtimeVersion`.
- `isSidechain` -> 줄 단위 `isSidechain`(subagent 여부).
- 그 밖에 `sessionId`, `uuid`, `parentUuid`, `userType`, `isMeta`, `requestId`, `leafUuid`가 존재한다.
- 줄 안의 session id는 쓰지 않는다. `sessionExternalId`는 호출자가 파일 이름 stem으로 넘긴다(schema 계약).

## 사람의 거절과 승인 prompt

사람이 tool 실행을 거절한 흔적은 `is_error: true`인 `tool_result` 안의 고정 문구로 남는다.

- 거절 문구는 한 종류였고, 표본에서 7건, 서로 다른 7개 파일에 나타났다.
- 문구는 "사용자가 이 tool 사용을 진행하기를 원하지 않는다. tool 사용이 거절되었다"는 취지의 runtime 생성 문자열이다(`The user doesn't want to proceed with this tool use. The tool use was rejected`로 시작).
- 이 표지가 있으면 `observedOutcome`는 `rejected_by_human`이다.

승인 prompt가 떴다가 사람이 승인한 경우를 가리키는 별도 field는 기록에 없다.

- 승인된 호출은 그냥 실행되어 일반 `tool_result`로 남는다.
- 승인 요청의 흔적은 위 거절 문구(거절된 경우)로만 남는다.
- 권한 mode 변경을 남기는 상태 줄은 있으나 호출 단위 승인 prompt 발생 여부를 담지 않는다.

## runtime이 차단한 호출의 표지

runtime이 실행 전에 막은 호출은 `is_error: true`인 `tool_result`에 고정 접두로 남는다.
`is_error` `tool_result` 총 458건 중 차단 표지는 121건이었다.

- `<tool_use_error>Blocked:`로 시작하는 결과(명령 guard) 58건.
- `PreToolUse:<도구> hook error:` 형태(실행 전 hook 거부) 62건.
- `Dangerous rm operation detected`(실행 전 guard) 1건.

이 표지가 있으면(거절 문구가 없을 때) `observedOutcome`는 `blocked_by_runtime`이다.

`PostToolUse` hook 오류는 도구가 이미 실행된 뒤의 것이므로 차단으로 보지 않는다.
`<tool_use_error>InputValidationError` 등 차단이 아닌 `<tool_use_error>`(약 20건)와 프로그램이 실행되어 비정상 종료한 결과(`Exit code`, traceback 등 약 330건)는 차단이 아니다.

## observedOutcome 도출 규칙

대응하는 `tool_result`를 찾은 뒤 우선순위대로 판정한다.

1. 거절 문구가 있으면 `rejected_by_human`.
2. 아니고 차단 표지가 있으면 `blocked_by_runtime`.
3. 아니면 `executed`(명령이 실패해 `is_error`여도 실행된 것이다).
4. `tool_result`가 없으면 `unknown`.

## 같은 tool_use id가 두 번 이상 나오는 원인

같은 `tool_use` id가 두 번 이상 나온 경우는 196건이었다(baseline 집계와 같음).

측정된 사실:

- 196건 모두 같은 파일 안이 아니라 서로 다른 두 파일에 걸쳐 나타났다(같은 파일 안 중복 0건).
- 두 번째로 나타난 위치는 100% 그 파일의 앞쪽 절반이었다(상대 위치 중앙값 약 0.19).
- 196건 모두, 관련된 파일이 session 이어 가기(continuation)를 나타내는 상태 줄을 가진 파일이었다.
- subagent(`isSidechain: true`)가 관련된 중복은 1건뿐이었다.

해석:

- 이 표본에서 중복의 원인은 session 이어 가기 때 이전 tool 기록이 다음 transcript 파일 앞부분으로 복사되는 것으로 검증된다.
- compaction으로 같은 파일 안에서 중복되는 경우, subagent 복사로 중복되는 경우는 이 표본에서 관측되지 않았다.
- 근거는 파일 단위 continuation 표지와 위치 분포이며, id마다 원인을 직접 표시하는 field는 없다. 위 분포에 맞지 않는 사례가 나오면 원인 미상으로 둔다.

이 중복은 parser가 아니라 소비자(`buildActionsForReplay`)가 제거한다.
같은 `actionKey`가 여러 session에 있으면 `occurredAt`가 가장 이른 것을 남기고, 동률이면 `sessionExternalId`가 UTF-16 code unit 오름차순으로 첫 번째인 것을 남긴다.

## subagent(sidechain)가 실행한 tool 호출의 위치

- subagent가 실행한 tool 호출은 별도 파일이 아니라 부모 transcript 파일 안에 `isSidechain: true`로 기록된다.
- 표본에서 sidechain tool 호출은 약 173건이었다.
- `ParsedToolCall`은 이 값을 그대로 담는다. Action 제외 여부(Operation 0개)는 classifier와 소비자의 판단이며 parser는 기록만 한다.

## 알려진 한계

`Write`나 `Edit`의 `content` 문자열 안에 JSON이 들어 있으면 그 안쪽은 구조적 마스킹이 아니라 정규식이 처리하므로 안쪽 JSON 형태가 깨질 수 있습니다.
secret은 제거되고 classifier는 `file_path`만 읽으므로 V1에는 영향이 없습니다.
