# ADR-0004 제한이 우선하는 순서 무관 평가, 기본 Effect는 ask, 자체 engine

Status: accepted (Target + V1). 출처: docs/design.md 34장.

- Context: Rule 순서에 의존하면 diff 해석이 어렵고 agent 구현이 갈린다. OPA와 Cedar라는 기성 engine이 있다.
- Decision: `deny > ask > allow`, 매칭이 없으면 `ask`. 약 100줄의 순수 함수로 직접 구현한다.
- Alternatives: first-match 순서 평가. Cedar(permit/forbid, 기본 deny)를 WASM으로 내장.
- Consequences: I1, I2를 property test로 증명할 수 있다. 넓은 `ask`를 좁히려면 그 Rule을 직접 고쳐야 한다. Effect가 3개 값이라 Cedar의 2개 값 모델에 그대로 맞지 않는다.
- Reversal trigger: Rule이 200개를 넘거나 Principal, 팀 계층 조건이 필요해질 때 Cedar로 옮긴다.
