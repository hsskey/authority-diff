import { ok } from '@authority/kernel';
import type { AppError, Result } from '@authority/kernel';
import { createDatabase, parseConfig } from '@authority/platform';
import type { Config, Database } from '@authority/platform';
import { createMemoryLogger, createSequentialIdGenerator } from '@authority/platform/testing';
import { createApp } from '../../src/http/app.ts';
import type { ServerDeps } from '../../src/http/env.ts';

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

// The trace routes are wired from a Database; readiness-only tests never reach
// them, so this reuses one lazily-connecting Database and overrides only ping.
const baseDatabase = createDatabase(testConfig());

function fakeDatabase(ping: () => Promise<Result<true, AppError>>): Database {
  return { ...baseDatabase, ping };
}

export const okProbe: Database = fakeDatabase(() => Promise.resolve(ok(true)));

export function probeThatFails(error: AppError): Database {
  return fakeDatabase(() => Promise.resolve({ ok: false, error }));
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
