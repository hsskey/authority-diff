import type { Hono } from 'hono';
import type { Clock, IdGenerator } from '@authority/kernel';
import type { Database } from '@authority/platform';
import { createTraceModule } from '@authority/trace';
import type { TraceModule } from '@authority/trace';
import type { AppEnv } from '../http/env.ts';
import { registerActionsRoutes } from '../http/routes/actions.routes.ts';
import { registerActivityOverviewRoutes } from '../http/routes/activity-overview.routes.ts';
import { registerRuntimeObservationsRoutes } from '../http/routes/runtime-observations.routes.ts';
import { registerTraceImportsRoutes } from '../http/routes/trace-imports.routes.ts';

export interface TraceWiringDeps {
  readonly database: Database;
  readonly clock: Clock;
  readonly idGenerator: IdGenerator;
}

export function registerTraceRoutes(app: Hono<AppEnv>, trace: TraceModule, clock: Clock): void {
  registerTraceImportsRoutes(app, trace);
  registerRuntimeObservationsRoutes(app, trace);
  registerActionsRoutes(app, trace);
  registerActivityOverviewRoutes(app, trace, clock);
}

export function wireTrace(app: Hono<AppEnv>, deps: TraceWiringDeps): TraceModule {
  const trace = createTraceModule({
    database: deps.database,
    clock: deps.clock,
    idGenerator: deps.idGenerator,
  });
  registerTraceRoutes(app, trace, deps.clock);
  return trace;
}
