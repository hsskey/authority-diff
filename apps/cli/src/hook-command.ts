import { existsSync, realpathSync } from 'node:fs';
import { execPath } from 'node:process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

export type HookCliEvent = 'permission-request' | 'pre-tool-use' | 'session-end';

export const LEGACY_PERMISSION_REQUEST_COMMAND = 'authority hook permission-request';
export const LEGACY_PRE_TOOL_USE_COMMAND = 'authority hook pre-tool-use';
export const LEGACY_SESSION_END_COMMAND = 'authority hook session-end';

const CLI_SRC_DIR = dirname(fileURLToPath(import.meta.url));

const MAIN_ENTRY_RELATIVE = join('apps', 'cli', 'src', 'main.ts');
const BUNDLE_ENTRY_RELATIVE = join('apps', 'cli', 'dist', 'authority.mjs');

export function resolveRepoRoot(): string {
  return resolve(CLI_SRC_DIR, '../../..');
}

export function shellQuote(value: string): string {
  if (/^[\w@./%+:-]+$/.test(value)) {
    return value;
  }
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export interface NodeSelection {
  readonly path: string;
  readonly reason: string;
}

const HOMEBREW_CELLAR_NODE = /^(.+)\/Cellar\/(node(?:@[^/]+)?)\/[^/]+\/bin\/node$/;
const VERSION_MANAGER_NODE = /^(.*\/\.(vite-plus|volta|nvm))\/.+\/bin\/node$/;

function tryRealpath(path: string, realpath: (path: string) => string): string | undefined {
  try {
    return realpath(path);
  } catch {
    return undefined;
  }
}

// A version-manager install path embeds the node version, so removing that version breaks
// every installed hook; the manager's shim picks an installed version at run time instead.
function selectVersionManagerShim(
  nodePath: string,
  realpath: (path: string) => string,
): NodeSelection | undefined {
  const managed = VERSION_MANAGER_NODE.exec(nodePath);
  if (managed === null) {
    return undefined;
  }
  const [, root = '', manager = ''] = managed;
  const shim = manager === 'nvm' ? join(root, 'current', 'bin', 'node') : join(root, 'bin', 'node');
  if (shim === nodePath) {
    return { path: nodePath, reason: `${nodePath} (${manager} shim)` };
  }
  if (tryRealpath(shim, realpath) === undefined) {
    return {
      path: nodePath,
      reason: `${nodePath} (${manager} versioned path; no shim at ${shim}, hooks break when this version is removed)`,
    };
  }
  return { path: shim, reason: `${shim} (${manager} shim instead of versioned ${nodePath})` };
}

// A Homebrew Cellar path embeds the node version, so `brew upgrade` deletes it and every
// installed hook breaks; a stable symlink that resolves to the same binary survives upgrades.
export function selectNodePath(
  nodePath: string = execPath,
  realpath: (path: string) => string = realpathSync,
): NodeSelection {
  const shim = selectVersionManagerShim(nodePath, realpath);
  if (shim !== undefined) {
    return shim;
  }
  const cellar = HOMEBREW_CELLAR_NODE.exec(nodePath);
  if (cellar === null) {
    return { path: nodePath, reason: `${nodePath} (current node, not a Homebrew Cellar path)` };
  }
  const [, prefix = '', formula = ''] = cellar;
  const target = tryRealpath(nodePath, realpath) ?? nodePath;
  const candidates = [
    join(prefix, 'bin', 'node'),
    join(prefix, 'opt', formula, 'bin', 'node'),
    '/usr/local/bin/node',
  ];
  const stable = candidates.find((candidate) => tryRealpath(candidate, realpath) === target);
  if (stable === undefined) {
    return {
      path: nodePath,
      reason: `${nodePath} (Homebrew Cellar path; no stable symlink resolves to it, hooks break on upgrade)`,
    };
  }
  return { path: stable, reason: `${stable} (stable symlink to Homebrew Cellar ${nodePath})` };
}

function resolveCoreHookCommand(event: HookCliEvent): string {
  const repoRoot = resolveRepoRoot();
  const node = shellQuote(selectNodePath().path);
  const bundle = join(repoRoot, BUNDLE_ENTRY_RELATIVE);
  if (existsSync(bundle)) {
    return [node, shellQuote(bundle), 'hook', event].join(' ');
  }
  const tsx = join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const main = join(repoRoot, MAIN_ENTRY_RELATIVE);
  return [node, shellQuote(tsx), shellQuote(main), 'hook', event].join(' ');
}

export function wrapFailOpenShell(coreCommand: string): string {
  const escaped = coreCommand.replace(/'/g, `'\\''`);
  return `sh -c 'mkdir -p $HOME/.authority 2>/dev/null; ${escaped} 2>>$HOME/.authority/hook-errors.log || exit 0'`;
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

  return wrapFailOpenShell(resolveCoreHookCommand(event));
}

function referencesHookEntry(command: string): boolean {
  return command.includes(MAIN_ENTRY_RELATIVE) || command.includes(BUNDLE_ENTRY_RELATIVE);
}

export function isManagedPermissionRequestCommand(command: string): boolean {
  return (
    command === LEGACY_PERMISSION_REQUEST_COMMAND ||
    (referencesHookEntry(command) && command.includes(' hook permission-request'))
  );
}

export function isManagedPreToolUseCommand(command: string): boolean {
  return (
    command === LEGACY_PRE_TOOL_USE_COMMAND ||
    (referencesHookEntry(command) && command.includes(' hook pre-tool-use'))
  );
}

export function isManagedSessionEndCommand(command: string): boolean {
  return (
    command === LEGACY_SESSION_END_COMMAND ||
    (referencesHookEntry(command) && command.includes(' hook session-end'))
  );
}
