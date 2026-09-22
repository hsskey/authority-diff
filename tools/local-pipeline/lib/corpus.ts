import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { parseTranscript } from '@authority/trace/client';
import type { ParsedSession } from '@authority/trace/schema';

export interface ReadCorpus {
  readonly sessions: ParsedSession[];
  readonly readFailureFiles: number;
  readonly toolUseWithoutTimestamp: number;
}

// The parser folds a tool_use line without a parseable timestamp into
// unparsedLineCount, so measure re-scans the raw lines to count it directly.
// Kept in sync with parse.ts: UTC `Z` timestamps only.
const TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function scanToolUseWithoutTimestamp(lines: readonly string[]): number {
  let count = 0;
  for (const line of lines) {
    if (line.trim().length === 0) {
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (!isRecord(parsed) || !isRecord(parsed.message)) {
      continue;
    }
    const { message } = parsed;
    if (message.role !== 'assistant' || !Array.isArray(message.content)) {
      continue;
    }
    const hasToolUse = message.content.some(
      (block) => isRecord(block) && block.type === 'tool_use',
    );
    if (
      hasToolUse &&
      !(typeof parsed.timestamp === 'string' && TIMESTAMP_RE.test(parsed.timestamp))
    ) {
      count++;
    }
  }
  return count;
}

/**
 * Reads and parses transcript files, tolerating unreadable files by counting
 * them instead of failing, and reporting tool_use lines dropped for a missing
 * timestamp.
 */
export function readCorpus(files: readonly string[]): ReadCorpus {
  const sessions: ParsedSession[] = [];
  let readFailureFiles = 0;
  let toolUseWithoutTimestamp = 0;
  for (const file of files) {
    let content: string;
    try {
      content = readFileSync(file, 'utf8');
    } catch {
      readFailureFiles++;
      continue;
    }
    const lines = content.split('\n');
    sessions.push(parseTranscript({ sessionExternalId: basename(file, '.jsonl'), lines }));
    toolUseWithoutTimestamp += scanToolUseWithoutTimestamp(lines);
  }
  return { sessions, readFailureFiles, toolUseWithoutTimestamp };
}
