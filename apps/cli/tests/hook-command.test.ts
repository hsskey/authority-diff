import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  isManagedPermissionRequestCommand,
  isManagedPreToolUseCommand,
  isManagedSessionEndCommand,
  LEGACY_PERMISSION_REQUEST_COMMAND,
  LEGACY_PRE_TOOL_USE_COMMAND,
  LEGACY_SESSION_END_COMMAND,
  resolveHookCommand,
  resolveRepoRoot,
  selectNodePath,
  wrapFailOpenShell,
} from '../src/hook-command.ts';
import { makeTempHome } from './support/harness.ts';
import { testPath } from './support/run-env.config.ts';

describe('resolveHookCommand', () => {
  test('builds a shell-wrapped command from the repo root', () => {
    const repoRoot = resolveRepoRoot();
    const bundle = join(repoRoot, 'apps', 'cli', 'dist', 'authority.mjs');
    const command = resolveHookCommand('permission-request');
    expect(command).toMatch(/^sh -c '/);
    expect(command).toContain('2>>$HOME/.authority/hook-errors.log || exit 0');
    expect(command).toContain('hook permission-request');
    if (existsSync(bundle)) {
      expect(command).toContain(bundle);
    } else {
      expect(command).toContain(join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs'));
      expect(command).toContain(join(repoRoot, 'apps', 'cli', 'src', 'main.ts'));
    }
  });

  test('builds a shell-wrapped pre-tool-use command from the repo root', () => {
    const repoRoot = resolveRepoRoot();
    const bundle = join(repoRoot, 'apps', 'cli', 'dist', 'authority.mjs');
    const command = resolveHookCommand('pre-tool-use');
    expect(command).toMatch(/^sh -c '/);
    expect(command).toContain('hook pre-tool-use');
    if (existsSync(bundle)) {
      expect(command).toContain(bundle);
    } else {
      expect(command).toContain(join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs'));
      expect(command).toContain(join(repoRoot, 'apps', 'cli', 'src', 'main.ts'));
    }
  });

  test('wrapFailOpenShell exits 0 when the inner command fails to start', () => {
    const command = wrapFailOpenShell('/nonexistent/node /nonexistent/entry hook pre-tool-use');
    expect(command).toMatch(/^sh -c '/);
    expect(command).toContain('|| exit 0');
    const result = spawnSync(command, {
      shell: true,
      stdio: 'ignore',
      env: { PATH: testPath, HOME: makeTempHome() },
    });
    expect(result.status).toBe(0);
  });

  test('wrapFailOpenShell appends inner stderr to $HOME/.authority/hook-errors.log', () => {
    const home = makeTempHome();
    const command = wrapFailOpenShell('sh -c "echo inner-failure >&2; exit 3"');

    spawnSync(command, { shell: true, stdio: 'ignore', env: { PATH: testPath, HOME: home } });

    expect(readFileSync(join(home, '.authority', 'hook-errors.log'), 'utf8')).toBe(
      'inner-failure\n',
    );
  });

  test('derives session-end and pre-tool-use from a permission-request override', () => {
    const override = '/node /tsx /main.ts hook permission-request';
    expect(resolveHookCommand('permission-request', { commandOverride: override })).toBe(override);
    expect(resolveHookCommand('session-end', { commandOverride: override })).toBe(
      '/node /tsx /main.ts hook session-end',
    );
    expect(resolveHookCommand('pre-tool-use', { commandOverride: override })).toBe(
      '/node /tsx /main.ts hook pre-tool-use',
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
    expect(isManagedPreToolUseCommand(LEGACY_PRE_TOOL_USE_COMMAND)).toBe(true);
    expect(isManagedSessionEndCommand(LEGACY_SESSION_END_COMMAND)).toBe(true);
    expect(isManagedPermissionRequestCommand(resolveHookCommand('permission-request'))).toBe(true);
    expect(isManagedPreToolUseCommand(resolveHookCommand('pre-tool-use'))).toBe(true);
    expect(isManagedSessionEndCommand(resolveHookCommand('session-end'))).toBe(true);
    expect(isManagedSessionEndCommand('echo unrelated')).toBe(false);
    expect(isManagedPermissionRequestCommand('mytool hook permission-request')).toBe(false);
    expect(isManagedPreToolUseCommand('mytool hook pre-tool-use')).toBe(false);
    expect(isManagedSessionEndCommand('mytool hook session-end')).toBe(false);
  });
});

describe('selectNodePath', () => {
  const CELLAR_NODE = '/opt/homebrew/Cellar/node/24.1.0/bin/node';
  const KEG_NODE = '/opt/homebrew/Cellar/node@22/22.9.0/bin/node';

  function fakeRealpath(links: Record<string, string>): (path: string) => string {
    return (path) => {
      const target = links[path];
      if (target === undefined) {
        throw new Error(`ENOENT: ${path}`);
      }
      return target;
    };
  }

  test.each([
    {
      name: 'keeps a non-Cellar node path',
      execPath: '/usr/bin/node',
      links: { '/usr/bin/node': '/usr/bin/node' },
      expected: '/usr/bin/node',
    },
    {
      name: 'uses <prefix>/bin/node when it resolves to the Cellar node',
      execPath: CELLAR_NODE,
      links: { [CELLAR_NODE]: CELLAR_NODE, '/opt/homebrew/bin/node': CELLAR_NODE },
      expected: '/opt/homebrew/bin/node',
    },
    {
      name: 'uses the opt symlink of a versioned formula',
      execPath: KEG_NODE,
      links: { [KEG_NODE]: KEG_NODE, '/opt/homebrew/opt/node@22/bin/node': KEG_NODE },
      expected: '/opt/homebrew/opt/node@22/bin/node',
    },
    {
      name: 'uses /usr/local/bin/node when it resolves to the Cellar node',
      execPath: CELLAR_NODE,
      links: { [CELLAR_NODE]: CELLAR_NODE, '/usr/local/bin/node': CELLAR_NODE },
      expected: '/usr/local/bin/node',
    },
    {
      name: 'keeps the Cellar path when the stable symlink points at another version',
      execPath: CELLAR_NODE,
      links: {
        [CELLAR_NODE]: CELLAR_NODE,
        '/opt/homebrew/bin/node': '/opt/homebrew/Cellar/node/25.0.0/bin/node',
      },
      expected: CELLAR_NODE,
    },
  ])('$name', ({ execPath, links, expected }) => {
    expect(selectNodePath(execPath, fakeRealpath(links)).path).toBe(expected);
  });

  test('explains the choice in one line', () => {
    const selection = selectNodePath(
      CELLAR_NODE,
      fakeRealpath({ [CELLAR_NODE]: CELLAR_NODE, '/opt/homebrew/bin/node': CELLAR_NODE }),
    );
    expect(selection.reason).toBe(
      `/opt/homebrew/bin/node (stable symlink to Homebrew Cellar ${CELLAR_NODE})`,
    );
  });
});
