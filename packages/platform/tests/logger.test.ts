import { describe, expect, test } from 'vitest';
import { createLogger, parseConfig } from '../index.ts';
import { expectOk } from './support/result.ts';

const configWith = (level: string) =>
  expectOk(
    parseConfig({
      AUTHORITY_DB_URL: 'postgres://user:pw@localhost:5432/authority',
      AUTHORITY_AUTH_TOKEN: 'secret-token',
      AUTHORITY_LOG_LEVEL: level,
    }),
  );

const capture = () => {
  const lines: string[] = [];
  return { lines, destination: { write: (line: string) => void lines.push(line) } };
};

describe('createLogger', () => {
  test('redacts secrets and trace-derived strings at the configured paths', () => {
    const sink = capture();
    const logger = createLogger(configWith('info'), { destination: sink.destination });

    logger.info('request', {
      auth: { token: 'CANARY-TOKEN' },
      provider: { apiKey: 'CANARY-KEY' },
      headers: { authorization: 'Bearer CANARY-AUTH' },
    });

    const output = sink.lines.join('');
    expect(output).not.toContain('CANARY-TOKEN');
    expect(output).not.toContain('CANARY-KEY');
    expect(output).not.toContain('CANARY-AUTH');
    expect(output).toContain('[redacted]');
  });

  test('suppresses messages below the configured level', () => {
    const sink = capture();
    const logger = createLogger(configWith('info'), { destination: sink.destination });

    logger.debug('below threshold');

    expect(sink.lines).toEqual([]);
  });

  test('serializes an Error passed as a cause with its message and chain', () => {
    const sink = capture();
    const logger = createLogger(configWith('info'), { destination: sink.destination });

    logger.error('failed', { cause: new Error('outer', { cause: new Error('inner') }) });

    expect(sink.lines.join('')).toContain('"message":"outer: inner"');
  });
});
