# Authority Diff

A modular monolith that turns past work records into the basis for Agent permission-policy changes.
The current scope is V1 (`docs/cutline.md`); `docs/design.md` is the Target Architecture.

- When `docs/cutline.md` differs from `docs/design.md`, follow the cutline. Do not write the code listed in cutline chapter 13.
- Use only the words in `CONTEXT.md`. File, symbol, and table names use the same words.
- When you must fix structure, names, or contracts: read `docs/design.md` chapters 19–28 and `docs/cutline.md` chapters 6 and 15.
- Before adding a package or importing another package: read `docs/design.md` chapter 21 and the boundary rules (`.dependency-cruiser.cjs`).
- When you would edit outside owned paths, or need a new dependency or a new structure: write an ACR under `docs/acr/` using the procedure in `docs/design.md` 33.3.
- Before making or changing a hard-to-reverse decision: read `docs/adr/`. If it meets the three ADR conditions (hard to reverse, surprising without context, a real alternative existed), add `docs/adr/NNNN-<slug>.md`.
- Write tests only at package entry points. Return expected failures as `Result`.
- Do not put real transcripts, raw commands, paths, repository names, or host names in the repo. Put outputs derived from real data under `.local/` and put only aggregate figures in the repo. Fixtures match real structure; their contents are synthetic.
- Measurement documents under `docs/evidence/` start with a corpus snapshot, classifierVersion, and resultHash on the first line. Do not mix figures from different classifier versions in one document; keep earlier-version figures only under a "Previous version" section. Figures shared across documents go in an `<!-- evidence-numbers -->` block after the stamp, and `pnpm check:evidence` (`scripts/check-evidence.ts`) checks documents for disagreement and mixed versions. The procedure for re-running a fresh volume is in `docs/evidence/adoption-preview.md`.
- `docs/design.md` and `docs/cutline.md` keep the same heading list and extracted numeric set; `pnpm check:doc-invariance` (`scripts/check-doc-invariance.ts`) fails if they drift. Product-output quotations in docs stay Korean and are marked `<!-- ko-product-output -->`.
- Before finishing work, run `pnpm check` and `pnpm lint:boundaries:prove`. If you change `apps/web`, also run `pnpm test:e2e` (Playwright; `pnpm exec playwright install chromium` is required). Screen screenshots are `pnpm e2e:visual`; that is separate from `test:e2e`, and the CI `e2e-visual` job compares against the baseline inside the Playwright Docker image. When the screen changes, retake the baseline with `--update-snapshots` in the same image (`playwright.config.ts`, linux/amd64). Use Node 22.
- `apps/web` styles: JSX uses Tailwind v4 utilities only. CSS is the single file `apps/web/src/styles/app.css` (`pnpm lint:css`) and may contain only `@import "tailwindcss"` (Preflight included), `@theme`, and `@layer base`; unused class selectors must be 0. Do not use `@apply` or new CSS classes. Extract a React component when the same utility combination appears three times. Use only `@theme` color tokens (`bg-surface`, `text-muted`); arbitrary colors are forbidden. A PR that changes the screen needs a screenshot diff.
- Write commit messages, PRs, documents, and comments in terms of purpose, not internal progress labels (work-stage numbers and the like) or personal context. Treat anything that lands in the public repository as open source.
- Branches use `<type>/<purpose>` with type one of `feat|feature|fix|bugfix|hotfix|release|chore`. Do not use author prefixes such as `ai/`, `claude/`, `codex/`, `copilot/`, `cursor/`, `fm/`, or internal progress labels.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
