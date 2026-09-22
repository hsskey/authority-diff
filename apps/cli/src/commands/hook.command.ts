import { readFileSync } from 'node:fs';
import { canonicalJson, sha256Hex } from '@authority/kernel/hash';
import { HOOK_EXIT_BUDGET_MS, runtimeVersion } from '../config.ts';
import { appendSpoolRecord } from '../spool/append.ts';
import type { HookEvent, SpoolRecord } from '../spool/types.ts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  if (typeof value !== 'string' || value.length === 0) {
    return null;
  }
  return value;
}

function hashToolInput(toolInput: unknown): string | null {
  if (toolInput === undefined || toolInput === null) {
    return null;
  }
  return sha256Hex(canonicalJson(toolInput));
}

function buildRecord(
  event: HookEvent,
  input: Record<string, unknown>,
  now: Date,
): SpoolRecord | null {
  const sessionId = readString(input, 'session_id');
  const cwd = readString(input, 'cwd');
  const toolUseId = readString(input, 'tool_use_id');
  if (sessionId === null || cwd === null) {
    return null;
  }

  if (event === 'permission_request') {
    const toolName = readString(input, 'tool_name');
    const toolInputHash = hashToolInput(input.tool_input);
    if (toolName === null || toolInputHash === null) {
      return null;
    }
    return {
      event,
      timestamp: now.toISOString(),
      sessionId,
      toolName,
      toolInputHash,
      toolUseId,
      cwd,
      runtimeVersion: runtimeVersion(),
    };
  }

  return {
    event,
    timestamp: now.toISOString(),
    sessionId,
    toolName: null,
    toolInputHash: null,
    toolUseId,
    cwd,
    runtimeVersion: runtimeVersion(),
  };
}

function readStdin(): string {
  return readFileSync(0, 'utf8');
}

// Fail-open core: read stdin, parse, append one spool record. Never throws, never exits.
// Split out from runHook so I9 (exit 0 on malformed/closed/empty stdin) is testable in-process.
export function spoolFromStdin(event: HookEvent, readInput: () => string = readStdin): void {
  try {
    const raw = readInput();
    if (raw.trim().length === 0) {
      return;
    }

    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) {
      return;
    }

    const record = buildRecord(event, parsed, new Date());
    if (record === null) {
      return;
    }

    appendSpoolRecord(record, new Date(record.timestamp));
  } catch {
    // fail-open: no stdout
  }
}

export function runHook(event: HookEvent, readInput: () => string = readStdin): void {
  const exitTimer = setTimeout(() => {
    process.exit(0);
  }, HOOK_EXIT_BUDGET_MS);

  spoolFromStdin(event, readInput);

  clearTimeout(exitTimer);
  process.exit(0);
}
