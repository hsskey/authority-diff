import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  checkDocInvariance,
  compareDocShapes,
  extractDocShape,
  fixtureDir,
  INVARIANT_DOCS,
  parseDocShape,
  snapshotPathFor,
} from '../check-doc-invariance.ts';

const korean = `# Title

## 1. 한 줄

3개 항목과 15,242건.

| 번호 | 값 |
| --- | --- |
| 1 | 10 |

### 1.1 세부
`;

const english = `# Title

## 1. One line

3 items and 15,242 cases.

| no | value |
| --- | --- |
| 1 | 10 |

### 1.1 Detail
`;

describe('extractDocShape', () => {
  it('keeps numbered heading markers and ignores title prose', () => {
    expect(extractDocShape(korean).headings).toEqual(['#', '## 1', '### 1.1']);
    expect(extractDocShape('## 10. 7 days left\n').headings).toEqual(['## 10']);
  });

  it('collects every numeric token including grouped thousands', () => {
    expect(extractDocShape(korean).numbers).toEqual(['1', '1', '1', '1', '3', '10', '15,242']);
  });

  it('counts table rows excluding the separator', () => {
    expect(extractDocShape(korean).tableRowCounts).toEqual([2]);
  });
});

describe('compareDocShapes', () => {
  it('accepts a translation that keeps headings, numbers, and table rows', () => {
    expect(
      compareDocShapes(extractDocShape(korean), extractDocShape(english), 'docs/design.md'),
    ).toEqual({
      ok: true,
    });
  });

  it('accepts a structure-preserving reorder of leading-zero and plain-digit tokens', () => {
    const original = '# Title\n\nSee ADR-0009 and item 9, then ADR-0011 and value 11.\n';
    const reordered = '# Title\n\nSee item 9 and ADR-0009, then value 11 and ADR-0011.\n';

    expect(
      compareDocShapes(extractDocShape(original), extractDocShape(reordered), 'docs/design.md'),
    ).toEqual({ ok: true });
  });

  it('rejects a missing numbered heading', () => {
    const after = english.replace('### 1.1 Detail\n', '');
    const result = compareDocShapes(
      extractDocShape(korean),
      extractDocShape(after),
      'docs/cutline.md',
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.failures).toContain('docs/cutline.md: heading list changed');
  });

  it('rejects a changed number', () => {
    const after = english.replace('15,242', '15,243');
    const result = compareDocShapes(
      extractDocShape(korean),
      extractDocShape(after),
      'docs/design.md',
    );

    expect(result).toEqual({
      ok: false,
      failures: ['docs/design.md: extracted numeric set changed'],
    });
  });

  it('rejects a dropped table data row', () => {
    const after = english.replace('| 1 | 10 |\n', '');
    const result = compareDocShapes(
      extractDocShape(korean),
      extractDocShape(after),
      'docs/cutline.md',
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.failures).toContain('docs/cutline.md: table row counts changed');
  });
});

describe('checkDocInvariance', () => {
  it('reports each document whose shape drifted from its snapshot', () => {
    const snapshot = extractDocShape(korean);
    const result = checkDocInvariance([
      { path: 'docs/design.md', text: english, snapshot },
      { path: 'docs/cutline.md', text: english.replace('## 1.', '## 2.'), snapshot },
    ]);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.failures).toContain('docs/cutline.md: heading list changed');
  });
});

describe('parseDocShape', () => {
  it('rejects a snapshot missing tableRowCounts', () => {
    expect(() => parseDocShape('{"headings":[],"numbers":[]}')).toThrow(
      'invalid doc shape snapshot',
    );
  });
});

describe('design.md and cutline.md snapshots', () => {
  it('hold the heading list and extracted numeric set of those two documents', () => {
    const root = join(fileURLToPath(import.meta.url), '../../..');
    const fixtures = fixtureDir(root);
    const result = checkDocInvariance(
      INVARIANT_DOCS.map((path) => ({
        path,
        text: readFileSync(join(root, path), 'utf8'),
        snapshot: parseDocShape(readFileSync(snapshotPathFor(path, fixtures), 'utf8')),
      })),
    );

    expect(result).toEqual({ ok: true });
  });
});
