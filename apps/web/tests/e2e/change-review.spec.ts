import { readFileSync } from 'node:fs';
import { test, expect, type Route } from '@playwright/test';

const SUFFIX = '0123456789ABCDEFGHJKMNPQRS';
const REVIEW_ID = `rev_${SUFFIX}`;
const POLICY_ID = `pol_${SUFFIX}`;
const CANDIDATE_VERSION_ID = `pver_${SUFFIX}`;
const BASELINE_VERSION_ID = `pver_ZYXWVTSRQPNMKJHGFEDCBA9876`;
const REPLAY_RUN_ID = `rpl_${SUFFIX}`;
const GROUP_KEY = 'b'.repeat(64);
const NARROWING_KEY = 'c'.repeat(64);
const ACTION_KEY = 'd'.repeat(64);
const CONTENT_HASH = 'e'.repeat(64);
const RESULT_HASH = 'f'.repeat(64);
const TS = '2026-09-01T00:00:00.000Z';
const REDACTED_INPUT = 'bash /Users/e2e-user/scripts/run.sh';
const TRACE_SOURCES = { transcript: 18, hook: 0, synthetic: 2 };

type Verdict = 'expected' | 'investigate' | 'unexpected';

interface Store {
  verdict: Verdict | null;
  decision: 'accept' | 'reject' | null;
  withdrawn: boolean;
}

function getString(raw: unknown, key: string): string | null {
  if (typeof raw === 'object' && raw !== null && key in raw) {
    const value: unknown = Reflect.get(raw, key);
    return typeof value === 'string' ? value : null;
  }
  return null;
}

function gateFor(verdict: Verdict | null): {
  isOpen: boolean;
  blockers: { code: string; count: number }[];
} {
  if (verdict === 'expected') {
    return { isOpen: true, blockers: [] };
  }
  if (verdict === 'investigate') {
    return { isOpen: false, blockers: [{ code: 'widening_investigate', count: 1 }] };
  }
  if (verdict === 'unexpected') {
    return { isOpen: false, blockers: [{ code: 'widening_unexpected', count: 1 }] };
  }
  return { isOpen: false, blockers: [{ code: 'widening_unreviewed', count: 1 }] };
}

function transitions(): { from: string; to: string; count: number }[] {
  const effects = ['allow', 'ask', 'deny'];
  const cells: { from: string; to: string; count: number }[] = [];
  for (const from of effects) {
    for (const to of effects) {
      cells.push({ from, to, count: from === to ? 5 : from === 'ask' && to === 'allow' ? 3 : 0 });
    }
  }
  return cells;
}

function buildReview(store: Store): unknown {
  const status = store.withdrawn
    ? 'withdrawn'
    : store.decision === 'accept'
      ? 'accepted'
      : store.decision === 'reject'
        ? 'rejected'
        : 'ready';
  return {
    id: REVIEW_ID,
    policyId: POLICY_ID,
    candidateVersionId: CANDIDATE_VERSION_ID,
    kind: 'change',
    candidateContentHash: CONTENT_HASH,
    baselineVersionId: BASELINE_VERSION_ID,
    windowFrom: TS,
    windowTo: TS,
    replayRunId: REPLAY_RUN_ID,
    status,
    decidedBy: store.decision === null ? null : 'reviewer-e2e',
    decidedAt: store.decision === null ? null : TS,
    decisionNote: store.decision === null ? null : 'looks good',
    createdAt: TS,
    replaySummary: {
      replayRunId: REPLAY_RUN_ID,
      status: 'completed',
      stats: {
        totalActions: 20,
        evaluatedActions: 18,
        excludedActions: 2,
        changedActions: 4,
        transitions: transitions(),
      },
      resultHash: RESULT_HASH,
    },
    traceSources: TRACE_SOURCES,
    gate: gateFor(store.verdict),
  };
}

function wideningGroup(store: Store): unknown {
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
    actionCount: 3,
    sessionCount: 2,
    analyzabilityNoneCount: 0,
    firstOccurredAt: TS,
    lastOccurredAt: TS,
    baselineRuleIds: ['baseline_rule'],
    candidateRuleIds: ['candidate_rule'],
    targetSummary: [{ key: 'Users/e2e-user', count: 3 }],
    headline:
      "Users/e2e-user only: 3 execute Actions change from 'ask' to 'allow'." +
      ' The Zone changes from workspace in the baseline to host in the candidate.',
    sampleActionKeys: [ACTION_KEY],
    verdict: store.verdict,
  };
}

function narrowingGroup(): unknown {
  return {
    groupKey: NARROWING_KEY,
    direction: 'narrowing',
    fromEffect: 'allow',
    toEffect: 'ask',
    capability: 'write',
    fromZone: 'workspace',
    toZone: 'workspace',
    program: null,
    severity: 'normal',
    actionCount: 1,
    sessionCount: 1,
    analyzabilityNoneCount: 0,
    firstOccurredAt: TS,
    lastOccurredAt: TS,
    baselineRuleIds: [],
    candidateRuleIds: [],
    targetSummary: [],
    headline: "1 write Action changes from 'allow' to 'ask'.",
    sampleActionKeys: [],
    verdict: null,
  };
}

function samples(): unknown {
  return {
    items: [
      {
        action: {
          actionKey: ACTION_KEY,
          sessionExternalId: 'session-1',
          operations: [
            {
              index: 0,
              capability: 'execute',
              target: { kind: 'path', path: '~/.ssh/config', isInsideWorkspace: false },
              analyzability: 'partial',
              program: 'bash',
              fragment: 'redacted fragment not shown in UI',
              signals: ['network'],
            },
          ],
          observedOutcome: 'executed',
          occurredAt: TS,
          toolName: 'Bash',
          toolInputRedacted: REDACTED_INPUT,
          isInputTruncated: false,
          isSidechain: false,
          classifierVersion: 'v1',
          recordedAt: TS,
        },
        targetKeys: ['~/.ssh'],
        baselineDecision: {
          effect: 'ask',
          decidingOperationIndex: 0,
          isMandateDependent: false,
          operations: [
            {
              operationIndex: 0,
              zone: 'workspace',
              reversibility: 'reversible',
              matchedRuleIds: ['baseline_rule'],
              decidingRuleId: 'baseline_rule',
              effect: 'ask',
              isMandateDependent: false,
            },
          ],
        },
        candidateDecision: {
          effect: 'allow',
          decidingOperationIndex: 0,
          isMandateDependent: false,
          operations: [
            {
              operationIndex: 0,
              zone: 'host',
              reversibility: 'reversible',
              matchedRuleIds: ['candidate_rule'],
              decidingRuleId: 'candidate_rule',
              effect: 'allow',
              isMandateDependent: false,
            },
          ],
        },
        baselineRuleRationales: { baseline_rule: 'Baseline asks before running scripts.' },
        candidateRuleRationales: { candidate_rule: 'Candidate allows scripts on this host.' },
      },
    ],
  };
}

const EMPTY_DOCUMENT = {
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
};

function draftVersion(): unknown {
  return {
    id: CANDIDATE_VERSION_ID,
    policyId: POLICY_ID,
    versionNumber: 2,
    status: 'draft',
    document: EMPTY_DOCUMENT,
    contentHash: CONTENT_HASH,
    baseVersionId: BASELINE_VERSION_ID,
    createdAt: TS,
    updatedAt: TS,
  };
}

function baselineVersion(): unknown {
  return {
    id: BASELINE_VERSION_ID,
    policyId: POLICY_ID,
    versionNumber: 1,
    status: 'accepted',
    document: EMPTY_DOCUMENT,
    contentHash: 'a'.repeat(64),
    baseVersionId: null,
    createdAt: TS,
    updatedAt: TS,
  };
}

function reportFor(store: Store): string {
  return [
    '# Evidence Report',
    '',
    `Change Review \`${REVIEW_ID}\``,
    '',
    '## Decision',
    '',
    store.decision === null ? 'No decision yet.' : '- Decision Record sequence: 1',
    '',
  ].join('\n');
}

async function installApi(route: Route, store: Store): Promise<void> {
  const request = route.request();
  const method = request.method();
  const pathname = new URL(request.url()).pathname;

  const respond = (body: unknown): Promise<void> =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

  if (method === 'GET' && pathname.endsWith('/samples')) {
    await respond(samples());
    return;
  }
  if (method === 'GET' && pathname.endsWith('/diff-groups')) {
    await respond({ items: [wideningGroup(store), narrowingGroup()], nextCursor: null });
    return;
  }
  if (method === 'PUT' && pathname.includes('/verdicts/')) {
    const value = getString(request.postDataJSON(), 'verdict');
    store.verdict =
      value === 'expected' || value === 'investigate' || value === 'unexpected' ? value : null;
    await respond({
      changeReviewId: REVIEW_ID,
      groupKey: GROUP_KEY,
      verdict: store.verdict,
      note: '',
    });
    return;
  }
  if (method === 'POST' && pathname.endsWith('/decisions')) {
    const value = getString(request.postDataJSON(), 'decision');
    store.decision = value === 'accept' || value === 'reject' ? value : null;
    await respond(buildReview(store));
    return;
  }
  if (method === 'POST' && pathname.endsWith('/withdrawals')) {
    store.withdrawn = true;
    await respond(buildReview(store));
    return;
  }
  if (method === 'POST' && pathname.endsWith('/change-reviews')) {
    await respond(buildReview(store));
    return;
  }
  if (method === 'GET' && pathname.endsWith('/report')) {
    await route.fulfill({
      status: 200,
      contentType: 'text/markdown; charset=utf-8',
      body: reportFor(store),
    });
    return;
  }
  if (method === 'GET' && pathname.endsWith('/change-reviews')) {
    await respond({ items: store.withdrawn ? [buildReview(store)] : [], nextCursor: null });
    return;
  }
  if (method === 'GET' && pathname.includes('/change-reviews/')) {
    await respond(buildReview(store));
    return;
  }
  if (method === 'GET' && pathname.endsWith(`/policies/${POLICY_ID}/versions`)) {
    await respond({ items: [baselineVersion(), draftVersion()], nextCursor: null });
    return;
  }
  if (method === 'GET' && pathname.includes('/policy-versions/')) {
    await respond(draftVersion());
    return;
  }
  await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
}

test('draft policy is reviewed, a verdict opens the gate, accepted, and a report downloads', async ({
  page,
}) => {
  const store: Store = { verdict: null, decision: null, withdrawn: false };

  await page.addInitScript(() => {
    window.localStorage.setItem('authority.authToken', 'e2e-token');
  });
  await page.route('**/api/v1/**', (route) => installApi(route, store));

  await page.goto(`/policies/${POLICY_ID}/versions/${CANDIDATE_VERSION_ID}`);
  await page.getByRole('button', { name: '변경 검토 만들기' }).click();

  await expect(page.getByRole('heading', { name: '변경 검토', level: 1 })).toBeVisible();
  await expect(page.getByText('평가한 action')).toBeVisible();
  await expect(page.getByTestId('trace-sources')).toHaveText(
    '기록 출처: 실제 transcript 18건 / synthetic 2건',
  );
  await expect(page.getByRole('button', { name: '정책 변경 수락' })).toBeDisabled();

  await page.getByRole('link', { name: '보기' }).first().click();
  await expect(page.getByRole('heading', { name: 'Diff Group', level: 1 })).toBeVisible();
  await expect(page.getByText('bash ~/scripts/run.sh')).toBeVisible();
  await expect(
    page.getByText("~ 1곳으로의 실행 3건이 '확인 필요'에서 '허용'으로 바뀝니다."),
  ).toBeVisible();
  await expect(page.getByText('e2e-user')).toHaveCount(0);
  await expect(page.getByText('Baseline 결정')).toBeVisible();
  await expect(page.getByText('Candidate 결정')).toBeVisible();
  await expect(page.getByText('#0 execute · workspace → host · ~/.ssh')).toBeVisible();
  await expect(page.getByText('~/.ssh/config')).toHaveCount(0);
  await expect(page.getByText('redacted fragment not shown in UI')).toHaveCount(0);
  await expect(page.getByText('Baseline asks before running scripts.')).toBeVisible();
  await expect(page.getByText('Candidate allows scripts on this host.')).toBeVisible();
  await expect(page.getByText('baseline_rule')).toBeHidden();
  await page.getByText('기술 세부').first().click();
  await expect(page.getByText('baseline_rule')).toBeVisible();

  await page
    .getByLabel('execute · workspace → host · 확인 필요 → 허용 · bash 판정')
    .selectOption('expected');

  await page.getByRole('link', { name: '변경 검토로 돌아가세요' }).click();
  await expect(page.getByRole('heading', { name: '변경 검토', level: 1 })).toBeVisible();
  await expect(page.getByText('Gate: 열림')).toBeVisible();

  await page.getByLabel('검토자 이름').fill('reviewer-e2e');
  const accept = page.getByRole('button', { name: '정책 변경 수락' });
  await expect(accept).toBeEnabled();
  await accept.click();
  await expect(page.getByRole('heading', { name: '결정 기록' })).toBeVisible();
  await expect(page.getByText('reviewer-e2e')).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '보고서 다운로드' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(`change-review-${REVIEW_ID}.md`);
  const path = await download.path();
  expect(readFileSync(path, 'utf8')).toBe(reportFor(store));
});

test('a ready review is withdrawn and its draft can start a new review', async ({ page }) => {
  const store: Store = { verdict: null, decision: null, withdrawn: false };

  await page.addInitScript(() => {
    window.localStorage.setItem('authority.authToken', 'e2e-token');
  });
  await page.route('**/api/v1/**', (route) => installApi(route, store));

  await page.goto(`/change-reviews/${REVIEW_ID}`);
  await expect(page.getByText('판정 대기')).toBeVisible();

  await page.getByRole('button', { name: '검토 철회' }).click();

  await expect(page.getByRole('heading', { name: '검토 철회됨' })).toBeVisible();
  await expect(page.getByText('철회됨', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '정책 변경 수락' })).toHaveCount(0);
  await expect(
    page.getByLabel('execute · workspace → host · 확인 필요 → 허용 · bash 판정'),
  ).toBeDisabled();

  await page.getByRole('link', { name: 'draft version 열기' }).click();
  await expect(page.getByRole('button', { name: '변경 검토 만들기' })).toBeEnabled();
});
