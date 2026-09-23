# ADR-0010 최초 도입 review는 baseline 없는 단일 평가이고 Adoption Group은 정책 판단 단위다

Status: accepted (V1). 출처: docs/cutline.md 5·6장과 최초 도입(Initial Adoption) review 계약. replay core에서 확정한 결정의 기록이며, policy lifecycle과 adoption review(gate, decision record)의 결정은 그 변경에서 이 문서에 덧붙인다.

- Context:
  V1의 첫 Policy Version은 accepted 상태로 seed됐고 Change Review는 accepted baseline과 candidate를 비교하는 `version_diff`만 있었다.
  조직이 처음 정책을 도입할 때는 baseline이 없고, 과거 runtime이 각 Action을 실제로 승인했는지도 transcript만으로는 알 수 없다.
  그래서 "과거에 실제로 있었던 Agent 행동에 이 최초 정책을 적용하면 앞으로 각각 allow/ask/deny 중 무엇이 되는가"를 보여 주는 별도의 Replay Run kind가 필요했다.
  이 preview에서 사람이 판정하는 단위(Adoption Group)의 signature도 정해야 했다.
  frozen corpus로 사전 측정한 결과 signature A `[effect, capability, zone, program]`은 ask/deny group 237개(1건짜리 67개)를, signature B `[effect, capability, zone]`은 23개(상위 3개가 ask/deny Action의 95.4%)를 만들었고, 두 signature 모두 group마다 deciding Rule이 정확히 1개였다.
- Decision:
  `adoption` Replay Run은 candidate Policy Version 하나를 baseline 없이 과거 Action에 대입한 단일 평가다.
  `baselineVersionId`는 null이고 `inputsHash`는 `['adoption', candidateContentHash, window, classifierVersion, actionCount, lastActionKey]`로 만든다.
  transcript의 observedOutcome(`executed`, `rejected_by_human`, `blocked_by_runtime`)을 Effect로 바꾸지 않는다. `executed`는 사람이 승인해 실행됐을 수 있으므로 baseline이 될 수 없다.
  `historical_activity` 같은 Decision Source를 새로 두지 않는다. adoption은 비교가 아니라 candidate 하나의 평가다.
  Adoption Group의 signature는 B `[effect, capability, zone]`이다. Rule은 program을 보지 않으므로 Policy가 내리는 판단 하나가 group 하나가 되고, "이 제한이 의도한 것인가"라는 adoption verdict의 판정 대상과 일치한다.
  program은 group key가 아니라 group 안의 근거다. `programSummary`(상위 10개)와 `distinctProgramCount`를 group에 싣고 `resultHash`에 포함한다. group의 `program` field는 항상 null이다.
  Change Review(`version_diff`)의 Diff Group signature는 그대로 program을 포함한다. 두 review는 다른 질문에 답한다. adoption은 "이 제한이 의도한 것인가"를, change는 "이렇게 넓어진 동작이 예상한 것인가"를 묻고, 후자는 무엇이 넓어졌는지 program까지 구체적이어야 한다. `computeDiffWith`의 signature와 `resultHash`는 바꾸지 않는다.
  Adoption Group에는 severity가 없다. widening용 `critical`을 재사용하지 않는다. allow Action은 집계만 하고 group으로 만들지 않는다. 정렬은 deny → ask → actionCount 내림차순 → sessionCount 내림차순 → groupKey다.
- Alternatives:
  signature A. group마다 program이 하나라 가장 구체적이지만 같은 Rule 판단이 최대 117개 group으로 흩어지고, "정책 수정 필요" verdict를 Policy에 반영할 단위(Rule 또는 Zone 설정)와 group이 어긋난다.
  observedOutcome을 baseline으로 쓰는 `historical_activity` Decision Source. 승인 여부를 복원하지 못한 값으로 전이를 만들게 된다.
  Change Review signature를 adoption에 맞춰 program을 빼는 것. Change Review evidence가 아직 적어 판단할 근거가 없다.
- Consequences:
  review kind별로 grouping 단위가 다르다. UI와 문서는 두 grouping을 구분해 적어야 한다.
  `ReplayRunSchema`는 kind별 discriminated union이 되고 `adoption` run의 `stats`는 `AdoptionStats`다. 기존 `version_diff`·`conformance` row는 backfill 없이 parse된다.
  Adoption Group 하나에 program이 여러 개 섞일 수 있다. group detail은 `programSummary`를 보여 줘야 "expected" 판정이 무엇을 승인하는지 드러난다.
  저장 table `replay_adoption_groups`와 `replay_adoption_assignments`가 추가된다(migration 0008).
- Reversal trigger:
  Change Review evidence가 충분히 쌓여 program이 Diff Group 판정에 실제로 필요하지 않다고 확인되면 두 signature를 B로 통일한다.
  반대로 adoption verdict가 program 단위로 갈리는 사례가 실제 corpus에서 반복되면 Adoption Group signature에 program을 넣는 것을 다시 검토한다.
  어느 쪽이든 groupKey와 resultHash가 바뀌므로 저장된 run과 verdict의 호환을 먼저 정한다.
