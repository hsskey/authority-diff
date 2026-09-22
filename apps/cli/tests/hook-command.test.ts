import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  isManagedPermissionRequestCommand,
  isManagedSessionEndCommand,
  LEGACY_PERMISSION_REQUEST_COMMAND,
  LEGACY_SESSION_END_COMMAND,
  resolveHookCommand,
  resolveRepoRoot,
} from '../src/hook-command.ts';

describe('resolveHookCommand', () => {
  test('builds an absolute command from the repo root', () => {
    const repoRoot = resolveRepoRoot();
    const command = resolveHookCommand('permission-request');
    expect(command).toContain('hook permission-request');
    expect(command).toContain(join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs'));
    expect(command).toContain(join(repoRoot, 'apps', 'cli', 'src', 'main.ts'));
  });

  test('derives session-end from a permission-request override', () => {
    const override = '/node /tsx /main.ts hook permission-request';
    expect(resolveHookCommand('permission-request', { commandOverride: override })).toBe(override);
    expect(resolveHookCommand('session-end', { commandOverride: override })).toBe(
      '/node /tsx /main.ts hook session-end',
    );
  });

  test('uses override only for permission-request when it lacks the suffix', () => {
    const override = 'custom-hook-runner';
    expect(resolveHookCommand('permission-request', { commandOverride: override })).toBe(override);
    expect(resolveHookCommand('session-end', { commandOverride: override })).toBe(
      resolveHookCommand('session-end'),
    );
  });

  test('recognizes legacy and managed hook commands', () => {
    expect(isManagedPermissionRequestCommand(LEGACY_PERMISSION_REQUEST_COMMAND)).toBe(true);
    expect(isManagedSessionEndCommand(LEGACY_SESSION_END_COMMAND)).toBe(true);
    expect(isManagedPermissionRequestCommand(resolveHookCommand('permission-request'))).toBe(true);
    expect(isManagedSessionEndCommand(resolveHookCommand('session-end'))).toBe(true);
    expect(isManagedSessionEndCommand('echo unrelated')).toBe(false);
    expect(isManagedPermissionRequestCommand('mytool hook permission-request')).toBe(false);
    expect(isManagedSessionEndCommand('mytool hook session-end')).toBe(false);
  });
});
