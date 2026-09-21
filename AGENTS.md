# Authority Diff

Agent 권한 정책 변경의 근거를 과거 작업 기록으로 만드는 modular monolith.
현재 범위는 V1(`docs/cutline.md`)이고 `docs/design.md`는 Target Architecture다.

- `docs/cutline.md`가 `docs/design.md`와 다르면 cutline을 따른다. cutline 13장의 code는 작성하지 않는다.
- 용어는 `CONTEXT.md`의 단어만 쓴다. 파일, symbol, table 이름도 같은 단어를 쓴다.
- 구조, 이름, 계약을 정해야 할 때: `docs/design.md` 19~28장과 `docs/cutline.md` 6, 15장을 읽는다.
- package를 추가하거나 다른 package를 import하기 전: `docs/design.md` 21장과 경계 규칙(`.dependency-cruiser.cjs`)을 읽는다.
- 소유 경로 밖을 고치거나 새 의존성, 새 구조가 필요할 때: `docs/design.md` 33.3 절차로 `docs/acr/`에 ACR을 쓴다.
- 되돌리기 어려운 결정을 내리거나 바꾸기 전: `docs/adr/`를 읽고, ADR 3조건(되돌리기 어려움, 맥락 없이는 의아함, 실제 대안이 있었음)을 채우면 `docs/adr/NNNN-<slug>.md`를 추가한다.
- test는 package entry point에서만 작성한다. 예상 가능한 실패는 `Result`로 반환한다.
- 작업을 끝내기 전 `pnpm check`와 `pnpm lint:boundaries:prove`를 실행한다. Node는 22를 쓴다.
- commit message, PR, 문서, 주석에 내부 진행 라벨(작업 단계 번호 등)이나 개인 맥락을 쓰지 않고 목적 기준으로 쓴다. 공개 저장소에 올라가는 내용은 오픈소스로 가정한다.
- branch는 `<type>/<purpose>` 형식이고 type은 `feat|feature|fix|bugfix|hotfix|release|chore` 중 하나다. `ai/`, `claude/`, `codex/`, `copilot/`, `cursor/`, `fm/` 같은 작성 주체 prefix와 내부 진행 라벨은 쓰지 않는다.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
