import type { Hono } from 'hono';
import { err, ok } from '@authority/kernel';
import type { Clock, IdGenerator, Logger } from '@authority/kernel';
import type { Database } from '@authority/platform';
import { createPolicyRepository } from '@authority/policy';
import type { PolicyId, PolicyVersionId } from '@authority/policy/schema';
import { createReplayModule } from '@authority/replay';
import type { PolicyReader, ReplayModule } from '@authority/replay';
import { createReviewModule } from '@authority/review';
import type { PolicyReviewRepository, ReviewModule } from '@authority/review';
import type { TraceModule } from '@authority/trace';
import type { AppEnv } from '../http/env.ts';
import { registerChangeReviewsRoutes } from '../http/routes/change-reviews.routes.ts';

type PolicyRepository = ReturnType<typeof createPolicyRepository>;

function makePolicyReader(repository: PolicyRepository): PolicyReader {
  return {
    async getVersion(id: PolicyVersionId) {
      const result = await repository.getVersion(id);
      if (result.ok) {
        const version = result.value;
        return {
          document: version.document,
          contentHash: version.contentHash,
          status: version.status,
        };
      }
      if (result.error.code === 'policy.version_not_found') {
        return null;
      }
      throw new Error(result.error.message);
    },
  };
}

function makePolicyReviewRepository(repository: PolicyRepository): PolicyReviewRepository {
  return {
    async getVersion(id: PolicyVersionId) {
      const result = await repository.getVersion(id);
      if (!result.ok) {
        return err(result.error);
      }
      const version = result.value;
      return ok({
        id: version.id,
        policyId: version.policyId,
        contentHash: version.contentHash,
        status: version.status,
      });
    },
    async getBaseline(policyId: PolicyId) {
      const result = await repository.getBaseline(policyId);
      if (!result.ok) {
        return err(result.error);
      }
      return ok({ id: result.value.id, contentHash: result.value.contentHash });
    },
    async submitForReview(id: PolicyVersionId) {
      const result = await repository.transitionVersion(id, 'submit');
      return result.ok ? ok(undefined) : err(result.error);
    },
  };
}

export interface RegisterReviewModuleDeps {
  readonly trace: TraceModule;
  readonly database: Database;
  readonly clock: Clock;
  readonly idGenerator: IdGenerator;
  readonly logger: Logger;
}

/** Wires the review module (over its own replay module) and its HTTP routes. */
export function registerReviewModule(app: Hono<AppEnv>, deps: RegisterReviewModuleDeps): void {
  const repository = createPolicyRepository({
    db: deps.database.db,
    clock: deps.clock,
    idGenerator: deps.idGenerator,
  });
  const replay: ReplayModule = createReplayModule({
    database: deps.database,
    reader: deps.trace.reader,
    policy: makePolicyReader(repository),
    clock: deps.clock,
    idGenerator: deps.idGenerator,
    logger: deps.logger,
    classifierVersion: deps.trace.classifierVersion,
  });
  const review: ReviewModule = createReviewModule({
    database: deps.database,
    replay,
    policy: makePolicyReviewRepository(repository),
    traceSources: deps.trace,
    clock: deps.clock,
    idGenerator: deps.idGenerator,
  });

  registerChangeReviewsRoutes(app, review);
}
