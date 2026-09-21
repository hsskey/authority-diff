# ADR-0010 경계와 naming 규칙의 owner는 ArchUnitTS arch test, 구문과 타입은 lint

Status: accepted (2026-09-21). 출처: docs/design.md 21장을 대체. 절차: docs/design.md 33.3.

- Context: docs/design.md 21장은 "경계 규칙의 출처가 둘이면 어느 쪽이 맞는지 다시 판단해야 한다"는 이유로 ArchUnitTS를 배제하고 dependency-cruiser 하나로 import graph를 강제했다.
  dependency-cruiser 18.3.1은 typescript 7 API를 지원하지 않아 typescript 7.0.2에서 0 module만 분석하고 exit 0으로 통과한다(경계 규칙 무효화).
  ArchUnitTS(npm `archunit` 2.5.4)는 자체 typescript 5.9.3을 번들로 파싱하므로 프로젝트가 typescript 7.0.2여도 module을 정상적으로 읽는다(실측: kernel 8 module).
- Decision: import graph 규칙(누가 누구를 import하는가, 순환, 도달)과 파일/폴더 predicate의 owner는 `tests/arch/*.arch.test.ts`(ArchUnitTS, vitest 안에서 실행)로 한다.
  구문과 타입 규칙(`any`, `as`, `!`, floating promise, `switch` 완전성, `class`, `enum`, `new Date`, `process.env`, `console`, default export)의 owner는 lint로 남긴다.
  같은 invariant를 두 도구가 동시에 표현하지 않도록 검사 대상으로 owner를 하나만 정한다.
  dependency-cruiser 의존성, `.dependency-cruiser.cjs`, `scripts/prove-boundaries.ts`를 제거한다.
  공개 명령 계약 `pnpm lint:boundaries`와 `pnpm lint:boundaries:prove`는 유지하되 arch test validation(`vitest run --project arch`)과 위반 proof(`vitest run --project arch -t fires`)의 alias로 재정의한다(Fable 10.7). PR template과 CI 계약은 그대로다.
- Alternatives:
  dependency-cruiser 유지 + typescript 6 고정(docs/acr/0001). typescript 7.0.2 목표와 충돌한다.
  dependency-cruiser 유지 + ArchUnitTS는 naming만. 같은 import graph 규칙을 두 도구가 나눠 가져 출처가 둘이 된다.
  ArchUnitTS 없이 stdlib vitest test로 graph 검사. 순환과 도달 검사를 직접 구현해야 한다.
- Consequences:
  import 기반 규칙 23개를 arch test로 재작성했다(되돌리기 어려움).
  design.md 21장을 읽은 사람은 ArchUnitTS 배제 조항과의 차이에 의아할 수 있다(이 ADR이 근거).
  각 규칙은 positive fixture(통과, 매칭 파일 수 > 0)와 violation fixture(의도한 규칙 이름으로 실패)를 가진다.
  ArchUnitTS는 `allowEmptyTests` 기본값 false라 매칭 0건 규칙은 실패로 처리되어 "0건 초록"을 막는다.
- Reversal trigger: ArchUnitTS가 유지 불가능해지거나(예: typescript 파싱 중단) import graph 표현력이 부족해지면, dependency-cruiser의 typescript 7 지원 버전으로 되돌리고 owner 표를 그 도구로 옮긴다.
