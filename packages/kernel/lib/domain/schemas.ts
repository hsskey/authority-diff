import { z } from 'zod';

export type Effect = 'allow' | 'ask' | 'deny';

export const EffectSchema = z.enum(['allow', 'ask', 'deny']);

export const IsoTimestampSchema = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    'must be a UTC ISO 8601 timestamp with exactly three millisecond digits ending in Z',
  )
  .brand('IsoTimestamp');

export type IsoTimestamp = z.infer<typeof IsoTimestampSchema>;

export const Sha256Schema = z
  .string()
  .regex(/^[0-9a-f]{64}$/, 'must be a lowercase 64-char hex sha256');

const CROCKFORD_CHAR = '[0-9A-HJKMNP-TV-Z]';

export function prefixedId<const P extends string, const B extends string>(
  prefix: P,
  brand: B,
): z.core.$ZodBranded<z.ZodString, B> & { readonly __prefix?: P };
export function prefixedId(prefix: string, brand: string) {
  const pattern = new RegExp(`^${prefix}_${CROCKFORD_CHAR}{26}$`);
  return z
    .string()
    .regex(pattern, `must be "${prefix}_" followed by 26 Crockford base32 characters`)
    .brand(brand);
}
