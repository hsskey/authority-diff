import { execPath } from 'node:process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

export type HookCliEvent = 'permission-request' | 'pre-tool-use' | 'session-end';

export const LEGACY_PERMISSION_REQUEST_COMMAND = 'authority hook permission-request';
export const LEGACY_PRE_TOOL_USE_COMMAND = 'authority hook pre-tool-use';
export const LEGACY_SESSION_END_COMMAND = 'authority hook session-end';

const CLI_SRC_DIR = dirname(fileURLToPath(import.meta.url));

const MAIN_ENTRY_RELATIVE = join('apps', 'cli', 'src', 'main.ts');

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
      return `${override.slice(0, -' hook permission-request'.length)} hook ${event}`;
    }
  }

  const repoRoot = resolveRepoRoot();
  const node = execPath;
  const tsx = join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const main = join(repoRoot, MAIN_ENTRY_RELATIVE);
  return [shellQuote(node), shellQuote(tsx), shellQuote(main), 'hook', event].join(' ');
}

function referencesMainEntry(command: string): boolean {
  return command.includes(MAIN_ENTRY_RELATIVE);
}

export function isManagedPermissionRequestCommand(command: string): boolean {
  return (
    command === LEGACY_PERMISSION_REQUEST_COMMAND ||
    (referencesMainEntry(command) && command.endsWith(' hook permission-request'))
  );
}

export function isManagedPreToolUseCommand(command: string): boolean {
  return (
    command === LEGACY_PRE_TOOL_USE_COMMAND ||
    (referencesMainEntry(command) && command.endsWith(' hook pre-tool-use'))
  );
}

export function isManagedSessionEndCommand(command: string): boolean {
  return (
    command === LEGACY_SESSION_END_COMMAND ||
    (referencesMainEntry(command) && command.endsWith(' hook session-end'))
  );
}
