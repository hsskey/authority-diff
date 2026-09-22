import { describe, expect, test } from 'vitest';
import { canonicalJson, sha256Hex } from '@authority/kernel/hash';
import { makeTempHome, readSpoolLines, runAuthority } from './support/harness.ts';
import { isRecord, readNullableString, readString } from './support/record.ts';

describe('authority hook', () => {
  test('exits 0 within 400 ms on malformed stdin', () => {
    const home = makeTempHome();
    const result = runAuthority(['hook', 'permission-request'], {
      home,
      input: 'not-json',
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.durationMs).toBeLessThan(400);
  });

  test('exits 0 within 400 ms in a closed environment without writing spool output', () => {
    const home = makeTempHome();
    const result = runAuthority(['hook', 'session-end'], {
      home,
      input: '',
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');
    expect(result.durationMs).toBeLessThan(400);
    expect(() => readSpoolLines(home)).toThrow();
  });

  test('appends one spool line for permission-request without storing raw tool_input', () => {
    const home = makeTempHome();
    const toolInput = { command: 'npm test', description: 'Run tests' };
    const input = JSON.stringify({
      session_id: 'session-1',
      cwd: '/tmp/project',
      hook_event_name: 'PermissionRequest',
      tool_name: 'Bash',
      tool_input: toolInput,
    });

    const result = runAuthority(['hook', 'permission-request'], {
      home,
      input,
      env: { CLAUDE_CODE_VERSION: '2.1.0' },
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');

    const lines = readSpoolLines(home);
    expect(lines).toHaveLength(1);
    const line = lines[0];
    if (line === undefined) {
      throw new Error('expected one spool line');
    }

    const record: unknown = JSON.parse(line);
    if (!isRecord(record)) {
      throw new Error('expected spool record object');
    }
    expect(readString(record, 'event')).toBe('permission_request');
    expect(readString(record, 'timestamp')).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(readString(record, 'sessionId')).toBe('session-1');
    expect(readString(record, 'toolName')).toBe('Bash');
    expect(readString(record, 'toolInputHash')).toBe(sha256Hex(canonicalJson(toolInput)));
    expect(readString(record, 'cwd')).toBe('/tmp/project');
    expect(readString(record, 'runtimeVersion')).toBe('2.1.0');
    expect(JSON.stringify(record)).not.toContain('npm test');
  });

  test('appends one spool line for session-end', () => {
    const home = makeTempHome();
    const input = JSON.stringify({
      session_id: 'session-2',
      cwd: '/tmp/project',
      hook_event_name: 'SessionEnd',
      reason: 'other',
    });

    const result = runAuthority(['hook', 'session-end'], { home, input });

    expect(result.status).toBe(0);
    expect(result.stdout).toBe('');

    const lines = readSpoolLines(home);
    expect(lines).toHaveLength(1);
    const line = lines[0];
    if (line === undefined) {
      throw new Error('expected one spool line');
    }

    const record: unknown = JSON.parse(line);
    if (!isRecord(record)) {
      throw new Error('expected spool record object');
    }
    expect(readString(record, 'event')).toBe('session_end');
    expect(readString(record, 'timestamp')).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(readString(record, 'sessionId')).toBe('session-2');
    expect(readNullableString(record, 'toolName')).toBeNull();
    expect(readNullableString(record, 'toolInputHash')).toBeNull();
    expect(readString(record, 'cwd')).toBe('/tmp/project');
    expect(readNullableString(record, 'runtimeVersion')).toBeNull();
  });
});
