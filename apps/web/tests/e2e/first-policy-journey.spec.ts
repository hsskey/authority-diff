import { test, expect, type Page, type Route } from '@playwright/test';

// The first-policy journey from an empty organization to a conformance screen,
// driven through the web only. Every /api route is served by a small stateful
// stub so the screens, router, and query layer are real while no backend runs.
// Transcript import (step 1) happens outside the web: the stub's activity
// overview stands in for the imported activity.

const SUFFIX = '0123456789ABCDEFGHJKMNPQRS';
const POLICY_ID = `pol_${SUFFIX}`;
const VERSION_1_ID = `pver_1${SUFFIX.slice(1)}`;
const VERSION_2_ID = `pver_2${SUFFIX.slice(1)}`;
const ADOPTION_REVIEW_ID = `rev_1${SUFFIX.slice(1)}`;
const CHANGE_REVIEW_ID = `rev_2${SUFFIX.slice(1)}`;
const ADOPTION_RUN_ID = `rpl_1${SUFFIX.slice(1)}`;
const CHANGE_RUN_ID = `rpl_2${SUFFIX.slice(1)}`;
const CONFORMANCE_RUN_ID = `rpl_3${SUFFIX.slice(1)}`;
const ASK_GROUP_KEY = 'a'.repeat(64);
const DENY_GROUP_KEY = 'b'.repeat(64);
const WIDENING_GROUP_KEY = 'c'.repeat(64);
const ACTION_KEY = 'd'.repeat(64);
const HASH = 'e'.repeat(64);
const TS = '2026-01-15T00:00:00.000Z';
const REDACTED_INPUT = 'cat ~/[REDACTED_PATH]/token';

type Verdict = 'expected' | 'investigate' | 'unexpected';
type VersionStatus = 'draft' | 'in_review' | 'accepted' | 'rejected';
type ReviewStatus = 'ready' | 'accepted' | 'rejected';
type ReviewKind = 'change' | 'adoption';

interface Version {
  id: string;
  versionNumber: number;
  status: VersionStatus;
  baseVersionId: string | null;
}

interface Review {
  id: string;
  kind: ReviewKind;
  candidateVersionId: string;
  baselineVersionId: string | null;
  replayRunId: string;
  status: ReviewStatus;
  verdicts: Map<string, Verdict>;
  decidedBy: string | null;
}

interface Store {
  hasPolicy: boolean;
  versions: Version[];
  reviews: Review[];
}

const DOCUMENT = {
  schemaVersion: 1,
  environment: {
    credentialPaths: ['~/.synthetic-credentials/**'],
    agentConfigPaths: [],
    trustedRemotes: [],
    publicRemotes: [],
    protectedBranches: [],
    productionMarkers: [],
  },
  rules: [
    {
      ruleId: 'deny_credentials_access',
      match: {
        capabilities: '*',
        zones: ['credentials'],
        reversibility: null,
        analyzability: null,
      },
      effect: 'deny',
      rationale: 'Reading credentials collapses every other boundary, so it is denied.',
    },
  ],
};

function zeroCounts(keys: readonly string[]): Record<string, number> {
  return Object.fromEntries(keys.map((key) => [key, 0]));
}

function overview(): unknown {
  return {
    windowDays: 30,
    windowFrom: '2026-01-01T00:00:00.000Z',
    windowTo: '2026-01-31T00:00:00.000Z',
    sessionCount: 12,
    actionCount: 340,
    evaluableActionCount: 330,
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
      read: 200,
      execute: 120,
      fetch: 30,
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
      workspace_path: 250,
      other_path: 70,
      vcs_remote: 30,
    },
    analyzability: { full: 250, partial: 60, none: 20 },
    topPrograms: [
      { program: 'git', count: 40 },
      { program: 'cat', count: 30 },
    ],
    topRemoteKeys: [{ remoteKey: 'github.com/synthetic-org/repo-a', count: 30 }],
  };
}

function versionBody(version: Version): unknown {
  return {
    id: version.id,
    policyId: POLICY_ID,
    versionNumber: version.versionNumber,
    status: version.status,
    document: DOCUMENT,
    contentHash: HASH,
    baseVersionId: version.baseVersionId,
    createdAt: TS,
    updatedAt: TS,
  };
}

function transitions(): { from: string; to: string; count: number }[] {
  const effects = ['allow', 'ask', 'deny'];
  return effects.flatMap((from) =>
    effects.map((to) => ({
      from,
      to,
      count: from === to ? 100 : from === 'ask' && to === 'allow' ? 3 : 0,
    })),
  );
}

function gateFor(review: Review, groupKeys: readonly string[]): unknown {
  const prefix = review.kind === 'adoption' ? 'adoption' : 'widening';
  const unreviewed = groupKeys.filter((key) => !review.verdicts.has(key)).length;
  const investigate = groupKeys.filter((key) => review.verdicts.get(key) === 'investigate').length;
  const unexpected = groupKeys.filter((key) => review.verdicts.get(key) === 'unexpected').length;
  const blockers = [
    { code: `${prefix}_unreviewed`, count: unreviewed },
    { code: `${prefix}_investigate`, count: investigate },
    { code: `${prefix}_unexpected`, count: unexpected },
  ].filter((blocker) => blocker.count > 0);
  return { isOpen: blockers.length === 0, blockers };
}

function groupKeysOf(review: Review): string[] {
  return review.kind === 'adoption' ? [ASK_GROUP_KEY, DENY_GROUP_KEY] : [WIDENING_GROUP_KEY];
}

function reviewBody(review: Review): unknown {
  const stats =
    review.kind === 'change'
      ? {
          totalActions: 340,
          evaluatedActions: 330,
          excludedActions: 10,
          changedActions: 3,
          transitions: transitions(),
        }
      : null;
  return {
    id: review.id,
    policyId: POLICY_ID,
    kind: review.kind,
    candidateVersionId: review.candidateVersionId,
    candidateContentHash: HASH,
    baselineVersionId: review.baselineVersionId,
    windowFrom: TS,
    windowTo: TS,
    replayRunId: review.replayRunId,
    status: review.status,
    decidedBy: review.decidedBy,
    decidedAt: review.decidedBy === null ? null : TS,
    decisionNote: review.decidedBy === null ? null : '',
    createdAt: TS,
    replaySummary: {
      replayRunId: review.replayRunId,
      status: 'completed',
      stats,
      resultHash: HASH,
    },
    gate: gateFor(review, groupKeysOf(review)),
  };
}

function runBody(review: Review): unknown {
  const base = {
    id: review.replayRunId,
    candidateVersionId: review.candidateVersionId,
    windowFrom: TS,
    windowTo: TS,
    status: 'completed',
    classifierVersion: 'v1',
    inputsHash: HASH,
    resultHash: HASH,
    errorCode: null,
    createdAt: TS,
    startedAt: TS,
    completedAt: TS,
  };
  if (review.kind === 'adoption') {
    return {
      ...base,
      kind: 'adoption',
      baselineVersionId: null,
      stats: {
        totalActions: 340,
        evaluatedActions: 330,
        excludedActions: 10,
        effectCounts: { allow: 79, ask: 250, deny: 1 },
        analyzability: { full: 250, partial: 60, none: 20 },
        cells: [],
      },
    };
  }
  return {
    ...base,
    kind: 'version_diff',
    baselineVersionId: review.baselineVersionId,
    stats: {
      totalActions: 340,
      evaluatedActions: 330,
      excludedActions: 10,
      changedActions: 3,
      transitions: transitions(),
      operationWidening: [],
    },
  };
}

function adoptionGroups(review: Review): unknown[] {
  return [
    {
      groupKey: DENY_GROUP_KEY,
      effect: 'deny',
      capability: 'read',
      zone: 'credentials',
      program: null,
      programSummary: [{ program: 'cat', count: 1 }],
      distinctProgramCount: 1,
      actionCount: 1,
      sessionCount: 1,
      analyzabilityNoneCount: 0,
      firstOccurredAt: TS,
      lastOccurredAt: TS,
      decidingRuleIds: ['deny_credentials_access'],
      targetSummary: [{ key: '~/.synthetic-credentials', count: 1 }],
      headline: "자격 증명에서의 읽기 1건이 이 정책에서 '차단' 대상이 됩니다.",
      sampleActionKeys: [ACTION_KEY],
      verdict: review.verdicts.get(DENY_GROUP_KEY) ?? null,
    },
    {
      groupKey: ASK_GROUP_KEY,
      effect: 'ask',
      capability: 'execute',
      zone: 'host',
      program: null,
      programSummary: [
        { program: null, count: 20 },
        { program: 'bash', count: 200 },
        { program: 'node', count: 30 },
      ],
      distinctProgramCount: 3,
      actionCount: 250,
      sessionCount: 12,
      analyzabilityNoneCount: 20,
      firstOccurredAt: TS,
      lastOccurredAt: TS,
      decidingRuleIds: [],
      targetSummary: [{ key: 'unknown', count: 250 }],
      headline: "호스트에서의 실행 250건이 이 정책에서 '확인 필요' 대상이 됩니다.",
      sampleActionKeys: [],
      verdict: review.verdicts.get(ASK_GROUP_KEY) ?? null,
    },
  ];
}

function wideningGroup(review: Review): unknown {
  return {
    groupKey: WIDENING_GROUP_KEY,
    direction: 'widening',
    fromEffect: 'ask',
    toEffect: 'allow',
    capability: 'fetch',
    fromZone: 'unknown_remote',
    toZone: 'trusted_remote',
    program: 'git',
    severity: 'critical',
    actionCount: 3,
    sessionCount: 2,
    analyzabilityNoneCount: 0,
    firstOccurredAt: TS,
    lastOccurredAt: TS,
    baselineRuleIds: [],
    candidateRuleIds: ['allow_trusted_fetch'],
    targetSummary: [{ key: 'github.com/synthetic-org/repo-a', count: 3 }],
    headline:
      "github.com/synthetic-org/repo-a 등 1곳으로의 가져오기 3건이 '확인 필요'에서 '허용'으로 바뀝니다.",
    sampleActionKeys: [ACTION_KEY],
    verdict: review.verdicts.get(WIDENING_GROUP_KEY) ?? null,
  };
}

function adoptionSample(): unknown {
  return {
    items: [
      {
        action: {
          actionKey: ACTION_KEY,
          sessionExternalId: 'session-1',
          operations: [
            {
              index: 0,
              capability: 'read',
              target: {
                kind: 'path',
                path: '~/.synthetic-credentials/token',
                isInsideWorkspace: false,
              },
              analyzability: 'full',
              program: 'cat',
              fragment: 'fragment not shown outside the sample panel',
              signals: [],
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
        targetKeys: ['~/.synthetic-credentials'],
        candidateDecision: {
          effect: 'deny',
          decidingOperationIndex: 0,
          operations: [
            {
              operationIndex: 0,
              zone: 'credentials',
              reversibility: 'reversible',
              matchedRuleIds: ['deny_credentials_access'],
              decidingRuleId: 'deny_credentials_access',
              effect: 'deny',
            },
          ],
        },
        candidateRuleRationales: {
          deny_credentials_access:
            'Reading credentials collapses every other boundary, so it is denied.',
        },
      },
    ],
  };
}

function conformance(): unknown {
  return {
    run: {
      replayRunId: CONFORMANCE_RUN_ID,
      policyVersionId: VERSION_1_ID,
      windowFrom: TS,
      windowTo: TS,
      unpairedPermissionRequests: 0,
    },
    items: [
      {
        findingKey: 'f'.repeat(64),
        kind: 'under_asked',
        capability: 'push',
        zone: 'public_remote',
        program: 'git',
        actionCount: 2,
        sessionCount: 1,
        firstOccurredAt: TS,
        lastOccurredAt: TS,
        sampleActionKeys: [ACTION_KEY],
      },
    ],
  };
}

function getString(raw: unknown, key: string): string | null {
  if (typeof raw === 'object' && raw !== null && key in raw) {
    const value: unknown = Reflect.get(raw, key);
    return typeof value === 'string' ? value : null;
  }
  return null;
}

function acceptedVersion(store: Store): Version | null {
  return store.versions.find((version) => version.status === 'accepted') ?? null;
}

function findReview(store: Store, pathname: string): Review | null {
  return store.reviews.find((review) => pathname.includes(`/change-reviews/${review.id}`)) ?? null;
}

function findVersion(store: Store, pathname: string): Version | null {
  return (
    store.versions.find((version) => pathname.includes(`/policy-versions/${version.id}`)) ?? null
  );
}

async function serve(route: Route, store: Store): Promise<void> {
  const request = route.request();
  const method = request.method();
  const url = new URL(request.url());
  const pathname = url.pathname.replace('/api/v1', '');
  const respond = (body: unknown, status = 200): Promise<void> =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

  if (method === 'GET' && pathname === '/activity-overview') {
    return respond(overview());
  }
  if (method === 'GET' && pathname === '/policies') {
    return respond({
      items: store.hasPolicy ? [{ id: POLICY_ID, name: 'org-default', createdAt: TS }] : [],
      nextCursor: null,
    });
  }
  if (method === 'POST' && pathname === '/policies') {
    store.hasPolicy = true;
    const initial: Version = {
      id: VERSION_1_ID,
      versionNumber: 1,
      status: 'draft',
      baseVersionId: null,
    };
    store.versions.push(initial);
    return respond(
      {
        policy: { id: POLICY_ID, name: 'org-default', createdAt: TS },
        initialVersion: versionBody(initial),
      },
      201,
    );
  }
  if (method === 'GET' && pathname === `/policies/${POLICY_ID}/versions`) {
    return respond({ items: store.versions.map(versionBody), nextCursor: null });
  }
  if (method === 'POST' && pathname === `/policies/${POLICY_ID}/versions`) {
    const base = getString(request.postDataJSON(), 'baseVersionId');
    const draft: Version = {
      id: VERSION_2_ID,
      versionNumber: 2,
      status: 'draft',
      baseVersionId: base,
    };
    store.versions.push(draft);
    return respond(versionBody(draft), 201);
  }
  if (method === 'GET' && pathname.startsWith('/policy-versions/')) {
    const version = findVersion(store, pathname);
    return version === null ? respond({}, 404) : respond(versionBody(version));
  }
  if (method === 'GET' && pathname === '/change-reviews') {
    return respond({ items: store.reviews.map(reviewBody), nextCursor: null });
  }
  if (method === 'POST' && pathname === '/change-reviews') {
    const candidateId = getString(request.postDataJSON(), 'candidateVersionId');
    const candidate = store.versions.find((version) => version.id === candidateId);
    if (candidate === undefined) {
      return respond({}, 404);
    }
    const baseline = acceptedVersion(store);
    candidate.status = 'in_review';
    const review: Review = {
      id: baseline === null ? ADOPTION_REVIEW_ID : CHANGE_REVIEW_ID,
      kind: baseline === null ? 'adoption' : 'change',
      candidateVersionId: candidate.id,
      baselineVersionId: baseline?.id ?? null,
      replayRunId: baseline === null ? ADOPTION_RUN_ID : CHANGE_RUN_ID,
      status: 'ready',
      verdicts: new Map(),
      decidedBy: null,
    };
    store.reviews.push(review);
    return respond(reviewBody(review), 202);
  }
  const review = findReview(store, pathname);
  if (review !== null) {
    if (method === 'GET' && pathname.endsWith('/adoption-groups')) {
      return respond({
        items: review.kind === 'adoption' ? adoptionGroups(review) : [],
        nextCursor: null,
      });
    }
    if (method === 'GET' && pathname.endsWith('/diff-groups')) {
      return respond({
        items: review.kind === 'change' ? [wideningGroup(review)] : [],
        nextCursor: null,
      });
    }
    if (method === 'PUT' && pathname.includes('/verdicts/')) {
      const groupKey = pathname.slice(pathname.lastIndexOf('/') + 1);
      const value = getString(request.postDataJSON(), 'verdict');
      if (value === 'expected' || value === 'investigate' || value === 'unexpected') {
        review.verdicts.set(groupKey, value);
      }
      return respond({ changeReviewId: review.id, groupKey, verdict: value, note: '' });
    }
    if (method === 'POST' && pathname.endsWith('/decisions')) {
      const body: unknown = request.postDataJSON();
      const decision = getString(body, 'decision');
      review.status = decision === 'accept' ? 'accepted' : 'rejected';
      review.decidedBy = getString(body, 'reviewerName');
      const candidate = store.versions.find((version) => version.id === review.candidateVersionId);
      if (candidate !== undefined) {
        candidate.status = decision === 'accept' ? 'accepted' : 'rejected';
      }
      return respond(reviewBody(review), 201);
    }
    if (method === 'GET' && pathname.endsWith('/report')) {
      return route.fulfill({
        status: 200,
        contentType: 'text/markdown',
        body: '# Evidence Report\n',
      });
    }
    if (method === 'GET') {
      return respond(reviewBody(review));
    }
  }
  if (method === 'GET' && pathname.startsWith('/replay-runs/')) {
    const run = store.reviews.find((entry) => pathname.endsWith(entry.replayRunId));
    return run === undefined ? respond({}, 404) : respond(runBody(run));
  }
  if (
    method === 'GET' &&
    pathname.startsWith('/adoption-groups/') &&
    pathname.endsWith('/samples')
  ) {
    return respond(pathname.includes(DENY_GROUP_KEY) ? adoptionSample() : { items: [] });
  }
  if (method === 'GET' && pathname.startsWith('/diff-groups/') && pathname.endsWith('/samples')) {
    return respond({ items: [] });
  }
  if (method === 'GET' && pathname === '/authority-map') {
    const accepted = acceptedVersion(store);
    return respond(
      accepted === null
        ? { run: null, cells: [], analyzability: { full: 0, partial: 0, none: 0 } }
        : {
            run: {
              replayRunId: ADOPTION_RUN_ID,
              policyVersionId: accepted.id,
              windowFrom: TS,
              windowTo: TS,
            },
            cells: [
              { capability: 'execute', zone: 'host', effect: 'ask', count: 250 },
              { capability: 'read', zone: 'workspace', effect: 'allow', count: 79 },
              { capability: 'read', zone: 'credentials', effect: 'deny', count: 1 },
            ],
            analyzability: { full: 250, partial: 60, none: 20 },
          },
    );
  }
  if (method === 'GET' && pathname === '/conformance-findings') {
    return respond(conformance());
  }
  return respond({}, 404);
}

async function expectNoEnforcementWording(page: Page): Promise<void> {
  await expect(page.getByText(/적용됨|활성화|enforced/)).toHaveCount(0);
}

test('an organization goes from no policy to an accepted first policy, a change review, and conformance', async ({
  page,
}) => {
  const store: Store = { hasPolicy: false, versions: [], reviews: [] };
  await page.addInitScript(() => {
    window.localStorage.setItem('authority.authToken', 'e2e-token');
  });
  await page.route('**/api/v1/**', (route) => serve(route, store));

  // 2. the overview of imported activity with no Policy yet
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '가져온 활동 개요 (최근 30일)' })).toBeVisible();
  await expect(page.getByText('340', { exact: true })).toBeVisible();
  await expect(page.getByText('synthetic-org')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '아직 조직 정책이 없습니다' })).toBeVisible();

  // 3. the first Policy: draft version 1 from the default template
  await page.getByRole('button', { name: '첫 조직 정책 만들기' }).click();
  await expect(page.getByRole('heading', { name: 'Policy Version', level: 1 })).toBeVisible();
  await expect(page.getByText('draft', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '최초 도입 검토 만들기' })).toBeVisible();

  // 4. the adoption preview: what the proposed policy would do to past Actions
  await page.getByRole('button', { name: '최초 도입 검토 만들기' }).click();
  await expect(page.getByRole('heading', { name: '최초 도입 검토', level: 1 })).toBeVisible();
  const effects = page.getByTestId('adoption-effects');
  await expect(effects).toContainText('허용');
  await expect(effects).toContainText('79');
  await expect(effects).toContainText('250');
  await expect(effects).toContainText('0.3%');
  await expect(page.getByText('없음 (최초 도입)')).toBeVisible();

  await page.goto('/');
  await expect(page.getByRole('link', { name: '최초 정책 설정 계속하기' })).toBeVisible();
  await expect(page.getByTestId('adoption-preview')).toContainText('250');
  await page.getByRole('link', { name: '최초 도입 검토 계속하기' }).click();

  // 5. the ask and deny groups, with the program mix inside the group
  await expect(page.getByRole('heading', { name: '확인 필요 group (1)' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '차단 group (1)' })).toBeVisible();
  await expect(page.getByText('판정하지 않은 group 2개').first()).toBeVisible();
  await expect(page.getByRole('button', { name: '최초 정책 채택' })).toBeDisabled();
  const denyRow = page.getByRole('row').filter({ hasText: 'credentials' });
  await denyRow.getByRole('link', { name: '보기' }).click();
  await expect(page.getByRole('heading', { name: 'Adoption Group', level: 1 })).toBeVisible();
  await expect(
    page.getByText("자격 증명에서의 읽기 1건이 이 정책에서 '차단' 대상이 됩니다."),
  ).toBeVisible();
  await expect(page.getByText('Program 구성: 서로 다른 program 1개, 상위 1개 표시')).toBeVisible();
  await expect(page.getByText(REDACTED_INPUT)).toBeVisible();
  await expect(page.getByText('제안 정책 결정')).toBeVisible();
  await expect(page.getByText('#0 read · credentials · ~/.synthetic-credentials')).toBeVisible();
  await expect(page.getByText('~/.synthetic-credentials/token')).toHaveCount(0);
  await expect(page.getByText('fragment not shown outside the sample panel')).toHaveCount(0);
  await expect(page.getByText('deny_credentials_access')).toBeHidden();
  await page.getByText('기술 세부').first().click();
  await expect(page.getByText('deny_credentials_access')).toBeVisible();

  // 6. every group intended, so the gate opens
  await page.getByLabel('read 판정').selectOption('expected');
  await page.getByRole('link', { name: '최초 도입 검토로 돌아가세요' }).click();
  await expect(page.getByText('판정하지 않은 group 1개').first()).toBeVisible();
  await page.getByLabel('execute 판정').selectOption('expected');
  await expect(page.getByText('Gate: 열림')).toBeVisible();

  // 7. the first Policy is adopted: version 1 becomes accepted, nothing is enforced
  await page.getByLabel('검토자 이름').fill('reviewer-e2e');
  await page.getByRole('button', { name: '최초 정책 채택' }).click();
  await expect(page.getByRole('heading', { name: '결정 기록' })).toBeVisible();
  await expect(page.getByText('최초 정책 채택', { exact: true })).toBeVisible();
  await expect(page.getByLabel('execute 판정')).toBeDisabled();
  await expectNoEnforcementWording(page);

  await page.goto('/');
  await expect(page.getByRole('heading', { name: '채택된 정책: version #1' })).toBeVisible();
  await expect(page.getByTestId('map-effects')).toContainText('250');
  await expectNoEnforcementWording(page);

  // 8. a version 2 draft from the accepted version 1
  await page.getByRole('link', { name: '채택된 version 보기' }).click();
  await expect(page.getByText('채택됨', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '이 version에서 draft 만들기' }).click();
  await expect(page.getByText('#2', { exact: true })).toBeVisible();

  // 9. a change review compares version 2 against the accepted baseline
  await page.getByRole('button', { name: '변경 검토 만들기' }).click();
  await expect(page.getByRole('heading', { name: 'Change Review', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Widening group (1)' })).toBeVisible();
  await expect(page.getByText('넓어진 action')).toBeVisible();
  await page.getByLabel('fetch 판정').selectOption('expected');
  await expect(page.getByText('Gate: 열림')).toBeVisible();

  // 10. conformance compares runtime observations with the accepted Policy
  await page.goto('/conformance');
  const finding = page.getByRole('row').filter({ hasText: 'under_asked' });
  await expect(finding).toContainText('push');
  await expectNoEnforcementWording(page);
});
