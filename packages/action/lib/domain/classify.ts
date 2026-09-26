/**
 * Top-level ToolCall routing.
 *
 * Bash input is parsed and delegated to the Bash classifier; an `mcp__*` name
 * becomes an `mcp` execute Operation; a control tool yields zero Operations; a
 * tool-table entry maps to its capability or to zero Operations; anything else
 * is opaque execution (never a false `read`). A truncated input always adds a
 * `none` Operation in addition to whatever was analyzed.
 */
import type { Analyzability, Capability, Operation, Target, ToolCall } from '#schema';
import type { BashParser } from '../shell/parser.ts';
import { classifyBash } from './bash.ts';
import { isControlTool } from './control-tools.ts';
import { draft, finalize, type OperationDraft } from './draft.ts';
import { hostTarget, pathTarget, resolvePath, unknownTarget } from './targets.ts';

const MCP_NAME = /^mcp__([^_]+(?:_[^_]+)*)__(.+)$/;

/**
 * Non-Bash tools with a documented capability (docs/design.md 13.2), or with a
 * recorded input shape that reaches no file, network, or process and so yields
 * zero Operations (docs/evidence/control-tools.md).
 */
type ToolMapping =
  | {
      readonly capability: Capability;
      readonly kind: 'path' | 'host' | 'none';
      readonly fields: readonly string[];
    }
  | { readonly kind: 'no_operation' };
const TOOL_TABLE: ReadonlyMap<string, ToolMapping> = new Map<string, ToolMapping>([
  ['Read', { capability: 'read', kind: 'path', fields: ['file_path', 'notebook_path'] }],
  ['NotebookRead', { capability: 'read', kind: 'path', fields: ['notebook_path'] }],
  ['Write', { capability: 'write', kind: 'path', fields: ['file_path'] }],
  ['Edit', { capability: 'write', kind: 'path', fields: ['file_path'] }],
  ['MultiEdit', { capability: 'write', kind: 'path', fields: ['file_path'] }],
  ['NotebookEdit', { capability: 'write', kind: 'path', fields: ['notebook_path'] }],
  ['Glob', { capability: 'read', kind: 'path', fields: ['path'] }],
  ['Grep', { capability: 'read', kind: 'path', fields: ['path'] }],
  ['LS', { capability: 'read', kind: 'path', fields: ['path'] }],
  ['WebFetch', { capability: 'fetch', kind: 'host', fields: ['url'] }],
  ['WebSearch', { capability: 'fetch', kind: 'none', fields: [] }],
  ['StructuredOutput', { kind: 'no_operation' }],
]);

export function classifyToolCall(call: ToolCall, parser: BashParser): readonly Operation[] {
  const drafts = analyze(call, parser);
  if (call.isInputTruncated) {
    drafts.push(
      draft('execute', unknownTarget(), 'none', null, call.toolInputRedacted, ['input_truncated']),
    );
  }
  return finalize(drafts);
}

function analyze(call: ToolCall, parser: BashParser): OperationDraft[] {
  const name = call.toolName;

  if (name === 'Bash') return bashDrafts(call, parser);
  if (isControlTool(name)) return [];

  const mcp = name.match(MCP_NAME);
  const server = mcp?.[1];
  const tool = mcp?.[2];
  if (server !== undefined && tool !== undefined) {
    const target: Target = { kind: 'mcp', server, tool };
    return [draft('execute', target, 'partial', name, call.toolInputRedacted)];
  }

  const mapping = TOOL_TABLE.get(name);
  if (mapping?.kind === 'no_operation') return [];
  if (mapping !== undefined) return [toolDraft(call, name, mapping)];

  // Unknown tool: exactly one opaque Operation, never a false read.
  return [
    draft('execute', unknownTarget(), 'none', name, call.toolInputRedacted, ['tool_unrecognized']),
  ];
}

function bashDrafts(call: ToolCall, parser: BashParser): OperationDraft[] {
  const parse = parser.parse(call.toolInputRedacted);
  const drafts = classifyBash(parse, call);
  if (parse.hasError) {
    drafts.push(
      draft('execute', unknownTarget(), 'none', null, call.toolInputRedacted, ['parse_error']),
    );
  }
  if (drafts.length === 0) {
    // Bash is not a control tool: guarantee at least one Operation.
    drafts.push(
      draft('execute', unknownTarget(), 'none', null, call.toolInputRedacted, ['empty_command']),
    );
  }
  return drafts;
}

function toolDraft(
  call: ToolCall,
  name: string,
  mapping: Exclude<ToolMapping, { kind: 'no_operation' }>,
): OperationDraft {
  const input = parseJson(call.toolInputRedacted);
  if (input === null) {
    return draft('execute', unknownTarget(), 'none', name, call.toolInputRedacted, [
      'input_unparsed',
    ]);
  }

  const raw = firstField(input, mapping.fields);
  if (mapping.kind === 'none' || raw === null) {
    return draft(mapping.capability, unknownTarget(), 'partial', name, call.toolInputRedacted);
  }
  if (isElided(raw)) {
    return draft(mapping.capability, unknownTarget(), 'partial', name, call.toolInputRedacted, [
      'input_elided',
    ]);
  }
  if (mapping.kind === 'host') {
    const target = hostTarget(raw);
    const analyzability: Analyzability = target === null ? 'partial' : 'full';
    return draft(
      mapping.capability,
      target ?? unknownTarget(),
      analyzability,
      name,
      call.toolInputRedacted,
    );
  }
  const resolved = resolvePath(raw, call.workspaceRoot, call.workspaceRoot);
  return draft(mapping.capability, pathTarget(resolved), 'full', name, call.toolInputRedacted);
}

function parseJson(text: string): Readonly<Record<string, unknown>> | null {
  try {
    const value: unknown = JSON.parse(text);
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function firstField(
  input: Readonly<Record<string, unknown>> | null,
  fields: readonly string[],
): string | null {
  if (input === null) return null;
  for (const field of fields) {
    const value = input[field];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return null;
}

function isElided(value: string): boolean {
  return /^__ELIDED_\d+__$/.test(value);
}
