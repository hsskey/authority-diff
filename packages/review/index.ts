import type { Clock, IdGenerator } from '@authority/kernel';
import type { Database } from '@authority/platform';
import type { ReplayModule } from '@authority/replay';
import {
  assembleReviewModule,
  type PolicyReviewRepository,
  type ReviewModule,
} from './lib/app/module.ts';
import { createReviewStore } from './lib/infra/review-store.ts';

export interface CreateReviewModuleDeps {
  readonly database: Database;
  readonly replay: ReplayModule;
  readonly policy: PolicyReviewRepository;
  readonly clock: Clock;
  readonly idGenerator: IdGenerator;
}

/** Assembles the review module for the server over a drizzle-backed store. */
export function createReviewModule(deps: CreateReviewModuleDeps): ReviewModule {
  return assembleReviewModule({
    store: createReviewStore({
      database: deps.database,
      clock: deps.clock,
      idGenerator: deps.idGenerator,
    }),
    replay: deps.replay,
    policy: deps.policy,
    clock: deps.clock,
    idGenerator: deps.idGenerator,
  });
}

export { migrateReviewStore } from './lib/infra/migrate.ts';
export { assembleReviewModule } from './lib/app/module.ts';
export { computeGate } from './lib/domain/gate.ts';
export { renderReport } from './lib/domain/report.ts';
export type {
  AssembleReviewModuleDeps,
  ChangeReviewView,
  CreateChangeReviewInput,
  DecideInput,
  ListReviewDiffGroupsInput,
  PolicyReviewRepository,
  RecordedVerdict,
  RecordVerdictInput,
  ReplaySummary,
  ReviewDiffGroup,
  ReviewDiffGroupsResult,
  ReviewModule,
} from './lib/app/module.ts';
export type { ReviewStore } from './lib/app/ports.ts';
export type { GateInput } from './lib/domain/gate.ts';
export type { ReportGroup, ReportInput } from './lib/domain/report.ts';
