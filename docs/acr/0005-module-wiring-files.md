# ACR-0005 Module wiring files

Status: accepted (2026-09-22).
Procedure: docs/design.md 33.3.
Scope: docs/design.md 20 (server structure).

The server gains a per-module wiring layer that constructs a module's dependencies and registers its routes through a single composition point. This supersedes the server layout in docs/design.md chapter 20 for where module composition lives.

## Context

docs/design.md chapter 20 places server route files under http/routes/<resource>.routes.ts but does not describe where the code that builds a module's dependencies and mounts its routes belongs. Without a dedicated place, each new module would wire itself in by editing the same server entry point (apps/server/src/main.ts or http/app.ts), so modules added independently collide on one shared file. A separate wiring layer removes that shared edit point.

## Decision

- Route files follow the http/routes/ convention of docs/design.md chapter 20.
- Each module's dependency construction and route registration live in apps/server/src/modules/<module>.wiring.ts, which exports a wire<Module>(app, deps) function.
- apps/server/src/composition-root.ts builds the shared dependencies and calls each module's wiring with one line per module.
- The running server invokes the composition root once from createApp.

## Consequences

- A new module adds its own wiring file and one line in the composition root, without editing main.ts or another module's code, so modules added independently do not collide on a shared server entry point.
- The modules/ directory and composition-root.ts are additions beyond docs/design.md chapter 20; this record supersedes that chapter's server layout for module composition, and route file placement under http/routes/ is unchanged.
