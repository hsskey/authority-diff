export type HookEvent = 'permission_request' | 'session_end';

export interface SpoolRecord {
  readonly event: HookEvent;
  readonly timestamp: string;
  readonly sessionId: string;
  readonly toolName: string | null;
  readonly toolInputHash: string | null;
  readonly cwd: string;
  readonly runtimeVersion: string | null;
}
