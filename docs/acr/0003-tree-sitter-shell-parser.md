# ACR-0003 Shell-parser dependency and classifier settings

Status: accepted (2026-09-22).
Procedure: docs/design.md 33.3.
Scope: boundary rules in docs/cutline.md chapter 15, allowed dependencies in 16.2, and packages/action dependencies and config files.
Approval basis: adding web-tree-sitter and tree-sitter-bash as runtime dependencies and fast-check as a dev dependency, recorded in this ACR.

To parse Bash commands with a real grammar and split them into Operations, packages/action gained web-tree-sitter and tree-sitter-bash (WASM grammar) as runtime dependencies and fast-check as a dev dependency.
Purity of lib/domain and the boundary rules were not weakened.

## Decision 1: Real shell grammar (web-tree-sitter + tree-sitter-bash WASM)

- Problem: 90.9% of the real record is Bash (local aggregate, 726 transcripts, 23,516 Bash Actions). If heredoc, command substitution, pipeline, and quoting are not split accurately, the basis for judgement shakes.
- Decision: Pin web-tree-sitter to exactly 0.27.0 and tree-sitter-bash to exactly 0.25.1. Use the prebuilt `tree-sitter-bash.wasm` that tree-sitter-bash ships. lib/shell loads the WASM once and exports a native node rewritten to a minimal AST of its own (lib/shell/ast.ts).
- Initial measurement (Node 22.23.2): WASM load succeeded. All 3 synthetic commands (heredoc, command substitution, pipeline) parsed with `rootNode.hasError === false`. Parse throughput about 32,700/s.
- End-to-end measurement: the classifier classifies 75,175/s (6,000 runs, after warm-up). The target is 2,000/s, so about 37× headroom.
- Alternative A: Hand-write a shell tokenizer inside lib/domain. No third-party dependency, so lib/domain stays pure, but quoting, heredoc, and substitution would have to be reimplemented and the bug surface is large. Public measurement showed 25.9% of Bash inputs contain a program in another language, so mis-cutting nested quotes would increase misclassification by that much. Not adopted.
- Alternative B: A light parser such as `shell-quote`. It does not reliably give the structure of heredoc and command substitution. Not adopted.
- Reversal trigger: Revisit this decision and alternative A if WASM does not load on Node 22 or cannot be obtained from the package (initial gate). The current gate passed.

## Decision 2: Turn off native binding build

- Problem: tree-sitter-bash tries to build a native node binding (node-gyp) at install. The classifier uses only the prebuilt WASM and does not use the native binding. pnpm install failed as an ignored build script and left a placeholder in `allowBuilds` of `pnpm-workspace.yaml`.
- Decision: Pin `tree-sitter-bash: false` in `allowBuilds` of `pnpm-workspace.yaml`. Clean install (exit 0) works with no C compiler.
- This change is outside the owned path (packages/action) but is a direct result of the approved dependency add, and this ACR leaves the basis under the 33.3 procedure.
- Alternative: Leave it `true` and build the native binding. That requires a C toolchain in CI and produces an artifact that is not used. Not adopted.

## Decision 3: Widen include in packages/action/tsconfig.json

- Problem: The scaffold tsconfig include held only `schema.ts` and `tests/**`, so `index.ts` and `lib/**` were treated as outside the project. `oxlint --type-aware` (tsgolint) saw those files as outside the project, did not load `node:module` types, and typed `createRequire` as error.
- Decision: Set include to `["*.ts", "lib/**/*.ts", "tests/**/*.ts"]`. That shape was specified as common across four tasks; other fields are unchanged.
- Measured: After the widen, `pnpm lint` passes and `pnpm typecheck` succeeds on all 5 packages.
- Alternative: Change `createRequire` to `import.meta.resolve`. tree-sitter-bash has no exports map (`exports: null`), so resolve itself works, but the `import.meta` type can become an error type for the same reason, which would still leave the root cause (project include). Not adopted.

## One contract exception

- Per the approval, TSDoc for the input form was added on `ToolCallSchema.toolInputRedacted` in `packages/action/schema.ts`. Schema values were not changed. This one item was explicitly approved and does not need a separate ACR. Other schema contracts stay frozen.

## Boundaries

- Only lib/shell imports web-tree-sitter. lib/domain has no third-party import and uses only kernel and its own AST (types from lib/shell/ast.ts).
- `pnpm lint:boundaries` (cruise, read-only) passes with no violation (46 modules, 106 dependencies).

## Dependencies

- Added (packages/action): `web-tree-sitter@0.27.0`, `tree-sitter-bash@0.25.1` (runtime), `fast-check@4.10.2` (dev).
- fast-check is the property-test tool approved for the whole project. It is pinned to the latest supported version so other work can use the same exact version.

## Out of scope

- A Codex parser, parsers for other runtimes.
- measure, replay-local (not implemented until a separate instruction).
