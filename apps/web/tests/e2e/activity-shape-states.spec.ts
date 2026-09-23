import { expect, test, type Page } from '@playwright/test';

// The Activity Shape page (/) reads the imported-activity overview and the
// Policy list, then GET /api/v1/authority-map once a version is accepted. Each
// test stubs those routes so the empty, populated, and error screens render
// without a backend. The routes are the named seam; the UI, router, and query
// layer are real.

const AUTHORITY_MAP = '**/api/v1/authority-map';
const SUFFIX = '0123456789ABCDEFGHJKMNPQRS';
const POLICY_ID = `pol_${SUFFIX}`;
const VERSION_ID = `pver_${SUFFIX}`;
const TS = '2026-01-01T00:00:00.000Z';

function fulfillWith(body: unknown) {
  return (route: { fulfill: (response: object) => Promise<void> }) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
}

function zeroCounts(keys: readonly string[]): Record<string, number> {
  return Object.fromEntries(keys.map((key) => [key, 0]));
}

function overview(): unknown {
  return {
    windowDays: 30,
    windowFrom: TS,
    windowTo: '2026-01-31T00:00:00.000Z',
    sessionCount: 2,
    actionCount: 5,
    evaluableActionCount: 4,
    capabilityCounts: {
      ...zeroCounts([
        'read',
        'write',
        'delete',
        'execute',
        'install',
        'fetch',
        'send',
        'commit',
        'push',
        'rewrite',
        'deploy',
      ]),
      write: 3,
      execute: 2,
    },
    targetKindCounts: {
      ...zeroCounts([
        'workspace_path',
        'other_path',
        'vcs_remote',
        'host',
        'package',
        'mcp',
        'deploy_target',
        'unknown',
      ]),
      workspace_path: 3,
      vcs_remote: 2,
    },
    analyzability: { full: 3, partial: 0, none: 1 },
    topPrograms: [{ program: 'git', count: 2 }],
    topRemoteKeys: [{ remoteKey: 'github.com/synthetic-org/repo-a', count: 2 }],
  };
}

async function stubAcceptedPolicy(page: Page): Promise<void> {
  await page.route('**/api/v1/activity-overview*', fulfillWith(overview()));
  await page.route(
    '**/api/v1/policies?*',
    fulfillWith({
      items: [{ id: POLICY_ID, name: 'org-default', createdAt: TS }],
      nextCursor: null,
    }),
  );
  await page.route(
    `**/api/v1/policies/${POLICY_ID}/versions*`,
    fulfillWith({
      items: [
        {
          id: VERSION_ID,
          policyId: POLICY_ID,
          versionNumber: 1,
          status: 'accepted',
          document: {
            schemaVersion: 1,
            environment: {
              credentialPaths: [],
              agentConfigPaths: [],
              trustedRemotes: [],
              publicRemotes: [],
              protectedBranches: [],
              productionMarkers: [],
            },
            rules: [],
          },
          contentHash: 'a'.repeat(64),
          baseVersionId: null,
          createdAt: TS,
          updatedAt: TS,
        },
      ],
      nextCursor: null,
    }),
  );
}

test('shows the imported-activity overview and the empty map when no run has completed', async ({
  page,
}) => {
  await stubAcceptedPolicy(page);
  await page.route(
    AUTHORITY_MAP,
    fulfillWith({ run: null, cells: [], analyzability: { full: 0, partial: 0, none: 0 } }),
  );

  await page.goto('/');

  await expect(page.getByRole('heading', { name: '활동 분포', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: '가져온 활동 개요 (최근 30일)' })).toBeVisible();
  const analyzability = page.getByTestId('overview-analyzability');
  await expect(analyzability).toContainText('75.0%');
  await expect(analyzability).toContainText('25.0%');
  await expect(page.getByText('github.com', { exact: true })).toBeVisible();
  await expect(page.getByText('synthetic-org')).toHaveCount(0);
  await expect(page.getByText('완료된 replay run이 없습니다')).toBeVisible();
});

test('shows the accepted policy map and its analyzability ratio for a completed run', async ({
  page,
}) => {
  await stubAcceptedPolicy(page);
  await page.route(
    AUTHORITY_MAP,
    fulfillWith({
      run: {
        replayRunId: 'rpl_00000000000000000000000000',
        policyVersionId: VERSION_ID,
        windowFrom: TS,
        windowTo: '2026-01-31T23:59:59.999Z',
      },
      cells: [
        { capability: 'write', zone: 'workspace', effect: 'allow', count: 3000 },
        { capability: 'read', zone: 'credentials', effect: 'deny', count: 1 },
      ],
      analyzability: { full: 2251, partial: 0, none: 750 },
    }),
  );

  await page.goto('/');

  await expect(page.getByRole('heading', { name: '채택된 정책: version #1' })).toBeVisible();
  const effects = page.getByTestId('map-effects');
  await expect(effects).toContainText('100.0%');
  await expect(effects).toContainText('<0.1%');
  const analyzability = page.getByTestId('map-analyzability');
  await expect(analyzability).toContainText('75.0%');
  await expect(analyzability).toContainText('0%');
  await expect(analyzability).toContainText('25.0%');
});

test('shows the error screen when the map request fails', async ({ page }) => {
  await stubAcceptedPolicy(page);
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
  await expect(alert).toContainText('활동 분포를 불러오지 못했습니다');
});

test('refuses to pick a policy when the organization has more than one', async ({ page }) => {
  await page.route('**/api/v1/activity-overview*', fulfillWith(overview()));
  await page.route(
    '**/api/v1/policies?*',
    fulfillWith({
      items: [
        { id: POLICY_ID, name: 'org-default', createdAt: TS },
        { id: `pol_${'Z'.repeat(26)}`, name: 'second', createdAt: TS },
      ],
      nextCursor: null,
    }),
  );

  await page.goto('/');

  await expect(page.getByText('지원하지 않는 상태: 조직 정책이 2개 이상입니다')).toBeVisible();
  await expect(page.getByRole('button', { name: '첫 조직 정책 만들기' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: '최초 정책 설정 계속하기' })).toHaveCount(0);
});
