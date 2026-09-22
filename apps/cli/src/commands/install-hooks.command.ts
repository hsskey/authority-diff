import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { claudeSettingsPath } from '../config.ts';
import {
  isManagedPermissionRequestCommand,
  isManagedSessionEndCommand,
  resolveHookCommand,
} from '../hook-command.ts';
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

interface ResolvedHookCommands {
  readonly permissionRequest: string;
  readonly sessionEnd: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function resolveCommands(commandOverride?: string): ResolvedHookCommands {
  const options = commandOverride === undefined ? undefined : { commandOverride };
  return {
    permissionRequest: resolveHookCommand('permission-request', options),
    sessionEnd: resolveHookCommand('session-end', options),
  };
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

function normalizeHookGroups(
  groups: readonly unknown[],
  isManaged: (command: string) => boolean,
  targetCommand: string,
): { readonly groups: readonly unknown[]; readonly changed: boolean } {
  let changed = false;
  let targetSeen = false;
  const nextGroups: unknown[] = [];

  for (const group of groups) {
    if (!isRecord(group) || !Array.isArray(group.hooks)) {
      nextGroups.push(group);
      continue;
    }

    const nextHooks: unknown[] = [];
    for (const hook of group.hooks) {
      if (!isRecord(hook) || hook.type !== 'command' || typeof hook.command !== 'string') {
        nextHooks.push(hook);
        continue;
      }

      if (hook.command === targetCommand) {
        if (targetSeen) {
          changed = true;
          continue;
        }
        targetSeen = true;
        nextHooks.push(hook);
        continue;
      }

      if (isManaged(hook.command)) {
        changed = true;
        if (!targetSeen) {
          targetSeen = true;
          nextHooks.push({ ...hook, command: targetCommand });
        }
        continue;
      }

      nextHooks.push(hook);
    }

    if (nextHooks.length > 0) {
      nextGroups.push({ ...group, hooks: nextHooks });
    } else if (group.hooks.length > 0) {
      changed = true;
    }
  }

  return { groups: nextGroups, changed };
}

function permissionRequestEntry(command: string): MatcherHookGroup {
  return {
    matcher: '*',
    hooks: [{ type: 'command', command }],
  };
}

function sessionEndEntry(command: string): SessionEndHookGroup {
  return {
    hooks: [{ type: 'command', command }],
  };
}

function mergeHooks(
  document: Record<string, unknown>,
  commands: ResolvedHookCommands,
): {
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
  let nextPermissionRequest = existingPermissionRequest;
  let nextSessionEnd = existingSessionEnd;

  const normalizedPermissionRequest = normalizeHookGroups(
    existingPermissionRequest,
    isManagedPermissionRequestCommand,
    commands.permissionRequest,
  );
  nextPermissionRequest = normalizedPermissionRequest.groups;
  if (normalizedPermissionRequest.changed) {
    change = {
      ...change,
      PermissionRequest: [permissionRequestEntry(commands.permissionRequest)],
    };
  }

  if (!arrayContainsCommand(nextPermissionRequest, commands.permissionRequest)) {
    const entry = permissionRequestEntry(commands.permissionRequest);
    nextPermissionRequest = [...nextPermissionRequest, entry];
    change = { ...change, PermissionRequest: [entry] };
  }

  const normalizedSessionEnd = normalizeHookGroups(
    existingSessionEnd,
    isManagedSessionEndCommand,
    commands.sessionEnd,
  );
  nextSessionEnd = normalizedSessionEnd.groups;
  if (normalizedSessionEnd.changed) {
    change = { ...change, SessionEnd: [sessionEndEntry(commands.sessionEnd)] };
  }

  if (!arrayContainsCommand(nextSessionEnd, commands.sessionEnd)) {
    const entry = sessionEndEntry(commands.sessionEnd);
    nextSessionEnd = [...nextSessionEnd, entry];
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

export function runInstallHooks(options: {
  readonly printOnly: boolean;
  readonly commandOverride?: string;
}): void {
  const commands = resolveCommands(options.commandOverride);
  const current = loadDocument();
  const merged = mergeHooks(current, commands);

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
