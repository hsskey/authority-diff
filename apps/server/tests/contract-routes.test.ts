import { describe, expect, test } from 'vitest';
import { routes } from '@authority/contracts/routes';
import { buildApp } from './support/harness.ts';

// The web calls the server only through the single-source `routes` table, so
// every server-owned entry must resolve to a handler the app actually
// registers. Booting the real app and reading Hono's resolved routing table
// proves the table's method+path match what apps/server serves; drift here
// would 404 the web at runtime. The change-review routes carry frozen DTOs but
// gain their server wiring in a later milestone, so they are excluded.
const CHANGE_REVIEW_PREFIX = '/api/v1/change-reviews';

function registeredRoutes(): Set<string> {
  const app = buildApp();
  return new Set(
    app.routes.filter((route) => route.method !== 'ALL').map((r) => `${r.method} ${r.path}`),
  );
}

describe('contract route table vs apps/server', () => {
  const served = registeredRoutes();

  const serverOwned = Object.entries(routes).filter(
    ([, def]) => !def.path.startsWith(CHANGE_REVIEW_PREFIX),
  );

  test.each(serverOwned)('server registers %s', (_name, def) => {
    expect(served).toContain(`${def.method} ${def.path}`);
  });

  test('change-review routes are declared in the table but not yet wired', () => {
    const changeReview = Object.values(routes).filter((def) =>
      def.path.startsWith(CHANGE_REVIEW_PREFIX),
    );
    expect(changeReview.length).toBeGreaterThan(0);
    for (const def of changeReview) {
      expect(served).not.toContain(`${def.method} ${def.path}`);
    }
  });
});
