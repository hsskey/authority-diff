import { IsoTimestampSchema } from '@authority/kernel';
import type { Clock, IsoTimestamp } from '@authority/kernel';

export function createSystemClock(): Clock {
  return {
    now(): IsoTimestamp {
      return IsoTimestampSchema.parse(new Date().toISOString());
    },
  };
}
