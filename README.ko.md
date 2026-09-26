# Authority Diff

Authority Diff는 Agent가 과거에 한 작업을 permission Policy로 다시 평가해, Policy를 채택하거나 바꾸기 전에 그 Policy가 어떤 Action을 allow, ask, deny할지 보여 줍니다.

**근거 범위:** 한 사람, 단일 runtime(Claude Code)의 근거이며, Verdict는 Agent가 기록했고, 등급은 medium입니다.
이 README의 corpus 수치는 한 사람의 Claude Code transcript에서 나왔고, 탐색적 probe만 synthetic Scenario를 씁니다.
이 기록의 Verdict는 사람이 아니라 Agent가 내렸고, 기록된 journey의 등급은 medium입니다([Evidence](#evidence)).

English: [README.md](README.md)

## 문제와 대상 독자

Authority Diff는 조직의 coding Agent가 따를 permission Policy를 작성하는 engineering lead나 platform 담당자를 위한 도구입니다.

permission Policy는 Rule 문장의 목록입니다.
문장만 읽어서는 각 Rule이 Agent의 실제 tool call 중 무엇을 allow, ask, deny할지 알 수 없습니다.
한 host의 모든 repository를 신뢰하는 것처럼 작은 수정 하나로, 아무도 신뢰하려 하지 않았던 Action이 ask에서 allow로 바뀔 수 있습니다.

Authority Diff는 기록된 Action에 대해 두 질문에 답합니다.

- 이 첫 Policy는 무엇을 ask하거나 deny하는가
- 이 Policy 변경은 어떤 Action의 Effect를 바꾸는가

## 빠른 시작

Node 22, pnpm, Docker가 필요합니다.
아래 명령은 `tests/fixtures/journey/transcripts`에 있는 synthetic transcript 3개를 import합니다.
내 작업을 검토하려면 import 경로를 내 Claude Code transcript 디렉터리로 바꾸세요.

```sh
pnpm install --frozen-lockfile
docker compose up -d --wait
AUTHORITY_CLI_SERVER_URL=http://localhost:8787 AUTHORITY_CLI_TOKEN=local-dev-token \
  pnpm authority import tests/fixtures/journey/transcripts
pnpm --filter @authority/web dev
```

`docker compose up`은 PostgreSQL과 server를 `http://localhost:8787`에 띄우고, server token을 `local-dev-token`으로 설정합니다.
`http://localhost:5173`을 열고 token `local-dev-token`으로 로그인한 뒤 "첫 조직 정책 만들기"를 누르세요.
나머지 화면은 다음 절에서 순서대로 설명합니다.
여기 인용한 화면 문구는 한국어 화면 기준이며, 헤더의 언어 버튼으로 영어와 한국어를 바꿀 수 있습니다.

### journey 따라가기

import → 활동 개요 → 첫 Policy(draft) → 최초 도입 미리보기 → 검토와 채택 → [Authority Diff 밖] runtime 설정 변경 → change review → conformance

1. **Import.** `authority import`는 Claude Code transcript를 읽고, secret을 가리고, 각 tool call을 Operation으로 분류합니다.
2. **Activity Overview.** Policy가 없을 때 `/`는 import한 활동을 보여 줍니다.
   Session, Action, Capability와 Target Kind 분포, analyzability, 상위 program이 나옵니다.
   Effect와 Zone은 Policy가 있어야 계산할 수 있어서 이 화면에는 나오지 않습니다.
3. **첫 Policy(draft).** "첫 조직 정책 만들기"를 누르면 기본 template으로 draft version 1이 만들어집니다.
   JSON(Rule과 Environment Profile)을 고친 뒤 저장하고 검증하세요.
   조직 하나에는 Policy가 하나입니다.
4. **최초 도입 미리보기.** "최초 도입 검토 만들기"를 누르면 기록된 Action을 draft 하나로만 평가합니다.
   화면은 draft가 allow, ask, deny할 Action 수를 세고, ask와 deny Action을 Effect, Capability, Zone별 Adoption Group으로 묶습니다.
   미리보기는 baseline과 비교하지 않고, transcript에서 과거 승인 여부를 추론하지 않습니다.
5. **검토와 채택.** 모든 Adoption Group에 Verdict를 주세요: 의도한 제한, 보류, 정책 수정 필요 중 하나입니다.
   모든 group이 의도한 제한이면 "최초 정책 채택"이 version 1을 `accepted`로 표시하고 Decision Record를 씁니다.
6. **[Authority Diff 밖] runtime 설정 변경.** `accepted`는 검토 기록입니다.
   Policy에 맞춰 runtime 설정을 바꾸는 일(예: managed settings)은 Authority Diff 밖에서 합니다.
   운영자는 이 변경을 했다는 사실을 API로 기록할 수 있습니다.
   Authority Diff는 그 선언을 확인하지 않고 저장만 하며, Policy Version status, replay, conformance, 평가, 화면 어디에서도 그 선언을 읽지 않습니다.
7. **Change review.** accepted version에서 만든 draft는 Change Review를 받습니다.
   같은 Action을 두 version으로 평가하고, Widening과 Narrowing group을 보여 주고, Verdict를 받은 뒤, Evidence Report와 함께 accept나 reject로 끝납니다.
8. **Conformance.** observation hook이 runtime이 실제로 한 일을 보고합니다.
   Conformance는 그 Runtime Observation을 accepted Policy와 비교해 violation, under_asked, over_asked finding을 보고합니다.
   runtime 동작에 대해 말하는 화면은 이 화면 하나입니다.

### snapshot으로 database seed하기

Policy 편집 화면을 건너뛰려면, 명령 하나로 transcript snapshot을 import하고 주어진 문서를 draft version 1로 하는 조직 Policy를 만들 수 있습니다.

```sh
AUTHORITY_DB_URL=postgres://authority:authority@localhost:55432/authority \
AUTHORITY_AUTH_TOKEN=local-dev-token \
  pnpm seed:demo --snapshot <transcript-directory> --policy <policy-document.json>
```

이미 Policy가 있는 database에는 seed가 실행되지 않습니다.
최초 도입 검토, Verdict, 채택은 web journey에서 진행하세요.

### conformance용 runtime 동작 기록하기

Claude Code 설정에 observation hook을 설치하세요.
hook은 fail-open이며 Effect를 돌려주지 않습니다.

```sh
pnpm authority install-hooks
```

`pnpm authority spool-flush`를 실행하면 기록된 spool 파일을 conformance용으로 server에 보냅니다.
다른 machine에서 복사한 spool 디렉터리는 `pnpm authority spool-flush --from <dir>`로 보내세요.

## 핵심 개념

**Policy Version과 Effect.**
Policy Version은 Rule과 Environment Profile을 담은, 바뀌지 않는 문서 하나입니다.
각 Rule은 Capability, Zone, Reversibility, Analyzability 조건에 Effect(`allow`, `ask`, `deny`) 하나를 붙입니다.
Authority Diff는 Action(tool call 하나)을 Operation으로 나누고, Action에는 Operation의 Effect 중 가장 제한적인 Effect를 줍니다.

**검토: group, Verdict, Gate.**
replay는 같은 기록 Action을 한 Policy Version으로 평가합니다.
accepted version이 아직 없으면 최초 도입 검토가 ask와 deny Action을 Adoption Group으로 묶습니다.
그 뒤에는 change review가 draft를 accepted version과 비교하고, Effect가 바뀐 Action을 Widening과 Narrowing group으로 묶습니다.
사람이 group마다 Verdict를 하나씩 기록합니다.
Gate는 blocker가 남지 않으면 열립니다.
최초 도입 검토에서는 모든 Adoption Group을, change review에서는 Widening group을 봅니다.
accept나 reject마다 Decision Record가 hash chain에 기록되고, `verify-audit`이 그 chain을 검사합니다.

**Conformance.**
observation hook은 runtime이 각 Action에 실제로 한 일, 곧 Disposition을 기록합니다.
Conformance는 그 Disposition을 accepted Policy Version과 비교하고, 어긋난 곳을 violation, under_asked, over_asked finding으로 보고합니다.
replay와 검토는 Policy가 무엇을 말하는지 보여 주고, runtime이 실제로 무엇을 했는지 측정하는 것은 conformance입니다.

전체 용어집은 `CONTEXT.md`입니다.

## Evidence

<!-- evidence-numbers
classifier: 0.2.6
snapshot.sessions: 1,036
snapshot.actions: 34,940
snapshot.evaluated: 34,033
policy-a.allow: 17,801
policy-a.ask: 16,212
policy-a.deny: 20
adoption.groups: 24
bp-scene.actions: 9
-->
아래 수치는 모두 고정된 corpus snapshot 하나(Session 1,036개, dedupe 후 Action 34,940개), classifier 0.2.6, 수정한 Environment Profile(policy A)에서 나왔습니다.
각 evidence 문서는 첫 줄에 classifier version을 적습니다.
이전 classifier version의 수치는 그 문서의 "Previous version" 절에만 남습니다.
자세한 내용, 가린 group 표, hash는 `docs/evidence/adoption-preview.md`, `docs/evidence/gate2-replay.md`, `docs/evidence/conformance.md`에 있습니다.

### 최초 도입 미리보기 (첫 Policy)

| 평가한 Action | allow | ask | deny | Adoption Group |
| ---: | ---: | ---: | ---: | --- |
| 34,033 | 17,801 (52.3%) | 16,212 (47.6%) | 20 (0.06%) | 24 (ask 22, deny 2) |

allow 52.3%와 ask 47.6%의 합이 99.9%인 것은 반올림 때문입니다.
나머지가 deny입니다: Action 20개이며, 표에서는 0.06%, 소수점 한 자리까지 보여 주는 화면 tile에서는 0.1%입니다.
ask 비율이 높은 이유는 두 가지입니다.
기본 template에는 workspace 밖의 read, write, execute를 allow하는 Rule이 없어서, 그런 Action은 기본값인 ask가 됩니다.
또 classifier가 분석하지 못하는 program의 `execute`는 Rule이 ask합니다.
allow 비율에는 workspace 안의 경로로 지정한 script가 들어 있습니다.
`allow_workspace_execute`는 이런 script를 읽지 않고 allow합니다.
allow 비율의 이 부분은 명령 인식 범위가 넓어져서 생긴 것이며, 그 script가 안전하다는 뜻이 아닙니다.
표는 Policy가 이 corpus에 대해 말하는 결과를 그대로 보여 줍니다.
미리보기 전체를 검토하는 데 Adoption Group마다 하나씩, Verdict 24개가 들었습니다.
API로 journey를 새 volume에서 다시 실행했을 때도 같은 수치가 나왔고, `verify-audit`은 Decision Record chain이 온전함을 확인했습니다.

### Change Review (github.com/** 장면)

핵심 장면은 draft가 host 전체 GitHub pattern으로 `trustedRemotes`를 넓힌 뒤, 다른 owner의 repository에서 fetch하는 Action입니다.

이 장면은 **Action 9개**입니다: 한 repository에서 `git` fetch 5개, 다른 repository 4개에서 하나씩 `gh` fetch 4개입니다.
Zone은 `unknown_remote` → `trusted_remote`, Effect는 ask → allow로 바뀌고, severity는 critical입니다.
Action workspace 밖에서 쓴 이름 붙은 remote는 Remote Key로 풀리지 않아서, 그 pattern 아래에서도 `unknown_remote`로 남습니다.

Journey 등급: **medium**.
실제 기록에서 나온 Adoption Group과 Widening group을 검토할 수 있었고, 그 group은 예측한 장면 안에 있었습니다.
기록된 Action에서 예상 목록 밖의 Widening이 나오지 않았기 때문에 등급은 strong이 아닙니다.
이 기록의 Verdict는 사람이 아니라 Agent가 내렸습니다.

### 탐색적 정책 문장 점검

`authority probe --provider jev`는 정책 문장을 읽는 model인 Jev에게 기본 template의 각 Rule 문장을 `tests/corpus/scenarios.json`의 Scenario에 비추어 어떻게 읽는지 묻고, Scenario를 margin 순으로 정렬합니다.
측정한 set은 synthetic schemaVersion 1 Scenario 35개이며, 그중 30개는 Agent가 썼습니다.
기본 template의 Rule마다 Scenario가 3개씩 있고, explicit, implied, delegated, absent Mandate 표현에 나뉘어 있습니다.
한 번 실행한 결과 35 / 35가 예상 Effect와 일치했고, 가장 낮은 Effect margin은 0.88이었습니다.
표본 35개로는 95% 일치율을 주장할 수 없습니다.
`tests/corpus/scenarios.json`에는 schemaVersion 2 Scenario 20개도 있지만, Jev에 접근할 수 없어서 다시 실행하지 않았습니다.
probe에는 threshold도 gate 연결도 없습니다.
순위, margin이 가장 낮은 Scenario, schemaVersion 2 추가분, 한계는 [docs/evidence/probe-exploratory.md](docs/evidence/probe-exploratory.md)에 있습니다.

## 한계와 non-goal

### Non-goal

- Authority Diff는 Policy를 배포하거나 강제하지 않습니다.
  `accepted`는 검토 기록이며, runtime 설정 변경은 Authority Diff 밖에서 일어납니다.
- Authority Diff는 runtime이 평가 결과대로 동작한다고 주장하지 않습니다.
  그것은 conformance가 Runtime Observation을 accepted Policy와 비교해 측정합니다.
- Jev는 탐색용 probe(`authority probe`)에만 쓰며, replay, 검토, conformance에는 관여하지 않습니다.

Policy Version rollback, settings export, API token과 role, provider calibration, Codex parser를 비롯해 `docs/cutline.md` 13장에 나열한 작업은 범위 밖입니다.

### 한계

- **한 사람의 corpus.** 최초 도입 미리보기, replay, conformance 수치는 Principal 한 사람의 Claude Code 기록에서 나왔습니다.
- **단일 runtime.** parsing, import, hook은 Claude Code만 다룹니다.
  Codex adapter는 없습니다.
- **Agent Verdict.** 기록된 journey의 Adoption Group과 Widening group Verdict는 Agent가 내렸습니다.
  그 group에 사람이 기록한 Verdict는 없습니다.
- **최초 도입 미리보기는 runtime baseline이 아닙니다.** 미리보기는 과거 Action을 draft로 평가합니다.
  그중 어떤 Action을 runtime이 승인했는지는 알려 주지 않고, `accepted`가 runtime이 이제 그렇게 동작한다는 뜻도 아닙니다.
- **hook 관측 공백.** hook이 멈춘 동안에는 Runtime Observation이 기록되지 않고, 그 Action은 Disposition `executed_prompt_unknown`을 받습니다.
- **`over_asked`는 0에 가깝습니다.** PermissionRequest hook 입력에는 tool use id가 없습니다.
  그래서 PermissionRequest는 Session, tool 이름, tool 입력 hash로 Action과 짝을 짓고, 앞선 `pre_tool_use`가 관측된 경우에만 짝이 맞습니다.
  이 corpus에는 PermissionRequest 관측이 2개뿐입니다.
- **publish 방향.** Zone은 publish와 fetch를 구분하지 않습니다.
  `ask_external_disclosure`는 `public_remote`와 `unknown_remote`의 `push`에만 맞습니다.
  `trustedRemotes`에 등록된 registry로의 package publish는 `trusted_remote`의 `push`이며, Policy는 이를 외부 공개로 보지 않습니다.
- **worktree의 host Zone.** `workspace`는 Action의 workspace root이고, 형제 worktree 경로는 `host`로 풀립니다.
  `workspace`에서 read, write, execute를 allow하는 Rule도 그 경로에서는 ask하며, 위 ask 비율의 대부분이 여기서 나옵니다.
- **근사적인 remote 해석.** Remote Key는 명령 텍스트와 import 시점에 디스크에서 찾은 remote로 만듭니다.
  Action workspace 밖에서 쓴 이름 붙은 remote는 풀리지 않고 `unknown_remote`가 됩니다(`docs/evidence/classifier-limitations.md`, `docs/evidence/replay-limitations.md`).
- **실제 기록 demo, synthetic fixture 없음.** 기록된 journey의 `github.com/**` 장면은 기록된 Action에서 나왔습니다.
  `synthetic` fixture는 import하지 않았고, 예상 목록 밖의 Widening은 나오지 않았습니다.
  지표, 출처, 등급은 `docs/evidence/v1-metrics.md`에 있습니다.
- **Node 경로.** `install-hooks`는 upgrade하면 사라지는 versioned 경로 대신 안정적인 Node 경로를 고릅니다.
  같은 Cellar binary로 풀리는 Homebrew symlink나 vite-plus, Volta, nvm shim을 씁니다.
  이 중 아무것도 없으면 hook은 versioned 경로를 그대로 쓰고, Node를 upgrade한 뒤 동작하지 않습니다.

classifier 세부 사항, Zone publish 수, hook spool 동작은 `docs/evidence/`에 있습니다.

## 기여하기

- [AGENTS.md](AGENTS.md)에 명령, package 경계, coding 규칙, pull request를 열기 전에 실행할 검사가 있습니다.
- [CONTEXT.md](CONTEXT.md)는 용어집입니다.
  code, 문서, 이름에는 이 용어만 씁니다.
- [docs/cutline.md](docs/cutline.md)는 현재 범위이고, [docs/design.md](docs/design.md)는 목표 architecture입니다.
- [docs/adr/](docs/adr/)는 되돌리기 어려운 결정을, [docs/acr/](docs/acr/)는 승인된 architecture 변경을 기록합니다.
- pull request는 [.github/PULL_REQUEST_TEMPLATE.md](.github/PULL_REQUEST_TEMPLATE.md)를 쓰고, CI가 본문을 검사합니다.
- 실제 transcript, 명령 텍스트, 경로, host 이름을 이 repository에 넣지 마세요.
  이런 자료는 `.local/` 아래에 두고, 집계 수치만 공개하세요.

## License

MIT.
[LICENSE](LICENSE)를 보세요.
