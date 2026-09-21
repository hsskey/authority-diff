# ADR-0002 intent 수준 명세가 canonical이고 runtime 설정은 구현물이다

Status: accepted (Target + V1). 출처: docs/design.md 34장.

- Context: replay의 기준을 "우리 명세"로 둘지 "Claude Code 설정을 모사한 결과"로 둘지 정해야 했다. Claude Code의 권한 검사 로직은 매주 바뀐다.
- Decision: Capability와 Zone 기반 명세를 기준으로 삼고 runtime matcher를 모사하지 않는다. 명세와 runtime의 차이는 conformance 관측으로 측정한다.
- Alternatives: `settings.json` rule matcher emulation.
- Consequences: vendor 변경에 덜 흔들리고 runtime을 추가하기 쉽다. replay 결과는 "명세상 차이"이지 "runtime의 실제 동작 예측"이 아니며 그 간극을 fidelity 지표로 드러내야 한다.
- Reversal trigger: fidelity가 0.8 아래에 머물고 원인이 명세 표현력의 한계일 때.
- V1 note: conformance와 fidelity 측정은 Tier 3이라 V1에 없다. R3 표현 규칙(docs/cutline.md 1장)으로 "명세상 차이"까지만 말한다.
