# ADR-0001 실행 경로 밖에 둔다

Status: accepted (Target + V1). 출처: docs/design.md 34장.

- Context: Agent 권한 제품은 tool call을 가로채 판정하는 형태가 먼저 떠오른다. Claude Code Auto Mode가 이미 그 자리에 있고 실제 기록에서 탐지 대상의 base rate는 0에 가까웠다.
- Decision: 이 제품은 어떤 tool call도 차단, 승인, 지연시키지 않는다. hook은 관측만 하고 항상 exit 0이다.
- Alternatives: `PreToolUse` gateway(방향 B).
- Consequences: 가용성 부담이 없고 도입이 쉽다. 실시간 차단 데모는 없다. 강제는 vendor 기능에 의존한다.
- Reversal trigger: 적대적 입력 비율이 높은 runtime을 지원해야 하고 vendor classifier를 쓸 수 없는 환경일 때.
