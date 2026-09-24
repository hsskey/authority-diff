# ACR-0011 Tailwind v4 theme and utilities for apps/web

Status: accepted (2026-09-24). The Preflight exclusion is superseded by ACR-0012; the rest stays in effect.
Procedure: docs/design.md 33.3.5.
Scope: `apps/web` build toolchain; docs/cutline.md 15 web style convention.

`apps/web` adds Tailwind CSS v4 so new styles can be written as utilities while existing class rules keep their appearance. Preflight is not enabled.

## Context

The web app styles live in one unlayered stylesheet of class selectors. Adding utilities without a token layer would mix arbitrary values into JSX. Tailwind v4 `@theme` maps existing color, spacing, and font values onto the same names used by utilities (`bg-surface`, `text-muted`). A full `@import "tailwindcss"` would inject Preflight and reset the current look.

## Decision

Add `apps/web` devDependencies, pinned to the installed 4.3.3 line:

- `tailwindcss` 4.3.3
- `@tailwindcss/vite` 4.3.3

`apps/web/vite.config.ts` loads the Vite plugin. `apps/web/src/styles/app.css` imports only `tailwindcss/theme` into `layer(theme)` and `tailwindcss/utilities` into `layer(utilities)`, moves the existing palette and font stacks into `@theme`, and keeps current rules inside `@layer base`. Dark mode remains `prefers-color-scheme` overriding those tokens on `:root`. `scripts/check-css-policy.ts` (`pnpm lint:css`, part of `pnpm check`) allows only that CSS file, only those top-level at-rules, and `.css` import from `main.tsx`.

## Alternatives

- `@import "tailwindcss"` (theme + preflight + utilities). Rejected: Preflight would change existing layout and typography.
- Tailwind v3 `tailwind.config.js` plus PostCSS. Rejected: v4 CSS-first `@theme` matches the token move and avoids a second config file.
- Keep class CSS only. Rejected: the requested surface is utilities in JSX with shared tokens.

## Reversal triggers

- If the Vite plugin cannot compile the layered imports without Preflight, remove `@tailwindcss/vite` and stop using utilities until a replacement is recorded.
