import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  LEGACY_PERMISSION_REQUEST_COMMAND,
  LEGACY_SESSION_END_COMMAND,
  resolveHookCommand,
  selectNodePath,
} from '../src/hook-command.ts';
import { makeTempHome, runAuthority } from './support/harness.ts';

function settingsPath(home: string): string {
  return join(home, '.claude', 'settings.json');
}

const PRE_TOOL_USE_COMMAND = resolveHookCommand('pre-tool-use');
const PERMISSION_REQUEST_COMMAND = resolveHookCommand('permission-request');
const SESSION_END_COMMAND = resolveHookCommand('session-end');

describe('authority install-hooks', () => {
  test('is idempotent and preserves existing hooks', () => {
    const home = makeTempHome();
    mkdirSync(join(home, '.claude'), { recursive: true });
    writeFileSync(
      settingsPath(home),
      `${JSON.stringify(
        {
          hooks: {
            PermissionRequest: [
              {
                matcher: 'Bash',
                hooks: [{ type: 'command', command: 'echo keep-me' }],
              },
            ],
          },
        },
        null,
        2,
      )}\n`,
      'utf8',
    );

    const first = runAuthority(['install-hooks'], { home });
    const second = runAuthority(['install-hooks'], { home });

    expect(first.status).toBe(0);
    expect(second.status).toBe(0);

    const settings: unknown = JSON.parse(readFileSync(settingsPath(home), 'utf8'));
    expect(settings).toEqual({
      hooks: {
        PreToolUse: [
          {
            matcher: '*',
            hooks: [{ type: 'command', command: PRE_TOOL_USE_COMMAND }],
          },
        ],
        PermissionRequest: [
          {
            matcher: 'Bash',
            hooks: [{ type: 'command', command: 'echo keep-me' }],
          },
          {
            matcher: '*',
            hooks: [{ type: 'command', command: PERMISSION_REQUEST_COMMAND }],
          },
        ],
        SessionEnd: [
          {
            hooks: [{ type: 'command', command: SESSION_END_COMMAND }],
          },
        ],
      },
    });
  });

  test('preserves unrelated top-level keys and other hook events', () => {
    const home = makeTempHome();
    mkdirSync(join(home, '.claude'), { recursive: true });
    writeFileSync(
      settingsPath(home),
      `${JSON.stringify(
        {
          model: 'claude-opus-4-8',
          env: { EXAMPLE: '1' },
          permissions: { allow: ['Read'] },
          hooks: {
            PreToolUse: [
              {
                matcher: 'Bash',
                hooks: [{ type: 'command', command: 'echo pre' }],
              },
            ],
          },
        },
        null,
        2,
      )}\n`,
      'utf8',
    );

    const result = runAuthority(['install-hooks'], { home });
    expect(result.status).toBe(0);

    const settings: unknown = JSON.parse(readFileSync(settingsPath(home), 'utf8'));
    expect(settings).toEqual({
      model: 'claude-opus-4-8',
      env: { EXAMPLE: '1' },
      permissions: { allow: ['Read'] },
      hooks: {
        PreToolUse: [
          {
            matcher: 'Bash',
            hooks: [{ type: 'command', command: 'echo pre' }],
          },
          {
            matcher: '*',
            hooks: [{ type: 'command', command: PRE_TOOL_USE_COMMAND }],
          },
        ],
        PermissionRequest: [
          {
            matcher: '*',
            hooks: [{ type: 'command', command: PERMISSION_REQUEST_COMMAND }],
          },
        ],
        SessionEnd: [
          {
            hooks: [{ type: 'command', command: SESSION_END_COMMAND }],
          },
        ],
      },
    });
  });

  test('replaces legacy authority hook commands with absolute paths', () => {
    const home = makeTempHome();
    mkdirSync(join(home, '.claude'), { recursive: true });
    writeFileSync(
      settingsPath(home),
      `${JSON.stringify(
        {
          hooks: {
            PermissionRequest: [
              {
                matcher: '*',
                hooks: [{ type: 'command', command: LEGACY_PERMISSION_REQUEST_COMMAND }],
              },
            ],
            SessionEnd: [
              {
                hooks: [{ type: 'command', command: LEGACY_SESSION_END_COMMAND }],
              },
            ],
          },
        },
        null,
        2,
      )}\n`,
      'utf8',
    );

    const first = runAuthority(['install-hooks'], { home });
    const second = runAuthority(['install-hooks'], { home });

    expect(first.status).toBe(0);
    expect(second.status).toBe(0);

    const settings: unknown = JSON.parse(readFileSync(settingsPath(home), 'utf8'));
    expect(settings).toEqual({
      hooks: {
        PreToolUse: [
          {
            matcher: '*',
            hooks: [{ type: 'command', command: PRE_TOOL_USE_COMMAND }],
          },
        ],
        PermissionRequest: [
          {
            matcher: '*',
            hooks: [{ type: 'command', command: PERMISSION_REQUEST_COMMAND }],
          },
        ],
        SessionEnd: [
          {
            hooks: [{ type: 'command', command: SESSION_END_COMMAND }],
          },
        ],
      },
    });
  });

  test('--print writes only the intended change and does not modify settings', () => {
    const home = makeTempHome();
    const dryRun = runAuthority(['install-hooks', '--print'], { home });

    expect(dryRun.status).toBe(0);
    expect(() => readFileSync(settingsPath(home), 'utf8')).toThrow();

    const change: unknown = JSON.parse(dryRun.stdout.trim());
    expect(change).toEqual({
      node: selectNodePath().reason,
      PreToolUse: [
        {
          matcher: '*',
          hooks: [{ type: 'command', command: PRE_TOOL_USE_COMMAND }],
        },
      ],
      PermissionRequest: [
        {
          matcher: '*',
          hooks: [{ type: 'command', command: PERMISSION_REQUEST_COMMAND }],
        },
      ],
      SessionEnd: [
        {
          hooks: [{ type: 'command', command: SESSION_END_COMMAND }],
        },
      ],
    });

    runAuthority(['install-hooks'], { home });
    const afterInstall = runAuthority(['install-hooks', '--print'], { home });
    expect(afterInstall.stdout).toBe('');
  });

  test('--command override is printed verbatim', () => {
    const home = makeTempHome();
    const override = '/custom/node /custom/tsx /custom/main.ts hook permission-request';
    const dryRun = runAuthority(['install-hooks', '--print', '--command', override], { home });

    expect(dryRun.status).toBe(0);
    const change: unknown = JSON.parse(dryRun.stdout.trim());
    expect(change).toEqual({
      PreToolUse: [
        {
          matcher: '*',
          hooks: [
            {
              type: 'command',
              command: '/custom/node /custom/tsx /custom/main.ts hook pre-tool-use',
            },
          ],
        },
      ],
      PermissionRequest: [
        {
          matcher: '*',
          hooks: [{ type: 'command', command: override }],
        },
      ],
      SessionEnd: [
        {
          hooks: [
            {
              type: 'command',
              command: '/custom/node /custom/tsx /custom/main.ts hook session-end',
            },
          ],
        },
      ],
    });
  });
});
