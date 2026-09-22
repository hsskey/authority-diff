import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  PERMISSION_REQUEST_HOOK_COMMAND,
  SESSION_END_HOOK_COMMAND,
  claudeSettingsPath,
} from '../config.ts';
import { writeStdout } from '../output.ts';

interface HookCommand {
  readonly type: 'command';
  readonly command: string;
}

interface MatcherHookGroup {
  readonly matcher?: string;
  readonly hooks: readonly HookCommand[];
}

interface SessionEndHookGroup {
  readonly hooks: readonly HookCommand[];
}

interface ClaudeSettings {
  readonly hooks?: {
    readonly PermissionRequest?: readonly MatcherHookGroup[];
    readonly SessionEnd?: readonly SessionEndHookGroup[];
  };
}

interface HookInstallChange {
  readonly PermissionRequest?: readonly MatcherHookGroup[];
  readonly SessionEnd?: readonly SessionEndHookGroup[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readHookCommand(value: unknown): HookCommand | null {
  if (!isRecord(value) || value.type !== 'command') {
    return null;
  }
  const command = value.command;
  if (typeof command !== 'string' || command.length === 0) {
    return null;
  }
  return { type: 'command', command };
}

function readMatcherGroup(value: unknown): MatcherHookGroup | null {
  if (!isRecord(value) || !Array.isArray(value.hooks)) {
    return null;
  }
  const hooks = value.hooks
    .map((entry) => readHookCommand(entry))
    .filter((entry): entry is HookCommand => entry !== null);
  if (hooks.length === 0) {
    return null;
  }
  const matcher = typeof value.matcher === 'string' ? value.matcher : undefined;
  return matcher === undefined ? { hooks } : { matcher, hooks };
}

function readSessionEndGroup(value: unknown): SessionEndHookGroup | null {
  if (!isRecord(value) || !Array.isArray(value.hooks)) {
    return null;
  }
  const hooks = value.hooks
    .map((entry) => readHookCommand(entry))
    .filter((entry): entry is HookCommand => entry !== null);
  if (hooks.length === 0) {
    return null;
  }
  return { hooks };
}

function readSettings(raw: string): ClaudeSettings {
  const parsed: unknown = JSON.parse(raw);
  if (!isRecord(parsed)) {
    return {};
  }

  const hooksValue = parsed.hooks;
  if (!isRecord(hooksValue)) {
    return {};
  }

  const permissionRequest = Array.isArray(hooksValue.PermissionRequest)
    ? hooksValue.PermissionRequest.map((entry) => readMatcherGroup(entry)).filter(
        (entry): entry is MatcherHookGroup => entry !== null,
      )
    : [];

  const sessionEnd = Array.isArray(hooksValue.SessionEnd)
    ? hooksValue.SessionEnd.map((entry) => readSessionEndGroup(entry)).filter(
        (entry): entry is SessionEndHookGroup => entry !== null,
      )
    : [];

  return {
    hooks: {
      PermissionRequest: permissionRequest,
      SessionEnd: sessionEnd,
    },
  };
}

function hasHookCommand(
  groups: readonly { readonly hooks: readonly HookCommand[] }[],
  command: string,
): boolean {
  return groups.some((group) => group.hooks.some((hook) => hook.command === command));
}

function permissionRequestEntry(): MatcherHookGroup {
  return {
    matcher: '*',
    hooks: [{ type: 'command', command: PERMISSION_REQUEST_HOOK_COMMAND }],
  };
}

function sessionEndEntry(): SessionEndHookGroup {
  return {
    hooks: [{ type: 'command', command: SESSION_END_HOOK_COMMAND }],
  };
}

function mergeHooks(settings: ClaudeSettings): {
  readonly settings: ClaudeSettings;
  readonly change: HookInstallChange;
} {
  const existingPermissionRequest = settings.hooks?.PermissionRequest ?? [];
  const existingSessionEnd = settings.hooks?.SessionEnd ?? [];

  let change: HookInstallChange = {};
  let nextPermissionRequest = existingPermissionRequest;
  let nextSessionEnd = existingSessionEnd;

  if (!hasHookCommand(existingPermissionRequest, PERMISSION_REQUEST_HOOK_COMMAND)) {
    const entry = permissionRequestEntry();
    nextPermissionRequest = [...existingPermissionRequest, entry];
    change = { ...change, PermissionRequest: [entry] };
  }

  if (!hasHookCommand(existingSessionEnd, SESSION_END_HOOK_COMMAND)) {
    const entry = sessionEndEntry();
    nextSessionEnd = [...existingSessionEnd, entry];
    change = { ...change, SessionEnd: [entry] };
  }

  return {
    settings: {
      ...settings,
      hooks: {
        PermissionRequest: nextPermissionRequest,
        SessionEnd: nextSessionEnd,
      },
    },
    change,
  };
}

function loadSettingsFile(): ClaudeSettings {
  const path = claudeSettingsPath();
  try {
    const raw = readFileSync(path, 'utf8');
    return readSettings(raw);
  } catch (error: unknown) {
    if (
      isRecord(error) &&
      'code' in error &&
      (error.code === 'ENOENT' || error.code === 'ENOTDIR')
    ) {
      return {};
    }
    throw error;
  }
}

function writeSettingsFile(settings: ClaudeSettings): void {
  const path = claudeSettingsPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
}

function hasChange(change: HookInstallChange): boolean {
  return change.PermissionRequest !== undefined || change.SessionEnd !== undefined;
}

export function runInstallHooks(options: { readonly printOnly: boolean }): void {
  const current = loadSettingsFile();
  const merged = mergeHooks(current);

  if (options.printOnly) {
    if (hasChange(merged.change)) {
      writeStdout(JSON.stringify(merged.change, null, 2));
    }
    return;
  }

  if (hasChange(merged.change)) {
    writeSettingsFile(merged.settings);
  }
}
