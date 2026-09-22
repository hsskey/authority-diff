import { randomInt } from 'node:crypto';
import type { IdGenerator } from '@authority/kernel';

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const ENCODING_LEN = 32;
const TIME_LEN = 10;
const RANDOM_LEN = 16;

function encodeTime(now: number): string {
  let remaining = now;
  let out = '';
  for (let i = 0; i < TIME_LEN; i++) {
    const mod = remaining % ENCODING_LEN;
    out = CROCKFORD.charAt(mod) + out;
    remaining = (remaining - mod) / ENCODING_LEN;
  }
  return out;
}

function encodeRandom(): string {
  let out = '';
  for (let i = 0; i < RANDOM_LEN; i++) {
    // randomInt is unbiased over 0..31; a raw byte % 32 would skew the distribution.
    out += CROCKFORD.charAt(randomInt(0, ENCODING_LEN));
  }
  return out;
}

export function createUlidGenerator(): IdGenerator {
  return {
    next(prefix: string): string {
      return `${prefix}_${encodeTime(Date.now())}${encodeRandom()}`;
    },
  };
}
