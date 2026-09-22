import { ok } from '@authority/kernel';
import type { AppError, Result } from '@authority/kernel';
import { parseConfig } from '@authority/platform';
import type { Config } from '@authority/platform';
import { createMemoryLogger, createSequentialIdGenerator } from '@authority/platform/testing';
import { createApp } from '../../src/http/app.ts';
import type { ReadinessProbe, ServerDeps } from '../../src/http/env.ts';

export function testConfig(token = 'test-token'): Config {
  const result = parseConfig({
    AUTHORITY_DB_URL: 'postgres://user:pw@localhost:5432/authority',
    AUTHORITY_AUTH_TOKEN: token,
  });
  if (!result.ok) {
    throw new Error('test config failed to parse');
  }
  return result.value;
}

export const okProbe: ReadinessProbe = {
  ping: (): Promise<Result<true, AppError>> => Promise.resolve(ok(true)),
};

export function probeThatFails(error: AppError): ReadinessProbe {
  return { ping: (): Promise<Result<true, AppError>> => Promise.resolve({ ok: false, error }) };
}

export function buildApp(overrides: Partial<ServerDeps> = {}) {
  const deps: ServerDeps = {
    config: testConfig(),
    logger: createMemoryLogger(),
    idGenerator: createSequentialIdGenerator(),
    db: okProbe,
    ...overrides,
  };
  return createApp(deps);
}
