const REDACTED = '[redacted]';

export interface Secret<T> {
  reveal(): T;
  toString(): string;
  toJSON(): string;
}

export function makeSecret<T>(value: T): Secret<T> {
  return {
    reveal: () => value,
    toString: () => REDACTED,
    toJSON: () => REDACTED,
  };
}
