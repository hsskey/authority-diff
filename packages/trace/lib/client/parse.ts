import { canonicalJson } from '@authority/kernel/hash';
import { ParsedSessionSchema, type ObservedOutcome, type ParseTranscript } from '../../schema.ts';
import { redactStructuredInput, redactText } from './redact.ts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function homeToTilde(path: string): string {
  return path.replace(/^\/(?:Users|home)\/[^/]+/, '~').replace(/^\/root(?=\/|$)/, '~');
}

const TIMESTAMP_RE = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?Z$/;

// Only UTC `Z` timestamps are recognized, normalized to exactly three
// millisecond digits. No other precision or offset form was observed; an
// offset form would require date arithmetic and is left unparseable.
function normalizeTimestamp(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const match = TIMESTAMP_RE.exec(value);
  const base = match?.[1];
  if (base === undefined) {
    return null;
  }
  const milliseconds = `${match?.[2] ?? ''}000`.slice(0, 3);
  return `${base}.${milliseconds}Z`;
}

function blockText(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const block of content) {
      if (isRecord(block) && typeof block.text === 'string') {
        parts.push(block.text);
      } else if (typeof block === 'string') {
        parts.push(block);
      }
    }
    return parts.join('\n');
  }
  return '';
}

function elideLongStrings(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.length > 500 ? `__ELIDED_${String(value.length)}__` : value;
  }
  if (Array.isArray(value)) {
    return value.map(elideLongStrings);
  }
  if (isRecord(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      out[key] = elideLongStrings(child);
    }
    return out;
  }
  return value;
}

interface RedactionCount {
  readonly kind: string;
  readonly count: number;
}

interface BuiltInput {
  readonly toolInputRedacted: string;
  readonly isInputTruncated: boolean;
  readonly redactions: readonly RedactionCount[];
}

const MAX_INPUT_LENGTH = 16000;

// Bash keeps its command string verbatim (then redacted). Every other tool is
// canonicalized after string values longer than 500 characters are elided; the
// elision marker is not truncation. Only a final string over 16,000 characters
// is cut, and only that cut sets isInputTruncated.
function buildToolInput(toolName: string, input: unknown): BuiltInput {
  let text: string;
  let redactions: readonly RedactionCount[];
  if (toolName === 'Bash' && isRecord(input) && typeof input.command === 'string') {
    const redacted = redactText(input.command);
    text = redacted.text;
    redactions = redacted.redactions;
  } else {
    const masked = redactStructuredInput(input === undefined ? null : input);
    text = canonicalJson(elideLongStrings(masked.value));
    redactions = masked.redactions;
  }
  const isInputTruncated = text.length > MAX_INPUT_LENGTH;
  const toolInputRedacted = isInputTruncated ? text.slice(0, MAX_INPUT_LENGTH) : text;
  return { toolInputRedacted, isInputTruncated, redactions };
}

const REFUSAL_MARKER =
  "The user doesn't want to proceed with this tool use. The tool use was rejected";
const BLOCK_MARKERS: readonly string[] = [
  '<tool_use_error>Blocked:',
  'Dangerous rm operation detected',
];
const PRETOOLUSE_BLOCK_RE = /PreToolUse:\S+ hook error:/;

function isBlocked(text: string): boolean {
  if (BLOCK_MARKERS.some((marker) => text.includes(marker))) {
    return true;
  }
  return PRETOOLUSE_BLOCK_RE.test(text);
}

interface ToolResultInfo {
  readonly text: string;
}

function deriveOutcome(
  toolUseId: string | null,
  results: Map<string, ToolResultInfo>,
): ObservedOutcome {
  if (toolUseId === null) {
    return 'unknown';
  }
  const result = results.get(toolUseId);
  if (result === undefined) {
    return 'unknown';
  }
  if (result.text.includes(REFUSAL_MARKER)) {
    return 'rejected_by_human';
  }
  if (isBlocked(result.text)) {
    return 'blocked_by_runtime';
  }
  return 'executed';
}

interface RawToolUse {
  readonly block: Record<string, unknown>;
  readonly occurredAt: string;
  readonly workspaceRoot: string | null;
  readonly gitBranch: string | null;
  readonly isSidechain: boolean;
}

/**
 * Parses in-memory transcript lines. Unparseable lines (invalid JSON, or a
 * tool_use line without a parseable timestamp) increment unparsedLineCount
 * instead of failing. Blank lines are ignored entirely.
 */
export const parseTranscript: ParseTranscript = ({ sessionExternalId, lines }) => {
  let totalLineCount = 0;
  let unparsedLineCount = 0;
  let runtimeVersion: string | null = null;
  let workspaceRoot: string | null = null;
  let gitBranch: string | null = null;

  const rawToolUses: RawToolUse[] = [];
  const results = new Map<string, ToolResultInfo>();
  const timestamps: string[] = [];

  for (const line of lines) {
    if (line.trim().length === 0) {
      continue;
    }
    totalLineCount++;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      unparsedLineCount++;
      continue;
    }
    if (!isRecord(parsed)) {
      continue;
    }

    runtimeVersion ??= nonEmptyString(parsed.version);
    const lineWorkspaceRaw = nonEmptyString(parsed.cwd);
    const lineWorkspace = lineWorkspaceRaw === null ? null : homeToTilde(lineWorkspaceRaw);
    const lineBranch = nonEmptyString(parsed.gitBranch);
    workspaceRoot ??= lineWorkspace;
    gitBranch ??= lineBranch;

    const lineTimestamp = normalizeTimestamp(parsed.timestamp);
    if (lineTimestamp !== null) {
      timestamps.push(lineTimestamp);
    }

    const message = parsed.message;
    if (!isRecord(message) || !Array.isArray(message.content)) {
      continue;
    }
    const role = message.role;
    const isSidechain = parsed.isSidechain === true;

    const lineToolUses: Record<string, unknown>[] = [];
    for (const block of message.content) {
      if (!isRecord(block)) {
        continue;
      }
      if (block.type === 'tool_use' && role === 'assistant') {
        lineToolUses.push(block);
      } else if (block.type === 'tool_result' && role === 'user') {
        const id = block.tool_use_id;
        if (typeof id === 'string') {
          results.set(id, { text: blockText(block.content) });
        }
      }
    }

    if (lineToolUses.length === 0) {
      continue;
    }
    if (lineTimestamp === null) {
      unparsedLineCount++;
      continue;
    }
    for (const block of lineToolUses) {
      rawToolUses.push({
        block,
        occurredAt: lineTimestamp,
        workspaceRoot: lineWorkspace,
        gitBranch: lineBranch,
        isSidechain,
      });
    }
  }

  const redactionTotals = new Map<string, number>();
  const toolCalls = rawToolUses.map((raw, sequence) => {
    const toolUseId = typeof raw.block.id === 'string' ? raw.block.id : null;
    const toolName = typeof raw.block.name === 'string' ? raw.block.name : '';
    const built = buildToolInput(toolName, raw.block.input);
    for (const redaction of built.redactions) {
      redactionTotals.set(
        redaction.kind,
        (redactionTotals.get(redaction.kind) ?? 0) + redaction.count,
      );
    }
    return {
      toolUseId,
      toolName,
      toolInputRedacted: built.toolInputRedacted,
      isInputTruncated: built.isInputTruncated,
      workspaceRoot: raw.workspaceRoot,
      gitBranch: raw.gitBranch,
      repoRemotes: null,
      sequence,
      isSidechain: raw.isSidechain,
      observedOutcome: deriveOutcome(toolUseId, results),
      occurredAt: raw.occurredAt,
    };
  });

  const redactions = [...redactionTotals.entries()]
    .map(([kind, count]) => ({ kind, count }))
    .sort((a, b) => (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0));

  const sorted = [...timestamps].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const startedAt = sorted[0] ?? null;
  const endedAt = sorted.length === 0 ? null : (sorted[sorted.length - 1] ?? null);

  return ParsedSessionSchema.parse({
    runtime: 'claude_code',
    runtimeVersion,
    sessionExternalId,
    workspaceRoot,
    gitBranch,
    startedAt,
    endedAt,
    toolCalls,
    totalLineCount,
    unparsedLineCount,
    redactions,
  });
};
