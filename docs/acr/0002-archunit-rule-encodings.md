# ACR-0002 ArchUnitTS 규칙 인코딩 4건

Status: accepted (2026-09-21). 절차: docs/design.md 33.3. 범위: docs/adr/0010의 owner 표를 실제 arch test로 구현하며 생긴 인코딩 결정.

ArchUnitTS 2.5.4의 실측 표현력에 맞춰 규칙을 인코딩하면서, 원래 설계 의도와 달라진 4건을 규칙 약화 없이 기록한다.

## 변경 1: pure-entry-points를 도달(reachable) 대신 직접(direct) 규칙으로 인코딩

- 문제: 원래 pure-entry-points는 순수 entry에서 "도달 가능한" 파일에 `lib/infra` 등이 없어야 한다는 transitive 규칙이다.
  ArchUnitTS 2.5.4의 assertion API에는 transitive/reachable predicate가 없다(실측: `dependOnFiles`는 직접 edge만 검사, `reachableFrom`은 graph 리포트 전용이라 pass/fail 규칙에 쓸 수 없음).
- 결정: 순수 entry 4개(`action/index.ts`, `trace/client.ts`, `policy/evaluate.ts`, `replay/diff.ts`)와 모든 `schema.ts`가 `lib/app`, `lib/infra`, `platform`을 직접 import하지 못하게 한다(G10).
  `lib/domain`을 `lib/domain`, `schema.ts`, kernel, zod로 닫는 domain-is-pure(G8)와 함께 귀납으로 도달 성질을 얻는다.
- 대안: graph 리포트 API로 도달 집합을 직접 계산해 assertion을 만든다(별도 도구 계층).
- 결과: 원래 규칙보다 엄격하다(순수 entry가 `lib/app`을 직접 import하는 것도 막힘). 네 entry는 순수 함수라 `lib/app`이 필요 없어 실질 손실은 없다.

## 변경 2: drizzle-orm과 postgres 제한을 lint에서 arch로 이동

- 문제: drizzle-orm/postgres import 제한은 import 기반 규칙이라 docs/adr/0010의 owner 표에서 arch가 owner다.
  기존 ESLint `no-restricted-imports` 항목과 중복된다.
- 결정: ESLint에서 해당 항목을 제거하고 arch test G14(`drizzlePostgresConfined`)로 옮긴다.
  drizzle-orm과 postgres는 `lib/infra`와 `platform`에서만 import할 수 있다.
- 대안: lint에 유지(owner 둘). owner 표와 충돌한다.
- 결과: 규칙 내용은 동일하고 owner만 하나로 정리된다.

## 변경 3: 외부 module(node builtin, 비-zod third-party) 규칙은 import 텍스트로 검사

- 문제: ArchUnitTS 2.5.4는 node_modules와 node builtin을 dependency graph에서 제외한다(실측: `includeExternalDependencies()`로도 external edge 0).
  따라서 `dependOnFiles`로 `node:crypto`나 `drizzle-orm` 같은 대상을 지목할 수 없다.
- 결정: domain-is-pure(G8b), app-has-no-infra(G9b), pure-entry(G10b), drizzle/postgres(G14)의 외부 module 부분은 `.adhereTo()` custom predicate로 파일의 import 텍스트를 검사한다.
  `tests/arch/rules.ts`의 `importSpecifiers`가 statement-anchored 정규식으로 specifier를 추출한다.
- 대안: ESLint `no-restricted-imports`로만 처리(import graph 규칙을 lint와 arch로 분할, owner 둘).
- 결과: import graph 규칙의 owner가 arch 하나로 유지된다. AST가 아닌 텍스트 검사이므로 import 구문에 한정한다.

## 변경 4: package root 파일 화이트리스트를 package.json exports에서 도출

- 문제: root 파일을 `index.ts`, `schema.ts`, `client.ts`, `testing.ts` 고정 목록으로 두면 `kernel`의 공개 entry인 root `hash.ts`(package.json exports의 `./hash`, node builtin을 쓰는 crypto를 browser-safe한 `index.ts`와 분리)가 위반으로 잡힌다.
- 결정: 각 package의 root `.ts` 허용 목록을 그 package의 `package.json` `exports`에서 도출한다(N2, `tests/arch/fs-rules.ts`).
  exports에 없는 root `.ts`는 위반이다.
- 대안: 고정 목록에 `hash.ts`를 예외로 추가(package별 특수 예외가 늘어남).
- 결과: 단일 출처(package.json exports)에서 허용 root가 결정되어 package가 늘어도 규칙이 그대로 성립한다.
