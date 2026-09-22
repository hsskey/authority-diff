import { describe, expect, test } from 'vitest';
import { parseConfig } from '../index.ts';
import { expectErr, expectOk } from './support/result.ts';

const fullEnv = (): Record<string, string | undefined> => ({
  AUTHORITY_SERVER_PORT: '9000',
  AUTHORITY_DB_URL: 'postgres://user:pw@localhost:5432/authority',
  AUTHORITY_DB_POOL_MAX: '20',
  AUTHORITY_AUTH_TOKEN: 'secret-token',
  AUTHORITY_LOG_LEVEL: 'warn',
});

const requiredOnlyEnv = (): Record<string, string | undefined> => ({
  AUTHORITY_DB_URL: 'postgres://user:pw@localhost:5432/authority',
  AUTHORITY_AUTH_TOKEN: 'secret-token',
});

describe('parseConfig', () => {
  test('parses a fully specified environment', () => {
    const config = expectOk(parseConfig(fullEnv()));
    expect(config.server.port).toBe(9000);
    expect(config.db.poolMax).toBe(20);
    expect(config.db.url.reveal()).toBe('postgres://user:pw@localhost:5432/authority');
    expect(config.auth.token.reveal()).toBe('secret-token');
    expect(config.log.level).toBe('warn');
  });

  test('applies defaults for optional variables', () => {
    const config = expectOk(parseConfig(requiredOnlyEnv()));
    expect(config.server.port).toBe(8787);
    expect(config.db.poolMax).toBe(10);
    expect(config.log.level).toBe('info');
  });

  test('reports every missing required variable', () => {
    const error = expectErr(parseConfig({}));
    expect(error.code).toBe('platform.config_invalid');
    expect(error.message).toContain('AUTHORITY_DB_URL');
    expect(error.message).toContain('AUTHORITY_AUTH_TOKEN');
  });

  test('rejects a non-numeric port', () => {
    const error = expectErr(
      parseConfig({ ...requiredOnlyEnv(), AUTHORITY_SERVER_PORT: 'not-a-number' }),
    );
    expect(error.message).toContain('AUTHORITY_SERVER_PORT');
  });

  test('does not expose the token value through serialization', () => {
    const config = expectOk(parseConfig(fullEnv()));
    expect(JSON.stringify(config)).not.toContain('secret-token');
  });
});
