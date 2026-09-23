# Change Review known limitations

replay 요청 실패 시 candidate가 in_review에 남을 수 있으나 in_review->draft 철회 전이로 복구 가능하며, V1은 transaction machinery를 추가하지 않는다.

Gate 2 widening group 검토(P′ 정책: `push`+`trusted_remote` 허용에 `trustedRemotes`를 host 전체 pattern으로 넓힌 정책의 Replay Run): 검토 시간은 agent 측정, 사람 판정 미실시.
