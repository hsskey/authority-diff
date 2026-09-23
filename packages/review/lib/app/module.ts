import { err, ok } from '@authority/kernel';
import type { AppError, Clock, IdGenerator, IsoTimestamp, Result } from '@authority/kernel';
import type { PolicyId, PolicyVersionId } from '@authority/policy/schema';
import type { ReplayModule } from '@authority/replay';
import type { DiffGroup, ReplayRun, ReplayRunStatus, ReplayStats } from '@authority/replay/schema';
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
import { renderReport, type ReportGroup } from '../domain/report.ts';
import type { ReviewStore, StoredVerdict } from './ports.ts';

/** The narrow policy surface the review module reads and transitions. */
export interface PolicyVersionSummary {
  readonly id: PolicyVersionId;
  readonly policyId: PolicyId;
  readonly contentHash: string;
  readonly status: string;
}

export interface PolicyReviewRepository {
  getVersion(id: PolicyVersionId): Promise<Result<PolicyVersionSummary, AppError>>;
  getBaseline(
    policyId: PolicyId,
  ): Promise<Result<{ id: PolicyVersionId; contentHash: string }, AppError>>;
  submitForReview(id: PolicyVersionId): Promise<Result<void, AppError>>;
}

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

export interface ReviewModule {
  createChangeReview(input: CreateChangeReviewInput): Promise<Result<ChangeReviewView, AppError>>;
  getChangeReview(id: ChangeReviewId): Promise<Result<ChangeReviewView, AppError>>;
  recordVerdict(input: RecordVerdictInput): Promise<Result<RecordedVerdict, AppError>>;
  decide(input: DecideInput): Promise<Result<ChangeReviewView, AppError>>;
  getDecision(id: ChangeReviewId): Promise<Result<ReviewDecision | null, AppError>>;
  getReport(id: ChangeReviewId): Promise<Result<string, AppError>>;
  listDiffGroups(
    id: ChangeReviewId,
    input: ListReviewDiffGroupsInput,
  ): Promise<Result<ReviewDiffGroupsResult, AppError>>;
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

function noActiveBaseline(policyId: string): AppError {
  return {
    code: 'review.no_active_baseline',
    message: `policy ${policyId} has no baseline version to compare against`,
    isRetryable: false,
    details: { policyId },
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
    message: `no diff group ${groupKey} in this review's replay`,
    isRetryable: false,
    details: { groupKey },
    cause: null,
  };
}

function replaySummaryOf(run: ReplayRun | null): ReplaySummary {
  if (run === null) {
    return { replayRunId: null, status: 'queued', stats: null, resultHash: null };
  }
  return { replayRunId: run.id, status: run.status, stats: run.stats, resultHash: run.resultHash };
}

export function assembleReviewModule(deps: AssembleReviewModuleDeps): ReviewModule {
  const { store, replay, policy, clock, idGenerator } = deps;

  const fetchAllGroups = async (
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

  const gateFor = async (
    review: ChangeReview,
    run: ReplayRun | null,
  ): Promise<Result<Gate, AppError>> => {
    if (run === null || run.status === 'failed') {
      return ok(computeGate({ replayCompleted: false, replayFailed: true, wideningVerdicts: [] }));
    }
    if (run.status !== 'completed') {
      return ok(computeGate({ replayCompleted: false, replayFailed: false, wideningVerdicts: [] }));
    }
    const groupsResult = await fetchAllGroups(run.id);
    if (!groupsResult.ok) {
      return groupsResult;
    }
    const verdicts = await store.listVerdicts(review.id);
    const verdictByGroup = new Map(verdicts.map((entry) => [entry.groupKey, entry.verdict]));
    const wideningVerdicts = groupsResult.value
      .filter((group) => group.direction === 'widening')
      .map((group) => verdictByGroup.get(group.groupKey) ?? null);
    return ok(computeGate({ replayCompleted: true, replayFailed: false, wideningVerdicts }));
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

      const baselineResult = await policy.getBaseline(candidate.policyId);
      if (!baselineResult.ok) {
        return err(noActiveBaseline(candidate.policyId));
      }
      const baseline = baselineResult.value;

      if (candidate.status === 'draft') {
        const submitted = await policy.submitForReview(candidate.id);
        if (!submitted.ok) {
          return err(submitted.error);
        }
      }

      const replayResult = await replay.requestReplay({
        baselineVersionId: baseline.id,
        candidateVersionId: candidate.id,
        windowFrom: input.windowFrom,
        windowTo: input.windowTo,
      });
      if (!replayResult.ok) {
        return err(replayResult.error);
      }
      const run = replayResult.value.run;

      const review: ChangeReview = {
        id: ChangeReviewIdSchema.parse(idGenerator.next('rev')),
        policyId: candidate.policyId,
        candidateVersionId: candidate.id,
        candidateContentHash: candidate.contentHash,
        baselineVersionId: baseline.id,
        windowFrom: input.windowFrom,
        windowTo: input.windowTo,
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

    async recordVerdict(input) {
      const review = await store.getChangeReview(input.changeReviewId);
      if (review === null) {
        return err(notFound(input.changeReviewId));
      }
      const synced = await syncStatus(review);
      if (synced.status !== 'ready') {
        return err(notOpen(input.changeReviewId));
      }
      if (synced.replayRunId === null) {
        return err(notOpen(input.changeReviewId));
      }
      const groupsResult = await fetchAllGroups(synced.replayRunId);
      if (!groupsResult.ok) {
        return groupsResult;
      }
      if (!groupsResult.value.some((group) => group.groupKey === input.groupKey)) {
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
      const baselineResult = await policy.getVersion(review.baselineVersionId);
      if (!baselineResult.ok) {
        return err(baselineResult.error);
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
        baselineContentHash: baselineResult.value.contentHash,
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
      const isComplete = run !== null && run.status === 'completed';

      let groups: ReportGroup[] = [];
      let analyzabilityNoneCount: number | null = null;
      if (isComplete) {
        const groupsResult = await fetchAllGroups(run.id);
        if (!groupsResult.ok) {
          return groupsResult;
        }
        const verdicts = await store.listVerdicts(review.id);
        const verdictByGroup = new Map(verdicts.map((entry) => [entry.groupKey, entry.verdict]));
        groups = groupsResult.value.map((group) => ({
          direction: group.direction,
          headline: group.headline,
          fromEffect: group.fromEffect,
          toEffect: group.toEffect,
          actionCount: group.actionCount,
          targetSummary: group.targetSummary.map((target) => ({
            key: target.key,
            count: target.count,
          })),
          verdict: verdictByGroup.get(group.groupKey) ?? null,
        }));
        analyzabilityNoneCount = groupsResult.value.reduce(
          (sum, group) => sum + group.analyzabilityNoneCount,
          0,
        );
      }

      const stats = run?.stats ?? null;
      const baseline = await policy.getVersion(review.baselineVersionId);
      const baselineContentHash = baseline.ok ? baseline.value.contentHash : '';

      const markdown = renderReport({
        changeReviewId: review.id,
        status: review.status,
        baselineContentHash,
        candidateContentHash: review.candidateContentHash,
        windowFrom: review.windowFrom,
        windowTo: review.windowTo,
        evaluatedActions: stats?.evaluatedActions ?? null,
        changedActions: stats?.changedActions ?? null,
        analyzabilityNoneCount,
        transitions: stats?.transitions ?? null,
        groups,
        decision:
          review.decidedBy !== null && review.decidedAt !== null
            ? {
                decision: review.status === 'accepted' ? 'accept' : 'reject',
                reviewerName: review.decidedBy,
                decidedAt: review.decidedAt,
                note: review.decisionNote ?? '',
              }
            : null,
      });
      return ok(markdown);
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
      const groupsResult = await fetchAllGroups(review.replayRunId);
      if (!groupsResult.ok) {
        return groupsResult;
      }
      const verdicts = await store.listVerdicts(review.id);
      const verdictByGroup = new Map(
        verdicts.map((entry: StoredVerdict) => [entry.groupKey, entry.verdict]),
      );
      const { cursor, direction, severity, verdict, limit } = input;
      const matches = groupsResult.value
        .map((group) => ({ ...group, verdict: verdictByGroup.get(group.groupKey) ?? null }))
        .filter((group) => direction === undefined || group.direction === direction)
        .filter((group) => severity === undefined || group.severity === severity)
        .filter((group) => verdict === undefined || group.verdict === verdict)
        .filter((group) => cursor === undefined || group.groupKey > cursor);
      const items = matches.slice(0, limit);
      const nextCursor =
        matches.length > limit ? (items[items.length - 1]?.groupKey ?? null) : null;
      return ok({ items, nextCursor });
    },
  };
}
