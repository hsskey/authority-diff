import { describe, expect, test } from 'vitest';
import { err, ok, IsoTimestampSchema } from '@authority/kernel';
import type { AppError, Result } from '@authority/kernel';
import { createFixedClock, createSequentialIdGenerator } from '@authority/platform/testing';
import { DEFAULT_POLICY_DOCUMENT } from '@authority/policy';
import {
  PolicyIdSchema,
  PolicyVersionIdSchema,
  PolicyVersionSchema,
} from '@authority/policy/schema';
import type { PolicyVersion } from '@authority/policy/schema';
import type { ReplayModule } from '@authority/replay';
import { ConformanceFindingViewSchema } from '@authority/replay/schema';
import type { ConformanceFindingView } from '@authority/replay/schema';
import { assembleReviewModule } from '../index.ts';
import type { PolicyReviewRepository, ReviewStore } from '../index.ts';

const FINDING_KEY = 'ab'.repeat(32);
const VERSION_ID = PolicyVersionIdSchema.parse(`pver_${'A'.repeat(26)}`);
const POLICY_ID = PolicyIdSchema.parse(`pol_${'B'.repeat(26)}`);
const DRAFT_ID = PolicyVersionIdSchema.parse(`pver_${'C'.repeat(26)}`);
const TS = IsoTimestampSchema.parse('2026-01-02T03:04:05.006Z');
const HASH = 'd'.repeat(64);

function sampleFinding(overrides: Partial<ConformanceFindingView> = {}): ConformanceFindingView {
  return ConformanceFindingViewSchema.parse({
    findingKey: FINDING_KEY,
    kind: 'over_asked',
    capability: 'push',
    zone: 'public_remote',
    program: 'git',
    actionCount: 2,
    sessionCount: 1,
    firstOccurredAt: TS,
    lastOccurredAt: TS,
    sampleActionKeys: ['e'.repeat(64)],
    status: 'open',
    note: '',
    ...overrides,
  });
}

function sampleVersion(overrides: Partial<PolicyVersion> = {}): PolicyVersion {
  return PolicyVersionSchema.parse({
    id: VERSION_ID,
    policyId: POLICY_ID,
    versionNumber: 1,
    status: 'accepted',
    document: DEFAULT_POLICY_DOCUMENT,
    contentHash: HASH,
    baseVersionId: null,
    createdAt: TS,
    updatedAt: TS,
    ...overrides,
  });
}

function unusedStore(): ReviewStore {
  return {
    insertChangeReview: () => Promise.resolve(),
    getChangeReview: () => Promise.resolve(null),
    findOpenChangeReview: () => Promise.resolve(null),
    listChangeReviews: () => Promise.resolve([]),
    updateStatus: () => Promise.resolve(),
    failReview: () => Promise.resolve(),
    withdrawReview: () => Promise.resolve(false),
    upsertVerdict: () => Promise.resolve(),
    getVerdict: () => Promise.resolve(null),
    listVerdicts: () => Promise.resolve([]),
    decide: () => Promise.resolve(ok(undefined)),
    getDecision: () => Promise.resolve(null),
    getChainedDecision: () => Promise.resolve(null),
    getAuditTail: () => Promise.resolve(null),
  };
}

function unusedReplay(overrides: Partial<ReplayModule> = {}): ReplayModule {
  const unconfigured = <T>(): Promise<Result<T, AppError>> =>
    Promise.resolve(
      err({
        code: 'internal.unexpected',
        message: 'module method not configured for this test',
        isRetryable: false,
        details: null,
        cause: null,
      }),
    );
  return {
    requestReplay: () => unconfigured(),
    requestConformanceReplay: () => unconfigured(),
    requestAdoptionReplay: () => unconfigured(),
    listConformanceFindings: () => Promise.resolve({ run: null, items: [] }),
    getConformanceFinding: () => unconfigured(),
    acknowledgeConformanceFinding: () => unconfigured(),
    getRun: () => Promise.resolve(null),
    listDiffGroups: () => unconfigured(),
    getSamples: () => unconfigured(),
    listAdoptionGroups: () => unconfigured(),
    getAdoptionSamples: () => unconfigured(),
    getAuthorityMap: () =>
      Promise.resolve({ run: null, cells: [], analyzability: { full: 0, partial: 0, none: 0 } }),
    recoverInterruptedRuns: () => Promise.resolve(),
    ...overrides,
  };
}

function unusedPolicy(overrides: Partial<PolicyReviewRepository> = {}): PolicyReviewRepository {
  const unconfigured = <T>(): Promise<Result<T, AppError>> =>
    Promise.resolve(
      err({
        code: 'internal.unexpected',
        message: 'module method not configured for this test',
        isRetryable: false,
        details: null,
        cause: null,
      }),
    );
  return {
    getVersion: () => unconfigured(),
    getBaseline: () => unconfigured(),
    submitForReview: () => unconfigured(),
    createDraftVersion: () => unconfigured(),
    updateDraftDocument: () => unconfigured(),
    ...overrides,
  };
}

function makeModule(input: {
  readonly replay?: Partial<ReplayModule>;
  readonly policy?: Partial<PolicyReviewRepository>;
}) {
  return assembleReviewModule({
    store: unusedStore(),
    replay: unusedReplay(input.replay),
    policy: unusedPolicy(input.policy),
    traceSources: {
      countActionsBySource: () => Promise.resolve({ transcript: 0, hook: 0, synthetic: 0 }),
    },
    clock: createFixedClock(TS),
    idGenerator: createSequentialIdGenerator(),
  });
}

describe('createPolicyDraftFromFinding', () => {
  test('creates a draft from the run candidate and appends a capability/zone Rule', async () => {
    const finding = sampleFinding();
    const base = sampleVersion();
    const copied = sampleVersion({
      id: DRAFT_ID,
      status: 'draft',
      versionNumber: 2,
      baseVersionId: VERSION_ID,
    });
    const module = makeModule({
      replay: {
        getConformanceFinding: () => Promise.resolve(ok({ finding, policyVersionId: VERSION_ID })),
      },
      policy: {
        getVersion: () =>
          Promise.resolve(
            ok({
              id: base.id,
              policyId: base.policyId,
              contentHash: base.contentHash,
              status: base.status,
            }),
          ),
        createDraftVersion: () => Promise.resolve(ok(copied)),
        updateDraftDocument: (_id, _ifMatch, document) =>
          Promise.resolve(ok({ ...copied, document, contentHash: 'f'.repeat(64) })),
      },
    });

    const result = await module.createPolicyDraftFromFinding(FINDING_KEY);
    if (!result.ok) {
      throw new Error(result.error.code);
    }
    const added = result.value.document.rules.at(-1);
    expect(added).toMatchObject({
      ruleId: `cfnd_${FINDING_KEY.slice(0, 12)}`,
      effect: 'ask',
      match: {
        capabilities: ['push'],
        zones: ['public_remote'],
        reversibility: null,
        analyzability: null,
      },
    });
    expect(result.value.document.rules).toHaveLength(DEFAULT_POLICY_DOCUMENT.rules.length + 1);
  });

  test('suffixes the drafted Rule id when the stem already exists', async () => {
    const stem = `cfnd_${FINDING_KEY.slice(0, 12)}`;
    const template = DEFAULT_POLICY_DOCUMENT.rules[0];
    if (template === undefined) {
      throw new Error('the default Policy Document has a Rule');
    }
    const copied = sampleVersion({
      id: DRAFT_ID,
      status: 'draft',
      document: {
        ...DEFAULT_POLICY_DOCUMENT,
        rules: [...DEFAULT_POLICY_DOCUMENT.rules, { ...template, ruleId: stem }],
      },
    });
    const module = makeModule({
      replay: {
        getConformanceFinding: () =>
          Promise.resolve(ok({ finding: sampleFinding(), policyVersionId: VERSION_ID })),
      },
      policy: {
        getVersion: () =>
          Promise.resolve(
            ok({
              id: VERSION_ID,
              policyId: POLICY_ID,
              contentHash: HASH,
              status: 'accepted',
            }),
          ),
        createDraftVersion: () => Promise.resolve(ok(copied)),
        updateDraftDocument: (_id, _ifMatch, document) =>
          Promise.resolve(ok({ ...copied, document })),
      },
    });

    const result = await module.createPolicyDraftFromFinding(FINDING_KEY);
    if (!result.ok) {
      throw new Error(result.error.code);
    }

    expect(result.value.document.rules.at(-1)?.ruleId).toBe(`${stem}_2`);
  });

  test.each([
    ['under_asked', 'allow'],
    ['violation', 'allow'],
  ] as const)('a %s finding drafts an %s Rule', async (kind, effect) => {
    const finding = sampleFinding({ kind });
    const copied = sampleVersion({
      id: DRAFT_ID,
      status: 'draft',
      document: { ...DEFAULT_POLICY_DOCUMENT, rules: [] },
    });
    const module = makeModule({
      replay: {
        getConformanceFinding: () => Promise.resolve(ok({ finding, policyVersionId: VERSION_ID })),
      },
      policy: {
        getVersion: () =>
          Promise.resolve(
            ok({
              id: VERSION_ID,
              policyId: POLICY_ID,
              contentHash: HASH,
              status: 'accepted',
            }),
          ),
        createDraftVersion: () => Promise.resolve(ok(copied)),
        updateDraftDocument: (_id, _ifMatch, document) =>
          Promise.resolve(ok({ ...copied, document })),
      },
    });

    const result = await module.createPolicyDraftFromFinding(FINDING_KEY);
    if (!result.ok) {
      throw new Error(result.error.code);
    }

    expect(result.value.document.rules[0]?.effect).toBe(effect);
  });

  test('passes through finding_not_found and draft_exists', async () => {
    const missing = makeModule({
      replay: {
        getConformanceFinding: () =>
          Promise.resolve(
            err({
              code: 'replay.finding_not_found',
              message: 'no Conformance Finding for the given finding key',
              isRetryable: false,
              details: { findingKey: FINDING_KEY },
              cause: null,
            }),
          ),
      },
    });
    const conflict = makeModule({
      replay: {
        getConformanceFinding: () =>
          Promise.resolve(ok({ finding: sampleFinding(), policyVersionId: VERSION_ID })),
      },
      policy: {
        getVersion: () =>
          Promise.resolve(
            ok({
              id: VERSION_ID,
              policyId: POLICY_ID,
              contentHash: HASH,
              status: 'accepted',
            }),
          ),
        createDraftVersion: () =>
          Promise.resolve(
            err({
              code: 'policy.draft_exists',
              message: 'already has an open draft',
              isRetryable: false,
              details: { policyId: POLICY_ID },
              cause: null,
            }),
          ),
      },
    });

    const notFound = await missing.createPolicyDraftFromFinding(FINDING_KEY);
    const exists = await conflict.createPolicyDraftFromFinding(FINDING_KEY);

    expect(notFound.ok).toBe(false);
    if (!notFound.ok) {
      expect(notFound.error.code).toBe('replay.finding_not_found');
    }
    expect(exists.ok).toBe(false);
    if (!exists.ok) {
      expect(exists.error.code).toBe('policy.draft_exists');
    }
  });
});
