import { describe, expect, it } from 'vitest';

import { koreanTextFailures } from '../check-korean-text.ts';

// Code points keep this file itself free of Korean text; the formatter unescapes string escapes.
const WORD = String.fromCodePoint(0xd55c, 0xae00);
const OTHER_WORD = String.fromCodePoint(0xac80, 0xd1a0);
const MARKER = '<!-- ko-product-output -->';

describe('koreanTextFailures', () => {
  it('reports each Korean line of a file outside the allowlist', () => {
    const files = [{ path: 'docs/guide.md', content: `# Guide\n\nPress ${WORD}.\n\n${WORD}\n` }];
    expect(koreanTextFailures(files)).toEqual([
      'docs/guide.md:3: Korean text outside the allowlist',
      'docs/guide.md:5: Korean text outside the allowlist',
    ]);
  });

  it('accepts a file with no Korean text', () => {
    expect(koreanTextFailures([{ path: 'docs/guide.md', content: 'Press Save.\n' }])).toEqual([]);
  });

  it.each([
    'README.ko.md',
    'apps/web/src/shared/i18n/ko.ts',
    'scripts/tests/check-i18n-keys.test.ts',
  ])('accepts Korean text anywhere in %s', (path) => {
    expect(koreanTextFailures([{ path, content: `${WORD} and ${OTHER_WORD}\n` }])).toEqual([]);
  });

  it('accepts Korean text in a web e2e spec', () => {
    const path = 'apps/web/tests/e2e/overview.spec.ts';
    expect(koreanTextFailures([{ path, content: `getByText('${WORD}')\n` }])).toEqual([]);
  });

  it.each([
    'apps/web/tests/e2e/fixtures.ts',
    'apps/web/tests/e2e/nested/overview.spec.ts',
    'apps/web/tests/overview.spec.ts',
    'packages/replay/tests/overview.spec.ts',
  ])('reports the same Korean e2e line in %s', (path) => {
    expect(koreanTextFailures([{ path, content: `getByText('${WORD}')\n` }])).toEqual([
      `${path}:1: Korean text outside the allowlist`,
    ]);
  });

  it.each([
    { case: 'a marked quotation', line: `Press ${MARKER}"${WORD} ${OTHER_WORD}".` },
    { case: 'a marked quotation with Latin words', line: `Press ${MARKER}"Gate ${WORD}" now.` },
    { case: 'a marked unquoted run', line: `Status ${MARKER}${WORD} ${OTHER_WORD}, then done.` },
    { case: 'one marker per run', line: `"${MARKER}${WORD} group 2${MARKER}${OTHER_WORD}"` },
    { case: 'adjacent marked runs', line: `"${MARKER}${WORD}: ${MARKER}${OTHER_WORD}"` },
  ])('accepts $case of product output', ({ line }) => {
    expect(koreanTextFailures([{ path: 'docs/demo.md', content: line }])).toEqual([]);
  });

  it.each([
    { case: 'an unmarked quotation', line: `Press "${WORD}".` },
    { case: 'a run after a Latin word', line: `Status ${MARKER}${WORD} group ${OTHER_WORD}.` },
    { case: 'a run after a digit', line: `${MARKER}${WORD} 12 ${OTHER_WORD}` },
    { case: 'a misspelled marker', line: `<!-- product-output -->"${WORD}"` },
  ])('reports $case', ({ line }) => {
    expect(koreanTextFailures([{ path: 'docs/demo.md', content: line }])).toEqual([
      'docs/demo.md:1: Korean text outside the allowlist',
    ]);
  });

  it('accepts Korean in parentheses on a glossary _Avoid_ line', () => {
    const content = `**Session**:\n_Avoid_: conversation (${WORD}), run (${OTHER_WORD})\n`;
    expect(koreanTextFailures([{ path: 'CONTEXT.md', content }])).toEqual([]);
  });

  it.each([
    { case: 'outside parentheses on an _Avoid_ line', line: `_Avoid_: conversation, ${WORD}` },
    { case: 'in parentheses on another glossary line', line: `A Session (${WORD}) is one run.` },
  ])('reports glossary Korean $case', ({ line }) => {
    expect(koreanTextFailures([{ path: 'CONTEXT.md', content: line }])).toEqual([
      'CONTEXT.md:1: Korean text outside the allowlist',
    ]);
  });

  it('reports parentheses on an _Avoid_ line outside the glossary', () => {
    const content = `_Avoid_: conversation (${WORD})`;
    expect(koreanTextFailures([{ path: 'docs/design.md', content }])).toEqual([
      'docs/design.md:1: Korean text outside the allowlist',
    ]);
  });
});
