import { createHash } from 'node:crypto';
import { invariant } from './domain/errors.ts';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Reflect.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function serialize(value: unknown): string {
  invariant(value !== undefined, 'canonicalJson does not accept undefined');
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    invariant(Number.isFinite(value), 'canonicalJson does not accept non-finite numbers');
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(serialize).join(',')}]`;
  }
  if (isPlainObject(value)) {
    const parts = Object.keys(value)
      .sort()
      .map((key) => {
        const child = value[key];
        invariant(child !== undefined, `canonicalJson does not accept undefined (key: ${key})`);
        return `${JSON.stringify(key)}:${serialize(child)}`;
      });
    return `{${parts.join(',')}}`;
  }
  invariant(false, `canonicalJson cannot serialize a ${typeof value}`);
}

export function canonicalJson(value: unknown): string {
  return serialize(value);
}

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}
