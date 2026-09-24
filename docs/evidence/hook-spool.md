# Hook spool known limitations (V3 observation)

이 문서는 `authority hook`과 `authority install-hooks`의 pre-bundle 동작에서 알려진 한계를 기록한다.
판정은 범위 밖이고, 관측 data는 `authority spool-flush`로 server에 전송된다.

## tsx startup (superseded by bundle)

`pnpm build:cli`로 `apps/cli/dist/authority.mjs`를 만들면 install-hooks가 bundle path를 쓴다.
측정치는 `docs/evidence/hook-bundle-startup.md`에 있다.
bundle이 없을 때만 tsx fallback이 남는다.

## Workspace link (superseded by bundle)

bundle은 workspace package를 단일 file에 포함한다.
bundle이 없고 workspace link도 없으면 tsx fallback이 module resolution 전에 실패할 수 있다.
`authority install-hooks --print`는 link가 없을 때 warning을 출력한다.

## Shell fail-open

install-hooks가 등록하는 command는 `sh -c '… 2>>$HOME/.authority/hook-errors.log || exit 0'` 형태다.
module-load failure도 shell이 exit 0으로 막고, stderr는 caller screen에 나오지 않는다.
hook process 내부 400ms fail-open guard는 main이 실행된 이후에만 적용된다.

## PermissionRequest 관측

두 종류의 근거를 구분한다.
아래 "direct hook-command 검증"은 이 환경에서 재현했다.
"live end-to-end firing"은 인증이 되는 Session에서만 확인 가능하므로 보류한다.

### direct hook-command 검증 (이 환경에서 재현)

`authority install-hooks`가 `~/.claude/settings.json`에 등록하는 바로 그 hook command를
realistic PermissionRequest payload로 직접 실행했다.
결과는 다음과 같다.

- hook command는 exit status 0으로 끝났고 stdout은 비었다. 즉 Decision을 출력하지 않는다.
- `permission_request` line이 spool에 추가됐다.
- hook이 읽는 field는 `session_id`, `cwd`, `tool_name`, `tool_input`, `tool_use_id`, `permission_mode`다.
  이는 Claude Code PermissionRequest payload의 shape과 일치한다.
  `permission_mode`는 spool의 `permissionMode`에 그대로 기록되고, 없으면 `null`이다(근거 ACR-0008).
- payload에 `tool_use_id`가 있으면 spool의 `toolUseId`에 그대로 기록되고,
  없으면 `toolUseId`는 `null`이다. `toolUseId` field는 nullable이다.
- raw command와 argument는 spool이나 이 문서에 남기지 않았다. `tool_input`은 hash로만 남는다.

### live end-to-end firing (보류)

실제 `claude` child Session이 workspace 밖 write를 시도해 hook이 실제로 발화하는
end-to-end 흐름은 이 환경에서 재현하지 못했다.
이 환경의 새 `claude` child process는 인증에 실패한다.
이 확인은 captain의 인증된 Session으로 미룬다.
이 문서는 그 live Session이 재현됐다고 주장하지 않는다.

## PreToolUse 관측 hook

plugin의 PermissionRequest Decision이 뒤의 hook을 건너뛸 수 있으므로,
모든 tool-call 시도를 놓치지 않도록 PreToolUse 관측 hook을 추가했다.
이 hook은 tool-call 시도마다 `tool_use_id`와 함께 한 line을 spool에 기록한다.
Decision을 출력하지 않고, 모든 경로에서 exit 0이며, 기존 400ms handler budget 안에서 끝난다.
`install-hooks`는 PreToolUse의 `*` matcher entry를 PermissionRequest, SessionEnd와 함께 관리한다.
이 hook의 spool line도 direct hook-command 실행으로 검증했다.

in this environment the plugin hook auto-approves Bash

plugin은 안전하다고 분류한 Bash Action만 자동으로 `allow`한다.
이 auto-approve는 user 환경의 실제 V3 관측 case이고 이 문서는 omc plugin config를 바꾸지 않는다.

## Node path pinning

install-hooks는 hook command의 node path를 등록 시점에 고정한다.
실행 중인 node가 `.vite-plus`, `.volta`, `.nvm` version-manager folder 안의 versioned path이면 그 manager의 shim을 고정한다.
shim은 `~/.vite-plus/bin/node`, `~/.volta/bin/node`, nvm의 `~/.nvm/current/bin/node`(`NVM_SYMLINK_CURRENT`가 켜진 경우에만 존재)다.
shim은 hook 실행 시점의 cwd와 manager 설정으로 node version을 고르므로, 등록 시점과 다른 version으로 hook이 실행될 수 있다.
shim이 없으면 versioned path를 그대로 쓰고, 그 version이 삭제되면 hook은 shell fail-open으로 조용히 멈춘다.
`authority install-hooks --print`의 `node` line이 고른 path와 이유를 보여 준다.
Homebrew Cellar 규칙은 `docs/evidence/hook-bundle-startup.md`에 있다.

## 다른 machine의 spool

`authority spool-flush --from <dir>`는 local spool 대신 다른 machine에서 복사한 spool directory를 전송한다.
전송한 file은 그 directory 안에서 `.sent`로 rename되고, local spool은 건드리지 않는다.
`<dir>`를 읽을 수 없으면 exit 1로 끝난다.
