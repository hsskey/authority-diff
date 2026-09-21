import { describe, expect, expectTypeOf, test } from 'vitest';
import type { Runtime } from '@authority/action/schema';
import {
  ParsedSessionSchema,
  type DeriveActionKey,
  type ParseTranscript,
  type ParsedSession,
  type RedactText,
} from '../schema.ts';
import parsedSessionFixture from '../../../tests/fixtures/parsed-session.json' with { type: 'json' };

describe('trace schema', () => {
  test('accepts the shared synthetic Parsed Session', () => {
    expect(ParsedSessionSchema.safeParse(parsedSessionFixture).success).toBe(true);
  });

  test('rejects a timestamp without milliseconds', () => {
    expect(
      ParsedSessionSchema.safeParse({
        ...parsedSessionFixture,
        startedAt: '2026-01-02T03:04:05Z',
      }).success,
    ).toBe(false);
  });

  test('exports transcript contract signatures', () => {
    expectTypeOf<ParseTranscript>().toEqualTypeOf<(lines: readonly string[]) => ParsedSession>();
    expectTypeOf<RedactText>().toEqualTypeOf<
      (text: string) => {
        readonly text: string;
        readonly redactions: readonly { readonly kind: string; readonly count: number }[];
      }
    >();
    expectTypeOf<DeriveActionKey>().toEqualTypeOf<
      (input: {
        readonly runtime: Runtime;
        readonly sessionExternalId: string;
        readonly toolUseId: string | null;
        readonly sequence: number;
      }) => string
    >();
  });
});
