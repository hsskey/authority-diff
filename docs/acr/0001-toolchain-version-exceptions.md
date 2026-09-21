# ACR-0001 M01 toolchain 버전 예외 2건

Status: accepted (2026-09-21). 절차: docs/design.md 33.3. 범위: docs/cutline.md 16.2 "허용 의존성"과 root 파일 목록.

M01의 "허용 의존성 version은 설치 시점의 최신 stable" 지시가 두 지점에서 M01의 핵심 요구와 충돌했다. 규칙을 약화하거나 새 의존성을 추가하지 않고, 지정 도구의 동작하는 버전/후속 설정으로 고정했다. 실측 증거는 docs/evidence/m01.md.

## 변경 1: typescript를 정확히 6.0.3으로 고정

- 문제: 설치 시점 최신 stable은 typescript 7.0.2였다. `dependency-cruiser@18.3.1`은 typescript 7을 지원하지 않는다(자체 메시지: "not a compatible TypeScript compiler (typescript: >=2.0.0 <7.0.0) ... Support for typescript@>=7 will follow when its API is published and stable"). 그 결과 `depcruise packages`가 0 modules만 분석하고 exit 0으로 통과한다. 즉 M01의 핵심 요구인 "경계 규칙이 위반에서 실제로 실패"가 무효화된다(vacuous green).
- 결정: `typescript`를 정확히 `6.0.3`으로 고정. TS6에서 depcruise가 11 modules를 분석하고 위반 주입 시 규칙이 실제로 발화(exit 1)함을 실측했다.
- 대안: TS7 유지 + 경계 도구를 ESLint 기반으로 교체(규칙 약화, allowlist 밖). depcruise가 TS7을 지원할 때까지 M01 중단(무기한).
- Reversal trigger: dependency-cruiser가 typescript 7 API를 지원하는 버전을 릴리즈하면 typescript를 최신으로 상향한다.

## 변경 2: vitest.workspace.ts 대신 vitest.config.ts의 test.projects

- 문제: cutline 16.2가 root 파일로 `vitest.workspace.ts`를 명시하나 `vitest@5.0.1`이 이 파일과 `--workspace` 플래그를 제거했다. throw를 넣은 workspace 파일이 로드되지 않고, `--workspace`는 "Unknown option"이다.
- 결정: `vitest.config.ts`의 `test.projects`(문서화된 후속 기능)로 대체. include를 비매칭으로 바꾸면 "No test files found"가 나와 설정이 실제로 구동됨을 확인했다.
- 대안: turbo가 package별 `vitest run` 구동(지정 root 파일 소멸). vitest 3.x 고정(downgrade, 3.x도 deprecated).
- Reversal trigger: 없음. workspace 파일은 상위 vitest에서 복구되지 않는다.

Firstmate/captain 승인: 두 예외 A/A 승인됨(2026-09-21).
