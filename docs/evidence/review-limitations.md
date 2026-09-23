# Change Review known limitations

replay 요청 실패 시 candidate가 in_review에 남을 수 있으나 in_review->draft 철회 전이로 복구 가능하며, V1은 transaction machinery를 추가하지 않는다.
