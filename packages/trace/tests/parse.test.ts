import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import { parseTranscript } from '../client.ts';

function assistantLine(input: {
  readonly id: string | null;
  readonly name: string;
  readonly toolInput: unknown;
  readonly timestamp?: string;
  readonly isSidechain?: boolean;
  readonly cwd?: string;
  readonly gitBranch?: string;
  readonly version?: string;
}): string {
  const block: Record<string, unknown> = {
    type: 'tool_use',
    name: input.name,
    input: input.toolInput,
  };
  if (input.id !== null) {
    block.id = input.id;
  }
  const line: Record<string, unknown> = {
    type: 'assistant',
    cwd: input.cwd ?? '/Users/synth/proj',
    gitBranch: input.gitBranch ?? 'feature/synthetic',
    version: input.version ?? '9.9.9-synthetic',
    isSidechain: input.isSidechain ?? false,
    message: { role: 'assistant', content: [block] },
  };
  if (input.timestamp !== undefined) {
    line.timestamp = input.timestamp;
  }
  return JSON.stringify(line);
}

function resultLine(toolUseId: string, isError: boolean, content: unknown): string {
  return JSON.stringify({
    type: 'user',
    timestamp: '2026-01-02T03:04:09.000Z',
    message: {
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: toolUseId, is_error: isError, content }],
    },
  });
}

const FIXTURE = readFileSync(
  fileURLToPath(new URL('./fixtures/canaries.jsonl', import.meta.url)),
  'utf8',
);

const RAW_CANARIES: readonly string[] = [
  'ghp_SYNTHETICCANARY000000000',
  'sk-ant-SYNTHETICCANARY0000',
  'sk-SYNTHETICCANARY0000000',
  'AKIASYNTHETIC0000000',
  'xoxb-SYNTHETIC-CANARY-000',
  'glpat-SYNTHETICCANARY00000',
  'npm_SYNTHETICCANARY000000000000000',
  'SYNTHBEARERTOKEN0001',
  'synthuser:synthpass',
  'syntheticvalue0001',
  'SYNTHKEYLINE0001',
  'eyJSYNTHHEADER0.eyJSYNTHPAYLOAD0.SYNTHSIGNATURE0',
];

const ALL_KINDS: readonly string[] = [
  'anthropic_key',
  'aws_access_key',
  'bearer_header',
  'github_token',
  'gitlab_token',
  'jwt',
  'npm_token',
  'openai_key',
  'private_key_block',
  'secret_assignment',
  'slack_token',
  'url_userinfo',
];

describe('parseTranscript canary fixture', () => {
  const lines = FIXTURE.split('\n');
  const parsed = parseTranscript({ sessionExternalId: 'canary-session', lines });
  const serialized = JSON.stringify(parsed);

  test.each(RAW_CANARIES)('serialized output contains no raw canary %s', (secret) => {
    expect(serialized.includes(secret)).toBe(false);
  });

  test('records every redaction kind exactly once', () => {
    expect(parsed.redactions).toEqual(ALL_KINDS.map((kind) => ({ kind, count: 1 })));
  });

  test('normalizes the home cwd to a tilde', () => {
    expect(parsed.workspaceRoot).toBe('~/proj');
  });

  test('keeps every non-tool line in the total but produces one call per tool_use', () => {
    expect(parsed.totalLineCount).toBe(13);
    expect(parsed.toolCalls.length).toBe(12);
    expect(parsed.unparsedLineCount).toBe(0);
  });
});

describe('parseTranscript observed outcome', () => {
  const lines = [
    assistantLine({
      id: 'a-exec',
      name: 'Bash',
      toolInput: { command: 'ls' },
      timestamp: '2026-01-02T03:04:05.001Z',
    }),
    resultLine('a-exec', false, 'ok'),
    assistantLine({
      id: 'a-fail',
      name: 'Bash',
      toolInput: { command: 'false' },
      timestamp: '2026-01-02T03:04:05.002Z',
    }),
    resultLine('a-fail', true, 'Exit code 1'),
    assistantLine({
      id: 'a-reject',
      name: 'Bash',
      toolInput: { command: 'rm x' },
      timestamp: '2026-01-02T03:04:05.003Z',
    }),
    resultLine(
      'a-reject',
      true,
      "The user doesn't want to proceed with this tool use. The tool use was rejected (eg. if it was a file edit).",
    ),
    assistantLine({
      id: 'a-block',
      name: 'Bash',
      toolInput: { command: 'sleep 99' },
      timestamp: '2026-01-02T03:04:05.004Z',
    }),
    resultLine('a-block', true, '<tool_use_error>Blocked: sleep 99</tool_use_error>'),
    assistantLine({
      id: 'a-unknown',
      name: 'Bash',
      toolInput: { command: 'pending' },
      timestamp: '2026-01-02T03:04:05.005Z',
    }),
  ];
  const parsed = parseTranscript({ sessionExternalId: 'outcome-session', lines });
  const outcomeById = new Map(parsed.toolCalls.map((c) => [c.toolUseId, c.observedOutcome]));

  test('a plain tool_result is executed', () => {
    expect(outcomeById.get('a-exec')).toBe('executed');
  });
  test('an is_error command failure is still executed', () => {
    expect(outcomeById.get('a-fail')).toBe('executed');
  });
  test('a refusal marker is rejected_by_human', () => {
    expect(outcomeById.get('a-reject')).toBe('rejected_by_human');
  });
  test('a runtime block marker is blocked_by_runtime', () => {
    expect(outcomeById.get('a-block')).toBe('blocked_by_runtime');
  });
  test('a missing tool_result is unknown', () => {
    expect(outcomeById.get('a-unknown')).toBe('unknown');
  });
});

describe('parseTranscript tool input', () => {
  test('Bash keeps the redacted command string, not canonical JSON', () => {
    const parsed = parseTranscript({
      sessionExternalId: 's',
      lines: [
        assistantLine({
          id: 't',
          name: 'Bash',
          toolInput: { command: 'echo hi', extra: 'ignored' },
          timestamp: '2026-01-02T03:04:05.000Z',
        }),
      ],
    });
    expect(parsed.toolCalls[0]?.toolInputRedacted).toBe('echo hi');
  });

  test('a non-Bash tool is canonical JSON with sorted keys', () => {
    const parsed = parseTranscript({
      sessionExternalId: 's',
      lines: [
        assistantLine({
          id: 't',
          name: 'WebFetch',
          toolInput: { b: 1, a: 2 },
          timestamp: '2026-01-02T03:04:05.000Z',
        }),
      ],
    });
    expect(parsed.toolCalls[0]?.toolInputRedacted).toBe('{"a":2,"b":1}');
  });

  test('a string value over 500 chars is elided and is not truncation', () => {
    const parsed = parseTranscript({
      sessionExternalId: 's',
      lines: [
        assistantLine({
          id: 't',
          name: 'WriteFile',
          toolInput: { body: 'x'.repeat(600) },
          timestamp: '2026-01-02T03:04:05.000Z',
        }),
      ],
    });
    const call = parsed.toolCalls[0];
    expect(call?.toolInputRedacted).toContain('__ELIDED_600__');
    expect(call?.isInputTruncated).toBe(false);
  });

  test('a final string over 16000 chars sets isInputTruncated', () => {
    const parsed = parseTranscript({
      sessionExternalId: 's',
      lines: [
        assistantLine({
          id: 't',
          name: 'Bash',
          toolInput: { command: 'y'.repeat(17000) },
          timestamp: '2026-01-02T03:04:05.000Z',
        }),
      ],
    });
    const call = parsed.toolCalls[0];
    expect(call?.toolInputRedacted.length).toBe(16000);
    expect(call?.isInputTruncated).toBe(true);
  });

  test('masks prefix-free credential values under secret-named keys as key_masked', () => {
    const parsed = parseTranscript({
      sessionExternalId: 's',
      lines: [
        assistantLine({
          id: 't',
          name: 'McpNotify',
          toolInput: { password: 'hunter2synthetic0001', apiKey: 'randomsynth7654321' },
          timestamp: '2026-01-02T03:04:05.000Z',
        }),
      ],
    });
    const redacted = parsed.toolCalls[0]?.toolInputRedacted ?? '';
    expect(redacted.includes('hunter2synthetic0001')).toBe(false);
    expect(redacted.includes('randomsynth7654321')).toBe(false);
    expect(JSON.parse(redacted)).toEqual({
      apiKey: '__REDACTED_KEY_APIKEY__',
      password: '__REDACTED_KEY_PASSWORD__',
    });
    expect(parsed.redactions).toContainEqual({ kind: 'key_masked', count: 2 });
  });

  test('redacts a large single-token command in linear time and leaves no credential match', () => {
    const command = 'a'.repeat(400000);
    const started = performance.now();
    const parsed = parseTranscript({
      sessionExternalId: 's',
      lines: [
        assistantLine({
          id: 't',
          name: 'Bash',
          toolInput: { command },
          timestamp: '2026-01-02T03:04:05.000Z',
        }),
      ],
    });
    const elapsedMs = performance.now() - started;
    const call = parsed.toolCalls[0];
    expect(call?.isInputTruncated).toBe(true);
    expect(call?.toolInputRedacted.length).toBe(16000);
    expect(parsed.redactions).toEqual([]);
    expect(elapsedMs).toBeLessThan(5000);
  });
});

describe('parseTranscript structural credential masking', () => {
  function maskedInput(toolInput: unknown): {
    redacted: string;
    parsed: ReturnType<typeof parseTranscript>;
  } {
    const parsed = parseTranscript({
      sessionExternalId: 's',
      lines: [
        assistantLine({
          id: 't',
          name: 'McpTool',
          toolInput,
          timestamp: '2026-01-02T03:04:05.000Z',
        }),
      ],
    });
    return { redacted: parsed.toolCalls[0]?.toolInputRedacted ?? '', parsed };
  }

  test('masks an array value under a credential-named key and stays valid JSON', () => {
    const { redacted, parsed } = maskedInput({ apiTokens: ['realsecretAAA', 'realsecretBBB'] });
    expect(redacted.includes('realsecretAAA')).toBe(false);
    expect(redacted.includes('realsecretBBB')).toBe(false);
    expect(JSON.parse(redacted)).toEqual({ apiTokens: '__REDACTED_KEY_APITOKENS__' });
    expect(parsed.redactions).toContainEqual({ kind: 'key_masked', count: 1 });
  });

  test('masks an object value nested under a credential-named key', () => {
    const { redacted, parsed } = maskedInput({ auth: { password: 'plainsecretx' } });
    expect(redacted.includes('plainsecretx')).toBe(false);
    expect(JSON.parse(redacted)).toEqual({ auth: { password: '__REDACTED_KEY_PASSWORD__' } });
    expect(parsed.redactions).toContainEqual({ kind: 'key_masked', count: 1 });
  });

  test('masks a credential-named key three levels deep', () => {
    const { redacted } = maskedInput({ level1: { level2: { sessionToken: 'buried999' } } });
    expect(redacted.includes('buried999')).toBe(false);
    expect(JSON.parse(redacted)).toEqual({
      level1: { level2: { sessionToken: '__REDACTED_KEY_SESSIONTOKEN__' } },
    });
  });

  test('never masks excluded path or command keys, only the sibling credential key', () => {
    const { redacted } = maskedInput({
      file_path: '/tmp/synthetic.txt',
      path: '/tmp',
      command: 'run --now',
      apiKey: 'realsecretZZZ',
    });
    expect(redacted.includes('realsecretZZZ')).toBe(false);
    expect(JSON.parse(redacted)).toEqual({
      apiKey: '__REDACTED_KEY_APIKEY__',
      command: 'run --now',
      file_path: '/tmp/synthetic.txt',
      path: '/tmp',
    });
  });
});

describe('parseTranscript NUL stripping', () => {
  test('strips a NUL character from a Bash command before redaction', () => {
    const parsed = parseTranscript({
      sessionExternalId: 'nul-session',
      lines: [
        assistantLine({
          id: 't',
          name: 'Bash',
          toolInput: { command: 'printf a\x00b' },
          timestamp: '2026-01-02T03:04:05.000Z',
        }),
      ],
    });
    expect(parsed.toolCalls[0]?.toolInputRedacted).toBe('printf ab');
    expect(parsed.toolCalls[0]?.toolInputRedacted.includes('\0')).toBe(false);
  });

  test('strips NUL from a non-Bash tool input before canonicalization', () => {
    const parsed = parseTranscript({
      sessionExternalId: 'nul-session',
      lines: [
        assistantLine({
          id: 'join',
          name: 'Write',
          toolInput: { body: 'before\u0000after' },
          timestamp: '2026-01-02T03:04:05.000Z',
        }),
      ],
    });
    expect(parsed.toolCalls[0]?.toolInputRedacted.includes('\0')).toBe(false);
    expect(JSON.parse(parsed.toolCalls[0]?.toolInputRedacted ?? '{}')).toEqual({
      body: 'beforeafter',
    });
  });
});

describe('parseTranscript line handling', () => {
  test('assigns sequence in tool_use appearance order', () => {
    const multi = JSON.stringify({
      type: 'assistant',
      timestamp: '2026-01-02T03:04:05.000Z',
      cwd: '/Users/synth/proj',
      gitBranch: 'b',
      version: 'v',
      isSidechain: false,
      message: {
        role: 'assistant',
        content: [
          { type: 'tool_use', id: 'first', name: 'Bash', input: { command: 'a' } },
          { type: 'tool_use', id: 'second', name: 'Bash', input: { command: 'b' } },
        ],
      },
    });
    const parsed = parseTranscript({ sessionExternalId: 's', lines: [multi] });
    expect(parsed.toolCalls.map((c) => c.sequence)).toEqual([0, 1]);
    expect(parsed.toolCalls.map((c) => c.toolUseId)).toEqual(['first', 'second']);
  });

  test('records isSidechain from the tool_use line', () => {
    const parsed = parseTranscript({
      sessionExternalId: 's',
      lines: [
        assistantLine({
          id: 't',
          name: 'Bash',
          toolInput: { command: 'x' },
          timestamp: '2026-01-02T03:04:05.000Z',
          isSidechain: true,
        }),
      ],
    });
    expect(parsed.toolCalls[0]?.isSidechain).toBe(true);
  });

  test('normalizes timestamps to three millisecond digits', () => {
    const parsed = parseTranscript({
      sessionExternalId: 's',
      lines: [
        assistantLine({
          id: 't',
          name: 'Bash',
          toolInput: { command: 'x' },
          timestamp: '2026-01-02T03:04:05.1Z',
        }),
      ],
    });
    expect(parsed.toolCalls[0]?.occurredAt).toBe('2026-01-02T03:04:05.100Z');
    expect(parsed.startedAt).toBe('2026-01-02T03:04:05.100Z');
  });

  test('counts malformed JSON as unparsed', () => {
    const parsed = parseTranscript({ sessionExternalId: 's', lines: ['{not json', '  ', '{}'] });
    expect(parsed.totalLineCount).toBe(2);
    expect(parsed.unparsedLineCount).toBe(1);
  });

  test('a tool_use line without a timestamp is unparsed and dropped', () => {
    const parsed = parseTranscript({
      sessionExternalId: 's',
      lines: [assistantLine({ id: 't', name: 'Bash', toolInput: { command: 'x' } })],
    });
    expect(parsed.toolCalls.length).toBe(0);
    expect(parsed.unparsedLineCount).toBe(1);
  });

  test('startedAt and endedAt are null when no line has a timestamp', () => {
    const parsed = parseTranscript({
      sessionExternalId: 's',
      lines: [JSON.stringify({ type: 'summary', summary: 's' })],
    });
    expect(parsed.startedAt).toBeNull();
    expect(parsed.endedAt).toBeNull();
  });

  test('property: never throws on arbitrary line arrays', () => {
    fc.assert(
      fc.property(fc.array(fc.string()), (lines) => {
        parseTranscript({ sessionExternalId: 'p', lines });
        return true;
      }),
    );
  });
});
