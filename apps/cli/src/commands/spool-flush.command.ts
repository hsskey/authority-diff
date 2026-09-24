import { readFileSync, readdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { RuntimeObservationInputSchema } from '@authority/contracts/schema';
import type {
  CreateRuntimeObservationsRequest,
  RuntimeObservationInput,
} from '@authority/contracts/schema';
import { authToken, serverBaseUrl, spoolDirectory } from '../config.ts';
import { writeStderr, writeStdout } from '../output.ts';

const BATCH_LIMIT = 500;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function toObservation(line: string): RuntimeObservationInput | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) {
    return null;
  }
  const observation = RuntimeObservationInputSchema.safeParse({
    event: parsed.event,
    sessionExternalId: readString(parsed, 'sessionId'),
    toolUseId: readString(parsed, 'toolUseId'),
    toolName: readString(parsed, 'toolName'),
    toolInputHash: readString(parsed, 'toolInputHash'),
    hookDecision: readString(parsed, 'hookDecision'),
    permissionMode: readString(parsed, 'permissionMode'),
    cwd: readString(parsed, 'cwd'),
    runtimeVersion: readString(parsed, 'runtimeVersion'),
    occurredAt: parsed.timestamp,
  });
  return observation.success ? observation.data : null;
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

async function postObservations(
  base: string,
  token: string,
  observations: readonly RuntimeObservationInput[],
): Promise<boolean> {
  for (const batch of chunk(observations, BATCH_LIMIT)) {
    const request: CreateRuntimeObservationsRequest = {
      runtime: 'claude_code',
      observations: batch,
    };
    const response = await fetch(`${base}/api/v1/runtime-observations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(request),
    });
    if (!response.ok) {
      writeStderr(`runtime-observations POST failed: HTTP ${response.status}`);
      return false;
    }
  }
  return true;
}

/**
 * Sends every spool file to the server and renames each sent file to `.sent`.
 * A file that fails to send keeps its name so a later flush retries it.
 * `from` reads a spool copied from another machine instead of the local spool.
 */
export async function runSpoolFlush(options?: { readonly from?: string }): Promise<void> {
  const token = authToken();
  if (token === null) {
    writeStderr('AUTHORITY_CLI_TOKEN is not set');
    process.exitCode = 1;
    return;
  }

  const directory = options?.from ?? spoolDirectory();
  let names: string[];
  try {
    names = readdirSync(directory).filter((name) => name.endsWith('.jsonl'));
  } catch {
    if (options?.from !== undefined) {
      writeStderr(`cannot read spool directory: ${directory}`);
      process.exitCode = 1;
      return;
    }
    writeStdout(JSON.stringify({ sentFiles: 0, failedFiles: 0 }, null, 2));
    return;
  }

  const base = serverBaseUrl();
  let sentFiles = 0;
  let failedFiles = 0;

  for (const name of names.sort()) {
    const path = join(directory, name);
    try {
      const observations = readFileSync(path, 'utf8')
        .split('\n')
        .filter((line) => line.trim().length > 0)
        .map(toObservation)
        .filter((observation): observation is RuntimeObservationInput => observation !== null);

      if (observations.length === 0 || (await postObservations(base, token, observations))) {
        renameSync(path, `${path}.sent`);
        sentFiles++;
      } else {
        failedFiles++;
      }
    } catch {
      failedFiles++;
    }
  }

  writeStdout(JSON.stringify({ sentFiles, failedFiles }, null, 2));
  if (failedFiles > 0) {
    process.exitCode = 1;
  }
}
