# ACR-0003 shell 파서 의존성과 classifier 설정

Status: accepted (2026-09-22).
절차: docs/design.md 33.3.
범위: docs/cutline.md 15장의 경계 규칙과 16.2의 허용 의존성, packages/action의 의존성과 설정 파일.
승인 근거: classifier v0 작업 지시(task-specific request.md)가 web-tree-sitter와 tree-sitter-bash 두 의존성과 fast-check(dev)를 승인하고, 이 ACR에 기록하도록 지시했다.

Bash 명령을 실제 grammar로 parse해 Operation으로 분해하려고 packages/action에 web-tree-sitter와 tree-sitter-bash(WASM grammar)를 runtime 의존성으로, fast-check를 dev 의존성으로 추가했다.
lib/domain의 순수성과 경계 규칙은 약화하지 않았다.

## 결정 1: 실제 shell grammar(web-tree-sitter + tree-sitter-bash WASM)

- 문제: 실제 기록의 90.9%가 Bash다(local 집계, 726개 transcript, Bash Action 23,516건). heredoc, 명령 치환, pipeline, 인용을 정확히 분해하지 못하면 판정의 근거가 흔들린다.
- 결정: web-tree-sitter를 정확히 0.27.0, tree-sitter-bash를 정확히 0.25.1로 고정한다. tree-sitter-bash가 배포에 포함한 prebuilt `tree-sitter-bash.wasm`을 쓴다. lib/shell이 WASM을 한 번 load하고 native node를 자체 최소 AST(lib/shell/ast.ts)로 바꿔 내보낸다.
- 0단계 실측(Node 22.23.2): WASM load 성공. 합성 명령 3개(heredoc, 명령 치환, pipeline) 모두 `rootNode.hasError === false`로 parse. parse 처리량 약 32,700건/초.
- end-to-end 실측: classifier가 초당 75,175건(6,000회, warm-up 뒤)을 분류한다. 목표는 초당 2,000건이므로 약 37배 여유다.
- 대안 A: lib/domain 안에서 손으로 shell tokenizer를 짠다. 제3자 의존성이 없어 lib/domain을 순수하게 유지하지만, 인용·heredoc·치환 처리를 다시 구현해야 하고 버그 표면이 크다. 공개 측정에서 Bash 입력의 25.9%가 다른 언어 program을 포함하므로 중첩 인용을 잘못 자르면 오분류가 그만큼 늘어난다. 채택하지 않았다.
- 대안 B: `shell-quote` 같은 경량 파서. heredoc과 명령 치환의 구조를 신뢰할 수 있게 주지 못한다. 채택하지 않았다.
- Reversal trigger: WASM이 Node 22에서 load되지 않거나 package에서 얻을 수 없으면(0단계 gate) 이 결정을 되돌리고 대안 A를 재검토한다. 현재 gate는 통과했다.

## 결정 2: native binding build를 끈다

- 문제: tree-sitter-bash는 native node binding(node-gyp)을 설치 시 build하려 한다. classifier는 prebuilt WASM만 쓰고 native binding은 쓰지 않는다. pnpm install이 ignored build script로 실패하고 `pnpm-workspace.yaml`의 `allowBuilds`에 placeholder를 남겼다.
- 결정: `pnpm-workspace.yaml`의 `allowBuilds`에서 `tree-sitter-bash: false`로 고정한다. C 컴파일러 없이 clean install(exit 0)이 된다.
- 이 변경은 소유 경로(packages/action) 밖이지만 승인된 의존성 추가의 직접적 결과이고 33.3 절차로 이 ACR이 근거를 남긴다.
- 대안: `true`로 두어 native binding을 build한다. CI에 C toolchain을 요구하고 쓰지 않는 산출물을 만든다. 채택하지 않았다.

## 결정 3: packages/action/tsconfig.json의 include 확장

- 문제: scaffold의 tsconfig include가 `schema.ts`와 `tests/**`만 담아, `index.ts`와 `lib/**`가 프로젝트 밖으로 취급됐다. `oxlint --type-aware`(tsgolint)가 이 파일들을 프로젝트 밖으로 보면서 `node:module` 타입을 로드하지 못해 `createRequire`를 error 타입으로 잡았다.
- 결정: include를 `["*.ts", "lib/**/*.ts", "tests/**/*.ts"]`로 맞춘다. 이 형태는 captain 승인(proof-isolation-approval.md 승인 2)이 네 작업에 공통으로 지정했고 다른 field는 바꾸지 않는다.
- 실측: 확장 뒤 `pnpm lint`가 통과하고 `pnpm typecheck`가 5개 package 전부 성공한다.
- 대안: `createRequire`를 `import.meta.resolve`로 바꾼다. tree-sitter-bash가 exports map이 없어(`exports: null`) resolve 자체는 되지만 `import.meta` 타입도 같은 원인으로 error 타입이 될 수 있어 근본 원인(프로젝트 include)을 두는 셈이다. 채택하지 않았다.

## 계약 예외 1건

- 승인 지시에 따라 `packages/action/schema.ts`의 `ToolCallSchema.toolInputRedacted`에 입력 형식 TSDoc을 추가했다. schema 값은 바꾸지 않았다. 이 한 건은 request.md가 명시적으로 승인했고 별도 ACR이 필요 없다고 지시했다. 다른 schema 계약은 고정 상태 그대로다.

## 경계

- lib/shell만 web-tree-sitter를 import한다. lib/domain은 제3자 import가 없고 kernel과 자체 AST(lib/shell/ast.ts의 type)만 쓴다.
- `pnpm lint:boundaries`(cruise, read-only)가 위반 없이 통과한다(46 module, 106 dependency).

## 의존성

- 추가(packages/action): `web-tree-sitter@0.27.0`, `tree-sitter-bash@0.25.1`(runtime), `fast-check@4.10.2`(dev).
- fast-check는 request.md와 common.md가 프로젝트 전체에 승인한 property test 도구다. 다른 lane도 같은 정확한 version을 쓸 수 있게 최신 지원 version으로 고정해 보고한다.

## 범위 밖

- Codex parser, 다른 runtime의 parser.
- measure, replay-local(별도 지시 전까지 구현하지 않음).
