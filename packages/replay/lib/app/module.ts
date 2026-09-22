import { err, ok } from '@authority/kernel';
import type { AppError, Clock, IdGenerator, IsoTimestamp, Result } from '@authority/kernel';
import { canonicalJson, sha256Hex } from '@authority/kernel/hash';
import { createEvaluator } from '@authority/policy/evaluate';
import type { Decision, PolicyDocument, PolicyVersionId } from '@authority/policy/schema';
import type { ActionReader } from '@authority/trace';
import type { ActionForReplay, StoredAgentAction } from '@authority/trace/schema';
import { ReplayRunIdSchema } from '../../schema.ts';
import type {
  DiffGroup,
  ReplayRun,
  ReplayRunId,
  StoredChangedAction,
  StoredDiffGroup,
} from '../../schema.ts';
import { buildMatrix } from '../domain/build-matrix.ts';
import type { AuthorityMapCell } from '../domain/build-matrix.ts';
import { computeDiffWith } from '../domain/compute-diff.ts';
import type { PolicyReader, ReplayStore, StoredReplayStats } from './ports.ts';

const BATCH_SIZE = 5_000;
const STALE_RUN_MS = 60_000;

export interface RequestReplayInput {
  readonly baselineVersionId: PolicyVersionId;
  readonly candidateVersionId: PolicyVersionId;
  readonly windowFrom: IsoTimestamp;
  readonly windowTo: IsoTimestamp;
}

export interface RequestReplayOutput {
  readonly run: ReplayRun;
  /** True when a completed run with the same inputsHash already existed (HTTP 200). */
  readonly reused: boolean;
  /** The in-process execution, for tests to await; null when a run was reused. */
  readonly execution: Promise<void> | null;
}

export interface DiffGroupSample {
  readonly action: StoredAgentAction;
  readonly baselineDecision: Decision;
  readonly candidateDecision: Decision;
}

export interface AuthorityMapView {
  readonly run: {
    readonly replayRunId: ReplayRunId;
    readonly policyVersionId: PolicyVersionId;
    readonly windowFrom: IsoTimestamp;
    readonly windowTo: IsoTimestamp;
  } | null;
  readonly cells: readonly AuthorityMapCell[];
}

export interface ListDiffGroupsInput {
  readonly direction?: DiffGroup['direction'] | undefined;
  readonly severity?: DiffGroup['severity'] | undefined;
  readonly cursor?: string | undefined;
  readonly limit: number;
}

export interface DiffGroupsResult {
  readonly items: readonly DiffGroup[];
  readonly nextCursor: string | null;
}

export interface ReplayModule {
  requestReplay(input: RequestReplayInput): Promise<Result<RequestReplayOutput, AppError>>;
  getRun(id: ReplayRunId): Promise<ReplayRun | null>;
  listDiffGroups(
    id: ReplayRunId,
    input: ListDiffGroupsInput,
  ): Promise<Result<DiffGroupsResult, AppError>>;
  getSamples(
    id: ReplayRunId,
    groupKey: string,
  ): Promise<Result<readonly DiffGroupSample[], AppError>>;
  getAuthorityMap(): Promise<AuthorityMapView>;
  recoverInterruptedRuns(): Promise<void>;
}

export interface AssembleReplayModuleDeps {
  readonly store: ReplayStore;
  readonly reader: ActionReader;
  readonly policy: PolicyReader;
  readonly clock: Clock;
  readonly idGenerator: IdGenerator;
  readonly classifierVersion: string;
}

function sourceInvalid(id: PolicyVersionId): AppError {
  return {
    code: 'replay.source_invalid',
    message: `no policy version ${id}`,
    isRetryable: false,
    details: { policyVersionId: id },
    cause: null,
  };
}

function classifierVersionMismatch(staleCount: number): AppError {
  return {
    code: 'replay.classifier_version_mismatch',
    message: 'the window contains Actions classified by a different classifier version',
    isRetryable: false,
    details: { staleCount },
    cause: null,
  };
}

function runNotFound(id: ReplayRunId): AppError {
  return {
    code: 'replay.run_not_found',
    message: `no replay run ${id}`,
    isRetryable: false,
    details: { replayRunId: id },
    cause: null,
  };
}

function groupNotFound(id: ReplayRunId, groupKey: string): AppError {
  return {
    code: 'replay.group_not_found',
    message: `no diff group ${groupKey} in run ${id}`,
    isRetryable: false,
    details: { replayRunId: id, groupKey },
    cause: null,
  };
}

async function collectActions(
  reader: ActionReader,
  window: { from: IsoTimestamp; to: IsoTimestamp },
): Promise<ActionForReplay[]> {
  const actions: ActionForReplay[] = [];
  for await (const batch of reader.streamActions({ ...window, batchSize: BATCH_SIZE })) {
    actions.push(...batch);
  }
  return actions;
}

export function assembleReplayModule(deps: AssembleReplayModuleDeps): ReplayModule {
  const { store, reader, policy, clock, idGenerator, classifierVersion } = deps;

  const runReplay = async (
    run: ReplayRun,
    actions: readonly ActionForReplay[],
    baselineDocument: PolicyDocument,
    candidateDocument: PolicyDocument,
  ): Promise<void> => {
    try {
      await store.markRunning(run.id, clock.now());
      const evaluateCandidate = createEvaluator(candidateDocument);
      const diff = computeDiffWith(createEvaluator(baselineDocument), evaluateCandidate, actions);
      const stats: StoredReplayStats = {
        ...diff.stats,
        matrix: buildMatrix(actions, evaluateCandidate),
      };
      const groups: StoredDiffGroup[] = diff.groups.map((group) => ({
        ...group,
        replayRunId: run.id,
      }));
      const changedActions: StoredChangedAction[] = diff.changedActions.map((changed) => ({
        replayRunId: run.id,
        actionKey: changed.actionKey,
        groupKey: changed.groupKey,
        fromEffect: changed.fromEffect,
        toEffect: changed.toEffect,
      }));
      await store.recordCompletion({
        replayRunId: run.id,
        resultHash: diff.resultHash,
        stats,
        groups,
        changedActions,
        completedAt: clock.now(),
      });
    } catch {
      // The failure is durable state, not a thrown error: the run is marked
      // failed in the DB and the fire-and-forget promise always resolves.
      await store.markFailed(run.id, 'replay.execution_failed', clock.now()).catch(() => {});
    }
  };

  return {
    async requestReplay(input) {
      const baseline = await policy.getVersion(input.baselineVersionId);
      if (baseline === null) {
        return err(sourceInvalid(input.baselineVersionId));
      }
      const candidate = await policy.getVersion(input.candidateVersionId);
      if (candidate === null) {
        return err(sourceInvalid(input.candidateVersionId));
      }

      const window = { from: input.windowFrom, to: input.windowTo };
      const staleCount = await reader.countStaleClassifications(window);
      if (staleCount > 0) {
        return err(classifierVersionMismatch(staleCount));
      }

      const actions = await collectActions(reader, window);
      const lastActionKey =
        actions.length === 0 ? '' : (actions[actions.length - 1]?.actionKey ?? '');
      const inputsHash = sha256Hex(
        canonicalJson([
          baseline.contentHash,
          candidate.contentHash,
          input.windowFrom,
          input.windowTo,
          classifierVersion,
          actions.length,
          lastActionKey,
        ]),
      );

      const existing = await store.findCompletedByInputsHash(inputsHash);
      if (existing !== null) {
        return ok({ run: existing, reused: true, execution: null });
      }

      const now = clock.now();
      const run: ReplayRun = {
        id: ReplayRunIdSchema.parse(idGenerator.next('rpl')),
        baselineVersionId: input.baselineVersionId,
        candidateVersionId: input.candidateVersionId,
        windowFrom: input.windowFrom,
        windowTo: input.windowTo,
        status: 'queued',
        classifierVersion,
        inputsHash,
        resultHash: null,
        stats: null,
        errorCode: null,
        createdAt: now,
        startedAt: null,
        completedAt: null,
      };
      await store.insertQueuedRun(run);
      const execution = runReplay(run, actions, baseline.document, candidate.document);
      return ok({ run, reused: false, execution });
    },

    getRun(id) {
      return store.getRun(id);
    },

    async listDiffGroups(id, input) {
      const run = await store.getRun(id);
      if (run === null) {
        return err(runNotFound(id));
      }
      const page = await store.listDiffGroups({ replayRunId: id, ...input });
      const items = page.items.map(({ replayRunId: _replayRunId, ...group }) => group);
      return ok({ items, nextCursor: page.nextCursor });
    },

    async getSamples(id, groupKey) {
      const run = await store.getRun(id);
      if (run === null) {
        return err(groupNotFound(id, groupKey));
      }
      const group = await store.getDiffGroup(id, groupKey);
      if (group === null) {
        return err(groupNotFound(id, groupKey));
      }
      const baseline = await policy.getVersion(run.baselineVersionId);
      const candidate = await policy.getVersion(run.candidateVersionId);
      if (baseline === null) {
        return err(sourceInvalid(run.baselineVersionId));
      }
      if (candidate === null) {
        return err(sourceInvalid(run.candidateVersionId));
      }
      const evaluateBaseline = createEvaluator(baseline.document);
      const evaluateCandidate = createEvaluator(candidate.document);
      const actions = await reader.getActions(group.sampleActionKeys);
      const byKey = new Map(actions.map((action) => [action.actionKey, action]));
      const samples: DiffGroupSample[] = [];
      for (const key of group.sampleActionKeys) {
        const action = byKey.get(key);
        if (action === undefined) {
          continue;
        }
        const baselineDecision = evaluateBaseline(action.operations);
        const candidateDecision = evaluateCandidate(action.operations);
        if (baselineDecision === null || candidateDecision === null) {
          continue;
        }
        samples.push({ action, baselineDecision, candidateDecision });
      }
      return ok(samples);
    },

    async getAuthorityMap() {
      const runs = await store.listCompletedRunsNewestFirst();
      for (const candidate of runs) {
        const version = await policy.getVersion(candidate.candidateVersionId);
        if (version?.status === 'accepted') {
          return {
            run: {
              replayRunId: candidate.replayRunId,
              policyVersionId: candidate.candidateVersionId,
              windowFrom: candidate.windowFrom,
              windowTo: candidate.windowTo,
            },
            cells: candidate.matrix,
          };
        }
      }
      return { run: null, cells: [] };
    },

    async recoverInterruptedRuns() {
      await store.failStaleRunningRuns({
        now: clock.now(),
        staleMs: STALE_RUN_MS,
        errorCode: 'replay.interrupted',
      });
    },
  };
}
