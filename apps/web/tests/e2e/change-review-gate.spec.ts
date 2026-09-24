import { expect, test } from '@playwright/test';

// The Change Review page (/change-reviews/:id) renders its Gate panel from
// GET /change-reviews/:id; each widening blocker code gets its own notice text.

const SUFFIX = '0123456789ABCDEFGHJKMNPQRS';
const REVIEW_ID = `rev_${SUFFIX}`;
const TS = '2026-09-01T00:00:00.000Z';

function fulfillWith(body: unknown) {
  return (route: { fulfill: (response: object) => Promise<void> }) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
}

function transitions(): { from: string; to: string; count: number }[] {
  const effects = ['allow', 'ask', 'deny'];
  return effects.flatMap((from) => effects.map((to) => ({ from, to, count: 0 })));
}

function reviewWithGate(blocker: { code: string; count: number }): unknown {
  return {
    id: REVIEW_ID,
    policyId: `pol_${SUFFIX}`,
    candidateVersionId: `pver_${SUFFIX}`,
    kind: 'change',
    candidateContentHash: 'a'.repeat(64),
    baselineVersionId: `pver_${'Z'.repeat(26)}`,
    windowFrom: TS,
    windowTo: TS,
    replayRunId: `rpl_${SUFFIX}`,
    status: 'ready',
    decidedBy: null,
    decidedAt: null,
    decisionNote: null,
    createdAt: TS,
    replaySummary: {
      replayRunId: `rpl_${SUFFIX}`,
      status: 'completed',
      stats: {
        totalActions: 1,
        evaluatedActions: 1,
        excludedActions: 0,
        changedActions: 1,
        transitions: transitions(),
      },
      resultHash: 'b'.repeat(64),
    },
    traceSources: { transcript: 1, hook: 0, synthetic: 0 },
    gate: { isOpen: false, blockers: [blocker] },
  };
}

const WIDENING_BLOCKER_CASES: { code: string; text: string }[] = [
  { code: 'widening_unreviewed', text: '판정하지 않은 group 1개' },
  { code: 'widening_investigate', text: '조사 필요로 남은 group 1개' },
  {
    code: 'widening_unexpected',
    text: '예상 밖으로 판정된 group 1개. 정책을 고쳐 새 review를 만드세요',
  },
];

for (const { code, text } of WIDENING_BLOCKER_CASES) {
  test(`gate notice shows "${text}"`, async ({ page }) => {
    await page.route(
      `**/api/v1/change-reviews/${REVIEW_ID}`,
      fulfillWith(reviewWithGate({ code, count: 1 })),
    );
    await page.route(
      `**/api/v1/change-reviews/${REVIEW_ID}/diff-groups*`,
      fulfillWith({ items: [], nextCursor: null }),
    );

    await page.goto(`/change-reviews/${REVIEW_ID}`);

    await expect(page.getByRole('heading', { name: '변경 검토', level: 1 })).toBeVisible();
    await expect(page.getByText(text).first()).toBeVisible();
  });
}

test('decision panel repeats the exact Gate section wording for an unexpected blocker', async ({
  page,
}) => {
  const text = '예상 밖으로 판정된 group 1개. 정책을 고쳐 새 review를 만드세요';
  await page.route(
    `**/api/v1/change-reviews/${REVIEW_ID}`,
    fulfillWith(reviewWithGate({ code: 'widening_unexpected', count: 1 })),
  );
  await page.route(
    `**/api/v1/change-reviews/${REVIEW_ID}/diff-groups*`,
    fulfillWith({ items: [], nextCursor: null }),
  );

  await page.goto(`/change-reviews/${REVIEW_ID}`);

  await expect(page.getByRole('heading', { name: '정책 변경 결정' })).toBeVisible();
  await expect(page.getByText(text)).toHaveCount(2);
});
