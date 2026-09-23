import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { claudeSettingsPath } from '../config.ts';
import {
  isManagedPermissionRequestCommand,
  isManagedPreToolUseCommand,
  isManagedSessionEndCommand,
  resolveHookCommand,
  resolveRepoRoot,
  selectNodePath,
} from '../hook-command.ts';
import { writeStdout } from '../output.ts';
import { workspaceLinkWarnings } from '../workspace-link.ts';

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
  readonly node?: string;
  readonly warnings?: readonly string[];
  readonly PreToolUse?: readonly MatcherHookGroup[];
  readonly PermissionRequest?: readonly MatcherHookGroup[];
  readonly SessionEnd?: readonly SessionEndHookGroup[];
}

interface ResolvedHookCommands {
  readonly preToolUse: string;
  readonly permissionRequest: string;
  readonly sessionEnd: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function resolveCommands(commandOverride?: string): ResolvedHookCommands {
  const options = commandOverride === undefined ? undefined : { commandOverride };
  return {
    preToolUse: resolveHookCommand('pre-tool-use', options),
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

function matcherEntry(command: string): MatcherHookGroup {
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

// Merge a matcher-based section (PreToolUse, PermissionRequest): normalize any managed
// commands to the target and append the canonical `*` entry when it is absent.
function mergeMatcherSection(
  existing: readonly unknown[],
  isManaged: (command: string) => boolean,
  command: string,
): { readonly groups: readonly unknown[]; readonly entry: MatcherHookGroup | undefined } {
  const normalized = normalizeHookGroups(existing, isManaged, command);
  let groups = normalized.groups;
  let entry = normalized.changed ? matcherEntry(command) : undefined;

  if (!arrayContainsCommand(groups, command)) {
    entry = matcherEntry(command);
    groups = [...groups, entry];
  }

  return { groups, entry };
}

function mergeHooks(
  document: Record<string, unknown>,
  commands: ResolvedHookCommands,
): {
  readonly document: Record<string, unknown>;
  readonly change: HookInstallChange;
} {
  const hooksValue = isRecord(document.hooks) ? document.hooks : {};
  const existingPreToolUse: readonly unknown[] = Array.isArray(hooksValue.PreToolUse)
    ? hooksValue.PreToolUse
    : [];
  const existingPermissionRequest: readonly unknown[] = Array.isArray(hooksValue.PermissionRequest)
    ? hooksValue.PermissionRequest
    : [];
  const existingSessionEnd: readonly unknown[] = Array.isArray(hooksValue.SessionEnd)
    ? hooksValue.SessionEnd
    : [];

  let change: HookInstallChange = {};

  const preToolUse = mergeMatcherSection(
    existingPreToolUse,
    isManagedPreToolUseCommand,
    commands.preToolUse,
  );
  if (preToolUse.entry !== undefined) {
    change = { ...change, PreToolUse: [preToolUse.entry] };
  }

  const permissionRequest = mergeMatcherSection(
    existingPermissionRequest,
    isManagedPermissionRequestCommand,
    commands.permissionRequest,
  );
  if (permissionRequest.entry !== undefined) {
    change = { ...change, PermissionRequest: [permissionRequest.entry] };
  }

  let nextSessionEnd = existingSessionEnd;
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
        PreToolUse: preToolUse.groups,
        PermissionRequest: permissionRequest.groups,
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
  return (
    change.PreToolUse !== undefined ||
    change.PermissionRequest !== undefined ||
    change.SessionEnd !== undefined
  );
}

function buildPrintOutput(
  change: HookInstallChange,
  commandOverride: string | undefined,
): HookInstallChange | null {
  const warnings = workspaceLinkWarnings(resolveRepoRoot());
  if (!hasChange(change) && warnings.length === 0) {
    return null;
  }
  return {
    ...(commandOverride === undefined ? { node: selectNodePath().reason } : {}),
    ...change,
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}

export function runInstallHooks(options: {
  readonly printOnly: boolean;
  readonly commandOverride?: string;
}): void {
  const commands = resolveCommands(options.commandOverride);
  const current = loadDocument();
  const merged = mergeHooks(current, commands);

  if (options.printOnly) {
    const output = buildPrintOutput(merged.change, options.commandOverride);
    if (output !== null) {
      writeStdout(JSON.stringify(output, null, 2));
    }
    return;
  }

  if (hasChange(merged.change)) {
    writeSettingsFile(merged.document);
  }
}
