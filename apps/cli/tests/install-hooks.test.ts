import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { PERMISSION_REQUEST_HOOK_COMMAND, SESSION_END_HOOK_COMMAND } from '../src/config.ts';
import { makeTempHome, runAuthority } from './support/harness.ts';

function settingsPath(home: string): string {
  return join(home, '.claude', 'settings.json');
}

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
        PermissionRequest: [
          {
            matcher: 'Bash',
            hooks: [{ type: 'command', command: 'echo keep-me' }],
          },
          {
            matcher: '*',
            hooks: [{ type: 'command', command: PERMISSION_REQUEST_HOOK_COMMAND }],
          },
        ],
        SessionEnd: [
          {
            hooks: [{ type: 'command', command: SESSION_END_HOOK_COMMAND }],
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
        ],
        PermissionRequest: [
          {
            matcher: '*',
            hooks: [{ type: 'command', command: PERMISSION_REQUEST_HOOK_COMMAND }],
          },
        ],
        SessionEnd: [
          {
            hooks: [{ type: 'command', command: SESSION_END_HOOK_COMMAND }],
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
      PermissionRequest: [
        {
          matcher: '*',
          hooks: [{ type: 'command', command: PERMISSION_REQUEST_HOOK_COMMAND }],
        },
      ],
      SessionEnd: [
        {
          hooks: [{ type: 'command', command: SESSION_END_HOOK_COMMAND }],
        },
      ],
    });

    runAuthority(['install-hooks'], { home });
    const afterInstall = runAuthority(['install-hooks', '--print'], { home });
    expect(afterInstall.stdout).toBe('');
  });
});
