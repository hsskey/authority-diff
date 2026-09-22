import { describe, expect, test } from 'vitest';
import type { ClassifyToolCall, Operation } from '@authority/action/schema';
import type { ParsedSession } from '../schema.ts';
import { buildActionsForReplay, deriveActionKey, parseTranscript } from '../client.ts';

const STUB_OPERATION: Operation = {
  index: 0,
  capability: 'read',
  target: { kind: 'unknown' },
  analyzability: 'none',
  program: null,
  fragment: 'stub',
  signals: ['injected'],
};

const classify: ClassifyToolCall = () => [STUB_OPERATION];

function session(sessionExternalId: string, toolUseId: string, timestamp: string): ParsedSession {
  const line = JSON.stringify({
    type: 'assistant',
    timestamp,
    cwd: '/Users/synth/proj',
    gitBranch: 'b',
    version: 'v',
    isSidechain: false,
    message: {
      role: 'assistant',
      content: [{ type: 'tool_use', id: toolUseId, name: 'Bash', input: { command: 'x' } }],
    },
  });
  return parseTranscript({ sessionExternalId, lines: [line] });
}

describe('deriveActionKey', () => {
  test('hashes runtime and toolUseId when present', () => {
    expect(
      deriveActionKey({
        runtime: 'claude_code',
        sessionExternalId: 'x',
        toolUseId: 'tool-xyz',
        sequence: 0,
      }),
    ).toBe('57042f5cae71b82bf0dadfe77556b7d5aa1adeff548873cdbbd392b9707ce147');
  });

  test('falls back to runtime, session and sequence without a toolUseId', () => {
    expect(
      deriveActionKey({
        runtime: 'claude_code',
        sessionExternalId: 'session-1',
        toolUseId: null,
        sequence: 3,
      }),
    ).toBe('a5be73a82c0c332777abbc2384ead7e8a2c5ee22e80660f56bd51bfe47af2782');
  });
});

describe('buildActionsForReplay', () => {
  test('uses the injected classifier for every action', () => {
    const { actions } = buildActionsForReplay(
      [session('s', 't', '2026-01-02T03:04:05.000Z')],
      classify,
    );
    expect(actions[0]?.operations).toEqual([STUB_OPERATION]);
  });

  test('keeps the earliest occurredAt for a duplicate actionKey', () => {
    const early = session('session-a', 'dup-1', '2026-01-02T03:04:05.001Z');
    const late = session('session-b', 'dup-1', '2026-01-02T03:04:05.999Z');
    const { actions, duplicateCount } = buildActionsForReplay([late, early], classify);
    expect(actions.length).toBe(1);
    expect(duplicateCount).toBe(1);
    expect(actions[0]?.occurredAt).toBe('2026-01-02T03:04:05.001Z');
    expect(actions[0]?.sessionExternalId).toBe('session-a');
  });

  test('breaks an occurredAt tie on the lexicographically first sessionExternalId', () => {
    const b = session('session-b', 'dup-2', '2026-01-02T03:04:05.500Z');
    const a = session('session-a', 'dup-2', '2026-01-02T03:04:05.500Z');
    const { actions, duplicateCount } = buildActionsForReplay([b, a], classify);
    expect(actions.length).toBe(1);
    expect(duplicateCount).toBe(1);
    expect(actions[0]?.sessionExternalId).toBe('session-a');
  });

  test('returns distinct actions sorted by actionKey with no duplicates', () => {
    const s1 = session('session-a', 'id-one', '2026-01-02T03:04:05.001Z');
    const s2 = session('session-a', 'id-two', '2026-01-02T03:04:05.002Z');
    const { actions, duplicateCount } = buildActionsForReplay([s1, s2], classify);
    expect(duplicateCount).toBe(0);
    expect(actions.length).toBe(2);
    const keys = actions.map((a) => a.actionKey);
    expect(keys).toEqual([...keys].sort());
  });
});
