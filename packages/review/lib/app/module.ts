import { err, ok } from '@authority/kernel';
import type { AppError, Clock, IdGenerator, IsoTimestamp, Result } from '@authority/kernel';
import type { PolicyId, PolicyVersionId } from '@authority/policy/schema';
import type { ReplayModule } from '@authority/replay';
import type {
  AdoptionGroup,
  DiffGroup,
  ReplayRun,
  ReplayRunStatus,
  ReplayStats,
} from '@authority/replay/schema';
import {
  ChangeReviewIdSchema,
  type ChangeReview,
  type ChangeReviewId,
  type Gate,
  type ReviewDecision,
  type Verdict,
  type VerdictSnapshotEntry,
} from '../../schema.ts';
import { computeGate } from '../domain/gate.ts';
import {
  renderAdoptionReport,
  renderReport,
  type AdoptionReportGroup,
  type ReportDecision,
  type ReportGroup,
} from '../domain/report.ts';
import type { ChainedDecision, ReviewStore } from './ports.ts';

/** The narrow policy surface the review module reads and transitions. */
export interface PolicyVersionSummary {
  readonly id: PolicyVersionId;
  readonly policyId: PolicyId;
  readonly contentHash: string;
  readonly status: string;
}

export interface PolicyReviewRepository {
  getVersion(id: PolicyVersionId): Promise<Result<PolicyVersionSummary, AppError>>;
  /** The latest accepted version, or `policy.no_accepted_version` when none was accepted yet. */
  getBaseline(
    policyId: PolicyId,
  ): Promise<Result<{ id: PolicyVersionId; contentHash: string }, AppError>>;
  submitForReview(id: PolicyVersionId): Promise<Result<void, AppError>>;
}

/** `stats` is the diff stats of a change review's run; an adoption run's stats live on the run. */
export interface ReplaySummary {
  readonly replayRunId: ReplayRun['id'] | null;
  readonly status: ReplayRunStatus;
  readonly stats: ReplayStats | null;
  readonly resultHash: string | null;
}

export interface ChangeReviewView {
  readonly review: ChangeReview;
  readonly replaySummary: ReplaySummary;
  readonly gate: Gate;
}

export interface CreateChangeReviewInput {
  readonly candidateVersionId: PolicyVersionId;
  readonly windowFrom: IsoTimestamp;
  readonly windowTo: IsoTimestamp;
}

export interface RecordVerdictInput {
  readonly changeReviewId: ChangeReviewId;
  readonly groupKey: string;
  readonly verdict: Verdict;
  readonly note: string;
}

export interface RecordedVerdict {
  readonly changeReviewId: ChangeReviewId;
  readonly groupKey: string;
  readonly verdict: Verdict;
  readonly note: string;
}

export interface DecideInput {
  readonly changeReviewId: ChangeReviewId;
  readonly decision: 'accept' | 'reject';
  readonly note: string;
  readonly reviewerName: string;
}

export interface ReviewDiffGroup extends DiffGroup {
  readonly verdict: Verdict | null;
}

export interface ListReviewDiffGroupsInput {
  readonly direction?: DiffGroup['direction'] | undefined;
  readonly severity?: DiffGroup['severity'] | undefined;
  readonly verdict?: Verdict | undefined;
  readonly cursor?: string | undefined;
  readonly limit: number;
}

export interface ReviewDiffGroupsResult {
  readonly items: readonly ReviewDiffGroup[];
  readonly nextCursor: string | null;
}

export interface ReviewAdoptionGroup extends AdoptionGroup {
  readonly verdict: Verdict | null;
}

/** `cursor` is the groupKey of the last group returned, in the run's review order. */
export interface ListReviewAdoptionGroupsInput {
  readonly effect?: AdoptionGroup['effect'] | undefined;
  readonly verdict?: Verdict | undefined;
  readonly cursor?: string | undefined;
  readonly limit: number;
}

export interface ReviewAdoptionGroupsResult {
  readonly items: readonly ReviewAdoptionGroup[];
  readonly nextCursor: string | null;
}

/** `cursor` is the id of the last review returned, in newest-first order. */
export interface ListChangeReviewsInput {
  readonly policyId: PolicyId;
  readonly cursor?: string | undefined;
  readonly limit: number;
}

export interface ChangeReviewsResult {
  readonly items: readonly ChangeReviewView[];
  readonly nextCursor: string | null;
}

export interface ReviewModule {
  createChangeReview(input: CreateChangeReviewInput): Promise<Result<ChangeReviewView, AppError>>;
  getChangeReview(id: ChangeReviewId): Promise<Result<ChangeReviewView, AppError>>;
  /** The Policy's reviews of either kind, newest first, each with its replay summary and gate. */
  listChangeReviews(input: ListChangeReviewsInput): Promise<Result<ChangeReviewsResult, AppError>>;
  recordVerdict(input: RecordVerdictInput): Promise<Result<RecordedVerdict, AppError>>;
  decide(input: DecideInput): Promise<Result<ChangeReviewView, AppError>>;
  getDecision(id: ChangeReviewId): Promise<Result<ReviewDecision | null, AppError>>;
  getReport(id: ChangeReviewId): Promise<Result<string, AppError>>;
  listDiffGroups(
    id: ChangeReviewId,
    input: ListReviewDiffGroupsInput,
  ): Promise<Result<ReviewDiffGroupsResult, AppError>>;
  /** An adoption review's Adoption Groups with their Verdicts; empty for a change review. */
  listAdoptionGroups(
    id: ChangeReviewId,
    input: ListReviewAdoptionGroupsInput,
  ): Promise<Result<ReviewAdoptionGroupsResult, AppError>>;
}

export interface AssembleReviewModuleDeps {
  readonly store: ReviewStore;
  readonly replay: ReplayModule;
  readonly policy: PolicyReviewRepository;
  readonly clock: Clock;
  readonly idGenerator: IdGenerator;
}

function notFound(id: ChangeReviewId): AppError {
  return {
    code: 'review.not_found',
    message: `no change review ${id}`,
    isRetryable: false,
    details: { id },
    cause: null,
  };
}

function notOpen(id: ChangeReviewId): AppError {
  return {
    code: 'review.not_open',
    message: `change review ${id} is not open for this operation`,
    isRetryable: false,
    details: { id },
    cause: null,
  };
}

function openReviewExists(policyId: PolicyId, changeReviewId: ChangeReviewId): AppError {
  return {
    code: 'review.open_review_exists',
    message: `policy ${policyId} already has an open review; decide it before creating another`,
    isRetryable: false,
    details: { policyId, changeReviewId },
    cause: null,
  };
}

function transitionNotAllowed(id: PolicyVersionId, status: string): AppError {
  return {
    code: 'policy.transition_not_allowed',
    message: `candidate version ${id} is ${status} and cannot enter review`,
    isRetryable: false,
    details: { id, status },
    cause: null,
  };
}

function gateBlocked(gate: Gate): AppError {
  return {
    code: 'review.gate_blocked',
    message: 'the acceptance gate is closed; resolve every blocker before accepting',
    isRetryable: false,
    details: { blockers: gate.blockers },
    cause: null,
  };
}

function groupNotFound(groupKey: string): AppError {
  return {
    code: 'replay.group_not_found',
    message: `no group ${groupKey} in this review's replay`,
    isRetryable: false,
    details: { groupKey },
    cause: null,
  };
}

/** A change review's replay is a version_diff run; any other kind has no diff stats. */
function diffStatsOf(run: ReplayRun): ReplayStats | null {
  return run.kind === 'version_diff' ? run.stats : null;
}

function replaySummaryOf(run: ReplayRun | null): ReplaySummary {
  if (run === null) {
    return { replayRunId: null, status: 'queued', stats: null, resultHash: null };
  }
  return {
    replayRunId: run.id,
    status: run.status,
    stats: diffStatsOf(run),
    resultHash: run.resultHash,
  };
}

function reportDecisionOf(chained: ChainedDecision): ReportDecision {
  return {
    decision: chained.decision.decision,
    reviewerName: chained.decision.reviewerName,
    decidedAt: chained.decision.decidedAt,
    note: chained.decision.note,
    sequence: chained.sequence,
    hash: chained.hash,
    replayInputsHash: chained.decision.replayInputsHash,
    replayResultHash: chained.decision.replayResultHash,
  };
}

export function assembleReviewModule(deps: AssembleReviewModuleDeps): ReviewModule {
  const { store, replay, policy, clock, idGenerator } = deps;

  const fetchAllDiffGroups = async (
    runId: ReplayRun['id'],
  ): Promise<Result<readonly DiffGroup[], AppError>> => {
    const groups: DiffGroup[] = [];
    let cursor: string | undefined;
    do {
      const page = await replay.listDiffGroups(runId, { limit: 200, cursor });
      if (!page.ok) {
        return page;
      }
      groups.push(...page.value.items);
      cursor = page.value.nextCursor ?? undefined;
    } while (cursor !== undefined);
    return ok(groups);
  };

  const fetchAllAdoptionGroups = async (
    runId: ReplayRun['id'],
  ): Promise<Result<readonly AdoptionGroup[], AppError>> => {
    const groups: AdoptionGroup[] = [];
    let cursor: string | undefined;
    do {
      const page = await replay.listAdoptionGroups(runId, { limit: 200, cursor });
      if (!page.ok) {
        return page;
      }
      groups.push(...page.value.items);
      cursor = page.value.nextCursor ?? undefined;
    } while (cursor !== undefined);
    return ok(groups);
  };

  const verdictsByGroup = async (reviewId: ChangeReviewId): Promise<Map<string, Verdict>> => {
    const verdicts = await store.listVerdicts(reviewId);
    return new Map(verdicts.map((entry) => [entry.groupKey, entry.verdict]));
  };

  // The groups a kind puts under review: a change review's Widening groups, an
  // adoption review's ask and deny groups.
  const gateVerdicts = async (
    review: ChangeReview,
    runId: ReplayRun['id'],
  ): Promise<Result<readonly (Verdict | null)[], AppError>> => {
    const verdicts = await verdictsByGroup(review.id);
    if (review.kind === 'adoption') {
      const groups = await fetchAllAdoptionGroups(runId);
      if (!groups.ok) {
        return groups;
      }
      return ok(groups.value.map((group) => verdicts.get(group.groupKey) ?? null));
    }
    const groups = await fetchAllDiffGroups(runId);
    if (!groups.ok) {
      return groups;
    }
    return ok(
      groups.value
        .filter((group) => group.direction === 'widening')
        .map((group) => verdicts.get(group.groupKey) ?? null),
    );
  };

  const gateFor = async (
    review: ChangeReview,
    run: ReplayRun | null,
  ): Promise<Result<Gate, AppError>> => {
    const { kind } = review;
    if (run === null || run.status === 'failed') {
      return ok(computeGate({ kind, replayCompleted: false, replayFailed: true, verdicts: [] }));
    }
    if (run.status !== 'completed') {
      return ok(computeGate({ kind, replayCompleted: false, replayFailed: false, verdicts: [] }));
    }
    const verdicts = await gateVerdicts(review, run.id);
    if (!verdicts.ok) {
      return verdicts;
    }
    return ok(
      computeGate({ kind, replayCompleted: true, replayFailed: false, verdicts: verdicts.value }),
    );
  };

  /** Every group of the review's replay that a Verdict may be recorded on. */
  const reviewGroupKeys = async (
    review: ChangeReview,
    runId: ReplayRun['id'],
  ): Promise<Result<ReadonlySet<string>, AppError>> => {
    const groups =
      review.kind === 'adoption'
        ? await fetchAllAdoptionGroups(runId)
        : await fetchAllDiffGroups(runId);
    if (!groups.ok) {
      return groups;
    }
    return ok(new Set(groups.value.map((group) => group.groupKey)));
  };

  /** Null for an adoption review, which has no baseline. */
  const baselineContentHashOf = async (
    review: ChangeReview,
  ): Promise<Result<string | null, AppError>> => {
    if (review.baselineVersionId === null) {
      return ok(null);
    }
    const baseline = await policy.getVersion(review.baselineVersionId);
    return baseline.ok ? ok(baseline.value.contentHash) : err(baseline.error);
  };

  // Poll behaviour: a review left `computing` catches up to the linked replay's
  // terminal status the next time it is read (docs/cutline.md section 5).
  const syncStatus = async (review: ChangeReview): Promise<ChangeReview> => {
    if (review.status !== 'computing' || review.replayRunId === null) {
      return review;
    }
    const run = await replay.getRun(review.replayRunId);
    if (run === null) {
      return review;
    }
    if (run.status === 'completed') {
      await store.updateStatus(review.id, 'ready');
      return { ...review, status: 'ready' };
    }
    if (run.status === 'failed') {
      await store.updateStatus(review.id, 'failed');
      return { ...review, status: 'failed' };
    }
    return review;
  };

  const viewOf = async (review: ChangeReview): Promise<Result<ChangeReviewView, AppError>> => {
    const run = review.replayRunId === null ? null : await replay.getRun(review.replayRunId);
    const gate = await gateFor(review, run);
    if (!gate.ok) {
      return gate;
    }
    return ok({ review, replaySummary: replaySummaryOf(run), gate: gate.value });
  };

  const changeReportGroups = async (
    review: ChangeReview,
    run: ReplayRun | null,
  ): Promise<
    Result<{ groups: ReportGroup[]; analyzabilityNoneCount: number | null }, AppError>
  > => {
    if (run === null || run.status !== 'completed') {
      return ok({ groups: [], analyzabilityNoneCount: null });
    }
    const groupsResult = await fetchAllDiffGroups(run.id);
    if (!groupsResult.ok) {
      return groupsResult;
    }
    const verdicts = await verdictsByGroup(review.id);
    const groups = groupsResult.value.map((group) => ({
      direction: group.direction,
      headline: group.headline,
      fromEffect: group.fromEffect,
      toEffect: group.toEffect,
      actionCount: group.actionCount,
      targetSummary: group.targetSummary.map((target) => ({
        key: target.key,
        count: target.count,
      })),
      verdict: verdicts.get(group.groupKey) ?? null,
    }));
    const analyzabilityNoneCount = groupsResult.value.reduce(
      (sum, group) => sum + group.analyzabilityNoneCount,
      0,
    );
    return ok({ groups, analyzabilityNoneCount });
  };

  const adoptionReportGroups = async (
    review: ChangeReview,
    run: ReplayRun | null,
  ): Promise<Result<AdoptionReportGroup[], AppError>> => {
    if (run === null || run.status !== 'completed') {
      return ok([]);
    }
    const groupsResult = await fetchAllAdoptionGroups(run.id);
    if (!groupsResult.ok) {
      return groupsResult;
    }
    const verdicts = await verdictsByGroup(review.id);
    return ok(
      groupsResult.value.map((group) => ({
        effect: group.effect,
        headline: group.headline,
        actionCount: group.actionCount,
        sessionCount: group.sessionCount,
        targetSummary: group.targetSummary.map((target) => ({
          key: target.key,
          count: target.count,
        })),
        verdict: verdicts.get(group.groupKey) ?? null,
      })),
    );
  };

  return {
    async createChangeReview(input) {
      const candidateResult = await policy.getVersion(input.candidateVersionId);
      if (!candidateResult.ok) {
        return err(candidateResult.error);
      }
      const candidate = candidateResult.value;

      if (candidate.status !== 'draft' && candidate.status !== 'in_review') {
        return err(transitionNotAllowed(candidate.id, candidate.status));
      }

      const open = await store.findOpenChangeReview(candidate.policyId);
      if (open !== null) {
        return err(openReviewExists(candidate.policyId, open.id));
      }

      // A Policy with no accepted version has nothing to compare against: the
      // candidate is the first version to adopt, so the review is an adoption.
      const baselineResult = await policy.getBaseline(candidate.policyId);
      if (!baselineResult.ok && baselineResult.error.code !== 'policy.no_accepted_version') {
        return err(baselineResult.error);
      }
      const baseline = baselineResult.ok ? baselineResult.value : null;

      if (candidate.status === 'draft') {
        const submitted = await policy.submitForReview(candidate.id);
        if (!submitted.ok) {
          return err(submitted.error);
        }
      }

      const window = { windowFrom: input.windowFrom, windowTo: input.windowTo };
      const replayResult =
        baseline === null
          ? await replay.requestAdoptionReplay({ candidateVersionId: candidate.id, ...window })
          : await replay.requestReplay({
              baselineVersionId: baseline.id,
              candidateVersionId: candidate.id,
              ...window,
            });
      if (!replayResult.ok) {
        return err(replayResult.error);
      }
      const run = replayResult.value.run;

      const review: ChangeReview = {
        id: ChangeReviewIdSchema.parse(idGenerator.next('rev')),
        policyId: candidate.policyId,
        kind: baseline === null ? 'adoption' : 'change',
        candidateVersionId: candidate.id,
        candidateContentHash: candidate.contentHash,
        baselineVersionId: baseline === null ? null : baseline.id,
        ...window,
        replayRunId: run.id,
        status: run.status === 'completed' ? 'ready' : 'computing',
        decidedBy: null,
        decidedAt: null,
        decisionNote: null,
        createdAt: clock.now(),
      };
      await store.insertChangeReview(review);
      return viewOf(review);
    },

    async getChangeReview(id) {
      const stored = await store.getChangeReview(id);
      if (stored === null) {
        return err(notFound(id));
      }
      const review = await syncStatus(stored);
      return viewOf(review);
    },

    async listChangeReviews(input) {
      const { policyId, cursor, limit } = input;
      const all = await store.listChangeReviews(policyId);
      const start = cursor === undefined ? 0 : all.findIndex((review) => review.id === cursor) + 1;
      const page = all.slice(start, start + limit);
      const items: ChangeReviewView[] = [];
      for (const stored of page) {
        const view = await viewOf(await syncStatus(stored));
        if (!view.ok) {
          return view;
        }
        items.push(view.value);
      }
      const nextCursor = start + limit < all.length ? (page[page.length - 1]?.id ?? null) : null;
      return ok({ items, nextCursor });
    },

    async recordVerdict(input) {
      const review = await store.getChangeReview(input.changeReviewId);
      if (review === null) {
        return err(notFound(input.changeReviewId));
      }
      const synced = await syncStatus(review);
      if (synced.status !== 'ready' || synced.replayRunId === null) {
        return err(notOpen(input.changeReviewId));
      }
      const groupKeys = await reviewGroupKeys(synced, synced.replayRunId);
      if (!groupKeys.ok) {
        return groupKeys;
      }
      if (!groupKeys.value.has(input.groupKey)) {
        return err(groupNotFound(input.groupKey));
      }
      await store.upsertVerdict({
        changeReviewId: input.changeReviewId,
        groupKey: input.groupKey,
        verdict: input.verdict,
        note: input.note,
        updatedAt: clock.now(),
      });
      return ok({
        changeReviewId: input.changeReviewId,
        groupKey: input.groupKey,
        verdict: input.verdict,
        note: input.note,
      });
    },

    async decide(input) {
      const stored = await store.getChangeReview(input.changeReviewId);
      if (stored === null) {
        return err(notFound(input.changeReviewId));
      }
      const review = await syncStatus(stored);
      if (review.status !== 'ready' || review.replayRunId === null) {
        return err(notOpen(input.changeReviewId));
      }
      const run = await replay.getRun(review.replayRunId);
      if (run === null || run.status !== 'completed' || run.resultHash === null) {
        return err(notOpen(input.changeReviewId));
      }
      const baselineContentHash = await baselineContentHashOf(review);
      if (!baselineContentHash.ok) {
        return err(baselineContentHash.error);
      }

      if (input.decision === 'accept') {
        const gate = await gateFor(review, run);
        if (!gate.ok) {
          return gate;
        }
        if (!gate.value.isOpen) {
          return err(gateBlocked(gate.value));
        }
      }

      const verdicts = await store.listVerdicts(review.id);
      const verdictSnapshot: VerdictSnapshotEntry[] = verdicts.map((entry) => ({
        groupKey: entry.groupKey,
        verdict: entry.verdict,
      }));
      const decidedAt = clock.now();
      const decision: ReviewDecision = {
        changeReviewId: review.id,
        decision: input.decision,
        note: input.note,
        reviewerName: input.reviewerName,
        decidedAt,
        baselineContentHash: baselineContentHash.value,
        candidateContentHash: review.candidateContentHash,
        replayInputsHash: run.inputsHash,
        replayResultHash: run.resultHash,
        classifierVersion: run.classifierVersion,
        verdictSnapshot,
      };

      const decided = await store.decide({
        decision,
        candidateVersionId: review.candidateVersionId,
      });
      if (!decided.ok) {
        return err(decided.error);
      }
      const updated: ChangeReview = {
        ...review,
        status: input.decision === 'accept' ? 'accepted' : 'rejected',
        decidedBy: input.reviewerName,
        decidedAt,
        decisionNote: input.note,
      };
      return viewOf(updated);
    },

    async getDecision(id) {
      const stored = await store.getChangeReview(id);
      if (stored === null) {
        return err(notFound(id));
      }
      return ok(await store.getDecision(id));
    },

    async getReport(id) {
      const stored = await store.getChangeReview(id);
      if (stored === null) {
        return err(notFound(id));
      }
      const review = await syncStatus(stored);
      const run = review.replayRunId === null ? null : await replay.getRun(review.replayRunId);
      const chained = await store.getChainedDecision(review.id);
      const decision = chained === null ? null : reportDecisionOf(chained);

      if (review.kind === 'adoption') {
        const groups = await adoptionReportGroups(review, run);
        if (!groups.ok) {
          return groups;
        }
        return ok(
          renderAdoptionReport({
            changeReviewId: review.id,
            status: review.status,
            candidateContentHash: review.candidateContentHash,
            windowFrom: review.windowFrom,
            windowTo: review.windowTo,
            stats: run !== null && run.kind === 'adoption' ? run.stats : null,
            groups: groups.value,
            decision,
          }),
        );
      }

      const reportGroups = await changeReportGroups(review, run);
      if (!reportGroups.ok) {
        return reportGroups;
      }
      const stats = run === null ? null : diffStatsOf(run);
      const baselineContentHash = await baselineContentHashOf(review);
      return ok(
        renderReport({
          changeReviewId: review.id,
          status: review.status,
          baselineContentHash: baselineContentHash.ok ? (baselineContentHash.value ?? '') : '',
          candidateContentHash: review.candidateContentHash,
          windowFrom: review.windowFrom,
          windowTo: review.windowTo,
          evaluatedActions: stats?.evaluatedActions ?? null,
          changedActions: stats?.changedActions ?? null,
          analyzabilityNoneCount: reportGroups.value.analyzabilityNoneCount,
          transitions: stats?.transitions ?? null,
          operationWidening: stats?.operationWidening ?? null,
          groups: reportGroups.value.groups,
          decision,
        }),
      );
    },

    async listDiffGroups(id, input) {
      const stored = await store.getChangeReview(id);
      if (stored === null) {
        return err(notFound(id));
      }
      const review = await syncStatus(stored);
      if (review.replayRunId === null) {
        return ok({ items: [], nextCursor: null });
      }
      const groupsResult = await fetchAllDiffGroups(review.replayRunId);
      if (!groupsResult.ok) {
        return groupsResult;
      }
      const verdicts = await verdictsByGroup(review.id);
      const { cursor, direction, severity, verdict, limit } = input;
      const matches = groupsResult.value
        .map((group) => ({ ...group, verdict: verdicts.get(group.groupKey) ?? null }))
        .filter((group) => direction === undefined || group.direction === direction)
        .filter((group) => severity === undefined || group.severity === severity)
        .filter((group) => verdict === undefined || group.verdict === verdict)
        .filter((group) => cursor === undefined || group.groupKey > cursor);
      const items = matches.slice(0, limit);
      const nextCursor =
        matches.length > limit ? (items[items.length - 1]?.groupKey ?? null) : null;
      return ok({ items, nextCursor });
    },

    async listAdoptionGroups(id, input) {
      const stored = await store.getChangeReview(id);
      if (stored === null) {
        return err(notFound(id));
      }
      const review = await syncStatus(stored);
      if (review.replayRunId === null) {
        return ok({ items: [], nextCursor: null });
      }
      const groupsResult = await fetchAllAdoptionGroups(review.replayRunId);
      if (!groupsResult.ok) {
        return groupsResult;
      }
      const verdicts = await verdictsByGroup(review.id);
      const { cursor, effect, verdict, limit } = input;
      // Groups keep the run's review order, so the cursor names the last group of
      // the previous page; a cursor naming no group yields no rows, as in replay.
      const ordered = groupsResult.value.map((group) => ({
        ...group,
        verdict: verdicts.get(group.groupKey) ?? null,
      }));
      const cursorIndex =
        cursor === undefined ? -1 : ordered.findIndex((group) => group.groupKey === cursor);
      const afterCursor =
        cursor !== undefined && cursorIndex === -1 ? [] : ordered.slice(cursorIndex + 1);
      const matches = afterCursor
        .filter((group) => effect === undefined || group.effect === effect)
        .filter((group) => verdict === undefined || group.verdict === verdict);
      const items = matches.slice(0, limit);
      const nextCursor =
        matches.length > limit ? (items[items.length - 1]?.groupKey ?? null) : null;
      return ok({ items, nextCursor });
    },
  };
}
