import type { Hono } from 'hono';
import {
  createDatabase,
  createLogger,
  createSystemClock,
  createUlidGenerator,
} from '@authority/platform';
import type { Config } from '@authority/platform';
import type { AppEnv } from './http/env.ts';
import { wirePolicy, type PolicyWiringDeps } from './modules/policy.wiring.ts';

// Shared dependencies every module wires against. Each module reads the subset
// it needs (policy uses db, clock, ids); logger and transactionRunner are here
// for the modules that need them.
export function buildServerDeps(config: Config): PolicyWiringDeps {
  const database = createDatabase(config);
  return {
    db: database.db,
    clock: createSystemClock(),
    ids: createUlidGenerator(),
    logger: createLogger(config),
    transactionRunner: database.transactionRunner,
  };
}

// One line per module. Later milestones add their own wiring call here.
export function composeModules(app: Hono<AppEnv>, config: Config): void {
  const deps = buildServerDeps(config);
  wirePolicy(app, deps);
}
