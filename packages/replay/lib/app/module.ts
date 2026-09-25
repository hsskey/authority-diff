import { z } from 'zod';
import { assertNever, err, ok } from '@authority/kernel';
import type {
  AppError,
  Clock,
  IdGenerator,
  IsoTimestamp,
  JobQueue,
  Logger,
  Result,
} from '@authority/kernel';
import { canonicalJson, sha256Hex } from '@authority/kernel/hash';
import { createEvaluator } from '@authority/policy/evaluate';
import type { Decision, PolicyDocument, PolicyVersionId } from '@authority/policy/schema';
import type { ActionReader } from '@authority/trace';
import type {
  ActionForReplay,
  ObservationForReplay,
  StoredAgentAction,
} from '@authority/trace/schema';
import { ReplayRunIdSchema } from '../../schema.ts';
import type {
  AdoptionEffect,
  AdoptionGroup,
  AnalyzabilityCounts,
  AuthorityMapCell,
  ConformanceFindingView,
  DiffGroup,
  ObservationGap,
  PermissionModeCount,
  ReplayRun,
  ReplayRunId,
  StoredAdoptionAssignment,
  StoredAdoptionGroup,
  StoredChangedAction,
  StoredDiffGroup,
} from '../../schema.ts';
import { buildAnalyzabilityCounts, buildMatrix } from '../domain/build-matrix.ts';
import { computeAdoptionWith } from '../domain/compute-adoption.ts';
import { computeConformanceWith } from '../domain/compute-conformance.ts';
import { computeDiffWith } from '../domain/compute-diff.ts';
import { findObservationGaps } from '../domain/find-observation-gaps.ts';
import { deriveTargetKey } from '../domain/group-summary.ts';
import type { PolicyReader, RecordCompletionInput, ReplayStore } from './ports.ts';

const BATCH_SIZE = 5_000;

function decidingRationales(decision: Decision, document: PolicyDocument): Record<string, string> {
  const decidingRuleIds = new Set(decision.operations.map((operation) => operation.decidingRuleId));
  return Object.fromEntries(
    document.rules
      .filter((rule) => decidingRuleIds.has(rule.ruleId))
      .map((rule) => [rule.ruleId, rule.rationale]),
  );
}
const STALE_RUN_MS = 60_000;

export const REPLAY_RUN_JOB = 'replay.run';

const ReplayRunJobPayloadSchema = z.object({ replayRunId: ReplayRunIdSchema });

type Completion = Omit<RecordCompletionInput, 'replayRunId' | 'completedAt'>;

/** A request's validated inputs: its inputsHash and the computation over the Actions it read. */
interface Plan {
  readonly inputsHash: string;
  readonly compute: (run: ReplayRun) => Completion;
}

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
}

export interface RequestConformanceReplayInput {
  readonly candidateVersionId: PolicyVersionId;
  readonly windowFrom: IsoTimestamp;
  readonly windowTo: IsoTimestamp;
}

/** The candidate is the draft Policy Version being adopted; there is no baseline. */
export interface RequestAdoptionReplayInput {
  readonly candidateVersionId: PolicyVersionId;
  readonly windowFrom: IsoTimestamp;
  readonly windowTo: IsoTimestamp;
}

/**
 * The findings of the most recent completed conformance run. `observationGaps`
 * is read from the observations stored now, not from the run's inputs.
 */
export interface ConformanceFindingsView {
  readonly run: {
    readonly replayRunId: ReplayRunId;
    readonly policyVersionId: PolicyVersionId;
    readonly windowFrom: IsoTimestamp;
    readonly windowTo: IsoTimestamp;
    readonly unpairedPermissionRequests: number;
    readonly byPermissionMode: readonly PermissionModeCount[];
    readonly observationGaps: readonly ObservationGap[];
  } | null;
  readonly items: readonly ConformanceFindingView[];
}

/**
 * `targetKeys[i]` is the Target key of `action.operations[i]`. Each rationale
 * map covers only the rules that decided an Operation in that Decision.
 */
export interface DiffGroupSample {
  readonly action: StoredAgentAction;
  readonly targetKeys: readonly string[];
  readonly baselineDecision: Decision;
  readonly candidateDecision: Decision;
  readonly baselineRuleRationales: Readonly<Record<string, string>>;
  readonly candidateRuleRationales: Readonly<Record<string, string>>;
}

/** An adoption run has no baseline, so a sample carries the candidate Decision only. */
export interface AdoptionGroupSample {
  readonly action: StoredAgentAction;
  readonly targetKeys: readonly string[];
  readonly candidateDecision: Decision;
  readonly candidateRuleRationales: Readonly<Record<string, string>>;
}

export interface AuthorityMapView {
  readonly run: {
    readonly replayRunId: ReplayRunId;
    readonly policyVersionId: PolicyVersionId;
    readonly windowFrom: IsoTimestamp;
    readonly windowTo: IsoTimestamp;
  } | null;
  readonly cells: readonly AuthorityMapCell[];
  readonly analyzability: AnalyzabilityCounts;
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

export interface ListAdoptionGroupsInput {
  readonly effect?: AdoptionEffect | undefined;
  readonly cursor?: string | undefined;
  readonly limit: number;
}

export interface AdoptionGroupsResult {
  readonly items: readonly AdoptionGroup[];
  readonly nextCursor: string | null;
}

export interface ReplayModule {
  requestReplay(input: RequestReplayInput): Promise<Result<RequestReplayOutput, AppError>>;
  /** Compares the observed_runtime Decision Source against the candidate. */
  requestConformanceReplay(
    input: RequestConformanceReplayInput,
  ): Promise<Result<RequestReplayOutput, AppError>>;
  /** Applies the candidate alone to the window's Actions: the Initial Adoption preview. */
  requestAdoptionReplay(
    input: RequestAdoptionReplayInput,
  ): Promise<Result<RequestReplayOutput, AppError>>;
  listConformanceFindings(): Promise<ConformanceFindingsView>;
  getConformanceFinding(
    findingKey: string,
  ): Promise<
    Result<{ finding: ConformanceFindingView; policyVersionId: PolicyVersionId }, AppError>
  >;
  acknowledgeConformanceFinding(
    findingKey: string,
    note: string,
  ): Promise<Result<ConformanceFindingView, AppError>>;
  getRun(id: ReplayRunId): Promise<ReplayRun | null>;
  listDiffGroups(
    id: ReplayRunId,
    input: ListDiffGroupsInput,
  ): Promise<Result<DiffGroupsResult, AppError>>;
  getSamples(
    id: ReplayRunId,
    groupKey: string,
  ): Promise<Result<readonly DiffGroupSample[], AppError>>;
  /** Adoption Groups in review order; an empty page for a run of another kind. */
  listAdoptionGroups(
    id: ReplayRunId,
    input: ListAdoptionGroupsInput,
  ): Promise<Result<AdoptionGroupsResult, AppError>>;
  getAdoptionSamples(
    id: ReplayRunId,
    groupKey: string,
  ): Promise<Result<readonly AdoptionGroupSample[], AppError>>;
  getAuthorityMap(): Promise<AuthorityMapView>;
  /**
   * Fails runs left running past 60 s and sends every queued run's job again,
   * so a run whose job was lost still executes; a duplicate job is a no-op.
   */
  recoverInterruptedRuns(): Promise<void>;
  /**
   * The `replay.run` job handler. Executes a `queued` run; any other status is
   * a redelivered job and is left as is. A run whose recomputed inputsHash no
   * longer matches fails with `replay.inputs_changed`.
   */
  runReplay(id: ReplayRunId): Promise<void>;
  /** `runReplay` over a `replay.run` payload; an invalid payload is logged and dropped. */
  readonly runReplayJob: (payload: unknown) => Promise<void>;
}

export interface AssembleReplayModuleDeps {
  readonly store: ReplayStore;
  readonly reader: ActionReader;
  readonly policy: PolicyReader;
  readonly jobQueue: JobQueue;
  readonly clock: Clock;
  readonly idGenerator: IdGenerator;
  readonly logger: Logger;
  readonly classifierVersion: string;
}

/** The kind-correlated identity of a new run, before status and hashes are attached. */
type ReplayRunIdentity = ReplayRun extends infer Run
  ? Run extends ReplayRun
    ? Pick<Run, 'kind' | 'baselineVersionId' | 'candidateVersionId' | 'windowFrom' | 'windowTo'>
    : never
  : never;

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

function findingNotFound(findingKey: string): AppError {
  return {
    code: 'replay.finding_not_found',
    message: 'no Conformance Finding for the given finding key',
    isRetryable: false,
    details: { findingKey },
    cause: null,
  };
}

function adoptionGroupNotFound(id: ReplayRunId, groupKey: string): AppError {
  return {
    code: 'replay.group_not_found',
    message: `no adoption group ${groupKey} in run ${id}`,
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
  const { store, reader, policy, jobQueue, clock, idGenerator, logger, classifierVersion } = deps;

  const persistFailure = async (
    run: ReplayRun,
    errorCode: string,
    cause: unknown,
    mark: () => Promise<void>,
  ): Promise<void> => {
    // The failure is durable state, not a thrown error: the run is marked
    // failed in the DB and the job completes.
    logger.error('replay run failed', { runId: run.id, errorCode, cause });
    await mark().catch((markCause: unknown) => {
      logger.error('replay run could not be marked failed', {
        runId: run.id,
        errorCode,
        cause: markCause,
      });
    });
  };

  const fail = (run: ReplayRun, errorCode: string, cause: unknown): Promise<void> =>
    persistFailure(run, errorCode, cause, () => store.markFailed(run.id, errorCode, clock.now()));

  const failQueued = (run: ReplayRun, errorCode: string, cause: unknown): Promise<void> =>
    persistFailure(run, errorCode, cause, () =>
      store.failQueuedRun(run.id, errorCode, clock.now()),
    );

  const execute = async (run: ReplayRun, compute: () => Completion): Promise<void> => {
    let errorCode = 'replay.execution_failed';
    try {
      if (!(await store.markRunning(run.id, clock.now()))) {
        return;
      }
      const completion = compute();
      errorCode = 'replay.persist_failed';
      await store.recordCompletion({
        ...completion,
        replayRunId: run.id,
        completedAt: clock.now(),
      });
    } catch (cause) {
      await fail(run, errorCode, cause);
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

  const planVersionDiff = async (input: RequestReplayInput): Promise<Result<Plan, AppError>> => {
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
    return ok({
      inputsHash,
      compute: (run) => {
        const evaluateCandidate = createEvaluator(candidate.document);
        const diff = computeDiffWith(
          createEvaluator(baseline.document),
          evaluateCandidate,
          actions,
        );
        return {
          resultHash: diff.resultHash,
          stats: {
            ...diff.stats,
            matrix: buildMatrix(actions, evaluateCandidate),
            analyzability: buildAnalyzabilityCounts(actions, evaluateCandidate),
          },
          groups: diff.groups.map((group): StoredDiffGroup => ({ ...group, replayRunId: run.id })),
          changedActions: diff.changedActions.map((changed): StoredChangedAction => ({
            ...changed,
            replayRunId: run.id,
          })),
          findings: [],
          adoptionGroups: [],
          adoptionAssignments: [],
        };
      },
    });
  };

  const planConformance = async (
    input: RequestConformanceReplayInput,
  ): Promise<Result<Plan, AppError>> => {
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
    return ok({
      inputsHash,
      compute: (run) => {
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
            analyzability: buildAnalyzabilityCounts(actions, evaluateCandidate),
            unpairedPermissionRequests: result.unpairedPermissionRequests,
          },
          groups: [],
          changedActions: [],
          findings: result.findings.map((finding) => ({
            ...finding,
            replayRunId: run.id,
            status: 'open' as const,
            note: '',
          })),
          adoptionGroups: [],
          adoptionAssignments: [],
        };
      },
    });
  };

  const planAdoption = async (
    input: RequestAdoptionReplayInput,
  ): Promise<Result<Plan, AppError>> => {
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
        'adoption',
        candidate.contentHash,
        input.windowFrom,
        input.windowTo,
        classifierVersion,
        actions.length,
        lastActionKeyOf(actions),
      ]),
    );
    return ok({
      inputsHash,
      compute: (run) => {
        const result = computeAdoptionWith(createEvaluator(candidate.document), actions);
        return {
          resultHash: result.resultHash,
          stats: result.stats,
          groups: [],
          changedActions: [],
          findings: [],
          adoptionGroups: result.groups.map((group, position): StoredAdoptionGroup => ({
            ...group,
            replayRunId: run.id,
            position,
          })),
          adoptionAssignments: result.assignments.map((assignment): StoredAdoptionAssignment => ({
            ...assignment,
            replayRunId: run.id,
          })),
        };
      },
    });
  };

  const planFor = (run: ReplayRun): Promise<Result<Plan, AppError>> => {
    switch (run.kind) {
      case 'version_diff':
        return planVersionDiff(run);
      case 'conformance':
        return planConformance(run);
      case 'adoption':
        return planAdoption(run);
      default:
        return assertNever(run);
    }
  };

  const start = async (
    identity: ReplayRunIdentity,
    planned: Result<Plan, AppError>,
  ): Promise<Result<RequestReplayOutput, AppError>> => {
    if (!planned.ok) {
      return planned;
    }
    const { inputsHash } = planned.value;
    const existing = await store.findCompletedByInputsHash(inputsHash);
    if (existing !== null) {
      return ok({ run: existing, reused: true });
    }
    const run: ReplayRun = {
      ...identity,
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
    await jobQueue.send(REPLAY_RUN_JOB, { replayRunId: run.id });
    return ok({ run, reused: false });
  };

  const samplesOf = async (
    sampleActionKeys: readonly string[],
  ): Promise<readonly StoredAgentAction[]> => {
    const actions = await reader.getActions(sampleActionKeys);
    const byKey = new Map(actions.map((action) => [action.actionKey, action]));
    return sampleActionKeys.flatMap((key) => {
      const action = byKey.get(key);
      return action === undefined ? [] : [action];
    });
  };

  const runReplay = async (id: ReplayRunId): Promise<void> => {
    const run = await store.getRun(id);
    if (run?.status !== 'queued') {
      return;
    }
    const planned = await planFor(run);
    if (!planned.ok) {
      await failQueued(run, planned.error.code, null);
      return;
    }
    if (planned.value.inputsHash !== run.inputsHash) {
      await failQueued(run, 'replay.inputs_changed', null);
      return;
    }
    const { compute } = planned.value;
    await execute(run, () => compute(run));
  };

  return {
    async requestReplay(input) {
      return start({ ...input, kind: 'version_diff' }, await planVersionDiff(input));
    },

    async requestConformanceReplay(input) {
      return start(
        { ...input, kind: 'conformance', baselineVersionId: null },
        await planConformance(input),
      );
    },

    async requestAdoptionReplay(input) {
      return start(
        { ...input, kind: 'adoption', baselineVersionId: null },
        await planAdoption(input),
      );
    },

    runReplay,

    async runReplayJob(payload) {
      const parsed = ReplayRunJobPayloadSchema.safeParse(payload);
      if (!parsed.success) {
        logger.error('replay job payload invalid', { issues: parsed.error.issues });
        return;
      }
      await runReplay(parsed.data.replayRunId);
    },

    async listConformanceFindings() {
      const run = await store.findLatestConformanceRun();
      if (run === null) {
        return { run: null, items: [] };
      }
      const window = { from: run.windowFrom, to: run.windowTo };
      return {
        run: {
          replayRunId: run.replayRunId,
          policyVersionId: run.candidateVersionId,
          windowFrom: run.windowFrom,
          windowTo: run.windowTo,
          unpairedPermissionRequests: run.unpairedPermissionRequests,
          byPermissionMode: run.byPermissionMode,
          observationGaps: findObservationGaps(await reader.listObservationTimes(window), window),
        },
        items: await store.listConformanceFindings(run.replayRunId),
      };
    },

    async getConformanceFinding(findingKey) {
      const run = await store.findLatestConformanceRun();
      if (run === null) {
        return err(findingNotFound(findingKey));
      }
      const finding = await store.getConformanceFinding(run.replayRunId, findingKey);
      if (finding === null) {
        return err(findingNotFound(findingKey));
      }
      return ok({ finding, policyVersionId: run.candidateVersionId });
    },

    async acknowledgeConformanceFinding(findingKey, note) {
      const run = await store.findLatestConformanceRun();
      if (run === null) {
        return err(findingNotFound(findingKey));
      }
      const finding = await store.acknowledgeConformanceFinding(run.replayRunId, findingKey, note);
      if (finding === null) {
        return err(findingNotFound(findingKey));
      }
      return ok(finding);
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
      const samples: DiffGroupSample[] = [];
      for (const action of await samplesOf(group.sampleActionKeys)) {
        const baselineDecision = evaluateBaseline(action.operations);
        const candidateDecision = evaluateCandidate(action.operations);
        if (baselineDecision === null || candidateDecision === null) {
          continue;
        }
        samples.push({
          action,
          targetKeys: action.operations.map((operation) => deriveTargetKey(operation.target)),
          baselineDecision,
          candidateDecision,
          baselineRuleRationales: decidingRationales(baselineDecision, baseline.document),
          candidateRuleRationales: decidingRationales(candidateDecision, candidate.document),
        });
      }
      return ok(samples);
    },

    async listAdoptionGroups(id, input) {
      const run = await store.getRun(id);
      if (run === null) {
        return err(runNotFound(id));
      }
      const page = await store.listAdoptionGroups({ replayRunId: id, ...input });
      const items = page.items.map(
        ({ replayRunId: _replayRunId, position: _position, ...group }) => group,
      );
      return ok({ items, nextCursor: page.nextCursor });
    },

    async getAdoptionSamples(id, groupKey) {
      const run = await store.getRun(id);
      if (run === null) {
        return err(adoptionGroupNotFound(id, groupKey));
      }
      const group = await store.getAdoptionGroup(id, groupKey);
      if (group === null) {
        return err(adoptionGroupNotFound(id, groupKey));
      }
      const candidate = await policy.getVersion(run.candidateVersionId);
      if (candidate === null) {
        return err(sourceInvalid(run.candidateVersionId));
      }
      const evaluateCandidate = createEvaluator(candidate.document);
      const samples: AdoptionGroupSample[] = [];
      for (const action of await samplesOf(group.sampleActionKeys)) {
        const candidateDecision = evaluateCandidate(action.operations);
        if (candidateDecision === null) {
          continue;
        }
        samples.push({
          action,
          targetKeys: action.operations.map((operation) => deriveTargetKey(operation.target)),
          candidateDecision,
          candidateRuleRationales: decidingRationales(candidateDecision, candidate.document),
        });
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
            analyzability: candidate.analyzability,
          };
        }
      }
      return { run: null, cells: [], analyzability: { full: 0, partial: 0, none: 0 } };
    },

    async recoverInterruptedRuns() {
      await store.failStaleRunningRuns({
        now: clock.now(),
        staleMs: STALE_RUN_MS,
        errorCode: 'replay.interrupted',
      });
      for (const replayRunId of await store.listQueuedRunIds()) {
        await jobQueue.send(REPLAY_RUN_JOB, { replayRunId });
      }
    },
  };
}
