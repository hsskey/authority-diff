# Authority Diff - V1 glossary

이 파일은 용어집 역할만 하고 구현 세부는 담지 않습니다.
파일, symbol, table, HTTP 이름도 여기 단어를 씁니다.
출처는 `docs/design.md` 13.1이며, V1 범위(`docs/cutline.md`)에 맞춰 Tier 2/3 개념을 뺐습니다.
Target Architecture 전용 용어(Mandate, Mandate Exception, Disposition, Decision Source, Scenario, Precedent, Probe Run, Decision Provider, Conformance Finding)는 V1 용어집에 없습니다.
용어집 완성은 계약 고정 시점의 사람 작업이고 이 목록은 그 입력입니다.

**Principal**:
Agent에게 작업을 맡긴 사람.
_Avoid_: user, developer, owner

**Session**:
한 runtime에서 시작부터 종료까지 이어진 Agent 실행 단위.
Claude Code에서는 transcript 파일 하나.
_Avoid_: conversation, run

**Parsed Session**:
transcript 줄을 memory에서 parse하고 redaction한 Session.
parse하지 못한 줄의 수와 관측된 Action을 함께 담습니다.

**Action**:
Agent가 실행하려 한 tool call 하나.
실행 여부와 무관하게 시도 자체를 가리킵니다.
_Avoid_: command, event, tool use

**Action Key**:
runtime의 tool use 식별자에서 결정적으로 유도한 Action 식별자.
tool use 식별자가 없을 때는 Session 식별자와 순번을 사용합니다.

**Operation**:
Action을 분해한 최소 단위.
하나의 Capability를 하나의 Target에 행사합니다.
Bash Action 하나는 Operation 여러 개를 가집니다.
_Avoid_: fragment, step, sub-command

**Capability**:
Operation이 행사하는 힘의 종류.
고정 enum.
_Avoid_: permission, action type, verb

**Target**:
Operation의 효과가 닿는 대상을 runtime에서 읽은 그대로 적은 값.
경로, host, VCS remote, package, MCP tool 등.
_Avoid_: resource, object

**Remote Key**:
VCS remote를 `host/owner/repo` 형식으로 정규화한 값.
scheme, user, port와 끝의 `.git`은 포함하지 않습니다.

**Zone**:
Target을 조직의 신뢰 경계로 분류한 값.
고정 enum.
_Avoid_: scope, boundary, trust level

**Environment Profile**:
Zone 계산에 필요한 조직의 사실 선언.
신뢰하는 host, credential 경로, protected branch 등.
_Avoid_: config, trusted infrastructure, context

**Analyzability**:
classifier가 Operation의 효과를 얼마나 확정했는지 나타내는 값.
`full`, `partial`, `none`.
_Avoid_: opacity, confidence

**Reversibility**:
Operation을 실행한 뒤 되돌릴 수 있는 정도.
_Avoid_: risk, severity

**Effect**:
명세가 Operation 또는 Action에 내리는 결과.
`allow`, `ask`, `deny`.
_Avoid_: decision(단독 사용), verdict, permission

**Rule**:
Capability, Zone, Reversibility, Analyzability 조건에 Effect 하나를 붙인 문장.
_Avoid_: policy(단수 rule을 가리킬 때), statement

**Policy**:
조직의 권한 명세를 담는 그릇.
Version들의 묶음.

**Policy Version**:
불변 문서 하나.
Rule 목록과 Environment Profile을 포함하며 content hash로 식별합니다.
_Avoid_: revision, snapshot

**Decision**:
한 Policy Version을 한 Action에 대입한 평가 결과.
Effect와 근거 Rule을 포함합니다.
_Avoid_: result, outcome

**Replay Run**:
두 Policy Version을 같은 Action 집합에 대입해 비교한 실행 1회.

**Diff Group**:
Effect가 달라진 Action을 같은 signature로 묶은 단위.
사람이 판정하는 단위입니다.
_Avoid_: cluster, bucket

**Group Key**:
Diff Group signature에서 결정적으로 유도한 식별자.

**Widening / Narrowing**:
candidate의 Effect가 baseline보다 덜 제한적이면 Widening, 더 제한적이면 Narrowing.
_Avoid_: loosening, tightening, regression

**Headline**:
Diff Group을 설명하는 고정 template의 평문 한 문장.
_Avoid_: summary, description

**Target Summary**:
Diff Group에서 Target key 상위 5개와 건수.
_Avoid_: top targets

**Verdict**:
사람이 Diff Group에 내린 판정.
`expected`, `investigate`, `unexpected`.

**Change Review**:
Policy Version 하나의 수락 여부를 결정하는 단위.
Replay Run, Verdict, 결정 기록을 묶습니다.
_Avoid_: approval request, PR

**Accept Policy Change / Reject Policy Change**:
Change Review의 두 종결 동작.
_Avoid_: Approve Review, Mark Reviewed

**Decision Record**:
정책 변경 수락 또는 반려 1건의 불변 기록.
_Avoid_: approval, activation

**Evidence Report**:
Change Review의 결정과 근거 hash를 담아 조직장이 읽는 Markdown 산출물.
_Avoid_: approval document, audit report

관계:

- Session은 Action을 여러 개 가집니다.
- Action은 Operation을 0개 이상 가집니다.
  0개인 Action(예: subagent 호출)은 평가에서 제외합니다.
- Decision의 Effect는 Operation별 Effect 중 가장 제한적인 값입니다.
- Change Review는 Replay Run 1개를 참조합니다.
