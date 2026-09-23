import { err, ok } from '@authority/kernel';
import type { AppError, Clock, IdGenerator, IsoTimestamp, Result } from '@authority/kernel';
import { canonicalJson, sha256Hex } from '@authority/kernel/hash';
import { createEvaluator } from '@authority/policy/evaluate';
import type { Decision, PolicyVersionId } from '@authority/policy/schema';
import type { ActionReader } from '@authority/trace';
import type {
  ActionForReplay,
  ObservationForReplay,
  StoredAgentAction,
} from '@authority/trace/schema';
import { ReplayRunIdSchema } from '../../schema.ts';
import type {
  ConformanceFinding,
  DiffGroup,
  ReplayRun,
  ReplayRunId,
  StoredChangedAction,
  StoredDiffGroup,
} from '../../schema.ts';
import { buildMatrix } from '../domain/build-matrix.ts';
import type { AuthorityMapCell } from '../domain/build-matrix.ts';
import { computeConformanceWith } from '../domain/compute-conformance.ts';
import { computeDiffWith } from '../domain/compute-diff.ts';
import type { PolicyReader, RecordCompletionInput, ReplayStore } from './ports.ts';

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

export interface RequestConformanceReplayInput {
  readonly candidateVersionId: PolicyVersionId;
  readonly windowFrom: IsoTimestamp;
  readonly windowTo: IsoTimestamp;
}

/** The findings of the most recent completed conformance run. */
export interface ConformanceFindingsView {
  readonly run: {
    readonly replayRunId: ReplayRunId;
    readonly policyVersionId: PolicyVersionId;
    readonly windowFrom: IsoTimestamp;
    readonly windowTo: IsoTimestamp;
    readonly unpairedPermissionRequests: number;
  } | null;
  readonly items: readonly ConformanceFinding[];
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
  /** Compares the observed_runtime Decision Source against the candidate. */
  requestConformanceReplay(
    input: RequestConformanceReplayInput,
  ): Promise<Result<RequestReplayOutput, AppError>>;
  listConformanceFindings(): Promise<ConformanceFindingsView>;
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

function lastActionKeyOf(actions: readonly ActionForReplay[]): string {
  return actions[actions.length - 1]?.actionKey ?? '';
}

async function collectObservations(
  reader: ActionReader,
  actions: readonly ActionForReplay[],
  window: { from: IsoTimestamp; to: IsoTimestamp },
): Promise<ObservationForReplay[]> {
  const sessions = new Set(actions.map((action) => action.sessionExternalId));
  for (const sessionExternalId of await reader.listObservationSessions(window)) {
    sessions.add(sessionExternalId);
  }
  const sessionList = [...sessions];
  const observations: ObservationForReplay[] = [];
  for (let i = 0; i < sessionList.length; i += BATCH_SIZE) {
    observations.push(...(await reader.getObservations(sessionList.slice(i, i + BATCH_SIZE))));
  }
  return observations;
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

  const execute = async (
    run: ReplayRun,
    compute: () => Omit<RecordCompletionInput, 'replayRunId' | 'completedAt'>,
  ): Promise<void> => {
    try {
      await store.markRunning(run.id, clock.now());
      await store.recordCompletion({ ...compute(), replayRunId: run.id, completedAt: clock.now() });
    } catch {
      // The failure is durable state, not a thrown error: the run is marked
      // failed in the DB and the fire-and-forget promise always resolves.
      await store.markFailed(run.id, 'replay.execution_failed', clock.now()).catch(() => {});
    }
  };

  const prepare = async (window: {
    from: IsoTimestamp;
    to: IsoTimestamp;
  }): Promise<Result<readonly ActionForReplay[], AppError>> => {
    const staleCount = await reader.countStaleClassifications(window);
    if (staleCount > 0) {
      return err(classifierVersionMismatch(staleCount));
    }
    return ok(await collectActions(reader, window));
  };

  const start = async (
    fields: Pick<
      ReplayRun,
      'kind' | 'baselineVersionId' | 'candidateVersionId' | 'windowFrom' | 'windowTo'
    >,
    inputsHash: string,
    compute: (run: ReplayRun) => Omit<RecordCompletionInput, 'replayRunId' | 'completedAt'>,
  ): Promise<RequestReplayOutput> => {
    const existing = await store.findCompletedByInputsHash(inputsHash);
    if (existing !== null) {
      return { run: existing, reused: true, execution: null };
    }
    const run: ReplayRun = {
      ...fields,
      id: ReplayRunIdSchema.parse(idGenerator.next('rpl')),
      status: 'queued',
      classifierVersion,
      inputsHash,
      resultHash: null,
      stats: null,
      errorCode: null,
      createdAt: clock.now(),
      startedAt: null,
      completedAt: null,
    };
    await store.insertQueuedRun(run);
    return { run, reused: false, execution: execute(run, () => compute(run)) };
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
      const prepared = await prepare({ from: input.windowFrom, to: input.windowTo });
      if (!prepared.ok) {
        return prepared;
      }
      const actions = prepared.value;
      const inputsHash = sha256Hex(
        canonicalJson([
          baseline.contentHash,
          candidate.contentHash,
          input.windowFrom,
          input.windowTo,
          classifierVersion,
          actions.length,
          lastActionKeyOf(actions),
        ]),
      );
      const output = await start({ ...input, kind: 'version_diff' }, inputsHash, (run) => {
        const evaluateCandidate = createEvaluator(candidate.document);
        const diff = computeDiffWith(
          createEvaluator(baseline.document),
          evaluateCandidate,
          actions,
        );
        return {
          resultHash: diff.resultHash,
          stats: { ...diff.stats, matrix: buildMatrix(actions, evaluateCandidate) },
          groups: diff.groups.map((group): StoredDiffGroup => ({ ...group, replayRunId: run.id })),
          changedActions: diff.changedActions.map((changed): StoredChangedAction => ({
            ...changed,
            replayRunId: run.id,
          })),
          findings: [],
        };
      });
      return ok(output);
    },

    async requestConformanceReplay(input) {
      const candidate = await policy.getVersion(input.candidateVersionId);
      if (candidate === null) {
        return err(sourceInvalid(input.candidateVersionId));
      }
      const prepared = await prepare({ from: input.windowFrom, to: input.windowTo });
      if (!prepared.ok) {
        return prepared;
      }
      const actions = prepared.value;
      const observations = await collectObservations(reader, actions, {
        from: input.windowFrom,
        to: input.windowTo,
      });
      const inputsHash = sha256Hex(
        canonicalJson([
          'observed_runtime',
          candidate.contentHash,
          input.windowFrom,
          input.windowTo,
          classifierVersion,
          actions.length,
          lastActionKeyOf(actions),
          observations.length,
        ]),
      );
      const output = await start(
        { ...input, kind: 'conformance', baselineVersionId: null },
        inputsHash,
        (run) => {
          const evaluateCandidate = createEvaluator(candidate.document);
          const result = computeConformanceWith(evaluateCandidate, actions, observations, {
            from: input.windowFrom,
            to: input.windowTo,
          });
          return {
            resultHash: result.resultHash,
            stats: {
              ...result.stats,
              matrix: buildMatrix(actions, evaluateCandidate),
              unpairedPermissionRequests: result.unpairedPermissionRequests,
            },
            groups: [],
            changedActions: [],
            findings: result.findings.map((finding) => ({ ...finding, replayRunId: run.id })),
          };
        },
      );
      return ok(output);
    },

    async listConformanceFindings() {
      const run = await store.findLatestConformanceRun();
      if (run === null) {
        return { run: null, items: [] };
      }
      return {
        run: {
          replayRunId: run.replayRunId,
          policyVersionId: run.candidateVersionId,
          windowFrom: run.windowFrom,
          windowTo: run.windowTo,
          unpairedPermissionRequests: run.unpairedPermissionRequests,
        },
        items: await store.listConformanceFindings(run.replayRunId),
      };
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
      if (run.baselineVersionId === null) {
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
