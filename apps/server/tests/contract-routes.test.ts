import { describe, expect, test } from 'vitest';
import { routes } from '@authority/contracts/routes';
import { buildApp } from './support/harness.ts';

// The web calls the server only through the single-source `routes` table, so
// every server-owned entry must resolve to a handler the app actually
// registers. Booting the real app and reading Hono's resolved routing table
// proves the table's method+path match what apps/server serves; drift here
// would 404 the web at runtime.
function registeredRoutes(): Set<string> {
  const app = buildApp();
  return new Set(
    app.routes.filter((route) => route.method !== 'ALL').map((r) => `${r.method} ${r.path}`),
  );
}

describe('contract route table vs apps/server', () => {
  const served = registeredRoutes();

  const serverOwned = Object.entries(routes);

  test.each(serverOwned)('server registers %s', (_name, def) => {
    expect(served).toContain(`${def.method} ${def.path}`);
  });
});
