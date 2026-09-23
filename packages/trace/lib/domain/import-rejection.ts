function isErrorRecord(value: unknown): value is { code?: unknown; cause?: unknown } {
  return typeof value === 'object' && value !== null;
}

function sqlStateCode(error: unknown): string | null {
  if (!isErrorRecord(error)) {
    return null;
  }
  if (typeof error.code === 'string' && error.code.length > 0) {
    return error.code;
  }
  return sqlStateCode(error.cause);
}

/** True when Postgres rejects jsonb or text content, including nested driver wrappers. */
export function isContentRejection(cause: unknown): boolean {
  const code = sqlStateCode(cause);
  return code !== null && code.startsWith('22');
}
