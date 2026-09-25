import type { IsoTimestamp } from '@authority/kernel';
import type { ObservationGap } from '../../schema.ts';

const GAP_MIN_MS = 24 * 60 * 60 * 1000;

/** Days from 1970-01-01 to a proleptic Gregorian date (Hinnant's days_from_civil). */
function daysFromCivil(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yearOfEra = y - era * 400;
  const dayOfYear = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const dayOfEra =
    yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146_097 + dayOfEra - 719_468;
}

/**
 * lib/domain may not use Date, and an IsoTimestamp has one fixed layout, so
 * the epoch offset is read from its fields.
 */
function epochMsOf(at: IsoTimestamp): number {
  const field = (start: number, end: number) => Number(at.slice(start, end));
  const days = daysFromCivil(field(0, 4), field(5, 7), field(8, 10));
  const minutes = (days * 24 + field(11, 13)) * 60 + field(14, 16);
  return minutes * 60_000 + field(17, 19) * 1000 + field(20, 23);
}

/**
 * The periods of 24 hours or more in the window with no observation.
 * `times` are the observation times inside the window, ascending; the window
 * start and end bound the first and last period.
 */
export function findObservationGaps(
  times: readonly IsoTimestamp[],
  window: { readonly from: IsoTimestamp; readonly to: IsoTimestamp },
): ObservationGap[] {
  const gaps: ObservationGap[] = [];
  let from = window.from;
  for (const to of [...times, window.to]) {
    if (epochMsOf(to) - epochMsOf(from) >= GAP_MIN_MS) {
      gaps.push({ from, to });
    }
    from = to;
  }
  return gaps;
}
