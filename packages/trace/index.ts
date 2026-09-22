import { CLASSIFIER_VERSION, createClassifier } from '@authority/action';
import type { ClassifyToolCall } from '@authority/action/schema';
import type { Clock, IdGenerator } from '@authority/kernel';
import type { Database } from '@authority/platform';
import { assembleTraceModule } from './lib/app/module.ts';
import { createTraceStore } from './lib/infra/trace-store.ts';

export interface CreateTraceModuleDeps {
  readonly database: Database;
  readonly clock: Clock;
  readonly idGenerator: IdGenerator;
}

/**
 * Assembles the trace module for the server. The classifier WASM grammar loads
 * once, on the first import or reclassification, and is reused thereafter.
 */
export function createTraceModule(deps: CreateTraceModuleDeps) {
  let classifier: Promise<ClassifyToolCall> | undefined;
  return assembleTraceModule({
    store: createTraceStore(deps.database),
    getClassify: () => (classifier ??= createClassifier()),
    clock: deps.clock,
    idGenerator: deps.idGenerator,
    classifierVersion: CLASSIFIER_VERSION,
  });
}

export type { TraceModule } from './lib/app/module.ts';
export type { ActionReader } from './lib/app/ports.ts';
export type { ImportTraceResult } from './lib/app/import-trace.ts';
export type {
  IngestObservationsInput,
  RuntimeObservationInput,
} from './lib/app/ingest-observations.ts';
export type { ReclassifyActionsResult } from './lib/app/reclassify-actions.ts';
