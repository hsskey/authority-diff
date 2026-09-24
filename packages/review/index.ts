import type { Clock, IdGenerator } from '@authority/kernel';
import type { Database } from '@authority/platform';
import type { ReplayModule } from '@authority/replay';
import {
  assembleReviewModule,
  type PolicyReviewRepository,
  type ReviewModule,
} from './lib/app/module.ts';
import type { TraceSourceReader } from './lib/app/ports.ts';
import { createReviewStore } from './lib/infra/review-store.ts';

export interface CreateReviewModuleDeps {
  readonly database: Database;
  readonly replay: ReplayModule;
  readonly policy: PolicyReviewRepository;
  readonly traceSources: TraceSourceReader;
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
    traceSources: deps.traceSources,
    clock: deps.clock,
    idGenerator: deps.idGenerator,
  });
}

export { createReviewStore } from './lib/infra/review-store.ts';
export { verifyAuditChain } from './lib/infra/audit-chain.ts';
export type { AuditVerification } from './lib/infra/audit-chain.ts';
export { recordSeedOnlyAcceptance, SEED_ONLY_AUDIT_NOTE } from './lib/infra/seed-audit.ts';
export type { RecordSeedOnlyAcceptanceInput } from './lib/infra/seed-audit.ts';
export { assembleReviewModule } from './lib/app/module.ts';
export { computeGate } from './lib/domain/gate.ts';
export { renderAdoptionReport, renderReport } from './lib/domain/report.ts';
export type {
  AssembleReviewModuleDeps,
  ChangeReviewView,
  ChangeReviewsResult,
  CreateChangeReviewInput,
  DecideInput,
  ListChangeReviewsInput,
  ListReviewAdoptionGroupsInput,
  ListReviewDiffGroupsInput,
  PolicyReviewRepository,
  RecordedVerdict,
  RecordVerdictInput,
  ReplaySummary,
  ReviewAdoptionGroup,
  ReviewAdoptionGroupsResult,
  ReviewDiffGroup,
  ReviewDiffGroupsResult,
  ReviewModule,
} from './lib/app/module.ts';
export type { ReviewStore, TraceSourceReader } from './lib/app/ports.ts';
export type { GateInput } from './lib/domain/gate.ts';
export type {
  AdoptionReportGroup,
  AuditTail,
  AdoptionReportInput,
  ReportConformance,
  ReportGroup,
  ReportInput,
  TraceSourceCounts,
} from './lib/domain/report.ts';
