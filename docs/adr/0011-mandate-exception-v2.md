# ADR-0011 PolicyDocument schemaVersion 2에서 Mandate Exception을 복원하고 probe 해석 안정성으로 gate에 연결한다

Status: proposed (draft). 구현 착수 결정이 아니다. 출처: docs/design.md 13.5, 14, 15, 16.4, 24.4, 24.6과 docs/cutline.md 6, 12장. ADR-0005, ADR-0009를 전제로 한다.

- Context:
  ADR-0009는 schemaVersion 1에서 `PolicyRule.mandateException`과 `Decision.isMandateDependent`를 뺐고, 자연어 Mandate 조건이 필요해지면 명시적인 schemaVersion 2 migration으로 추가한다고 정했다.
  ADR-0005는 Decision Provider를 offline probe에만 쓰고 replay에서 Mandate Exception을 평가하지 않는다고 정했다.
  V1의 probe는 탐색 단계다(docs/evidence/probe-exploratory.md).
  default template에는 Mandate Exception이 없어서 Scenario 35개가 모두 기대 Effect와 일치했고, 32개는 Effect margin이 1.00이었다.
  Effect 질문은 거의 움직이지 않았고 해석이 갈린 곳은 `mandate_reading` 질문이었다.
  delegated 표현의 Mandate 8개는 `implied` 4개, `not_authorized` 4개로 나뉘었다.
  같은 문서는 policy prose가 Rule의 reversibility와 analyzability 조건을 빠뜨려 Rule이 실제보다 넓게 읽힌다는 한계도 기록했다.
  반복 실행과 두 번째 독자 비교는 없다.
  즉 지금 probe는 순위만 보여 주고, 자르는 기준(threshold)도 gate 연동도 없다.
  Mandate Exception을 되살리려면 네 가지를 함께 정해야 한다.
  schema와 migration, probe가 측정할 수 있는 문장 조건, 그 측정을 믿을 근거인 golden set과 threshold, 그리고 측정 결과가 Change Review gate에 어떻게 연결되는지다.
  이 문서는 그 네 가지의 초안이다.

- Decision (schemaVersion 2):
  `PolicyDocument.schemaVersion`은 `1 | 2`의 discriminated union이 된다.
  schemaVersion 2의 `PolicyRule`은 설계서 24.4의 `mandateException: { clause: string(10..300) } | null`을 가진다.
  field는 optional이 아니라 nullable이고, 값이 있으면 그 Rule의 Effect는 `ask`여야 한다.
  Rule 하나에 Mandate Exception은 최대 1개다.
  `OperationDecision.isMandateDependent`와 `Decision.isMandateDependent`를 복원한다.
  `isMandateDependent`는 Effect가 `ask`이고 matched `ask` Rule 전부가 Mandate Exception을 가질 때만 true다.
  예외가 없는 `ask` Rule이 함께 걸리면 false다.
  decidingRule 선택은 설계서 13.5대로 "Mandate Exception이 없는 Rule 우선, 그다음 ruleId 사전순"으로 되돌린다.
  schemaVersion 1 문서에서는 모든 Rule에 Mandate Exception이 없으므로 이 규칙이 ruleId 사전순과 같은 결과를 낸다.
  replay는 Mandate Exception을 평가하지 않는다(ADR-0005).
  Mandate-dependent Action의 Effect는 `ask`로 남고 `isMandateDependent` 표시만 붙는다.
  Diff Group과 Adoption Group은 signature를 바꾸지 않고 group 안의 근거로 `mandateDependentCount`를 싣는다.
  Adoption Group signature `[effect, capability, zone]`(ADR-0010)은 그대로다.
- Decision (migration):
  저장된 schemaVersion 1 Policy Version은 다시 쓰지 않는다.
  그 `contentHash`는 Replay Run의 `inputsHash`와 Decision Record의 hash chain이 참조하기 때문이다.
  schemaVersion 1 문서는 계속 parse되고, 평가기는 모든 Rule의 `mandateException`을 null로 읽는다.
  schemaVersion 2로 올리는 방법은 새 `draft` Policy Version을 만드는 것 하나다.
  변환은 각 Rule에 `mandateException: null`을 더하는 순수 함수이고, 새 version은 다른 version과 같은 Change Review를 거쳐야 `accepted`가 된다.
  schemaVersion 1 문서만 입력으로 쓰는 Replay Run은 복원 전후로 `inputsHash`와 `resultHash`가 같아야 한다.
  이 invariant를 어떻게 지킬지(hash 입력에서 새 field를 어떻게 다룰지)는 구현 ACR에서 정한다.
  `renderPolicyProse`는 schemaVersion 2에서 Mandate Exception clause를 Rule 문장 안에 렌더링한다.
  같은 변경에서 reversibility와 analyzability 조건도 렌더링한다.
  prose가 조건을 빠뜨리면 probe는 정책 문장이 아니라 renderer의 누락을 측정하게 된다.

- Decision (probe가 측정하는 문장 조건):
  "해석이 안정적인 Mandate Exception"은 아래 조건을 모두 만족하는 clause다.
  조건은 Probe Run 결과(설계서 24.6의 `ProbeResult`)와 Probe Run 사이의 비교만으로 계산할 수 있어야 한다.
  provider의 `confidence`는 쓰지 않는다(설계서 2.3). 분포에서 직접 계산한 `pTop`과 `margin`만 쓴다.
  - S1 구조: clause가 붙은 Rule의 Effect는 `ask`이고 rationale이 있다. 이 조건은 schema 검증이 판정하고 모델을 쓰지 않는다.
  - S2 일치: clause를 대상으로 하는(`targetRuleId`가 그 Rule인) Scenario마다 Q1 `effect`의 top 선택이 기대 Effect와 같다.
  - S3 한 가지로 읽힘: 같은 Scenario에서 Q1 `pTop >= thresholdTop`이다. `thresholdTop`이 없으면(`advisory_only`, `uncalibrated`) 이 조건은 판정하지 않고 margin 순위만 보여 준다.
  - S4 두 질문의 정합: Q1이 `allow`이면 Q2 `mandate_reading`의 top 선택이 `explicit`이다. Q1 `allow`와 Q2 `not_authorized`가 함께 나오면 정합이 깨진 것이다. Mandate Exception의 정의가 "Mandate가 명시적으로 허락하면 `allow`"이기 때문이다.
  - S5 국소성: 한 clause를 고친 뒤 전체 Scenario를 다시 돌렸을 때, 다른 Rule을 대상으로 하는 Scenario 중 top 선택이 바뀌거나 `pTop`이 `thresholdTop` 아래로 내려간 것이 없다. 두 Probe Run을 Scenario 단위로 비교해 계산한다(설계서 15.4의 "옆 항목" 관찰, docs/cutline.md 12장의 확장 증거).
  - S6 반복성: 같은 Policy Version, 같은 Scenario, 같은 provider model version으로 Probe Run을 3회 돌렸을 때 Q1 top 선택이 모두 같다. `pTop`의 범위(최대 - 최소)는 조건이 아니라 측정값으로 함께 기록하고, 허용 폭은 반복 측정 data가 생긴 뒤 정한다.
  Q1만 calibration 대상이다.
  ask Rule에 Mandate Exception이 적용되는지는 Q1의 `allow` 대 `ask`가 이미 나타내므로, Q2는 S4의 정합 검사에만 쓴다.
  probe가 측정하지 못하는 것도 적는다.
  실제 Session의 Mandate가 clause를 만족했는지는 측정하지 않는다(ADR-0005, trace를 보내지 않음).
  runtime Agent가 clause를 같은 뜻으로 읽는지도 측정하지 않는다.
  사람 두 명이 같은 뜻으로 읽는지는 probe가 아니라 golden set label 절차가 확인한다.

- Decision (golden set 구성):
  golden set은 `isGolden`인 Precedent의 집합이다.
  모든 Scenario는 합성 문장이고 trace에서 나온 문자열을 담지 않는다.
  크기는 200개 이상이다(설계서 14.1, 15.1).
  threshold 채택에는 `pTop >= t` 구간에 80개 이상이 필요하고, 강화 단계에서는 그 구간에 120개 이상이 들어오는지를 확인한다.
  아래 구성 비율은 초안 값이고 검토 대상이다.
  - 100개 이상은 Mandate Exception이 있는 `ask` Rule을 대상으로 한다. 그 안에서 Mandate 표현 4종(explicit, implied, delegated, absent)이 각각 20개 이상이다. 표현 분류는 docs/evidence/probe-exploratory.md의 정의를 따른다.
  - 나머지는 정책의 모든 Rule을 한 번 이상 대상으로 하고, 기대 Effect `allow`, `ask`, `deny`가 각각 30개 이상이다. `targetRuleId`가 null인 기본 Effect(`ask`) Scenario도 포함한다.
  - 탐색 실행에서 margin 1.00이 32/35였다. Mandate Exception이 없는 쉬운 Scenario가 대부분이면 threshold가 쉽게 나오지만 clause의 해석 안정성에 대해서는 알려 주는 것이 없다. 위 비율은 그 편향을 막기 위한 하한이다.
  label 절차는 아래와 같다.
  - 기대 Effect는 policy owner가 정한다(설계서 15.5의 한계: 일치율은 owner 의도와의 일치다).
  - Scenario 문장을 쓴 사람이나 agent는 기대 Effect를 정하지 않는다. 탐색 실행에서 작성자가 기대 Effect도 정한 것을 한계로 기록했기 때문이다.
  - 두 번째 사람이 golden 후보 전부에 독립적으로 label을 붙인다. owner와 label이 다르면 그 Scenario는 golden set에서 빼고 "사람 사이에서 해석이 갈린 사례"로 기록한다. 이 기록은 docs/cutline.md 12장의 세 번째 확장 증거다.
  calibration 1회는 golden set의 hash를 함께 저장한다.
  golden set에 Scenario를 더하거나 빼면 새 calibration이다.

- Decision (threshold 산출, 설계서 15장):
  `thresholdTop`은 상수가 아니라 provider와 provider model version마다 golden set에서 산출한다.
  절차는 설계서 15.2 그대로다.
  golden set 전체를 judge해 `(pTop, judgedEffect)`를 얻는다.
  후보 `t`를 `{0.50, 0.55, ..., 0.95, 0.97, 0.99}`에서 오름차순으로 검사한다.
  `B(t) = {pTop >= t}`, `n = |B(t)|`, `k`는 `B(t)` 안의 일치 수다.
  `n >= 80`이고 `wilsonLowerBound(k, n) >= 0.95`인 첫 `t`를 채택한다.
  없으면 `thresholdTop = null`이고 provider 상태는 `advisory_only`다.
  coverage, ECE(equal-mass 10 bin), Brier, bin별 평균 `pTop`과 일치율을 함께 저장한다.
  수치의 근거는 아래와 같다.
  - Wilson 95% 하한이 0.95 이상이려면 오류 0건에 73개, 1건에 110개, 2건에 142개, 3건에 173개가 필요하다.
  - 최소 구간 80개에서는 오류 0건일 때 하한 0.954, 1건일 때 0.933이다. 80~109개 구간은 오류 0건만 통과한다.
  - 30/30은 0.887, 35/35는 0.901이다. 지금 탐색 결과로는 95%를 주장할 수 없다.
  - 놓친 모호성 1건의 비용(사고 조사 30분 이상, 외부 전송이면 되돌릴 수 없음)이 불필요한 확인 1건(약 1분)의 30배 이상이다(설계서 15.3). 그래서 threshold는 확인을 더 요구하는 쪽으로 두고 coverage가 0.4 미만이어도 채택한다.
  - `trusted`는 하한 0.95에서 들어가고 0.93 아래에서 `degraded`로 나온다. 경계에서 상태가 반복해 바뀌지 않게 하는 간격이다(설계서 15.5).
  provider model version이 바뀌면 재측정 전까지 `degraded`다.
  재측정 주기는 설계서 14.1의 주 1회다.

- Decision (gate 연결):
  probe blocker는 candidate 문서에 Mandate Exception이 1개 이상 있을 때만 적용한다.
  schemaVersion 1 문서와 clause가 없는 schemaVersion 2 문서는 지금 gate 그대로다. replay가 Effect를 전부 결정하기 때문이다.
  Probe Run은 candidate의 `contentHash`에 묶인다. 정책을 한 곳 고치면 새 Policy Version이고 Scenario 전체를 다시 돌린다.
  Scenario verdict는 설계서 15.4의 `pass`, `conflict`, `ambiguous`, `suggested`, `unevaluated`를 쓴다.
  blocker code는 아래 세 개다.
  - `probe_incomplete`: candidate `contentHash`에 완료된 Probe Run이 없거나 `unevaluated` Scenario가 있고 면제가 없다(설계서 16.4).
  - `precedent_conflict`: Precedent 중 `conflict` verdict가 있다(설계서 16.4). 정책 문장이나 기대 Effect를 고쳐 새 review를 만들어야 한다.
  - `probe_unconfirmed`: 사람의 확정이 필요한 Scenario가 남아 있다. provider가 `trusted`가 아니면 모든 Scenario가 대상이고, `trusted`이면 기대 Effect 없는 `ambiguous`가 대상이다. 설계서 16.4에 없는 code이고 설계서 15.4, 15.5의 "확정 요구"를 gate에서 보이게 하려고 더한다.
  S4 정합이 깨진 Scenario와 S5 국소성이 깨진 Scenario는 blocker가 아니라 Evidence Report의 경고로 싣는다. 판정 기준 data가 쌓이기 전에 gate를 닫는 조건으로 쓰지 않는다.
  면제는 `unevaluated`(provider 호출 실패)에만 허용한다. `conflict`와 `probe_unconfirmed`는 면제할 수 없다.
  면제 사유, Probe Run의 `resultHash`, calibration id, provider 상태를 Decision Record에 넣어 audit hash chain에 남긴다(`docs/acr/0006-review-decision-hash-chain.md`의 확장이며 구현 ACR 대상).
  probe 결과는 replay Effect, Diff Group, Adoption Group을 바꾸지 않는다. review를 닫거나 여는 근거로만 쓴다.
  gate 연결은 calibration 기록이 1개 이상 있은 뒤에만 켠다.

- Decision (착수 순서):
  이 초안은 아래 조건이 채워질 때 단계별로 accepted로 바꾼다.
  - schemaVersion 2 복원: docs/cutline.md 12장의 첫 번째 증거(작성자가 probe 결과로 문장을 실제로 고친 사례 3건 이상)와 세 번째 증거(두 번째 사람의 해석이 작성자와 다른 Scenario 1건 이상)가 확인될 때. ADR-0009의 reversal trigger("probe가 가치를 보임")에 해당한다.
  - golden set과 calibration: 두 번째 증거(schemaVersion 2 이후 실제 정책에 Mandate Exception 2개 이상)까지 확인될 때.
  - gate 연결: calibration 기록이 생긴 뒤.
  지금은 세 증거 모두 없다. 탐색 실행은 기대 Effect 불일치 0건이고 두 번째 독자 비교가 없다.

- Alternatives:
  Mandate Exception 없이 더 좁은 `allow` Rule로 표현하기. deterministic이지만 "Principal이 명시적으로 요청했을 때"라는 조건은 Capability, Zone, reversibility로 표현할 수 없다.
  replay에서 Decision Provider로 Mandate Exception을 평가하기. 실제 Mandate와 명령이 밖으로 나가고 정답 label이 없다(ADR-0005).
  schemaVersion 1을 제자리에서 확장하기(field 추가 후 `contentHash` 재계산). 저장된 version, Replay Run, Decision Record가 참조하는 hash가 깨진다.
  provider `confidence`나 고정 상수를 threshold로 쓰기. `confidence`는 정답 확률이 아니고(설계서 2.3), 상수는 provider와 model version마다 다른 calibration을 반영하지 못한다.
  Q2 `mandate_reading`도 calibration 대상으로 두기. 기대 `mandate_reading` label이 추가로 필요하고, 같은 정보는 Q1의 `allow` 대 `ask`에 이미 있다.
  schemaVersion 2 문서 전부에 probe blocker 적용하기. clause가 없는 문서는 replay가 Effect를 전부 결정하므로 probe가 막을 근거가 없다.
  S4, S5를 처음부터 blocker로 두기. 기준값을 정할 반복 측정 data가 아직 없다.
- Consequences:
  `PolicyDocumentSchema`, `DecisionSchema`, `OperationDecisionSchema`, `GateBlockerCodeSchema`, `review_decisions`가 바뀐다. 모두 schema 계약이라 구현 전에 ACR이 필요하다.
  schemaVersion 1과 2가 공존한다. 평가기, prose renderer, policy editor가 두 version을 모두 읽어야 한다.
  Mandate Exception을 쓰는 정책의 Change Review는 golden set 200개와 사람 두 명의 label을 전제로 한다. 첫 확정에 사람 시간이 들지만 확정한 Scenario는 Precedent로 남아 이후 version의 regression 기준이 된다.
  threshold를 같은 golden set에서 고르고 그 set에서 일치율을 보고하므로 보고한 일치율은 in-sample 값이다. 주 1회 재측정과 model version 변경 시 재측정이 이를 보완한다.
  probe는 문장 해석의 안정성만 말한다. Evidence Report는 probe 절에 "Mandate Exception이 실제 Session에서 적용됐는지는 평가하지 않았음"을 고정 고지로 싣는다.
- Reversal trigger:
  calibration이 반복해서 `advisory_only`로 끝나면(provider가 golden set에서 threshold를 산출하지 못하면) gate 연결을 철회하고 probe를 참고 절로 되돌린다.
  두 번째 사람의 label 불일치가 golden 후보의 상당 부분을 차지하면 Mandate Exception의 문장 형식("보수적인 기본값 + 구체적인 예외 1개", 설계서 13.5)부터 다시 검토한다.
  실제 정책에서 Mandate Exception이 쓰이지 않으면 schemaVersion 2를 도입하지 않고 ADR-0009를 유지한다.

- 열린 질문:
  golden set 구성 비율(Mandate Exception 대상 100개, 표현별 20개, Effect별 30개)의 값.
  `probe_unconfirmed`를 별도 code로 둘지, `probe_incomplete`에 포함할지.
  S6 반복 횟수 3회와 `pTop` 범위의 허용 폭.
  두 번째 labeler를 golden 후보 전부에 둘지, 표본에만 둘지.
