# Hook spool known limitations (V3 observation)

이 문서는 `authority hook`과 `authority install-hooks`의 pre-bundle 동작에서 알려진 한계를 기록한다.
판정이나 server 전송은 범위 밖이고, 관측 data가 쌓이기만 한다.

## tsx startup

Hook handler logic은 400ms budget 안에서 끝나야 한다.
현재 hook command는 repository root에서 `node <repo>/node_modules/tsx/dist/cli.mjs <repo>/apps/cli/src/main.ts hook <event>` 형태로 raw TypeScript entry를 실행한다.
tsx interpreter startup 시간은 이 budget에 포함되지 않는다.
post-Sunday bundle 이후에는 단일 JS bundle로 대체해 startup을 줄일 예정이다.

## Workspace link

Hook entry는 `@authority/kernel` 등 workspace package를 import한다.
target clone에 `pnpm install`이 되어 workspace link가 없으면 module resolution이 main에 도달하기 전에 `ERR_MODULE_NOT_FOUND`로 실패하고 process는 exit 1로 종료한다.
400ms fail-open guard는 main이 실행된 이후에만 적용되므로 이 실패를 막지 못한다.
`authority install-hooks --print`는 link가 없을 때 warning을 출력한다.
durable fix는 bundle 이후 단일 file 실행이다.

## PermissionRequest 관측

Manual mode의 headless `claude --debug` Session에서 workspace 밖 file write Action을
시도했다. debug log와 spool을 대조한 결과는 다음과 같다.

- `PermissionRequest`는 발생했다.
- plugin hook 다음에도 authority hook이 실행됐고 exit status는 0이었다.
- stdin의 top-level field는 `cwd`, `effort`, `hook_event_name`, `permission_mode`,
  `permission_suggestions`, `prompt_id`, `session_id`, `tool_input`, `tool_name`,
  `transcript_path`였다. `tool_input`의 field는 `command`, `description`이었다.
- 이 `PermissionRequest` 입력에는 `tool_use_id`가 없었다. spool의 `toolUseId`는
  nullable이며 이 Session에서는 `null`이다.
- 같은 Session에서 `permission_request` line이 spool에 추가됐다. plugin의
  Decision이 뒤의 hook을 건너뛰게 하지는 않았다.

in this environment the plugin hook auto-approves Bash

plugin은 안전하다고 분류한 Bash Action만 자동으로 `allow`한다. 이번 workspace 밖
write Action에는 `continue`만 반환했고, headless Session의 기본 흐름이 Action을
`deny`했다. raw command와 argument는 spool이나 이 문서에 남기지 않았다.
