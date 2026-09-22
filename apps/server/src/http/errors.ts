import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { AppError } from '@authority/kernel';
import type { AppEnv } from './env.ts';

const STATUS_BY_CODE: Record<string, ContentfulStatusCode> = {
  'auth.token_missing': 401,
  'auth.token_invalid': 401,
  'auth.role_forbidden': 403,
  'validation.invalid_request': 422,
  'trace.redaction_missing': 422,
  'trace.batch_too_large': 413,
  'trace.action_not_found': 404,
  'policy.version_not_found': 404,
  'policy.name_conflict': 409,
  'policy.draft_exists': 409,
  'policy.version_not_draft': 409,
  'policy.in_review_exists': 409,
  'policy.transition_not_allowed': 409,
  'policy.content_conflict': 412,
  'policy.precondition_required': 428,
  'policy.document_invalid': 422,
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

export function validationInvalidRequest(details: Record<string, unknown> | null): AppError {
  return {
    code: 'validation.invalid_request',
    message: 'the request body is invalid',
    isRetryable: false,
    details,
    cause: null,
  };
}

export function traceBatchTooLarge(): AppError {
  return {
    code: 'trace.batch_too_large',
    message: 'the import exceeds the maximum tool call count',
    isRetryable: false,
    details: null,
    cause: null,
  };
}

export function traceActionNotFound(): AppError {
  return {
    code: 'trace.action_not_found',
    message: 'no Action exists for the given action key',
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
