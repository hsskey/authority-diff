import { describe, expect, test } from 'vitest';
import {
  archiveMainSections,
  proseLinesWithDigits,
  replaceBlocks,
  stampVersion,
} from '../lib/evidence-doc.ts';

const doc = [
  'corpus snapshot: s (2026-01-01, 1 files, 2 Actions); classifier 0.2.2; measured 2026-01-02',
  '<!-- evidence-numbers',
  'counts.a: 1',
  '-->',
  '',
  '# Title',
  '',
  'Prose with 3 Actions.',
  '<!-- remeasure:counts -->',
  '| a | 1 |',
  '<!-- /remeasure:counts -->',
  '',
  '### Detail',
  '',
  '## Previous version: classifier 0.2.1 (not re-run)',
  '',
  'Old 5.',
  '',
].join('\n');

describe('replaceBlocks', () => {
  test('replaces a block body and keeps the prose around it', () => {
    const result = replaceBlocks(doc, new Map([['counts', '| a | 2 |']]));

    expect(result).toBe(doc.replace('| a | 1 |', '| a | 2 |'));
  });

  test('refuses a document block that nothing rendered', () => {
    expect(() => replaceBlocks(doc, new Map([['other', 'x']]))).toThrow(
      'block mismatch: missing in document [other], not rendered [counts]',
    );
  });
});

test('stampVersion reads the classifier version from the first line', () => {
  expect(stampVersion(doc)).toBe('0.2.2');
});

test('archiveMainSections freezes the main sections, without the numbers block, as the newest previous version', () => {
  const result = archiveMainSections(doc, '0.2.2');

  expect(result).toBe(
    [
      'corpus snapshot: s (2026-01-01, 1 files, 2 Actions); classifier 0.2.2; measured 2026-01-02',
      '<!-- evidence-numbers',
      'counts.a: 1',
      '-->',
      '',
      '# Title',
      '',
      'Prose with 3 Actions.',
      '<!-- remeasure:counts -->',
      '| a | 1 |',
      '<!-- /remeasure:counts -->',
      '',
      '### Detail',
      '',
      '## Previous version: classifier 0.2.2 (not re-run)',
      '',
      'Prose with 3 Actions.',
      '| a | 1 |',
      '',
      '#### Detail',
      '',
      '## Previous version: classifier 0.2.1 (not re-run)',
      '',
      'Old 5.',
      '',
    ].join('\n'),
  );
});

test('proseLinesWithDigits lists main-section prose with numbers, skipping blocks, the numbers block, and previous versions', () => {
  expect(proseLinesWithDigits(doc)).toEqual(['Prose with 3 Actions.']);
});
