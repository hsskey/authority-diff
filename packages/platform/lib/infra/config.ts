import { z } from 'zod';
import { err, ok } from '@authority/kernel';
import type { AppError, Result } from '@authority/kernel';
import { makeSecret } from '../domain/secret.ts';
import type { Secret } from '../domain/secret.ts';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Config {
  readonly server: { readonly port: number };
  readonly db: { readonly url: Secret<string>; readonly poolMax: number };
  readonly auth: { readonly token: Secret<string> };
  readonly log: { readonly level: LogLevel };
}

const EnvSchema = z.object({
  AUTHORITY_SERVER_PORT: z.coerce.number().int().positive().max(65535).default(8787),
  AUTHORITY_DB_URL: z.string().min(1),
  AUTHORITY_DB_POOL_MAX: z.coerce.number().int().positive().default(10),
  AUTHORITY_AUTH_TOKEN: z.string().min(1),
  AUTHORITY_LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export function parseConfig(env: Record<string, string | undefined>): Result<Config, AppError> {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const variables = [
      ...new Set(
        parsed.error.issues
          .map((issue) => issue.path[0])
          .filter((segment): segment is string => typeof segment === 'string'),
      ),
    ].sort();
    return err({
      code: 'platform.config_invalid',
      message: `invalid configuration for: ${variables.join(', ')}`,
      isRetryable: false,
      details: { variables },
      cause: null,
    });
  }
  const data = parsed.data;
  return ok({
    server: { port: data.AUTHORITY_SERVER_PORT },
    db: { url: makeSecret(data.AUTHORITY_DB_URL), poolMax: data.AUTHORITY_DB_POOL_MAX },
    auth: { token: makeSecret(data.AUTHORITY_AUTH_TOKEN) },
    log: { level: data.AUTHORITY_LOG_LEVEL },
  });
}

export function loadConfig(): Config {
  const result = parseConfig(process.env);
  if (!result.ok) {
    process.stderr.write(`${result.error.message}\n`);
    process.exit(1);
  }
  return result.value;
}
