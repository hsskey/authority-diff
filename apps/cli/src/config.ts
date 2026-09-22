import { homedir } from 'node:os';
import { join } from 'node:path';

export const HOOK_EXIT_BUDGET_MS = 400;

export const PERMISSION_REQUEST_HOOK_COMMAND = 'authority hook permission-request';
export const SESSION_END_HOOK_COMMAND = 'authority hook session-end';

export function resolveHome(): string {
  const fromEnv = process.env.HOME;
  if (typeof fromEnv === 'string' && fromEnv.length > 0) {
    return fromEnv;
  }
  return homedir();
}

export function spoolDirectory(): string {
  return join(resolveHome(), '.authority', 'spool');
}

export function claudeSettingsPath(): string {
  return join(resolveHome(), '.claude', 'settings.json');
}

export function runtimeVersion(): string | null {
  const version = process.env.CLAUDE_CODE_VERSION;
  if (typeof version === 'string' && version.length > 0) {
    return version;
  }
  return null;
}
