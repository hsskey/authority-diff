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
    expect(command).toContain(join(repoRoot, 'node_modules', '.bin', 'tsx'));
    expect(command).toContain(join(repoRoot, 'apps', 'cli', 'src', 'main.ts'));
  });

  test('recognizes legacy and managed hook commands', () => {
    expect(isManagedPermissionRequestCommand(LEGACY_PERMISSION_REQUEST_COMMAND)).toBe(true);
    expect(isManagedSessionEndCommand(LEGACY_SESSION_END_COMMAND)).toBe(true);
    expect(isManagedPermissionRequestCommand(resolveHookCommand('permission-request'))).toBe(true);
    expect(isManagedSessionEndCommand('echo unrelated')).toBe(false);
  });
});
