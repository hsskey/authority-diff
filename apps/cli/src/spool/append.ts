import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { spoolDirectory } from '../config.ts';
import type { SpoolRecord } from './types.ts';

function spoolFileName(now: Date): string {
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}.jsonl`;
}

export function appendSpoolRecord(record: SpoolRecord, now: Date): void {
  const directory = spoolDirectory();
  mkdirSync(directory, { recursive: true });
  const filePath = join(directory, spoolFileName(now));
  appendFileSync(filePath, `${JSON.stringify(record)}\n`, 'utf8');
}
