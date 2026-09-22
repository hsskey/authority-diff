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

export { migrateReplayStore } from './lib/infra/migrate.ts';
export { assembleReplayModule } from './lib/app/module.ts';
export type {
  AssembleReplayModuleDeps,
  AuthorityMapView,
  DiffGroupSample,
  DiffGroupsResult,
  ListDiffGroupsInput,
  ReplayModule,
  RequestReplayInput,
  RequestReplayOutput,
} from './lib/app/module.ts';
export type { PolicyReader, PolicyVersionView, ReplayStore } from './lib/app/ports.ts';
export type { AuthorityMapCell } from './lib/domain/build-matrix.ts';
