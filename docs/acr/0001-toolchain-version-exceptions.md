# ACR-0001 toolchain 버전 예외 2건

Status: superseded by ACR-0002 (2026-09-21). 변경 1(typescript 6.0.3 고정)은 ACR-0002가 대체한다(root는 7.x, dependency-cruiser만 packageExtensions로 6.0.3). 변경 2(vitest test.projects)는 유효하며 ACR-0002가 유지한다. 아래는 원래 기록이다.

절차: docs/design.md 33.3. 범위: docs/cutline.md의 허용 의존성 규칙과 root 파일 목록.

repository scaffold에서 "허용 의존성 version은 설치 시점의 최신 stable" 규칙이 두 지점에서 아키텍처 경계 검증과 충돌했다. 규칙을 약화하거나 새 의존성을 추가하지 않고, 지정 도구의 동작하는 버전/후속 설정으로 고정했다.

## 변경 1: typescript를 정확히 6.0.3으로 고정

- 문제: 설치 시점 최신 stable은 typescript 7.0.2였다. dependency-cruiser 18.3.1은 typescript 7을 지원하지 않는다(자체 메시지: "not a compatible TypeScript compiler (typescript: >=2.0.0 <7.0.0)"). typescript 7.0.2에서 `depcruise packages`는 0 module만 분석하고 exit 0으로 통과한다 - 경계 규칙이 무효화되는 vacuous green.
- 결정: `typescript`를 정확히 `6.0.3`으로 고정. typescript 6.0.3에서 depcruise가 11 module을 분석하고, 위반 fixture 주입 시 규칙이 실제로 exit 1로 실패함을 실측했다.
- 대안: TS7 유지 + 경계 도구를 ESLint 기반으로 교체(규칙 약화, 허용 목록 밖). depcruise가 TS7을 지원할 때까지 경계 검증 도구 중단.
- Reversal trigger: dependency-cruiser가 typescript 7 API를 지원하는 버전을 릴리즈하면 typescript를 최신으로 상향한다.

## 변경 2: vitest.workspace.ts 대신 vitest.config.ts의 test.projects

- 문제: root 파일 목록이 `vitest.workspace.ts`를 명시하나 vitest 5.0.1이 이 파일과 `--workspace` 플래그를 제거했다(파일을 로드하지 않고, `--workspace`는 Unknown option).
- 결정: `vitest.config.ts`의 `test.projects`(문서화된 후속 기능)로 대체. include를 비매칭으로 바꾸면 "No test files found"가 나와 설정이 실제로 구동됨을 실측했다.
- 대안: package별 `vitest run` 개별 실행(지정 root 파일 소멸). vitest 3.x 고정(downgrade, 3.x도 deprecated).
- Reversal trigger: 없음. workspace 파일은 상위 vitest에서 복구되지 않는다.
