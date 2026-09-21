export interface AppError {
  readonly code: string;
  readonly message: string;
  readonly isRetryable: boolean;
  readonly details: Record<string, unknown> | null;
  readonly cause: unknown;
}

export function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`invariant failed: ${message}`);
  }
}

export function assertNever(value: never): never {
  throw new Error(`assertNever reached with: ${String(value)}`);
}
