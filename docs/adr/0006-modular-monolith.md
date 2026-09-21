# ADR-0006 modular monolith, PostgreSQL job queue, 상태 table이 canonical

Status: accepted. V1 note: pg-boss와 JobQueue는 V1에 없음(docs/cutline.md 3, 6장). modular monolith와 PostgreSQL 결정은 유지. 출처: docs/design.md 34장.

- Context: ingest peak 7건/초, replay 수십 초, 외부 호출 월 2,800건이다.
- Decision: process 1개, PostgreSQL 1개, pg-boss. event sourcing과 message broker는 쓰지 않는다. audit은 별도 hash chain table이다.
- Alternatives: 서비스 분리 + Kafka/Redis. SQLite 단일 파일.
- Consequences: 운영 대상이 2개다. 20배 성장까지 구조 변경이 없다. SQLite를 쓰지 않아 설치가 docker compose를 요구한다.
- Reversal trigger: 월 Action이 500만 건을 넘거나 replay가 10분을 넘을 때 worker 분리와 partition을 넣는다.
- V1 note: replay는 pg-boss job이 아니라 같은 process 안의 비동기 함수로 실행한다. audit hash chain은 V1에서 불변 Decision Record로 대체한다(docs/cutline.md 8장).
