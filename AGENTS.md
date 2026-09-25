# Authority Diff

Authority Diff is a TypeScript modular monolith that turns past Agent work records into evidence for Agent permission-policy changes.

`CLAUDE.md` imports this file; edit `AGENTS.md` only.

## Scope and sources of truth

- `docs/cutline.md` is the current (V1) scope; `docs/design.md` is the Target Architecture.
  When they differ, follow the cutline.
- Do not build anything listed in `docs/cutline.md` chapter 13.
- `CONTEXT.md` is the glossary.
  Use only its terms in code, docs, and names of files, symbols, tables, and HTTP resources.
- `docs/adr/` records hard-to-reverse decisions; `docs/acr/` records approved architecture changes.

## Commands

Use Node 22 (`.nvmrc`) and pnpm (`packageManager` in `package.json`).
Run everything from the repository root.

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm lint:boundaries:prove
pnpm test
pnpm typecheck
pnpm lint
pnpm format:check
pnpm lint:css
pnpm lint:boundaries
pnpm check:evidence
pnpm check:doc-invariance
pnpm test:int:db:up
pnpm test:int
pnpm test:int:db:down
pnpm exec playwright install chromium
pnpm test:e2e
pnpm db:generate
```

- `pnpm check` runs typecheck, lint, format check, CSS policy, boundaries, lint proof, evidence check, doc-invariance check, and unit tests.
- `pnpm lint:boundaries:prove` inserts known violations and confirms each boundary rule still fails.
- `pnpm test:int` needs the test database from `pnpm test:int:db:up`; stop it with `pnpm test:int:db:down`.
- `pnpm test:e2e` needs the Chromium install above and starts the web dev server itself.
- Screenshot tests are the separate Playwright `visual` project.
  They run only inside the pinned Playwright image on linux/amd64, as the `e2e-visual` job in `.github/workflows/ci.yml` does.
  When the screen changes, retake the baselines with `--update-snapshots` inside that same image (`playwright.config.ts`).
- `pnpm exec tsx scripts/verify-agents-commands.ts` runs every command in the block above and fails on any non-zero exit.

## Before finishing

- Run `pnpm check` and `pnpm lint:boundaries:prove`; both must pass.
- If you changed `apps/web`, also run `pnpm test:e2e`.
- If you changed a repository or HTTP route, also run `pnpm test:int`.

## Package boundaries and the alias rule

Before you decide structure, names, or contracts, or add a package or import another package, read `docs/design.md` chapters 19-28 and `docs/cutline.md` chapters 6 and 15.
`.dependency-cruiser.cjs` enforces the boundary rules through `pnpm lint:boundaries`; Oxlint enforces the import and global restrictions.

- A package's public surface is only the files at its root (`index.ts`, `schema.ts`, `testing.ts`, and the pure entries named in cutline chapter 6).
  Everything under `lib/` and `tests/` is private.
- Import another workspace package only by its alias: `@authority/<package>` or `@authority/<package>/<root entry>` as listed in that package's `package.json` `exports`.
- Package-to-package imports follow the allow-list graph in cutline chapter 6.
- `apps/web` imports only `@authority/contracts` and `@authority/kernel`.
  `apps/cli` also imports `@authority/trace/client`.
  `tools/local-pipeline` imports only pure entries and `schema.ts`.
- `schema.ts` imports only `zod`, `@authority/kernel`, other packages' `schema.ts`, and its own `lib/`.
- `lib/domain` is pure; `lib/app` holds use cases and ports; `lib/infra` implements ports.
- Table definitions live in the owning package's `lib/infra/tables.ts`.
  Read another module's data through its public functions.

## Change control

Stop and write an ACR in `docs/acr/NNNN-<slug>.md` (what, why, alternatives, affected packages) before you do any of these, following `docs/design.md` 33.3:

- edit a file outside the paths you own (adding one registration line to an assembly file is the exception);
- add a third-party dependency or an environment variable;
- add a structure the design does not have (class, DI container, event bus, cache, new layer), a package-root entry file, or an import outside the allowed graph;
- change `schema.ts`, `events.ts`, `packages/contracts`, `CONTEXT.md`, or another package's tables;
- relax a lint, boundary, or test rule.

Proceed only after a person has approved.

Before making or changing a hard-to-reverse decision, read `docs/adr/`.
Add `docs/adr/NNNN-<slug>.md` when the decision is hard to reverse, surprising without context, and had a real alternative.

## Coding conventions

Naming is `docs/design.md` chapter 22; the TypeScript rules are chapter 23.
The ones agents miss most often:

- Files are kebab-case with role suffixes (`*.use-case.ts`, `*.port.ts`, `<port>.<tech>.ts`, `*.fake.ts`).
- Domain values are created through a Zod schema or `parse<Type>(input): Result<...>`, and are `readonly`.
- Dependencies are injected through factory functions that take a deps object (`create<Name>Module`, `create<Verb><Noun>UseCase`).
- Expected failures are `Result<T, E>`.
  Error codes are `<module>.<snake_case_reason>` from `docs/design.md` chapter 28; add new codes to the module's `<Module>Error` union.
  `throw` is only for defects.
- Branch on unions with `switch` and `assertNever`.
- External input enters as `unknown` and is parsed with Zod at the boundary.
- Domain and wire values use `T | null`; `undefined` is only for optional arguments.
- Time, ids, and randomness come from the `Clock` and `IdGenerator` ports.
- Comments state reasons only.

## Tests

- Write tests only at the three seams: package entry points, the HTTP API, and CLI commands (`docs/design.md` chapter 32).
- Tests import entry points only, never a `lib/` internal; dependency-cruiser rejects it.
- Put unit and property tests in `packages/<package>/tests/`, and integration tests in `*.int.test.ts`.
- Take expected values from hand-checked literals or a labeled corpus, not from recomputing the implementation.
- Fixtures match the real structure and hold synthetic content.

## Web styles (`apps/web`)

- JSX uses Tailwind v4 utilities only.
- The single stylesheet `apps/web/src/styles/app.css` may contain only `@import "tailwindcss"`, `@theme`, and `@layer base`, with zero unused class selectors (`pnpm lint:css`).
- Colors come only from `@theme` tokens (`bg-surface`, `text-muted`).
- Extract a React component when the same utility combination appears three times.

## Data, evidence, and generated files

- Keep outputs derived from real data under `.local/`; commit only aggregate figures.
- Change `drizzle/` only through `pnpm db:generate`, and `apps/web/src/routeTree.gen.ts` only through the TanStack Router Vite plugin.
- Measurement documents in `docs/evidence/` start with a first-line stamp naming the corpus snapshot, classifierVersion, and resultHash.
  One document states figures from one classifier version; earlier figures go only under a `## Previous version` section.
  Figures shared across documents go in an `<!-- evidence-numbers -->` block after the stamp, which `pnpm check:evidence` cross-checks.
  Re-running a fresh volume is described in `docs/evidence/adoption-preview.md`.
- `docs/design.md` and `docs/cutline.md` keep the same headings and numbers (`pnpm check:doc-invariance`).
- Quotations of product output in docs stay Korean and are marked `<!-- ko-product-output -->`.

## Do not

- Do not put real transcripts, raw command text, file paths, repository names, or host names in the repository.
- Do not hand-edit `drizzle/` migrations or other generated files.
- Do not import another package's `lib/` or `tests/`, or reach a package through a relative path.
- Do not create an `index.ts` re-export inside `lib/`.
- Do not use classes, default exports, TypeScript `enum`, `any`, `as T` casts (only `as const` and `satisfies`), or non-null `!`.
- Do not use `Date`, `Math.random()`, `process.env`, `console`, `drizzle-orm`, or `postgres` outside the files `.oxlintrc.json` allows.
- Do not name things `Service`, `Manager`, `Helper`, or `Util`.
- Do not add feature flags, `@ts-expect-error`, or lint-disable comments.
- Do not use `@apply`, new CSS classes, or arbitrary colors in `apps/web`.
- Do not leave commented-out code.

## Commits and pull requests

- Commit messages follow Conventional Commits (`feat(policy): ...`, `docs(evidence): ...`).
- Branches are `<type>/<purpose>` with type `feat`, `feature`, `fix`, `bugfix`, `hotfix`, `release`, or `chore`.
  Do not use author or tool prefixes such as `ai/`, `claude/`, `codex/`, `copilot/`, `cursor/`, or `fm/`.
- PR bodies use `.github/pull_request_template.md`; CI checks the body (`scripts/validate-pr-body.ts`).
- A PR that changes the screen includes a screenshot diff.
- Everything here is public open source.
  Describe purpose in commits, PRs, docs, and comments; leave out internal progress labels, schedules, and personal context.

## Where to read more

- `README.md`: what the product does and how to run it.
- `docs/demo.md`: the end-to-end demo.
- `docs/design.md` 19-28: modules, dependency rules, naming, TypeScript rules, contracts, schema, API, errors.
- `docs/design.md` 32: test kinds and critical invariants.
- `docs/cutline.md` 6, 13, 15: V1 architecture, excluded work, enforced rules.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
