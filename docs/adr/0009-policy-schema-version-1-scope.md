# ADR-0009 PolicyDocument schemaVersion 1은 V1 개념만 담는다

Status: accepted (V1). 출처: docs/cutline.md 6장 정정 C. 기존 채택 결정의 기록이며 신규 결정이 아니다.

- Context: 자연어 Mandate 조건(Mandate Exception)은 Target Architecture 개념이지만 V1은 평가하지 않는다. 미사용 field를 문서 hash 안정을 위해 예약할지, 아예 빼고 나중에 migration할지 정해야 했다.
- Decision: schemaVersion 1은 V1이 평가하는 개념만 담는다. `PolicyRule.mandateException`과 `Decision.isMandateDependent`를 뺀다. 자연어 Mandate 조건이 필요해지면 명시적 schemaVersion 2 migration으로 추가하고 이전한다.
- Alternatives: field를 남기고 V1은 읽지 않기(hash 안정 예약). Target 개념을 그대로 유지.
- Consequences: 저장 문서와 `contentHash`가 V1 개념만 반영해 정직하다. 되돌리기 어렵다(저장된 문서와 hash). 설계서 13.5, 24.4를 읽은 사람은 field가 있을 것으로 기대한다. hash 안정성 예약을 포기한 대가로 schema 정직성을 얻는 trade-off다.
- Reversal trigger: 의미 판단(probe, Tier 2)이 가치를 보여 schemaVersion 2를 도입할 때. Target Architecture(docs/design.md 13.5, 24.4, ADR-0005)는 이 개념을 유지한다.
