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

export const TargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('path'), path: z.string(), isInsideWorkspace: z.boolean() }),
  z.object({ kind: z.literal('host'), host: z.string(), scheme: z.string().nullable() }),
  z.object({
    kind: z.literal('vcs_remote'),
    remoteName: z.string().nullable(),
    remoteUrl: z.string().nullable(),
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
  toolInputRedacted: z.string().max(16000),
  isInputTruncated: z.boolean(),
  workspaceRoot: z.string().nullable(),
  gitBranch: z.string().nullable(),
  repoRemotes: z.record(z.string(), z.string()).nullable(),
});
export type ToolCall = z.infer<typeof ToolCallSchema>;

/**
 * Classifies one ToolCall without failing.
 *
 * Unrecognized input produces an `execute` Operation with `analyzability:
 * 'none'`; it is never classified as `read`.
 */
export type ClassifyToolCall = (call: ToolCall) => readonly Operation[];
