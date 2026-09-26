# ACR-0020 Same-package import aliases

Status: proposed (2026-09-27).
Procedure: docs/design.md 33.3.
Scope: every workspace `package.json` under `packages/`, `apps/`, `tools/`; `.oxlintrc.json`; `scripts/oxlint-import-depth.ts`; `scripts/prove-lint.ts`; `scripts/prove-boundaries.ts`.

Relative imports that climb two or more directories inside one workspace package are replaced by package-local aliases, and a lint rule keeps them out.
The alias convention is a new repository-wide structure and adds a lint rule with its own plugin file, so it is recorded here.

## Context

- A survey of every relative import going two or more levels up found 165.
  108 stay inside their own workspace package; 57 leave it to reach shared repo-root test data (`tests/fixtures`, `tests/corpus`, `tests/workloads`), `scripts/`, or another package's file.
- All 55 same-package deep imports in `apps/*` target files under `src/`.
- All 53 same-package deep imports in `packages/*` target the package-root `schema.ts` (`lib/<layer>/x.ts` importing `../../schema.ts`); none targets `lib/`.
- The alias was first requested as `@/`, mapped through TypeScript `paths` to the package root in packages and to `src/` in apps.
  That spelling does not work here.
  `paths` is a per-tool resolution feature, and the tools that run this code disagree on which tsconfig applies: tsx reads `paths` only from the tsconfig of its working directory, never from the importing file's nearest tsconfig.
  Run from the repository root (the CLI, `tools/`, `scripts/`), a package's `@/` import fails with `MODULE_NOT_FOUND`.
  Run from `apps/server`, as the Docker start command does, a package's `@/` import silently resolves against the server's own `@/` mapping and loads the wrong module without any error; this was reproduced with two packages that each map `@/`.
  dependency-cruiser also takes a single tsconfig, so a per-package `@/` cannot be expressed for the boundary check either.

## Decision

- Each workspace package declares Node subpath imports in its `package.json` `imports` field, with the same names in every package:
  - packages: `#lib/*` maps to `./lib/*`, and the exact key `#schema` maps to `./schema.ts` (each only where that path exists);
  - apps: `#src/*` maps to `./src/*`;
  - `tools/local-pipeline`: `#lib/*` maps to `./lib/*`.
- Node resolves `imports` against the nearest `package.json` of the importing file, so every runtime and tool here (Node 22 and tsx, TypeScript `NodeNext` and `Bundler`, Vite, Vitest, esbuild through tsup and drizzle-kit, dependency-cruiser) resolves an alias to the importing package and cannot reach another package through it.
  Node 22 rejects a key starting with `#/`, so the aliases carry a name after `#`.
  `#lib/*` and `#src/*` are unified names rather than per-package names, so an alias never reads like a cross-package import; cross-package imports stay `@authority/<package>` root entries.
- `#schema` exposes one root file only; no alias maps the whole package root, so other root files are not reachable through an alias.
- The Oxlint JS plugin rule `authority/no-deep-relative-import` (`scripts/oxlint-import-depth.ts`) reports a relative import that goes up two or more levels and resolves inside the importing file's workspace package.
  `./x` and `../x` stay allowed.
  Relative imports that leave the package are not same-package imports and stay as they are; crossing into another package remains dependency-cruiser's job.
- `scripts/prove-lint.ts` injects a violation for the new rule.
  `scripts/prove-boundaries.ts` adds two alias-based violations (a `lib/domain` file and a pure entry point each reaching `lib/infra` through `#lib/*`) and copies the live package manifests into its synthetic tree, so a broken alias mapping makes those proofs fail instead of passing silently.

## Alternatives

- `@/` through TypeScript `paths`: wrong-module resolution under tsx as described above, and no per-package form for dependency-cruiser.
- `@/` through `paths` in `apps/web` only, with `#` aliases elsewhere: two spellings for one convention.
- Keep `@/` everywhere with a custom Node loader or a new resolver dependency: more machinery and a new dependency for a naming preference.
- A single root key such as `#pkg/*` mapping `./*`: exposes every package-root file through the alias.
- Self-reference by package name (`@authority/<package>/schema`) from inside the package: reads like a cross-package import.
- `no-restricted-imports` patterns: a specifier regex cannot tell whether a `../../` path stays inside the package, so an exact rule needs the importing file's location.

## Consequences

- No runtime behavior, schema, contract, table, or stored output changes; the CLI and web bundles are byte-identical before and after the rewrite.
- New code inside a package imports a target two or more levels up through `#lib/*`, `#schema`, or `#src/*`.
- The Oxlint JS plugin API is alpha and not covered by semver; `pnpm lint:prove` detects a plugin that stops firing.
