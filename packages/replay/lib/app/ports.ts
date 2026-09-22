import type { IsoTimestamp } from '@authority/kernel';
import type {
  PolicyDocument,
  PolicyVersionId,
  PolicyVersionStatus,
} from '@authority/policy/schema';
import type {
  DiffGroup,
  ReplayRun,
  ReplayRunId,
  ReplayStats,
  StoredChangedAction,
  StoredDiffGroup,
} from '../../schema.ts';
import type { AuthorityMapCell } from '../domain/build-matrix.ts';

/** The stored `stats` jsonb: the diff core's stats plus the authority-map matrix. */
export interface StoredReplayStats extends ReplayStats {
  readonly matrix: readonly AuthorityMapCell[];
}

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

export interface RecordCompletionInput {
  readonly replayRunId: ReplayRunId;
  readonly resultHash: string;
  readonly stats: StoredReplayStats;
  readonly groups: readonly StoredDiffGroup[];
  readonly changedActions: readonly StoredChangedAction[];
  readonly completedAt: IsoTimestamp;
}

export interface FailStaleRunsInput {
  /** Current time; a run whose startedAt is more than `staleMs` before it fails. */
  readonly now: IsoTimestamp;
  readonly staleMs: number;
  readonly errorCode: string;
}

/** A completed run and its stored matrix, for the authority-map query. */
export interface AuthorityMapRunView {
  readonly replayRunId: ReplayRunId;
  readonly candidateVersionId: PolicyVersionId;
  readonly windowFrom: IsoTimestamp;
  readonly windowTo: IsoTimestamp;
  readonly matrix: readonly AuthorityMapCell[];
}

/**
 * The persistence port owned by replay. `lib/infra` implements it against
 * drizzle; tests implement it in memory. Idempotency is the natural
 * `inputsHash`: a completed run with a given hash is returned unchanged.
 */
export interface ReplayStore {
  findCompletedByInputsHash(inputsHash: string): Promise<ReplayRun | null>;
  insertQueuedRun(run: ReplayRun): Promise<void>;
  markRunning(id: ReplayRunId, startedAt: IsoTimestamp): Promise<void>;
  recordCompletion(input: RecordCompletionInput): Promise<void>;
  markFailed(id: ReplayRunId, errorCode: string, completedAt: IsoTimestamp): Promise<void>;
  getRun(id: ReplayRunId): Promise<ReplayRun | null>;
  listDiffGroups(query: ListDiffGroupsQuery): Promise<DiffGroupsPage>;
  getDiffGroup(id: ReplayRunId, groupKey: string): Promise<StoredDiffGroup | null>;
  failStaleRunningRuns(input: FailStaleRunsInput): Promise<number>;
  listCompletedRunsNewestFirst(): Promise<readonly AuthorityMapRunView[]>;
}
