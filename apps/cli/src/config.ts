import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Hook handler logic must finish within this budget. tsx interpreter startup and
 * workspace package resolution are not counted toward the budget until the CLI is
 * bundled (known limitations; see docs/evidence/hook-spool.md).
 */
export const HOOK_EXIT_BUDGET_MS = 400;

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

export function serverBaseUrl(): string {
  const url = process.env.AUTHORITY_CLI_SERVER_URL;
  if (typeof url === 'string' && url.length > 0) {
    return url.replace(/\/+$/, '');
  }
  return 'http://localhost:8787';
}

export function authToken(): string | null {
  const token = process.env.AUTHORITY_CLI_TOKEN;
  if (typeof token === 'string' && token.length > 0) {
    return token;
  }
  return null;
}
