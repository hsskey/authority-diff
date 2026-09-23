export type HookEvent = 'permission_request' | 'pre_tool_use' | 'session_end';

export interface SpoolRecord {
  readonly event: HookEvent;
  readonly timestamp: string;
  readonly sessionId: string;
  readonly toolName: string | null;
  readonly toolInputHash: string | null;
  readonly toolUseId: string | null;
  readonly hookDecision: 'allow' | 'deny' | null;
  readonly permissionMode: string | null;
  readonly cwd: string;
  readonly runtimeVersion: string | null;
}
