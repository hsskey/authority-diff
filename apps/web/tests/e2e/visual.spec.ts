import { expect, test, type Page, type Route } from '@playwright/test';

// Six screens on one seeded synthetic fixture, light and dark at 1280x800.
// API routes are the named seam; the UI, router, and query layer are real.
// Fonts are pinned to Liberation Sans / Unifont from the Playwright Docker image.

const SUFFIX = '0123456789ABCDEFGHJKMNPQRS';
const POLICY_ID = `pol_${SUFFIX}`;
const ACCEPTED_VERSION_ID = `pver_1${SUFFIX.slice(1)}`;
const DRAFT_VERSION_ID = `pver_2${SUFFIX.slice(1)}`;
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
const TRACE_SOURCES = { transcript: 340, hook: 0, synthetic: 2 };
const COLOR_SCHEMES = ['light', 'dark'] as const;

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
    {
      ruleId: 'allow_trusted_fetch',
      match: {
        capabilities: ['fetch', 'install'],
        zones: ['trusted_remote'],
        reversibility: null,
        analyzability: null,
      },
      effect: 'allow',
      rationale: 'Fetching from an approved registry or internal host is an expected action.',
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

function versionBody(id: string, versionNumber: number, status: 'accepted' | 'draft'): unknown {
  return {
    id,
    policyId: POLICY_ID,
    versionNumber,
    status,
    document: DOCUMENT,
    contentHash: HASH,
    baseVersionId: status === 'draft' ? ACCEPTED_VERSION_ID : null,
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

function changeReview(): unknown {
  return {
    id: CHANGE_REVIEW_ID,
    policyId: POLICY_ID,
    kind: 'change',
    candidateVersionId: DRAFT_VERSION_ID,
    candidateContentHash: HASH,
    baselineVersionId: ACCEPTED_VERSION_ID,
    windowFrom: TS,
    windowTo: TS,
    replayRunId: CHANGE_RUN_ID,
    status: 'ready',
    decidedBy: null,
    decidedAt: null,
    decisionNote: null,
    createdAt: TS,
    replaySummary: {
      replayRunId: CHANGE_RUN_ID,
      status: 'completed',
      stats: {
        totalActions: 340,
        evaluatedActions: 330,
        excludedActions: 10,
        changedActions: 3,
        transitions: transitions(),
      },
      resultHash: HASH,
    },
    traceSources: TRACE_SOURCES,
    gate: { isOpen: false, blockers: [{ code: 'widening_unreviewed', count: 1 }] },
  };
}

function adoptionReview(): unknown {
  return {
    id: ADOPTION_REVIEW_ID,
    policyId: POLICY_ID,
    kind: 'adoption',
    candidateVersionId: ACCEPTED_VERSION_ID,
    candidateContentHash: HASH,
    baselineVersionId: null,
    windowFrom: TS,
    windowTo: TS,
    replayRunId: ADOPTION_RUN_ID,
    status: 'ready',
    decidedBy: null,
    decidedAt: null,
    decisionNote: null,
    createdAt: TS,
    replaySummary: {
      replayRunId: ADOPTION_RUN_ID,
      status: 'completed',
      stats: null,
      resultHash: HASH,
    },
    traceSources: TRACE_SOURCES,
    gate: { isOpen: false, blockers: [{ code: 'adoption_unreviewed', count: 2 }] },
  };
}

function adoptionRun(): unknown {
  return {
    id: ADOPTION_RUN_ID,
    kind: 'adoption',
    candidateVersionId: ACCEPTED_VERSION_ID,
    baselineVersionId: null,
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

function wideningGroup(): unknown {
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
    verdict: null,
  };
}

function adoptionGroups(): unknown[] {
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
      verdict: null,
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
      verdict: null,
    },
  ];
}

function diffSamples(): unknown {
  return {
    items: [
      {
        action: {
          actionKey: ACTION_KEY,
          sessionExternalId: 'session-1',
          operations: [
            {
              index: 0,
              capability: 'fetch',
              target: { kind: 'host', host: 'github.com', scheme: 'https' },
              analyzability: 'full',
              program: 'git',
              fragment: 'fragment not shown outside the sample panel',
              signals: ['network'],
            },
          ],
          observedOutcome: 'executed',
          occurredAt: TS,
          toolName: 'Bash',
          toolInputRedacted: 'git fetch origin',
          isInputTruncated: false,
          isSidechain: false,
          classifierVersion: 'v1',
          recordedAt: TS,
        },
        targetKeys: ['github.com/synthetic-org/repo-a'],
        baselineDecision: {
          effect: 'ask',
          decidingOperationIndex: 0,
          operations: [
            {
              operationIndex: 0,
              zone: 'unknown_remote',
              reversibility: 'reversible',
              matchedRuleIds: [],
              decidingRuleId: null,
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
              zone: 'trusted_remote',
              reversibility: 'reversible',
              matchedRuleIds: ['allow_trusted_fetch'],
              decidingRuleId: 'allow_trusted_fetch',
              effect: 'allow',
            },
          ],
        },
        baselineRuleRationales: {},
        candidateRuleRationales: {
          allow_trusted_fetch:
            'Fetching from an approved registry or internal host is an expected action.',
        },
      },
    ],
  };
}

function conformance(): unknown {
  return {
    run: {
      replayRunId: CONFORMANCE_RUN_ID,
      policyVersionId: ACCEPTED_VERSION_ID,
      windowFrom: TS,
      windowTo: TS,
      unpairedPermissionRequests: 0,
      byPermissionMode: [
        { permissionMode: 'bypassPermissions', actionCount: 12, findingCount: 1 },
        { permissionMode: 'default', actionCount: 318, findingCount: 0 },
      ],
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

async function fulfillFixture(route: Route): Promise<void> {
  const method = route.request().method();
  const pathname = new URL(route.request().url()).pathname.replace('/api/v1', '');
  const respond = (body: unknown): Promise<void> =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

  if (method === 'GET' && pathname === '/activity-overview') {
    return respond(overview());
  }
  if (method === 'GET' && pathname === '/policies') {
    return respond({
      items: [{ id: POLICY_ID, name: 'org-default', createdAt: TS }],
      nextCursor: null,
    });
  }
  if (method === 'GET' && pathname === `/policies/${POLICY_ID}/versions`) {
    return respond({
      items: [
        versionBody(ACCEPTED_VERSION_ID, 1, 'accepted'),
        versionBody(DRAFT_VERSION_ID, 2, 'draft'),
      ],
      nextCursor: null,
    });
  }
  if (method === 'GET' && pathname === `/policy-versions/${ACCEPTED_VERSION_ID}`) {
    return respond(versionBody(ACCEPTED_VERSION_ID, 1, 'accepted'));
  }
  if (method === 'GET' && pathname === `/policy-versions/${DRAFT_VERSION_ID}`) {
    return respond(versionBody(DRAFT_VERSION_ID, 2, 'draft'));
  }
  if (method === 'GET' && pathname === '/authority-map') {
    return respond({
      run: {
        replayRunId: ADOPTION_RUN_ID,
        policyVersionId: ACCEPTED_VERSION_ID,
        windowFrom: TS,
        windowTo: TS,
      },
      cells: [
        { capability: 'execute', zone: 'host', effect: 'ask', count: 250 },
        { capability: 'read', zone: 'workspace', effect: 'allow', count: 79 },
        { capability: 'read', zone: 'credentials', effect: 'deny', count: 1 },
      ],
      analyzability: { full: 250, partial: 60, none: 20 },
    });
  }
  if (method === 'GET' && pathname === `/change-reviews/${CHANGE_REVIEW_ID}/diff-groups`) {
    return respond({ items: [wideningGroup()], nextCursor: null });
  }
  if (method === 'GET' && pathname === `/change-reviews/${ADOPTION_REVIEW_ID}/adoption-groups`) {
    return respond({ items: adoptionGroups(), nextCursor: null });
  }
  if (method === 'GET' && pathname === `/change-reviews/${CHANGE_REVIEW_ID}`) {
    return respond(changeReview());
  }
  if (method === 'GET' && pathname === `/change-reviews/${ADOPTION_REVIEW_ID}`) {
    return respond(adoptionReview());
  }
  if (method === 'GET' && pathname === '/change-reviews') {
    return respond({ items: [adoptionReview(), changeReview()], nextCursor: null });
  }
  if (method === 'GET' && pathname === `/replay-runs/${ADOPTION_RUN_ID}`) {
    return respond(adoptionRun());
  }
  if (
    method === 'GET' &&
    pathname === `/diff-groups/${CHANGE_RUN_ID}/${WIDENING_GROUP_KEY}/samples`
  ) {
    return respond(diffSamples());
  }
  if (method === 'GET' && pathname === '/conformance-findings') {
    return respond(conformance());
  }
  return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
}

async function seed(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem('authority.authToken', 'e2e-token');
    const style = document.createElement('style');
    style.textContent =
      'html,body,button,input,textarea,select,table{font-family:"Liberation Sans",Unifont,sans-serif!important}';
    document.documentElement.appendChild(style);
  });
  await page.route('**/api/v1/**', fulfillFixture);
}

async function capture(page: Page, name: string, colorScheme: string): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot(`${name}-${colorScheme}.png`);
}

const SCREENS: { name: string; path: string; ready: (page: Page) => Promise<void> }[] = [
  {
    name: 'overview-state-c',
    path: '/',
    ready: async (page) => {
      await expect(
        page.getByRole('heading', { name: 'Accepted policy: version #1' }),
      ).toBeVisible();
      await expect(page.getByTestId('map-effects')).toBeVisible();
    },
  },
  {
    name: 'change-review',
    path: `/change-reviews/${CHANGE_REVIEW_ID}`,
    ready: async (page) => {
      await expect(page.getByRole('heading', { name: 'Change review', level: 1 })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Widening groups (1)' })).toBeVisible();
    },
  },
  {
    name: 'group-detail',
    path: `/change-reviews/${CHANGE_REVIEW_ID}/groups/${WIDENING_GROUP_KEY}`,
    ready: async (page) => {
      await expect(page.getByRole('heading', { name: 'Diff Group', level: 1 })).toBeVisible();
      await expect(page.getByText('Baseline decision')).toBeVisible();
    },
  },
  {
    name: 'adoption-review',
    path: `/change-reviews/${ADOPTION_REVIEW_ID}`,
    ready: async (page) => {
      await expect(
        page.getByRole('heading', { name: 'Initial adoption review', level: 1 }),
      ).toBeVisible();
      await expect(page.getByTestId('adoption-effects')).toBeVisible();
    },
  },
  {
    name: 'conformance',
    path: '/conformance',
    ready: async (page) => {
      await expect(page.getByRole('heading', { name: 'Conformance', level: 1 })).toBeVisible();
      await expect(page.getByRole('row').filter({ hasText: 'under_asked' })).toBeVisible();
    },
  },
  {
    name: 'policy-editor',
    path: `/policies/${POLICY_ID}/versions/${DRAFT_VERSION_ID}`,
    ready: async (page) => {
      await expect(page.getByRole('heading', { name: 'Policy Version', level: 1 })).toBeVisible();
      await expect(page.getByLabel('Policy document JSON')).toBeVisible();
    },
  },
];

for (const colorScheme of COLOR_SCHEMES) {
  test.describe(colorScheme, () => {
    test.use({ colorScheme });

    for (const screen of SCREENS) {
      test(screen.name, async ({ page }) => {
        await seed(page);
        await page.goto(screen.path);
        await screen.ready(page);
        await capture(page, screen.name, colorScheme);
      });
    }
  });
}
