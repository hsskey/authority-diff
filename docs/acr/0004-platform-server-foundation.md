# ACR-0004 Platform and server foundation dependencies and single-token auth

Status: accepted (2026-09-22). Approved for exactly the three foundation choices below: a required single-user `AUTHORITY_AUTH_TOKEN` Bearer secret, the `@hono/node-server` 2.1.1 adapter, and an initial Drizzle database handle.
Procedure: docs/design.md 33.3.
Scope: docs/cutline.md 6 (MVP architecture, foundational decision changes) and 8 (module changes); docs/design.md 19, 21, 25, 28, 29, 30.

This change introduces the runtime dependencies, environment variable, and platform entry points required to build the `packages/platform` and `apps/server` skeleton. It does not add business tables, business endpoints, a job queue, a token table, probe, or an observability platform.

## Context

The cutline reduces `platform` to config, db, logger, clock, and id, and reduces authentication to a single environment-variable token for a single user (docs/cutline.md 6, 8). The database client and the HTTP skeleton cannot be built without a driver and a framework. The dependency allowlist recorded in the architecture documents names these tools but they are not yet installed, so introducing them requires this record under docs/design.md 33.3.5. The single-token model has no environment-variable name assigned by the documents, so one is proposed here under the naming convention.

## Decision

### Runtime dependencies

Add only the foundation dependencies the architecture documents name, pinned to exact versions:

- `postgres` 3.4.9: PostgreSQL driver, reserved to lib/infra and platform by docs/design.md 21.2.
- `drizzle-orm` 0.45.3: the ORM designated by docs/design.md 19.2 and 21.3. The database handle is exported as a drizzle instance so that adding the first table later does not change the platform entry-point contract.
- `pino` 10.3.1: the structured logger designated by docs/design.md 30.1.
- `hono` 4.13.8: the HTTP framework designated by docs/cutline.md 6 and reserved to apps/server by docs/design.md 21.2.
- `@hono/node-server` 2.1.1: the standard adapter that runs Hono on the Node HTTP server. Bridging Web Request/Response and node http by hand is error-prone around streaming and headers, so the maintained adapter is used.

### Single-user token authentication

Add `AUTHORITY_AUTH_TOKEN` (required, secret), named per the `AUTHORITY_<area>_<name>` convention (docs/design.md 22.6). The server auth middleware compares `Authorization: Bearer <token>` against this value in constant time. The reviewer name is supplied at decision time and is kept separate from the token (docs/cutline.md 6). No role distinction is introduced because the scope is a single user.

The config parser reads only the variables this skeleton uses: `AUTHORITY_SERVER_PORT`, `AUTHORITY_DB_URL`, `AUTHORITY_DB_POOL_MAX`, `AUTHORITY_AUTH_TOKEN`, `AUTHORITY_LOG_LEVEL`. The remaining variables in docs/design.md 29 are added when their modules arrive.

### Platform entry points and reduced surface

The platform public entry points are `index.ts` and `testing.ts` (docs/design.md 19.2). `index.ts` exports the config loader, `Config` and `Secret`, and the clock, id, logger, and database factories. `testing.ts` exports deterministic fakes (fixed clock, sequential id, memory logger) for other packages' tests. Relative to docs/design.md 19.2, the job queue, HTTP client, token table, and idempotency keys are omitted (docs/cutline.md 8). Platform owns no tables in this skeleton; the `api_tokens` and `idempotency_keys` tables of docs/design.md 25 are removed by the cutline.

### Integration testing and workspace wiring

The database-connectivity integration test requires a running PostgreSQL, so it is separated into `test:int` and excluded from the CI `pnpm check`, matching the test-only database in docs/cutline.md 6 and the `test:int` split in docs/design.md 33.3. `vitest.config.ts` adds `apps/*/tests` to the unit target and excludes `*.int.test.ts` from it; `vitest.int.config.ts` runs the integration tests. The integration database uses a dedicated compose project name, a dedicated port, and tmpfs so it never collides with another stack's containers or volumes.

## Alternatives

- Export a raw `postgres` client instead of a drizzle instance. Connectivity proof is identical because the ping runs on the postgres.js path, but the first table forces the database handle contract to change to drizzle, which is an entry-point change (33.3.2) and would require another record and consumer edits.
- Run Hono on `node:http` directly instead of `@hono/node-server`. The Request/Response conversion must then be maintained by hand, which is less robust.
- Reuse the `AUTHORITY_AUTH_BOOTSTRAP_ADMIN_TOKEN` name from docs/design.md 29. Its register-then-remove meaning does not match a static single-token model and would mislead.

## Reversal triggers

- If the storage and business-logic work chooses raw SQL over drizzle, remove `drizzle-orm` from platform.
- If Hono is dropped, remove `@hono/node-server` with it.
- If the product expands to multiple users, restore the `api_tokens` table and roles of docs/design.md 25 and replace `AUTHORITY_AUTH_TOKEN`.

## Out of scope

- Business tables, business endpoints, CLI import, web, review, measure, replay-local, job queue, token table, probe, and the metric endpoint.
- Broad root tooling or documentation refactors.
- Any dependency the architecture documents do not name.
