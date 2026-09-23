import { expect, test } from '@playwright/test';

// The Conformance page issues one request, GET /api/v1/conformance-findings,
// which each test stubs so the list renders without a backend.

const CONFORMANCE_FINDINGS = '**/api/v1/conformance-findings';
const SUFFIX = '0123456789ABCDEFGHJKMNPQRS';
const TS = '2026-09-01T00:00:00.000Z';

function fulfillWith(body: unknown) {
  return (route: { fulfill: (response: object) => Promise<void> }) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
}

test('lists each finding with its kind, capability, zone, and counts', async ({ page }) => {
  await page.route(
    CONFORMANCE_FINDINGS,
    fulfillWith({
      run: {
        replayRunId: `rpl_${SUFFIX}`,
        policyVersionId: `pver_${SUFFIX}`,
        windowFrom: TS,
        windowTo: TS,
      },
      items: [
        {
          findingKey: 'a'.repeat(64),
          kind: 'under_asked',
          capability: 'push',
          zone: 'public_remote',
          program: 'git',
          actionCount: 4,
          sessionCount: 2,
          firstOccurredAt: TS,
          lastOccurredAt: TS,
          sampleActionKeys: ['b'.repeat(64)],
        },
      ],
    }),
  );

  await page.goto('/conformance');

  const row = page.getByRole('row').filter({ hasText: 'under_asked' });
  await expect(row).toContainText('push');
  await expect(row).toContainText('public_remote');
  await expect(row).toContainText('git');
  await expect(row.getByRole('cell').nth(4)).toHaveText('4');
});

test('shows the empty screen when no conformance run has completed', async ({ page }) => {
  await page.route(CONFORMANCE_FINDINGS, fulfillWith({ run: null, items: [] }));

  await page.goto('/conformance');

  await expect(page.getByRole('heading', { name: 'Conformance' })).toBeVisible();
  await expect(page.getByText('No observations compared yet')).toBeVisible();
});
