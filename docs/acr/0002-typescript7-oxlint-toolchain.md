# ACR-0002 TypeScript 7 전환과 lint 도구 교체

Status: accepted (2026-09-21). ACR-0001을 대체한다.
절차: docs/design.md 33.3. 범위: docs/cutline.md 15장의 lint 규칙, 16.2의 허용 의존성과 설정 파일 목록.
승인 근거: 작업 순서 재정렬 지시(kernel 계약 수정 -> toolchain 전환 -> formatter).

`typescript`를 설치 시점 최신 stable 7.x로 올리고, 경계 검증 도구(dependency-cruiser)는 유지하되 자체 TypeScript 6.0.3으로 분석하게 하고, lint를 ESLint에서 Oxlint로 옮겼다. 아키텍처와 lint 제약은 약화하지 않았다.

## 변경 1: root는 TypeScript 7.x, dependency-cruiser는 6.0.3

- 문제: ACR-0001은 `dependency-cruiser`가 typescript 7을 지원하지 않아(`>=2.0.0 <7.0.0`, TS7에서 0 module 분석) `typescript`를 6.0.3으로 고정했다. toolchain 전환의 목표는 root TypeScript 7.x다.
- 결정: root `typescript`를 정확히 7.0.2로 고정하고, pnpm `pnpm-workspace.yaml`의 `packageExtensions`로 `dependency-cruiser`에만 `typescript: 6.0.3`을 공급한다.
- 실측: `depcruise --info`가 `typescript@6.0.3`을 표시하고, root `tsc --version`은 7.0.2다. depcruise가 11 module을 분석하고 경계 proof가 통과한다.
- 대안: TS6 고정 유지(전환 목표와 충돌). depcruise 제거(경계 검증 상실).
- Reversal trigger: dependency-cruiser가 typescript 7을 지원하면 packageExtensions를 제거한다.

## 변경 2: lint를 ESLint에서 Oxlint로 교체

- 문제: `typescript-eslint`는 typescript 7에서 실행 시 예외로 종료한다(`typescript-eslint does not support TS 7.0`). TS7과 linter 교체는 같은 변경이어야 한다.
- 결정: ESLint 대신 Oxlint를 쓴다. type-aware 규칙은 `oxlint-tsgolint`가 담당하며 `oxlint --type-aware`에서 동작한다. 설정 문법이 아니라 아래 동작을 보존한다.
- 보존한 lint 규칙(14건, `.oxlintrc.json`, 전부 error): no-floating-promises, require-await, `new Date()`(lib/domain, lib/app), `Math.random()`(같은 범위), `process.env`(지정 config 파일 2곳 예외), type assertion(`as T`), no-unnecessary-type-assertion, no-explicit-any, no-unsafe-assignment, no-console, no-non-null-assertion, switch-exhaustiveness-check, default export, `drizzle-orm` import(lib/infra와 platform 예외).
- `no-restricted-syntax` 부재 대체: `process.env`는 `node/no-process-env`, `Date.now`와 `Math.random`은 `no-restricted-properties`, `new Date()`를 포함한 lib/domain·lib/app의 Date 사용은 `no-restricted-globals: Date`(설계서 23장 "Date 객체는 infra 안에서만"과 같은 뜻. value 위치만 잡고 `: Date` type 위치는 잡지 않음을 실측).
- 기존 예외 경로를 그대로 유지한다: `process.env`는 `packages/platform/lib/infra/config.ts`, `apps/cli/src/config.ts`, 그리고 tooling인 `scripts/**`와 `*.config.ts`에서 허용(이전 ESLint 설정이 이 경로에서 `no-restricted-syntax`를 껐던 것과 동일). `no-console`은 `apps/cli/src/output.ts`, `tools/**`, `scripts/**`, `*.config.ts`에서 허용. default export는 `scripts/**`, `*.config.ts`에서 허용.
- 증명: `scripts/prove-lint.ts`가 14건 각각을 위반 fixture로 실패시켜 확인하고, `pnpm lint:prove`로 CI(`pnpm check`)에서 돈다. 14건이 전부 증명된 뒤에 ESLint 관련 의존성을 제거했다.
- 대안: 규칙별로 ESLint를 일부 남기는 혼합 구성(도구 이중화, 규칙 소유 분산). 채택하지 않았다.

## 변경 3: 경계 검사 범위 확장

- `lint:boundaries`가 `packages`, `apps`, `tools`를 모두 cruise한다. 대상 목록은 `scripts/boundary-roots.ts` 한 곳에 정의하고 `lint:boundaries`와 `scripts/prove-boundaries.ts`가 공유한다.
- 경계 proof를 5개에서 7개로 늘렸다: (f) 순수 entry가 lib/infra에 전이 도달 -> `pure-entry-points`, (g) `tools/` 파일이 `packages/kernel/lib/`를 import -> `entrypoint-boundary-from-app`.

## 의존성

- 추가: `oxlint`, `oxlint-tsgolint`, `oxfmt`, `lint-staged`.
- 제거: `eslint`, `typescript-eslint`, `eslint-plugin-import-x`, `eslint-plugin-n`.
- 유지: `dependency-cruiser`(packageExtensions로 typescript 6.0.3 공급), typescript, zod, vitest, turbo, tsx, @types/node.

## 변경 4: Oxfmt와 pre-commit hook

- pre-commit은 lint-staged로 staged 파일에만 Oxfmt(`--check`)와 Oxlint를 실행한다. typecheck, test, depcruise는 넣지 않는다. hook 설치는 `prepare` script가 `core.hooksPath`를 `.githooks`로 설정한다.

## 범위 밖

- ArchUnitTS 도입.
- kernel 외 package, apps, tools 안의 code.
