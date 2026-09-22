import { IsoTimestampSchema } from '@authority/kernel';
import type { Clock, IdGenerator } from '@authority/kernel';
import type { ClassifyToolCall } from '@authority/action/schema';
import { assembleTraceModule } from './lib/app/module.ts';
import type { TraceModule } from './lib/app/module.ts';
import { createInMemoryTraceStore } from './lib/app/in-memory-store.ts';
import type { InMemoryTraceStore } from './lib/app/in-memory-store.ts';

export { createInMemoryTraceStore };
export type { InMemoryTraceStore };

function fixedClock(): Clock {
  return { now: () => IsoTimestampSchema.parse('2026-01-01T00:00:00.000Z') };
}

function counterIdGenerator(): IdGenerator {
  let n = 0;
  return { next: (prefix) => `${prefix}_${String(++n).padStart(26, '0')}` };
}

export interface TestTraceModuleDeps {
  readonly store?: InMemoryTraceStore;
  readonly classify?: ClassifyToolCall;
  readonly clock?: Clock;
  readonly idGenerator?: IdGenerator;
  readonly classifierVersion?: string;
}

export interface TestTraceModule extends TraceModule {
  readonly store: InMemoryTraceStore;
}

/**
 * Builds a trace module backed by an in-memory store and an injected classifier,
 * so a test can drive imports, observations and reclassification without a
 * database or the real WASM grammar.
 */
export function createTestTraceModule(deps: TestTraceModuleDeps = {}): TestTraceModule {
  const store = deps.store ?? createInMemoryTraceStore();
  const classify = deps.classify ?? ((): [] => []);
  const module = assembleTraceModule({
    store,
    getClassify: () => Promise.resolve(classify),
    clock: deps.clock ?? fixedClock(),
    idGenerator: deps.idGenerator ?? counterIdGenerator(),
    classifierVersion: deps.classifierVersion ?? 'test-classifier',
  });
  return { ...module, store };
}
