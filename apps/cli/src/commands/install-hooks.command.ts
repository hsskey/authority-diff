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

interface HookInstallChange {
  readonly PermissionRequest?: readonly MatcherHookGroup[];
  readonly SessionEnd?: readonly SessionEndHookGroup[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function arrayContainsCommand(value: unknown, command: string): boolean {
  if (!Array.isArray(value)) {
    return false;
  }
  return value.some((group) => {
    if (!isRecord(group) || !Array.isArray(group.hooks)) {
      return false;
    }
    return group.hooks.some((hook) => isRecord(hook) && hook.command === command);
  });
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

function mergeHooks(document: Record<string, unknown>): {
  readonly document: Record<string, unknown>;
  readonly change: HookInstallChange;
} {
  const hooksValue = isRecord(document.hooks) ? document.hooks : {};
  const existingPermissionRequest: readonly unknown[] = Array.isArray(hooksValue.PermissionRequest)
    ? hooksValue.PermissionRequest
    : [];
  const existingSessionEnd: readonly unknown[] = Array.isArray(hooksValue.SessionEnd)
    ? hooksValue.SessionEnd
    : [];

  let change: HookInstallChange = {};
  let nextPermissionRequest: readonly unknown[] = existingPermissionRequest;
  let nextSessionEnd: readonly unknown[] = existingSessionEnd;

  if (!arrayContainsCommand(hooksValue.PermissionRequest, PERMISSION_REQUEST_HOOK_COMMAND)) {
    const entry = permissionRequestEntry();
    nextPermissionRequest = [...existingPermissionRequest, entry];
    change = { ...change, PermissionRequest: [entry] };
  }

  if (!arrayContainsCommand(hooksValue.SessionEnd, SESSION_END_HOOK_COMMAND)) {
    const entry = sessionEndEntry();
    nextSessionEnd = [...existingSessionEnd, entry];
    change = { ...change, SessionEnd: [entry] };
  }

  return {
    document: {
      ...document,
      hooks: {
        ...hooksValue,
        PermissionRequest: nextPermissionRequest,
        SessionEnd: nextSessionEnd,
      },
    },
    change,
  };
}

function loadDocument(): Record<string, unknown> {
  const path = claudeSettingsPath();
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
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
  const parsed: unknown = JSON.parse(raw);
  return isRecord(parsed) ? parsed : {};
}

function writeSettingsFile(document: Record<string, unknown>): void {
  const path = claudeSettingsPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
}

function hasChange(change: HookInstallChange): boolean {
  return change.PermissionRequest !== undefined || change.SessionEnd !== undefined;
}

export function runInstallHooks(options: { readonly printOnly: boolean }): void {
  const current = loadDocument();
  const merged = mergeHooks(current);

  if (options.printOnly) {
    if (hasChange(merged.change)) {
      writeStdout(JSON.stringify(merged.change, null, 2));
    }
    return;
  }

  if (hasChange(merged.change)) {
    writeSettingsFile(merged.document);
  }
}
