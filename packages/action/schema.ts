import { z } from 'zod';

export const RuntimeSchema = z.enum(['claude_code']);
export type Runtime = z.infer<typeof RuntimeSchema>;

export const CapabilitySchema = z.enum([
  'read',
  'write',
  'delete',
  'execute',
  'install',
  'fetch',
  'send',
  'commit',
  'push',
  'rewrite',
  'deploy',
]);
export type Capability = z.infer<typeof CapabilitySchema>;

export const AnalyzabilitySchema = z.enum(['full', 'partial', 'none']);
export type Analyzability = z.infer<typeof AnalyzabilitySchema>;

const RemoteKeySchema = z.string().refine((value) => {
  const parts = value.split('/');
  const host = parts[0];
  const repo = parts[2];
  return (
    parts.length === 3 &&
    parts.every((part) => part.length > 0) &&
    value === value.toLowerCase() &&
    host !== undefined &&
    !host.includes(':') &&
    !host.includes('@') &&
    repo !== undefined &&
    !repo.endsWith('.git')
  );
}, 'must be a lowercase host/owner/repo Remote Key without scheme, user, port, or .git');

/**
 * Targets contain classifier-normalized values.
 *
 * A path is absolute; a home prefix is represented by `~`. The classifier
 * resolves relative paths against ToolCall.workspaceRoot. A host is lowercase
 * with its port removed.
 *
 * A VCS Remote Key is lowercase `host/owner/repo` with scheme, user, port, and
 * a trailing `.git` removed. SSH and HTTPS forms of the same remote produce
 * the same key. The classifier normalizes a URL from the command when present,
 * otherwise it looks up remoteName in ToolCall.repoRemotes. An unparseable
 * remote has a null remoteKey.
 */
export const TargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('path'), path: z.string(), isInsideWorkspace: z.boolean() }),
  z.object({ kind: z.literal('host'), host: z.string(), scheme: z.string().nullable() }),
  z.object({
    kind: z.literal('vcs_remote'),
    remoteName: z.string().nullable(),
    remoteKey: RemoteKeySchema.nullable(),
    branch: z.string().nullable(),
  }),
  z.object({
    kind: z.literal('package'),
    ecosystem: z.enum(['npm', 'pypi', 'cargo', 'go', 'system', 'other']),
    source: z.string().nullable(),
  }),
  z.object({ kind: z.literal('mcp'), server: z.string(), tool: z.string() }),
  z.object({ kind: z.literal('deploy_target'), label: z.string().nullable() }),
  z.object({ kind: z.literal('unknown') }),
]);
export type Target = z.infer<typeof TargetSchema>;

export const OperationSchema = z.object({
  index: z.number().int().nonnegative(),
  capability: CapabilitySchema,
  target: TargetSchema,
  analyzability: AnalyzabilitySchema,
  program: z.string().nullable(),
  fragment: z.string().max(2000),
  signals: z.array(z.string()),
});
export type Operation = z.infer<typeof OperationSchema>;

export const ToolCallSchema = z.object({
  toolUseId: z.string().nullable(),
  toolName: z.string(),
  /**
   * Redacted tool input in a per-tool format.
   *
   * When toolName is `Bash`, this is `input.command` verbatim with redaction
   * applied: a secret value is replaced by a `__REDACTED_<KIND>__` token.
   *
   * For every other tool, this is the canonical JSON string of the input
   * object; a string value longer than 500 characters is replaced by
   * `__ELIDED_<length>__`. Input that does not parse as JSON is classified
   * conservatively as `execute`, target `unknown`, analyzability `none`.
   */
  toolInputRedacted: z.string().max(16000),
  isInputTruncated: z.boolean(),
  workspaceRoot: z.string().nullable(),
  gitBranch: z.string().nullable(),
  /**
   * Raw remote name-to-URL values supplied before classification by an
   * I/O-capable caller, such as the local pipeline or CLI. The caller queries
   * each workspaceRoot; values approximate import time and may differ from the
   * historical Session. URLs remain unnormalized for the classifier.
   */
  repoRemotes: z.record(z.string(), z.string()).nullable(),
});
export type ToolCall = z.infer<typeof ToolCallSchema>;

/**
 * Classifies one ToolCall without failing.
 *
 * Zero Operations may be returned only for a tool name in the future exported
 * `CONTROL_TOOL_NAMES` list. Membership requires official documentation that
 * the tool changes no external state and controls only Agent progress; an
 * observed tool name is not sufficient evidence.
 *
 * A tool name with neither an explicit mapping nor list membership returns
 * exactly one Operation with capability `execute`, target `{ kind:
 * 'unknown' }`, and analyzability `none`. It is never classified as `read`.
 *
 * A name matching `mcp__<server>__<tool>` returns an `execute` Operation with
 * target `{ kind: 'mcp', server, tool }` parsed from the name and
 * analyzability `partial`.
 *
 * When isInputTruncated is true, classification adds an Operation with
 * capability `execute`, target `{ kind: 'unknown' }`, analyzability `none`,
 * and signal `input_truncated` in addition to all analyzed Operations.
 *
 * An Operation fragment longer than 2,000 characters is truncated to 2,000
 * and receives signal `fragment_truncated`. Only the display fragment is
 * truncated; classification uses the complete input.
 */
export type ClassifyToolCall = (call: ToolCall) => readonly Operation[];
