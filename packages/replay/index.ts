import type { Clock, IdGenerator, JobQueue, Logger } from '@authority/kernel';
import type { Database } from '@authority/platform';
import type { ActionReader } from '@authority/trace';
import { assembleReplayModule } from './lib/app/module.ts';
import type { PolicyReader } from './lib/app/ports.ts';
import { createReplayStore } from './lib/infra/replay-store.ts';

export interface CreateReplayModuleDeps {
  readonly database: Database;
  readonly reader: ActionReader;
  readonly policy: PolicyReader;
  readonly jobQueue: JobQueue;
  readonly clock: Clock;
  readonly idGenerator: IdGenerator;
  readonly logger: Logger;
  readonly classifierVersion: string;
}

/** Assembles the replay module for the server over a drizzle-backed store. */
export function createReplayModule(deps: CreateReplayModuleDeps) {
  return assembleReplayModule({
    store: createReplayStore(deps.database),
    reader: deps.reader,
    policy: deps.policy,
    jobQueue: deps.jobQueue,
    clock: deps.clock,
    idGenerator: deps.idGenerator,
    logger: deps.logger,
    classifierVersion: deps.classifierVersion,
  });
}

export { assembleReplayModule, REPLAY_RUN_JOB } from './lib/app/module.ts';
export type {
  AdoptionGroupSample,
  AdoptionGroupsResult,
  AssembleReplayModuleDeps,
  AuthorityMapView,
  ConformanceFindingsView,
  DiffGroupSample,
  DiffGroupsResult,
  ListAdoptionGroupsInput,
  ListDiffGroupsInput,
  ReplayModule,
  RequestAdoptionReplayInput,
  RequestConformanceReplayInput,
  RequestReplayInput,
  RequestReplayOutput,
} from './lib/app/module.ts';
export type { PolicyReader, PolicyVersionView, ReplayStore } from './lib/app/ports.ts';
export type { AnalyzabilityCounts, AuthorityMapCell, ConformanceFindingView } from './schema.ts';
