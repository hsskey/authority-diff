import { IsoTimestampSchema, invariant, type IsoTimestamp } from '../../packages/kernel/index.ts';
import type { Operation } from '../../packages/action/schema.ts';
import { deriveActionKey } from '../../packages/trace/client.ts';
import type { ActionForReplay } from '../../packages/trace/schema.ts';
import {
  ASK_DENY_ARCHETYPES,
  S1_ACTION_COUNT,
  S1_ARCHETYPES,
  S1_DAY_COUNT,
  S1_ORIGIN,
  S1_PRINCIPAL_COUNT,
  S1_SEED,
  type S1Archetype,
} from './s1-seed.ts';

export interface GenerateS1Options {
  readonly principalCount: number;
  readonly dayCount: number;
  readonly actionCount: number;
  readonly seed: number;
}

export const S1_DEFAULTS: GenerateS1Options = {
  principalCount: S1_PRINCIPAL_COUNT,
  dayCount: S1_DAY_COUNT,
  actionCount: S1_ACTION_COUNT,
  seed: S1_SEED,
};

const MS_PER_DAY = 86_400_000;

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let next = state;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function pickArchetype(roll: number, archetypes: readonly S1Archetype[]): S1Archetype {
  let remaining = roll;
  for (const archetype of archetypes) {
    remaining -= archetype.weight;
    if (remaining < 0) {
      return archetype;
    }
  }
  const last = archetypes[archetypes.length - 1];
  invariant(last !== undefined, 'S1 archetypes must not be empty');
  return last;
}

function pickProgram(roll: number, programs: readonly (string | null)[]): string | null {
  const index = Math.min(programs.length - 1, Math.floor(roll * programs.length));
  const program = programs[index];
  invariant(program !== undefined, 'S1 archetype programs must not be empty');
  return program;
}

export function principalId(index: number): string {
  return `principal-${String(index).padStart(2, '0')}`;
}

export function sessionExternalId(principalIndex: number, sessionIndex: number): string {
  return `${principalId(principalIndex)}/session-${String(sessionIndex).padStart(4, '0')}`;
}

function occurredAt(
  originMs: number,
  day: number,
  indexInDay: number,
  dayLength: number,
): IsoTimestamp {
  const spread = dayLength === 0 ? 0 : Math.floor((indexInDay * (MS_PER_DAY - 1)) / dayLength);
  return IsoTimestampSchema.parse(new Date(originMs + day * MS_PER_DAY + spread).toISOString());
}

const EXTRA_NONE_WEIGHT = 1_653;
const ASK_DENY_NOT_NONE_WEIGHT = 11_786;

function toOperation(
  archetype: S1Archetype,
  program: string | null,
  index: number,
): Operation | null {
  if (archetype.capability === null) {
    return null;
  }
  return {
    index,
    capability: archetype.capability,
    target: archetype.target,
    analyzability: archetype.analyzability,
    program,
    fragment: 'synthetic redacted fragment',
    signals: [...archetype.signals],
  };
}

function extraNoneOperation(index: number): Operation {
  return {
    index,
    capability: 'execute',
    target: { kind: 'unknown' },
    analyzability: 'none',
    program: 'synthetic-unanalyzed',
    fragment: 'synthetic redacted fragment',
    signals: ['inline_code'],
  };
}

/**
 * Yields a synthetic organization's Actions: `principalCount` Principals over
 * `dayCount` days, sampling the published R1 Capability / Zone / analyzability
 * mix. Consumption is lazy; a caller that only needs a window `take`s it.
 */
export function* generateS1Actions(
  options: GenerateS1Options = S1_DEFAULTS,
): IterableIterator<ActionForReplay> {
  const { principalCount, dayCount, actionCount, seed } = options;
  invariant(principalCount > 0, 'principalCount must be positive');
  invariant(dayCount > 0, 'dayCount must be positive');
  invariant(actionCount >= 0, 'actionCount must be non-negative');
  const rng = mulberry32(seed);
  const totalWeight = S1_ARCHETYPES.reduce((sum, archetype) => sum + archetype.weight, 0);
  const originMs = Date.parse(S1_ORIGIN);
  const actionsPerSession = 34;
  for (let index = 0; index < actionCount; index += 1) {
    const archetype = pickArchetype(rng() * totalWeight, S1_ARCHETYPES);
    const program = pickProgram(rng(), archetype.programs);
    const principalIndex = index % principalCount;
    const day = Math.floor((index * dayCount) / actionCount);
    const dayStart = Math.ceil((day * actionCount) / dayCount);
    const nextDayStart = Math.ceil(((day + 1) * actionCount) / dayCount);
    const dayLength = nextDayStart - dayStart;
    const operation = toOperation(archetype, program, 0);
    const addTrailingNone =
      operation !== null &&
      archetype.analyzability !== 'none' &&
      ASK_DENY_ARCHETYPES.includes(archetype) &&
      rng() * ASK_DENY_NOT_NONE_WEIGHT < EXTRA_NONE_WEIGHT;
    const operations =
      operation === null ? [] : addTrailingNone ? [operation, extraNoneOperation(1)] : [operation];
    yield {
      actionKey: deriveActionKey({
        runtime: 'claude_code',
        sessionExternalId: sessionExternalId(principalIndex, Math.floor(index / actionsPerSession)),
        toolUseId: `s1-${String(seed)}-${String(index)}`,
        sequence: index,
      }),
      sessionExternalId: sessionExternalId(principalIndex, Math.floor(index / actionsPerSession)),
      operations,
      observedOutcome: 'executed',
      occurredAt: occurredAt(originMs, day, index - dayStart, dayLength),
    };
  }
}

export function collectS1Actions(options: GenerateS1Options = S1_DEFAULTS): ActionForReplay[] {
  return [...generateS1Actions(options)];
}

export function takeActions(actions: Iterable<ActionForReplay>, count: number): ActionForReplay[] {
  const taken: ActionForReplay[] = [];
  for (const action of actions) {
    taken.push(action);
    if (taken.length === count) {
      break;
    }
  }
  return taken;
}

export function windowByDays(
  actions: readonly ActionForReplay[],
  windowDays: number,
  origin: string = S1_ORIGIN,
): ActionForReplay[] {
  const endMs = Date.parse(origin) + windowDays * MS_PER_DAY;
  return actions.filter((action) => Date.parse(action.occurredAt) < endMs);
}
