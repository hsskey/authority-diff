# ADR-0008 `actionKey`(sha256)를 agent_actions의 primary key로 쓴다

Status: accepted (V1). 출처: docs/cutline.md 6장(계약 변경). 기존 채택 결정의 기록이며 신규 결정이 아니다.

- Context: 같은 transcript를 다시 import하거나 local pipeline과 server가 각각 계산할 때, 같은 Action이 양쪽에서 같은 식별자를 가져야 `resultHash`를 비교할 수 있다.
- Decision: `AgentAction.id`(ULID)를 제거하고 내용에서 유도한 `actionKey`(sha256)를 primary key로 쓴다.
- Alternatives: `act_` ULID + 별도 `actionKey` 열(설계서 24장 원안). import마다 새 ULID를 발급.
- Consequences: 재import와 local/server 양쪽에서 식별자가 안정적이라 결정성 비교(I6)가 성립한다. 설계서 22.3의 ULID primary key 규칙과 달라, 그 규칙만 읽은 사람에게는 의아하다.
- Reversal trigger: 내용 충돌(같은 actionKey, 다른 Action)이 실측되거나 다인 조직에서 Principal 분리 저장이 필요해질 때.

이어 간 Session은 이전 대화를 새 transcript 파일에 복사할 수 있으므로 `sessionExternalId`를 항상 key에 넣지 않습니다. `toolUseId`가 있으면 `sha256Hex(canonicalJson([runtime, toolUseId]))`, 없으면 `sha256Hex(canonicalJson([runtime, sessionExternalId, "seq", sequence]))`를 씁니다. 여러 Session에서 같은 `actionKey`가 나오면 `occurredAt`이 가장 이른 Action을 남기고, 같으면 `sessionExternalId` UTF-16 code unit 오름차순의 첫 Action을 남깁니다. 파일 하나를 다루는 parser가 아니라 여러 Session을 모으는 소비자가 이 중복 제거를 맡습니다.