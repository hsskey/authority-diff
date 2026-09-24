import type { Hono } from 'hono';
import {
  createDatabase,
  createLogger,
  createSystemClock,
  createUlidGenerator,
} from '@authority/platform';
import type { Config, Database } from '@authority/platform';
import type { TraceModule } from '@authority/trace';
import type { AppEnv } from './http/env.ts';
import { wirePolicy, type PolicyWiringDeps } from './modules/policy.wiring.ts';
import { wireTrace } from './modules/trace.wiring.ts';

export interface ModuleWiringDeps extends PolicyWiringDeps {
  readonly database: Database;
}

export function buildServerDeps(config: Config): ModuleWiringDeps {
  const database = createDatabase(config);
  return {
    database,
    db: database.db,
    clock: createSystemClock(),
    ids: createUlidGenerator(),
    logger: createLogger(config),
    transactionRunner: database.transactionRunner,
  };
}

export function composeModules(app: Hono<AppEnv>, config: Config): TraceModule {
  const deps = buildServerDeps(config);
  wirePolicy(app, deps);
  return wireTrace(app, {
    database: deps.database,
    clock: deps.clock,
    idGenerator: deps.ids,
  });
}
