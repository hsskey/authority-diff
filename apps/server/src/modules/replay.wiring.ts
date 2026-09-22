import type { Hono } from 'hono';
import type { Clock, IdGenerator } from '@authority/kernel';
import type { Database } from '@authority/platform';
import { createPolicyRepository } from '@authority/policy';
import type { PolicyVersionId } from '@authority/policy/schema';
import { createReplayModule } from '@authority/replay';
import type { PolicyReader, ReplayModule } from '@authority/replay';
import type { TraceModule } from '@authority/trace';
import type { AppEnv } from '../http/env.ts';
import { registerAuthorityMapRoutes } from '../http/routes/authority-map.routes.ts';
import { registerDiffGroupsRoutes } from '../http/routes/diff-groups.routes.ts';
import { registerReplayRunsRoutes } from '../http/routes/replay-runs.routes.ts';

function makePolicyReader(repository: ReturnType<typeof createPolicyRepository>): PolicyReader {
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

export interface RegisterReplayModuleDeps {
  readonly trace: TraceModule;
  readonly database: Database;
  readonly clock: Clock;
  readonly idGenerator: IdGenerator;
}

/** Wires the replay module and its routes; runs restart recovery once at init. */
export function registerReplayModule(app: Hono<AppEnv>, deps: RegisterReplayModuleDeps): void {
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
    classifierVersion: deps.trace.classifierVersion,
  });

  // Recovery runs once at init and never blocks boot: a run left running past
  // 60s becomes failed, and a cold database is swallowed rather than thrown.
  void replay.recoverInterruptedRuns().catch(() => {});

  registerReplayRunsRoutes(app, replay);
  registerDiffGroupsRoutes(app, replay);
  registerAuthorityMapRoutes(app, replay);
}
