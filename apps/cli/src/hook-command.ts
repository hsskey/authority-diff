import { execPath } from 'node:process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

export type HookCliEvent = 'permission-request' | 'session-end';

export const LEGACY_PERMISSION_REQUEST_COMMAND = 'authority hook permission-request';
export const LEGACY_SESSION_END_COMMAND = 'authority hook session-end';

const CLI_SRC_DIR = dirname(fileURLToPath(import.meta.url));

export function resolveRepoRoot(): string {
  return resolve(CLI_SRC_DIR, '../../..');
}

export function shellQuote(value: string): string {
  if (/^[\w@./%+:-]+$/.test(value)) {
    return value;
  }
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function resolveHookCommand(
  event: HookCliEvent,
  options?: { readonly commandOverride?: string },
): string {
  const override = options?.commandOverride;
  if (override !== undefined) {
    if (event === 'permission-request') {
      return override;
    }
    if (override.endsWith(' hook permission-request')) {
      return `${override.slice(0, -' hook permission-request'.length)} hook session-end`;
    }
    return override;
  }

  const repoRoot = resolveRepoRoot();
  const node = execPath;
  const tsx = join(repoRoot, 'node_modules', '.bin', 'tsx');
  const main = join(repoRoot, 'apps', 'cli', 'src', 'main.ts');
  return [shellQuote(node), shellQuote(tsx), shellQuote(main), 'hook', event].join(' ');
}

export function isManagedPermissionRequestCommand(command: string): boolean {
  return (
    command === LEGACY_PERMISSION_REQUEST_COMMAND ||
    command.endsWith(' hook permission-request') ||
    command.endsWith(' hook permission_request')
  );
}

export function isManagedSessionEndCommand(command: string): boolean {
  return (
    command === LEGACY_SESSION_END_COMMAND ||
    command.endsWith(' hook session-end') ||
    command.endsWith(' hook session_end')
  );
}
