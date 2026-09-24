# ACR-0001 Two toolchain version exceptions

Status: superseded by ACR-0002 (2026-09-21). Change 1 (pin typescript 6.0.3) is replaced by ACR-0002 (root is 7.x; only dependency-cruiser gets 6.0.3 via packageExtensions). Change 2 (vitest test.projects) remains valid and ACR-0002 keeps it. Below is the original record.

Procedure: docs/design.md 33.3. Scope: the allowed-dependency rule and root file list in docs/cutline.md.

In the repository scaffold, the rule "allowed dependency versions are latest stable at install time" collided with architecture-boundary verification at two points. Without weakening the rule or adding a new dependency, the working version / follow-on setting of the named tool was pinned.

## Change 1: Pin typescript to exactly 6.0.3

- Problem: Latest stable at install time was typescript 7.0.2. dependency-cruiser 18.3.1 does not support typescript 7 (its own message: "not a compatible TypeScript compiler (typescript: >=2.0.0 <7.0.0)"). On typescript 7.0.2, `depcruise packages` analyzes 0 modules and passes with exit 0 — a vacuous green that voids the boundary rules.
- Decision: Pin `typescript` to exactly `6.0.3`. On typescript 6.0.3, depcruise analyzed 11 modules, and injecting a violation fixture made the rule actually fail with exit 1.
- Alternatives: Keep TS7 and replace the boundary tool with an ESLint-based one (weakens the rule, outside the allow list). Pause boundary verification until depcruise supports TS7.
- Reversal trigger: When dependency-cruiser releases a version that supports the typescript 7 API, raise typescript to latest.

## Change 2: test.projects in vitest.config.ts instead of vitest.workspace.ts

- Problem: The root file list names `vitest.workspace.ts`, but vitest 5.0.1 removed that file and the `--workspace` flag (it does not load the file, and `--workspace` is Unknown option).
- Decision: Replace it with `test.projects` on `vitest.config.ts` (the documented successor). Changing include to a non-matching pattern produced "No test files found", which showed the setting actually runs.
- Alternatives: Run `vitest run` per package (the named root file disappears). Pin vitest 3.x (downgrade; 3.x is also deprecated).
- Reversal trigger: None. The workspace file is not restored in a later vitest.
