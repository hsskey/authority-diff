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
const REDACTED_INPUT = 'execute: bash script over [REDACTED_PATH]';

type Verdict = 'expected' | 'investigate' | 'unexpected';

interface Store {
  verdict: Verdict | null;
  decision: 'accept' | 'reject' | null;
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
  const status =
    store.decision === 'accept' ? 'accepted' : store.decision === 'reject' ? 'rejected' : 'ready';
  return {
    id: REVIEW_ID,
    policyId: POLICY_ID,
    candidateVersionId: CANDIDATE_VERSION_ID,
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
    targetSummary: [{ key: 'host', count: 3 }],
    headline: 'execute가 workspace에서 host로 넓어졌습니다',
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
    headline: 'write가 좁아졌습니다',
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
          operations: [
            {
              operationIndex: 0,
              zone: 'workspace',
              reversibility: 'reversible',
              matchedRuleIds: ['baseline_rule'],
              decidingRuleId: 'baseline_rule',
              effect: 'ask',
            },
          ],
        },
        candidateDecision: {
          effect: 'allow',
          decidingOperationIndex: 0,
          operations: [
            {
              operationIndex: 0,
              zone: 'host',
              reversibility: 'reversible',
              matchedRuleIds: ['candidate_rule'],
              decidingRuleId: 'candidate_rule',
              effect: 'allow',
            },
          ],
        },
        baselineRuleRationales: { baseline_rule: 'Baseline asks before running scripts.' },
        candidateRuleRationales: { candidate_rule: 'Candidate allows scripts on this host.' },
      },
    ],
  };
}

function draftVersion(): unknown {
  return {
    id: CANDIDATE_VERSION_ID,
    policyId: POLICY_ID,
    versionNumber: 2,
    status: 'draft',
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
    contentHash: CONTENT_HASH,
    baseVersionId: BASELINE_VERSION_ID,
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
    '## 결정',
    '',
    store.decision === null ? '아직 결정되지 않았습니다.' : '- Decision Record sequence: 1',
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
  if (method === 'GET' && pathname.includes('/change-reviews/')) {
    await respond(buildReview(store));
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
  const store: Store = { verdict: null, decision: null };

  await page.addInitScript(() => {
    window.localStorage.setItem('authority.authToken', 'e2e-token');
  });
  await page.route('**/api/v1/**', (route) => installApi(route, store));

  // draft -> a change review is created from the draft policy version
  await page.goto(`/policies/${POLICY_ID}/versions/${CANDIDATE_VERSION_ID}`);
  await page.getByRole('button', { name: 'Create Change Review' }).click();

  // review -> the Change Review screen loads with the gate closed
  await expect(page.getByRole('heading', { name: 'Change Review', level: 1 })).toBeVisible();
  await expect(page.getByText('평가한 action')).toBeVisible();
  await expect(page.getByRole('button', { name: '정책 변경 수락' })).toBeDisabled();

  // the group detail shows the redacted input, operations, and both decisions
  await page.getByRole('link', { name: '보기' }).first().click();
  await expect(page.getByRole('heading', { name: 'Diff Group', level: 1 })).toBeVisible();
  await expect(page.getByText(REDACTED_INPUT)).toBeVisible();
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

  // verdict -> record the widening group as expected
  await page.getByLabel('execute 판정').selectOption('expected');

  // back on the review the gate is now open
  await page.getByRole('link', { name: 'Change Review로 돌아가세요' }).click();
  await expect(page.getByRole('heading', { name: 'Change Review', level: 1 })).toBeVisible();
  await expect(page.getByText('Gate: 열림')).toBeVisible();

  // accept -> the decision is recorded
  await page.getByLabel('검토자 이름').fill('reviewer-e2e');
  const accept = page.getByRole('button', { name: '정책 변경 수락' });
  await expect(accept).toBeEnabled();
  await accept.click();
  await expect(page.getByRole('heading', { name: '결정 기록' })).toBeVisible();
  await expect(page.getByText('reviewer-e2e')).toBeVisible();

  // report -> the server's Evidence Report is saved byte for byte
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '보고서 다운로드' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(`change-review-${REVIEW_ID}.md`);
  const path = await download.path();
  expect(readFileSync(path, 'utf8')).toBe(reportFor(store));
});
