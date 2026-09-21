# ADR-0007 승인 근거는 hash로 재현 가능해야 한다

Status: accepted (Target + V1). 출처: docs/design.md 34장.

- Context: 승인 기록이 의미를 가지려면 승인 당시 무엇을 봤는지 나중에 증명할 수 있어야 한다.
- Decision: Policy Version은 `contentHash`, Replay Run은 `inputsHash`와 `resultHash`를 가지고 승인 audit event가 이 값들을 담는다. replay는 같은 입력에 같은 결과를 내야 한다.
- Alternatives: 승인 시점의 화면 snapshot 저장. 결과 전체 복제 저장.
- Consequences: replay에 비결정적 요소(시각, 난수, 모델 호출)를 넣을 수 없다. 이 제약이 ADR-0005와 맞물린다.
- Reversal trigger: 없음. 이 결정을 버리면 제품의 승인 기록이 증거가 되지 못한다.
- V1 note: kernel의 `lib/domain`과 `lib/app`은 `new Date()`, `Date.now()`, `Math.random()` 사용이 lint로 금지되고 Clock port로만 시각을 얻는다. 이 규칙이 결정성을 강제한다.
