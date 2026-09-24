# ACR-0002 TypeScript 7 switch and lint-tool replacement

Status: accepted (2026-09-21). Replaces ACR-0001.
Procedure: docs/design.md 33.3. Scope: lint rules in docs/cutline.md chapter 15, and the allowed dependencies and config file list in 16.2.
Approval basis: toolchain switch sequenced after kernel contract changes, then the formatter.

Raise `typescript` to latest stable 7.x at install time, keep the boundary-verification tool (dependency-cruiser) but have it analyze with its own TypeScript 6.0.3, and move lint from ESLint to Oxlint. Architecture and lint constraints were not weakened.

## Change 1: Root is TypeScript 7.x; dependency-cruiser is 6.0.3

- Problem: ACR-0001 pinned `typescript` to 6.0.3 because `dependency-cruiser` does not support typescript 7 (`>=2.0.0 <7.0.0`; 0 modules analyzed on TS7). The toolchain switch's goal is root TypeScript 7.x.
- Decision: Pin root `typescript` to exactly 7.0.2, and supply `typescript: 6.0.3` only to `dependency-cruiser` via pnpm `packageExtensions` in `pnpm-workspace.yaml`.
- Measured: `depcruise --info` shows `typescript@6.0.3`, and root `tsc --version` is 7.0.2. depcruise analyzes 11 modules and the boundary proof passes.
- Alternatives: Keep the TS6 pin (conflicts with the switch goal). Remove depcruise (lose boundary verification).
- Reversal trigger: Remove packageExtensions when dependency-cruiser supports typescript 7.

## Change 2: Replace ESLint with Oxlint

- Problem: `typescript-eslint` exits with an exception on typescript 7 (`typescript-eslint does not support TS 7.0`). The TS7 switch and the linter replacement must be the same change.
- Decision: Use Oxlint instead of ESLint. Type-aware rules are handled by `oxlint-tsgolint` and run under `oxlint --type-aware`. Preserve the behavior below, not the config syntax.
- Preserved lint rules (19, `.oxlintrc.json`, all error): no-floating-promises, no-misused-promises, require-await, `new Date()` (lib/domain, lib/app), `Math.random()` (same range), `process.env` (exception for 2 named config files), type assertion (`as T`), no-unnecessary-type-assertion, no-explicit-any, no-unsafe-assignment, no-unsafe-call, no-unsafe-member-access, no-unsafe-return, no-unsafe-argument, no-console, no-non-null-assertion, switch-exhaustiveness-check, default export, `drizzle-orm` import (exception for lib/infra and platform).
- Replacement where `no-restricted-syntax` is absent: `process.env` is `node/no-process-env`, `Date.now` and `Math.random` are `no-restricted-properties`, Date use in lib/domain and lib/app including `new Date()` is `no-restricted-globals: Date` (same meaning as design chapter 23 "Date objects only inside infra". Measured: it catches value positions only, not `: Date` type positions).
- Keep existing exception paths as-is: `process.env` is allowed in `packages/platform/lib/infra/config.ts`, `apps/cli/src/config.ts`, and tooling `scripts/**` and `*.config.ts` (same as the previous ESLint config turning off `no-restricted-syntax` on those paths). `no-console` is allowed in `apps/cli/src/output.ts`, `tools/**`, `scripts/**`, `*.config.ts`. Default export is allowed in `scripts/**`, `*.config.ts`.
- Proof: `scripts/prove-lint.ts` fails a violation fixture for each of the 19 rules, and `pnpm lint:prove` runs that in CI (`pnpm check`). ESLint-related dependencies were removed only after all 19 were proved.
- Alternatives: A mixed setup that leaves ESLint for some rules (tool dual-running, split rule ownership). Not adopted.

## Change 3: Widen the boundary-check range

- `lint:boundaries` cruises `packages`, `apps`, and `tools`. The target list is defined in one place, `scripts/boundary-roots.ts`, and shared by `lint:boundaries` and `scripts/prove-boundaries.ts`.
- Boundary proofs grew from 5 to 7: (f) a pure entry transitively reaches lib/infra -> `pure-entry-points`, (g) a `tools/` file imports `packages/kernel/lib/` -> `entrypoint-boundary-from-app`.

## Dependencies

- Added: `oxlint`, `oxlint-tsgolint`, `oxfmt`, `lint-staged`.
- Removed: `eslint`, `typescript-eslint`, `eslint-plugin-import-x`, `eslint-plugin-n`.
- Kept: `dependency-cruiser` (typescript 6.0.3 supplied via packageExtensions), typescript, zod, vitest, turbo, tsx, @types/node.

## Change 4: Oxfmt and pre-commit hook

- Pre-commit runs Oxfmt (`--check`) and Oxlint on staged files only via lint-staged. It does not include typecheck, test, or depcruise. Hook install is the `prepare` script setting `core.hooksPath` to `.githooks`, and `blame.ignoreRevsFile` to `.git-blame-ignore-revs` so the first Oxfmt reformat commit does not hide `git blame`.

## Out of scope

- Introducing ArchUnitTS.
- Code inside packages other than kernel, apps, and tools.
