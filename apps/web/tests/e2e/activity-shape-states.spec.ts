import { expect, test } from '@playwright/test';

// The Activity Shape page (/) issues one request, GET /api/v1/authority-map.
// Each test stubs that route so the empty and error screens render without a
// backend. The route is the named seam; the UI, router, and query layer are real.

const AUTHORITY_MAP = '**/api/v1/authority-map';

test('shows the empty screen when no run has completed', async ({ page }) => {
  await page.route(AUTHORITY_MAP, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ run: null, cells: [] }),
    }),
  );

  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Activity Shape' })).toBeVisible();
  await expect(page.getByText('No completed run yet')).toBeVisible();
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
