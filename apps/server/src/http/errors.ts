import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { AppError } from '@authority/kernel';
import type { AppEnv } from './env.ts';

const STATUS_BY_CODE: Record<string, ContentfulStatusCode> = {
  'auth.token_missing': 401,
  'auth.token_invalid': 401,
  'auth.role_forbidden': 403,
  'validation.invalid_request': 422,
  'platform.database_unavailable': 503,
  'internal.unexpected': 500,
};

export function httpStatusForError(error: AppError): ContentfulStatusCode {
  // Unknown codes fall back to 500 so an unmapped failure is never a success.
  return STATUS_BY_CODE[error.code] ?? 500;
}

export function toErrorEnvelope(error: AppError, requestId: string) {
  return {
    error: {
      code: error.code,
      message: error.message,
      isRetryable: error.isRetryable,
      details: error.details,
      requestId,
    },
  };
}

export function respondError(c: Context<AppEnv>, error: AppError): Response {
  const requestId = c.get('requestId');
  return c.json(toErrorEnvelope(error, requestId), httpStatusForError(error), {
    'X-Request-Id': requestId,
  });
}

export function authTokenMissing(): AppError {
  return {
    code: 'auth.token_missing',
    message: 'a bearer token is required',
    isRetryable: false,
    details: null,
    cause: null,
  };
}

export function authTokenInvalid(): AppError {
  return {
    code: 'auth.token_invalid',
    message: 'the bearer token is invalid',
    isRetryable: false,
    details: null,
    cause: null,
  };
}

export function internalUnexpected(cause: unknown): AppError {
  return {
    code: 'internal.unexpected',
    message: 'an unexpected error occurred',
    isRetryable: false,
    details: null,
    cause,
  };
}
