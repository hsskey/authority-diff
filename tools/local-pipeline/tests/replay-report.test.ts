import { expect, test } from 'vitest';
import type { DiffResult } from '@authority/replay/schema';
import { renderReplayMarkdown } from '../lib/replay-report.ts';

const HASH = 'a'.repeat(64);

const nineTransitions = [
  { from: 'allow', to: 'allow', count: 0 },
  { from: 'allow', to: 'ask', count: 0 },
  { from: 'allow', to: 'deny', count: 0 },
  { from: 'ask', to: 'allow', count: 0 },
  { from: 'ask', to: 'ask', count: 1 },
  { from: 'ask', to: 'deny', count: 0 },
  { from: 'deny', to: 'allow', count: 0 },
  { from: 'deny', to: 'ask', count: 0 },
  { from: 'deny', to: 'deny', count: 0 },
] as const;

test('replay.md lists operation-level widening when Action effect is unchanged', () => {
  const diff: DiffResult = {
    stats: {
      totalActions: 1,
      evaluatedActions: 1,
      excludedActions: 0,
      changedActions: 0,
      transitions: [...nineTransitions],
      operationWidening: [
        { capability: 'push', fromZone: 'public_remote', toZone: 'trusted_remote', count: 1 },
        { capability: 'push', fromZone: 'unknown_remote', toZone: 'trusted_remote', count: 2 },
      ],
    },
    groups: [],
    changedActions: [],
    resultHash: HASH,
  };

  const markdown = renderReplayMarkdown({
    diff,
    actions: [],
    baselineContentHash: HASH,
    candidateContentHash: HASH,
  });

  expect(markdown).toContain('## Action effect unchanged, operation-level widening');
  expect(markdown).toContain('| push | unknown_remote | trusted_remote | 2 |');
  expect(markdown).toContain('| push | public_remote | trusted_remote | 1 |');
});
