import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import { redactText } from '../client.ts';

interface KindCase {
  readonly kind: string;
  readonly secret: string;
  readonly marker: string;
  // The sensitive material that must never survive; for context-bound kinds it
  // is the embedded token, otherwise the whole secret.
  readonly sensitive: string;
}

const CASES: readonly KindCase[] = [
  {
    kind: 'github_token',
    secret: 'ghp_SYNTHETICCANARY000000000',
    marker: '__REDACTED_GITHUB_TOKEN__',
    sensitive: 'ghp_SYNTHETICCANARY000000000',
  },
  {
    kind: 'anthropic_key',
    secret: 'sk-ant-SYNTHETICCANARY0000',
    marker: '__REDACTED_ANTHROPIC_KEY__',
    sensitive: 'sk-ant-SYNTHETICCANARY0000',
  },
  {
    kind: 'openai_key',
    secret: 'sk-SYNTHETICCANARY0000000',
    marker: '__REDACTED_OPENAI_KEY__',
    sensitive: 'sk-SYNTHETICCANARY0000000',
  },
  {
    kind: 'aws_access_key',
    secret: 'AKIASYNTHETIC0000000',
    marker: '__REDACTED_AWS_ACCESS_KEY__',
    sensitive: 'AKIASYNTHETIC0000000',
  },
  {
    kind: 'slack_token',
    secret: 'xoxb-SYNTHETIC-CANARY-000',
    marker: '__REDACTED_SLACK_TOKEN__',
    sensitive: 'xoxb-SYNTHETIC-CANARY-000',
  },
  {
    kind: 'gitlab_token',
    secret: 'glpat-SYNTHETICCANARY00000',
    marker: '__REDACTED_GITLAB_TOKEN__',
    sensitive: 'glpat-SYNTHETICCANARY00000',
  },
  {
    kind: 'npm_token',
    secret: 'npm_SYNTHETICCANARY000000000000000',
    marker: '__REDACTED_NPM_TOKEN__',
    sensitive: 'npm_SYNTHETICCANARY000000000000000',
  },
  {
    kind: 'bearer_header',
    secret: 'Authorization: Bearer SYNTHBEARERTOKEN0001',
    marker: '__REDACTED_BEARER_HEADER__',
    sensitive: 'SYNTHBEARERTOKEN0001',
  },
  {
    kind: 'url_userinfo',
    secret: 'https://synthuser:synthpass@example.invalid/x',
    marker: '__REDACTED_URL_USERINFO__',
    sensitive: 'synthuser:synthpass',
  },
  {
    kind: 'secret_assignment',
    secret: 'MY_SECRET_TOKEN=syntheticvalue0001',
    marker: '__REDACTED_SECRET_ASSIGNMENT__',
    sensitive: 'syntheticvalue0001',
  },
  {
    kind: 'private_key_block',
    secret:
      '-----BEGIN SYNTHETIC PRIVATE KEY-----\nSYNTHKEYLINE0001\n-----END SYNTHETIC PRIVATE KEY-----',
    marker: '__REDACTED_PRIVATE_KEY_BLOCK__',
    sensitive: 'SYNTHKEYLINE0001',
  },
  {
    kind: 'jwt',
    secret: 'eyJSYNTHHEADER0.eyJSYNTHPAYLOAD0.SYNTHSIGNATURE0',
    marker: '__REDACTED_JWT__',
    sensitive: 'eyJSYNTHHEADER0.eyJSYNTHPAYLOAD0.SYNTHSIGNATURE0',
  },
];

describe('redactText per kind', () => {
  test.each(CASES)(
    'replaces $kind with its marker and scrubs the secret',
    ({ kind, secret, marker, sensitive }) => {
      const { text, redactions } = redactText(`before ${secret} after`);
      expect(text).toContain(marker);
      expect(text.includes(sensitive)).toBe(false);
      expect(redactions).toContainEqual({ kind, count: 1 });
    },
  );
});

describe('redactText invariants', () => {
  test('every replacement marker uses only uppercase, digit, underscore', () => {
    const combined = CASES.map((c) => c.secret).join(' ');
    const { text } = redactText(combined);
    const markers = text.match(/__REDACTED_[A-Za-z0-9_]+__/g) ?? [];
    expect(markers.length).toBe(CASES.length);
    for (const marker of markers) {
      expect(marker).toMatch(/^__REDACTED_[A-Z0-9_]+__$/);
    }
  });

  test('never drops a line', () => {
    const input = 'line1 ghp_SYNTHETICCANARY000000000\nline2\nline3 sk-SYNTHETICCANARY0000000';
    const { text } = redactText(input);
    expect(text.split('\n').length).toBe(3);
  });

  test('is idempotent in text and stops counting on the second pass', () => {
    const input = CASES.map((c) => c.secret).join('\n');
    const first = redactText(input);
    const second = redactText(first.text);
    expect(second.text).toBe(first.text);
    expect(second.redactions).toEqual([]);
  });

  test.each(['KEY="value":extra', "TOKEN='abc':tail"])(
    'a quoted value followed by a colon redacts once and stays idempotent: %s',
    (input) => {
      const first = redactText(input);
      const second = redactText(first.text);
      expect(first.text).toContain('__REDACTED_SECRET_ASSIGNMENT__');
      expect(first.text.endsWith(input.split(':').pop() ?? '')).toBe(true);
      expect(second.text).toBe(first.text);
      expect(second.redactions).toEqual([]);
    },
  );

  test('redactions are sorted by kind', () => {
    const { redactions } = redactText(CASES.map((c) => c.secret).join(' '));
    const kinds = redactions.map((r) => r.kind);
    expect(kinds).toEqual([...kinds].sort());
  });

  test('property: idempotent on arbitrary text', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const once = redactText(input).text;
        return redactText(once).text === once;
      }),
    );
  });
});
