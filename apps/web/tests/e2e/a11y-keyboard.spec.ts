import { expect, test, type Page } from '@playwright/test';

// Keyboard and name contracts for the web shell: skip link, current-page nav,
// login submit, and the labeled verdict control. API routes are stubbed; the
// document, router, and focus order are real.

const TS = '2026-01-01T00:00:00.000Z';
const SUFFIX = '0123456789ABCDEFGHJKMNPQRS';
const REVIEW_ID = `rev_${SUFFIX}`;
const POLICY_ID = `pol_${SUFFIX}`;
const VERSION_ID = `pver_${SUFFIX}`;
const RUN_ID = `rpl_${SUFFIX}`;
const GROUP_KEY = 'b'.repeat(64);
const ACTION_KEY = 'd'.repeat(64);

function transitions(): { from: string; to: string; count: number }[] {
  const effects = ['allow', 'ask', 'deny'];
  const cells: { from: string; to: string; count: number }[] = [];
  for (const from of effects) {
    for (const to of effects) {
      cells.push({ from, to, count: from === to ? 1 : 0 });
    }
  }
  return cells;
}

function fulfillWith(body: unknown) {
  return (route: { fulfill: (response: object) => Promise<void> }) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
}

function overview(): unknown {
  return {
    windowDays: 30,
    windowFrom: TS,
    windowTo: '2026-01-31T00:00:00.000Z',
    sessionCount: 0,
    actionCount: 0,
    evaluableActionCount: 0,
    capabilityCounts: {
      read: 0,
      write: 0,
      delete: 0,
      execute: 0,
      install: 0,
      fetch: 0,
      send: 0,
      commit: 0,
      push: 0,
      rewrite: 0,
      deploy: 0,
    },
    targetKindCounts: {
      workspace_path: 0,
      other_path: 0,
      vcs_remote: 0,
      host: 0,
      package: 0,
      mcp: 0,
      deploy_target: 0,
      unknown: 0,
    },
    analyzability: { full: 0, partial: 0, none: 0 },
    topPrograms: [],
    topRemoteKeys: [],
  };
}

async function stubShellApis(page: Page): Promise<void> {
  await page.route('**/api/v1/activity-overview*', fulfillWith(overview()));
  await page.route('**/api/v1/policies?*', fulfillWith({ items: [], nextCursor: null }));
  await page.route('**/api/v1/conformance-findings', fulfillWith({ run: null, items: [] }));
}

function reviewBody(verdict: 'expected' | 'investigate' | 'unexpected' | null): unknown {
  return {
    id: REVIEW_ID,
    policyId: POLICY_ID,
    candidateVersionId: VERSION_ID,
    kind: 'change',
    candidateContentHash: 'a'.repeat(64),
    baselineVersionId: VERSION_ID,
    windowFrom: TS,
    windowTo: TS,
    replayRunId: RUN_ID,
    status: 'ready',
    decidedBy: null,
    decidedAt: null,
    decisionNote: null,
    createdAt: TS,
    replaySummary: {
      replayRunId: RUN_ID,
      status: 'completed',
      stats: {
        totalActions: 3,
        evaluatedActions: 3,
        excludedActions: 0,
        changedActions: 1,
        transitions: transitions(),
      },
      resultHash: 'b'.repeat(64),
    },
    traceSources: { transcript: 3, hook: 0, synthetic: 0 },
    gate: {
      isOpen: verdict === 'expected',
      blockers: verdict === 'expected' ? [] : [{ code: 'widening_unreviewed', count: 1 }],
    },
  };
}

function wideningGroup(verdict: 'expected' | 'investigate' | 'unexpected' | null): unknown {
  return {
    groupKey: GROUP_KEY,
    direction: 'widening',
    fromEffect: 'ask',
    toEffect: 'allow',
    capability: 'execute',
    fromZone: 'workspace',
    toZone: 'host',
    program: 'bash',
    severity: 'critical',
    actionCount: 1,
    sessionCount: 1,
    analyzabilityNoneCount: 0,
    firstOccurredAt: TS,
    lastOccurredAt: TS,
    baselineRuleIds: [],
    candidateRuleIds: [],
    targetSummary: [{ key: 'host', count: 1 }],
    headline: "실행이 '확인 필요'에서 '허용'으로 바뀝니다.",
    sampleActionKeys: [ACTION_KEY],
    verdict,
    note: '',
  };
}

test('skip link is the first tab stop and moves focus into main', async ({ page }) => {
  await stubShellApis(page);
  await page.goto('/login');

  await expect(page.locator('html')).toHaveAttribute('lang', 'ko');
  await expect(page).toHaveTitle('로그인 · Authority Diff');
  await expect(page.getByRole('main')).toBeVisible();
  await expect(page.getByRole('navigation', { name: '주 메뉴' })).toBeVisible();

  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: '본문으로 건너뛰기' });
  await expect(skip).toBeFocused();
  await skip.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();
});

test('nav marks the current page and login submits from the keyboard', async ({ page }) => {
  await stubShellApis(page);
  await page.goto('/login');

  await expect(page.getByRole('link', { name: '로그인' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('link', { name: '활동 분포' })).not.toHaveAttribute('aria-current');

  const token = page.getByLabel('Bearer token');
  await token.fill('e2e-token');
  await token.press('Enter');

  await expect(page).toHaveURL('/');
  await expect(page).toHaveTitle('활동 분포 · Authority Diff');
  await expect(page.getByRole('heading', { name: '활동 분포', level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: '활동 분포' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(page.getByRole('link', { name: '로그인' })).toHaveCount(0);

  await page.getByRole('link', { name: '적합성' }).click();
  await expect(page).toHaveURL('/conformance');
  await expect(page.getByRole('link', { name: '적합성' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('link', { name: '활동 분포' })).not.toHaveAttribute('aria-current');
});

test('a verdict control is a labeled combobox the keyboard can reach', async ({ page }) => {
  const store: { verdict: 'expected' | 'investigate' | 'unexpected' | null } = { verdict: null };
  await page.addInitScript(() => {
    window.localStorage.setItem('authority.authToken', 'e2e-token');
  });
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (request.method() === 'PUT' && pathname.includes('/verdicts/')) {
      store.verdict = 'expected';
      await fulfillWith({
        changeReviewId: REVIEW_ID,
        groupKey: GROUP_KEY,
        verdict: store.verdict,
        note: '',
      })(route);
      return;
    }
    if (pathname.endsWith('/diff-groups')) {
      await fulfillWith({ items: [wideningGroup(store.verdict)], nextCursor: null })(route);
      return;
    }
    if (pathname.includes('/change-reviews/')) {
      await fulfillWith(reviewBody(store.verdict))(route);
      return;
    }
    await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  });

  await page.goto(`/change-reviews/${REVIEW_ID}`);

  await expect(page.getByRole('heading', { name: '변경 검토', level: 1 })).toBeVisible();
  const verdict = page.getByRole('combobox', {
    name: 'execute · workspace → host · 확인 필요 → 허용 · bash 판정',
  });
  await verdict.focus();
  await expect(verdict).toBeFocused();
  await verdict.selectOption('expected');
  await expect(verdict).toHaveValue('expected');
});
