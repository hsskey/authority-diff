import type { AppError } from '@authority/kernel';

export function redactionMissing(kinds: readonly string[]): AppError {
  return {
    code: 'trace.redaction_missing',
    message: 'the import still contains secret material after re-redaction',
    isRetryable: false,
    details: { kinds: [...kinds] },
    cause: null,
  };
}

export function importRejected(cause: unknown): AppError {
  return {
    code: 'trace.import_rejected',
    message: 'the import could not be stored',
    isRetryable: false,
    details: null,
    cause,
  };
}
