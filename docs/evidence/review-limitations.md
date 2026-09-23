# Change Review known limitations

replay run이 failed로 끝난 review는 다음 조회에서 failed가 되고, 같은 transaction에서 candidate가 철회 전이로 in_review에서 draft로 돌아가 새 review를 만들 수 있다.
사람용 철회 버튼은 없다.

replay 완료 저장이 한 statement의 bind parameter 한도(65,534)를 넘던 결함은 실제 corpus 여정에서 발견되었다.
기존 store 통합 test는 한도 아래의 몇 행만 저장해 이 결함을 드러내지 못했고, 지금은 20,000행을 저장하는 test가 이를 막는다.

Gate 2 widening group 검토(P′ 정책: `push`+`trusted_remote` 허용에 `trustedRemotes`를 host 전체 pattern으로 넓힌 정책의 Replay Run): 검토 시간은 agent 측정, 사람 판정 미실시.
