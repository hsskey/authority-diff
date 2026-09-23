import type { Clock, IdGenerator } from '@authority/kernel';
import type { Database } from '@authority/platform';
import type { ActionReader } from '@authority/trace';
import { assembleReplayModule } from './lib/app/module.ts';
import type { PolicyReader } from './lib/app/ports.ts';
import { createReplayStore } from './lib/infra/replay-store.ts';

export interface CreateReplayModuleDeps {
  readonly database: Database;
  readonly reader: ActionReader;
  readonly policy: PolicyReader;
  readonly clock: Clock;
  readonly idGenerator: IdGenerator;
  readonly classifierVersion: string;
}

/** Assembles the replay module for the server over a drizzle-backed store. */
export function createReplayModule(deps: CreateReplayModuleDeps) {
  return assembleReplayModule({
    store: createReplayStore(deps.database),
    reader: deps.reader,
    policy: deps.policy,
    clock: deps.clock,
    idGenerator: deps.idGenerator,
    classifierVersion: deps.classifierVersion,
  });
}

export { assembleReplayModule } from './lib/app/module.ts';
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
export type { AnalyzabilityCounts, AuthorityMapCell } from './schema.ts';
