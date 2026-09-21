import { createHash } from 'node:crypto';
import { invariant } from './domain/errors.ts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function serialize(value: unknown): string {
  invariant(value !== undefined, 'canonicalJson does not accept undefined');
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(serialize).join(',')}]`;
  }
  if (isRecord(value)) {
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
