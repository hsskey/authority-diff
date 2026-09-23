import { expect, test } from '@playwright/test';

// The Change Review page polls GET /change-reviews/:id and its diff-groups
// every 3s while status is 'computing', and disables verdict selects and the
// accept button until the review leaves 'computing'.

const SUFFIX = '0123456789ABCDEFGHJKMNPQRS';
const REVIEW_ID = `rev_${SUFFIX}`;
const GROUP_KEY = 'a'.repeat(64);
const TS = '2026-09-01T00:00:00.000Z';

function transitions(): { from: string; to: string; count: number }[] {
  const effects = ['allow', 'ask', 'deny'];
  return effects.flatMap((from) => effects.map((to) => ({ from, to, count: 0 })));
}

function wideningGroup(): unknown {
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
    targetSummary: [],
    headline: 'execute가 workspace에서 host로 넓어졌습니다',
    sampleActionKeys: [],
    verdict: null,
  };
}

function buildReview(computing: boolean): unknown {
  return {
    id: REVIEW_ID,
    policyId: `pol_${SUFFIX}`,
    candidateVersionId: `pver_${SUFFIX}`,
    candidateContentHash: 'a'.repeat(64),
    baselineVersionId: `pver_${'Z'.repeat(26)}`,
    windowFrom: TS,
    windowTo: TS,
    replayRunId: `rpl_${SUFFIX}`,
    status: computing ? 'computing' : 'ready',
    decidedBy: null,
    decidedAt: null,
    decisionNote: null,
    createdAt: TS,
    replaySummary: {
      replayRunId: `rpl_${SUFFIX}`,
      status: computing ? 'running' : 'completed',
      stats: computing
        ? null
        : {
            totalActions: 1,
            evaluatedActions: 1,
            excludedActions: 0,
            changedActions: 1,
            transitions: transitions(),
          },
      resultHash: computing ? null : 'b'.repeat(64),
    },
    gate: computing
      ? { isOpen: false, blockers: [{ code: 'replay_incomplete', count: 1 }] }
      : { isOpen: false, blockers: [{ code: 'widening_unreviewed', count: 1 }] },
  };
}

test('the page polls while computing and enables controls once the review is ready', async ({
  page,
}) => {
  let reviewCalls = 0;

  await page.route(`**/api/v1/change-reviews/${REVIEW_ID}`, (route) => {
    reviewCalls += 1;
    const computing = reviewCalls <= 2;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildReview(computing)),
    });
  });
  await page.route(`**/api/v1/change-reviews/${REVIEW_ID}/diff-groups*`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [wideningGroup()], nextCursor: null }),
    }),
  );

  await page.goto(`/change-reviews/${REVIEW_ID}`);

  await expect(page.getByRole('heading', { name: 'Change Review', level: 1 })).toBeVisible();
  await expect(page.getByLabel('execute 판정')).toBeDisabled();
  await expect(page.getByRole('button', { name: '정책 변경 수락' })).toBeDisabled();
  await expect(page.getByText('replay가 아직 끝나지 않음').first()).toBeVisible();

  await expect(page.getByLabel('execute 판정')).toBeEnabled({ timeout: 10_000 });
  await expect(page.getByText('판정하지 않은 group 1개').first()).toBeVisible();
});

test('once ready, diff-groups are fetched even though they were empty while computing', async ({
  page,
}) => {
  let reviewCalls = 0;
  let ready = false;

  await page.route(`**/api/v1/change-reviews/${REVIEW_ID}`, (route) => {
    reviewCalls += 1;
    const computing = reviewCalls <= 2;
    if (!computing) {
      ready = true;
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildReview(computing)),
    });
  });
  await page.route(`**/api/v1/change-reviews/${REVIEW_ID}/diff-groups*`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: ready ? [wideningGroup()] : [], nextCursor: null }),
    }),
  );

  await page.goto(`/change-reviews/${REVIEW_ID}`);

  await expect(page.getByRole('heading', { name: 'Change Review', level: 1 })).toBeVisible();
  await expect(page.getByText('넓어진 group이 없습니다.')).toBeVisible();

  await expect(page.getByLabel('execute 판정')).toBeEnabled({ timeout: 10_000 });
  await expect(page.getByText('넓어진 group이 없습니다.')).toHaveCount(0);
});
