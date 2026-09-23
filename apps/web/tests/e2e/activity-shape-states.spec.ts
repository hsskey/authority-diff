import { expect, test } from '@playwright/test';

// The Activity Shape page (/) issues one request, GET /api/v1/authority-map.
// Each test stubs that route so the empty, populated, and error screens render
// without a backend. The route is the named seam; the UI, router, and query
// layer are real.

const AUTHORITY_MAP = '**/api/v1/authority-map';

test('shows the empty screen when no run has completed', async ({ page }) => {
  await page.route(AUTHORITY_MAP, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        run: null,
        cells: [],
        analyzability: { full: 0, partial: 0, none: 0 },
      }),
    }),
  );

  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Activity Shape' })).toBeVisible();
  await expect(page.getByText('No completed run yet')).toBeVisible();
});

test('shows the analyzability ratio for a completed run', async ({ page }) => {
  await page.route(AUTHORITY_MAP, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        run: {
          replayRunId: 'rpl_00000000000000000000000000',
          policyVersionId: 'pver_00000000000000000000000000',
          windowFrom: '2026-01-01T00:00:00.000Z',
          windowTo: '2026-01-31T23:59:59.999Z',
        },
        cells: [{ capability: 'write', zone: 'workspace', effect: 'allow', count: 3 }],
        analyzability: { full: 2, partial: 0, none: 1 },
      }),
    }),
  );

  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Analyzability' })).toBeVisible();
  const full = page.getByText('full', { exact: true }).locator('..');
  await expect(full).toContainText('2');
  await expect(full).toContainText('67%');
  const partial = page.getByText('partial', { exact: true }).locator('..');
  await expect(partial).toContainText('0');
  await expect(partial).toContainText('0%');
  const none = page.getByText('none', { exact: true }).locator('..');
  await expect(none).toContainText('1');
  await expect(none).toContainText('33%');
});

test('shows the error screen when the map request fails', async ({ page }) => {
  await page.route(AUTHORITY_MAP, (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({
        error: {
          code: 'internal',
          message: 'replay store unavailable',
          isRetryable: true,
          details: null,
          requestId: 'req-e2e',
        },
      }),
    }),
  );

  await page.goto('/');

  const alert = page.getByRole('alert');
  await expect(alert).toBeVisible();
  await expect(alert).toContainText('Could not load the authority map');
});
