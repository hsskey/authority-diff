import type { IsoTimestamp } from '@authority/kernel';
import type {
  PolicyDocument,
  PolicyVersionId,
  PolicyVersionStatus,
} from '@authority/policy/schema';
import type {
  AdoptionEffect,
  AdoptionStats,
  AnalyzabilityCounts,
  AuthorityMapCell,
  ConformanceFindingView,
  DiffGroup,
  PermissionModeCount,
  ReplayRun,
  ReplayRunId,
  ReplayStats,
  StoredAdoptionAssignment,
  StoredAdoptionGroup,
  StoredChangedAction,
  StoredConformanceFinding,
  StoredDiffGroup,
} from '../../schema.ts';

/**
 * The stored `stats` jsonb of a version_diff or conformance run: the diff
 * core's stats plus the authority-map matrix and analyzability counts, and for
 * a conformance run the permission_requests left without a pre_tool_use.
 */
export interface StoredReplayStats extends ReplayStats {
  readonly matrix: readonly AuthorityMapCell[];
  readonly analyzability: AnalyzabilityCounts;
  readonly unpairedPermissionRequests?: number;
}

/** The stored `stats` jsonb of any run; an adoption run stores its AdoptionStats as is. */
export type StoredRunStats = StoredReplayStats | AdoptionStats;

/** The candidate/baseline policy documents replay reads through trace's sibling policy module. */
export interface PolicyVersionView {
  readonly document: PolicyDocument;
  readonly contentHash: string;
  readonly status: PolicyVersionStatus;
}

export interface PolicyReader {
  getVersion(id: PolicyVersionId): Promise<PolicyVersionView | null>;
}

export interface ListDiffGroupsQuery {
  readonly replayRunId: ReplayRunId;
  readonly direction?: DiffGroup['direction'] | undefined;
  readonly severity?: DiffGroup['severity'] | undefined;
  readonly cursor?: string | undefined;
  readonly limit: number;
}

export interface DiffGroupsPage {
  readonly items: readonly StoredDiffGroup[];
  readonly nextCursor: string | null;
}

export interface ListAdoptionGroupsQuery {
  readonly replayRunId: ReplayRunId;
  readonly effect?: AdoptionEffect | undefined;
  /** The groupKey of the last group of the previous page. */
  readonly cursor?: string | undefined;
  readonly limit: number;
}

export interface AdoptionGroupsPage {
  readonly items: readonly StoredAdoptionGroup[];
  readonly nextCursor: string | null;
}

export interface RecordCompletionInput {
  readonly replayRunId: ReplayRunId;
  readonly resultHash: string;
  readonly stats: StoredRunStats;
  readonly groups: readonly StoredDiffGroup[];
  readonly changedActions: readonly StoredChangedAction[];
  readonly findings: readonly StoredConformanceFinding[];
  readonly adoptionGroups: readonly StoredAdoptionGroup[];
  readonly adoptionAssignments: readonly StoredAdoptionAssignment[];
  readonly completedAt: IsoTimestamp;
}

export interface FailStaleRunsInput {
  /** Current time; a run whose startedAt is more than `staleMs` before it fails. */
  readonly now: IsoTimestamp;
  readonly staleMs: number;
  readonly errorCode: string;
}

/** A completed run and its stored matrix and analyzability counts, for the authority-map query. */
export interface AuthorityMapRunView {
  readonly replayRunId: ReplayRunId;
  readonly candidateVersionId: PolicyVersionId;
  readonly windowFrom: IsoTimestamp;
  readonly windowTo: IsoTimestamp;
  readonly matrix: readonly AuthorityMapCell[];
  readonly analyzability: AnalyzabilityCounts;
}

/** The most recent completed conformance run. */
export interface ConformanceRunView {
  readonly replayRunId: ReplayRunId;
  readonly candidateVersionId: PolicyVersionId;
  readonly windowFrom: IsoTimestamp;
  readonly windowTo: IsoTimestamp;
  readonly unpairedPermissionRequests: number;
  readonly byPermissionMode: readonly PermissionModeCount[];
}

/**
 * The persistence port owned by replay. `lib/infra` implements it against
 * drizzle; tests implement it in memory. Idempotency is the natural
 * `inputsHash`: a completed run with a given hash is returned unchanged.
 */
export interface ReplayStore {
  findCompletedByInputsHash(inputsHash: string): Promise<ReplayRun | null>;
  insertQueuedRun(run: ReplayRun): Promise<void>;
  /** Claims a `queued` run; false when the run is in any other status. */
  markRunning(id: ReplayRunId, startedAt: IsoTimestamp): Promise<boolean>;
  recordCompletion(input: RecordCompletionInput): Promise<void>;
  markFailed(id: ReplayRunId, errorCode: string, completedAt: IsoTimestamp): Promise<void>;
  /** Fails a run only while it is still `queued`; a no-op once it is claimed or completed. */
  failQueuedRun(id: ReplayRunId, errorCode: string, completedAt: IsoTimestamp): Promise<void>;
  getRun(id: ReplayRunId): Promise<ReplayRun | null>;
  listDiffGroups(query: ListDiffGroupsQuery): Promise<DiffGroupsPage>;
  getDiffGroup(id: ReplayRunId, groupKey: string): Promise<StoredDiffGroup | null>;
  /** Adoption Groups of a run in review order (`position`). */
  listAdoptionGroups(query: ListAdoptionGroupsQuery): Promise<AdoptionGroupsPage>;
  getAdoptionGroup(id: ReplayRunId, groupKey: string): Promise<StoredAdoptionGroup | null>;
  failStaleRunningRuns(input: FailStaleRunsInput): Promise<number>;
  listQueuedRunIds(): Promise<readonly ReplayRunId[]>;
  /** Completed `version_diff` and `adoption` runs; a conformance run never backs the authority map. */
  listCompletedRunsNewestFirst(): Promise<readonly AuthorityMapRunView[]>;
  findLatestConformanceRun(): Promise<ConformanceRunView | null>;
  listConformanceFindings(id: ReplayRunId): Promise<readonly ConformanceFindingView[]>;
  getConformanceFinding(
    id: ReplayRunId,
    findingKey: string,
  ): Promise<ConformanceFindingView | null>;
  acknowledgeConformanceFinding(
    id: ReplayRunId,
    findingKey: string,
    note: string,
  ): Promise<ConformanceFindingView | null>;
}
