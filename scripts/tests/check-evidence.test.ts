import { describe, expect, it } from 'vitest';

import { checkEvidence } from '../check-evidence.ts';

const makeDoc = ({
  path = 'docs/evidence/a.md',
  stamp = 'classifier 0.2.3',
  numbers = ['adoption.allow: 15,242'],
  body = ['Allowed 15,242 Actions.'],
}: {
  readonly path?: string;
  readonly stamp?: string | null;
  readonly numbers?: readonly string[] | null;
  readonly body?: readonly string[];
} = {}): { path: string; text: string } => ({
  path,
  text: [
    ...(stamp === null
      ? []
      : [`corpus snapshot: s (2026-01-01, 1 files, 2 Actions); ${stamp}; measured 2026-01-02`]),
    ...(numbers === null ? [] : ['<!-- evidence-numbers', ...numbers, '-->']),
    '',
    '# Title',
    '',
    ...body,
    '',
  ].join('\n'),
});

describe('checkEvidence', () => {
  it('accepts documents that state the same number on the same classifier version', () => {
    const result = checkEvidence([makeDoc(), makeDoc({ path: 'docs/evidence/b.md' })]);

    expect(result).toEqual({ ok: true });
  });

  it('reports a key whose value differs between two documents on the same classifier version', () => {
    const result = checkEvidence([
      makeDoc(),
      makeDoc({
        path: 'docs/evidence/b.md',
        numbers: ['adoption.allow: 8,217'],
        body: ['Allowed 8,217 Actions.'],
      }),
    ]);

    expect(result).toEqual({
      ok: false,
      failures: [
        'adoption.allow on classifier 0.2.3: docs/evidence/a.md says 15,242, docs/evidence/b.md says 8,217',
      ],
    });
  });

  it('compares nothing between documents on different classifier versions', () => {
    const result = checkEvidence([
      makeDoc(),
      makeDoc({
        path: 'docs/evidence/b.md',
        stamp: 'classifier 0.2.2',
        numbers: ['adoption.allow: 8,217'],
        body: ['Allowed 8,217 Actions.'],
      }),
    ]);

    expect(result).toEqual({ ok: true });
  });

  it('compares the numbers of a comparison stamp under its later version', () => {
    const result = checkEvidence([
      makeDoc(),
      makeDoc({
        path: 'docs/evidence/b.md',
        stamp: 'classifier 0.2.2 → 0.2.3',
        numbers: ['adoption.allow: 8,217'],
        body: ['Allowed 8,217 Actions.'],
      }),
    ]);

    expect(result).toEqual({
      ok: false,
      failures: [
        'adoption.allow on classifier 0.2.3: docs/evidence/a.md says 15,242, docs/evidence/b.md says 8,217',
      ],
    });
  });

  it('takes the version of an unstamped document from its classifier key', () => {
    const result = checkEvidence([
      makeDoc(),
      makeDoc({
        path: 'README.md',
        stamp: null,
        numbers: ['classifier: 0.2.3', 'adoption.allow: 8,217'],
        body: ['With classifier 0.2.3, 8,217 allowed.'],
      }),
    ]);

    expect(result).toEqual({
      ok: false,
      failures: [
        'adoption.allow on classifier 0.2.3: docs/evidence/a.md says 15,242, README.md says 8,217',
      ],
    });
  });

  it.each([
    {
      name: 'stated only under "Previous version"',
      body: ['Allowed 8,217.', '', '## Previous version: classifier 0.2.2', '', 'Allowed 15,242.'],
    },
    { name: 'stated only as part of a longer number', body: ['Allowed 115,242 and 15,2420.'] },
  ])('reports a declared number $name', ({ body }) => {
    const result = checkEvidence([makeDoc({ body })]);

    expect(result).toEqual({
      ok: false,
      failures: [
        'docs/evidence/a.md: adoption.allow is 15,242 in evidence-numbers but not in the main sections',
      ],
    });
  });

  it('finds a declared short hash as the full sha256 it abbreviates', () => {
    const result = checkEvidence([
      makeDoc({
        numbers: ['gate2.a-vs-b.resultHash: 2c4577fa…a8d9'],
        body: [`| A vs B | \`2c4577fa${'0'.repeat(52)}a8d9\` |`],
      }),
    ]);

    expect(result).toEqual({ ok: true });
  });

  it('reports a declared short hash whose ending differs from the one in the main sections', () => {
    const result = checkEvidence([
      makeDoc({
        numbers: ['gate2.a-vs-b.resultHash: 2c4577fa…a8d9'],
        body: ['resultHash `2c4577fa…c08b`'],
      }),
    ]);

    expect(result).toEqual({
      ok: false,
      failures: [
        'docs/evidence/a.md: gate2.a-vs-b.resultHash is 2c4577fa…a8d9 in evidence-numbers but not in the main sections',
      ],
    });
  });

  it('reports another classifier version named in the main sections, with its line', () => {
    const result = checkEvidence([
      makeDoc({ numbers: null, body: ['Measured on **classifier 0.2.2**.'] }),
    ]);

    expect(result).toEqual({
      ok: false,
      failures: [
        'docs/evidence/a.md:5: classifier 0.2.2 outside a "Previous version" section of a classifier 0.2.3 document',
      ],
    });
  });

  it('accepts other classifier versions under "Previous version" and both versions of a comparison stamp', () => {
    const result = checkEvidence([
      makeDoc({
        stamp: 'classifier 0.2.2 → 0.2.3',
        numbers: null,
        body: [
          'From classifier 0.2.2 to classifier 0.2.3.',
          '',
          '## Previous version: classifier 0.2.1',
          '',
          'On classifier 0.2.1.',
        ],
      }),
    ]);

    expect(result).toEqual({ ok: true });
  });

  it.each([
    {
      name: 'a numbers block without a classifier version',
      doc: makeDoc({ stamp: null }),
      failure:
        'docs/evidence/a.md: evidence-numbers needs a classifier version in the stamp or the block',
    },
    {
      name: 'a classifier key that differs from the stamp',
      doc: makeDoc({ numbers: ['classifier: 0.2.2'], body: ['classifier 0.2.3, not 0.2.2'] }),
      failure: 'docs/evidence/a.md: evidence-numbers classifier 0.2.2 differs from the stamp',
    },
    {
      name: 'a line that is not "key: value"',
      doc: makeDoc({ numbers: ['adoption allow 15,242'] }),
      failure:
        'docs/evidence/a.md: evidence-numbers line is not "key: value": adoption allow 15,242',
    },
    {
      name: 'a key declared twice',
      doc: makeDoc({ numbers: ['adoption.allow: 15,242', 'adoption.allow: 15,242'] }),
      failure: 'docs/evidence/a.md: evidence-numbers declares adoption.allow twice',
    },
  ])('reports $name', ({ doc, failure }) => {
    const result = checkEvidence([doc]);

    expect(result).toEqual({ ok: false, failures: [failure] });
  });
});
