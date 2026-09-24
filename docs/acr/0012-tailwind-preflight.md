# ACR-0012 Tailwind Preflight for apps/web

Status: accepted (2026-09-24). Supersedes the Preflight exclusion in ACR-0011.
Procedure: docs/design.md 33.3.
Scope: `apps/web` styles; docs/cutline.md 15 web style convention.

`apps/web/src/styles/app.css` imports the full `tailwindcss` entry, so Preflight is on.

## Context

ACR-0011 kept Preflight off because the app was styled by class rules that assumed browser defaults.
The screens now style themselves mostly with utilities, and the hand-written resets in `@layer base` duplicate what Preflight already provides.
Keeping the split `tailwindcss/theme` and `tailwindcss/utilities` imports meant every screen depended on browser defaults that differ across engines.

## Decision

- `app.css` has a single `@import "tailwindcss";` with no layer or condition. `@theme` and `@layer base` follow it.
- Two reset fixes keep the current look: `select` reverts to the browser font, and the date-time field wrapper reverts to its browser padding.
- Lists that show markers opt back in with `list-disc` or `list-decimal`.
- `scripts/check-css-policy.ts` (`pnpm lint:css`) rejects any other `@import`, including the split theme and utilities imports.

## Alternatives

- Keep the split imports without Preflight. Rejected: each screen keeps depending on browser defaults, and the base layer keeps hand-written copies of Preflight rules.
- Import `tailwindcss/preflight` separately next to theme and utilities. Rejected: three imports with explicit layers restate what the single entry already declares in the same order.

## Reversal triggers

- If a screen cannot be restored to its screenshot baseline with utilities or a reset fix, record the intended change with before and after screenshots instead of turning Preflight off.
