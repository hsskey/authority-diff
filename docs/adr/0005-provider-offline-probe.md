# ADR-0005 의미 판단 provider는 offline probe에만 쓰고 trace를 보내지 않는다

Status: accepted (Target). V1 상태: probe는 Tier 2. 출처: docs/design.md 34장.

- Context: Jev는 빠르고 저렴하지만 early access이고 data를 미국에서 처리한다. 개인 실험에서 효과가 확인된 용도는 정책 문장 점검이었다.
- Decision: provider가 받는 입력은 정책 산문과 가상 Scenario뿐이다. 경계 밖으로 나가는 개념은 bounded question과 분포뿐이고 provider의 `confidence`는 쓰지 않는다.
- Alternatives: replay에서 Mandate 범위 판정. 실시간 판정.
- Consequences: privacy 검토 없이 도입할 수 있고 provider를 바꿔도 다른 module이 영향을 받지 않는다. replay에서 Mandate Exception은 평가하지 못하고 표시만 한다.
- Reversal trigger: 조직 내부에 둘 수 있는 calibrated 판정 model이 나오고 범위 초과 label이 100건 이상 모였을 때.
- V1 note: probe와 Mandate/Mandate Exception 개념은 V1 범위 밖(docs/cutline.md 12장, 정정 C). Tier 2 검토 시점에만 Jev API access를 확인한다.
