import { expect, test } from 'vitest';
import { createMasks } from '../lib/evidence-masks.ts';

const makeMasks = () =>
  createMasks({
    programs: { 'private-script': '<local-tool-07>' },
    targets: { 'github.com/other/repo': 'repo-02', 'example.com': 'example.com' },
  });

test.each([
  ['git', 'git'],
  ['private-script', '<local-tool-07>'],
  ['another-script', '<local-tool-08>'],
  ['mcp__server__tool', '<mcp-tool-01>'],
  [null, '(none)'],
])('program %s is shown as %s', (name, label) => {
  expect(makeMasks().program(name)).toBe(label);
});

test.each([
  ['unknown', 'unknown'],
  ['origin', 'origin (unresolved)'],
  ['upstream', 'named remote (unresolved)'],
  ['github.com/other/repo', 'repo-02'],
  ['github.com/new/repo', 'repo-03'],
  ['/Users/someone/project', 'local-path-01'],
  ['example.com', 'example.com'],
  ['internal.host', 'host-01'],
])('target %s is shown as %s', (key, label) => {
  expect(makeMasks().target(key)).toBe(label);
});

test('a newly labelled name is written to the legend', () => {
  const masks = makeMasks();

  masks.target('github.com/new/repo');

  expect(masks.legend.targets['github.com/new/repo']).toBe('repo-03');
});
