import { describe, expect, test } from 'vitest';
import { foldHomePaths, homeToTilde } from '../index.ts';

describe('homeToTilde', () => {
  test.each([
    ['/Users/alice/work/repo', '~/work/repo'],
    ['/home/alice/work/repo', '~/work/repo'],
    ['/root/work/repo', '~/work/repo'],
    ['/Users/alice', '~'],
    ['/root', '~'],
    ['/rooted/work/repo', '/rooted/work/repo'],
    ['/opt/work/repo', '/opt/work/repo'],
    ['~/work/repo', '~/work/repo'],
    ['relative/path', 'relative/path'],
  ])('%s becomes %s', (input, expected) => {
    expect(homeToTilde(input)).toBe(expected);
  });
});

describe('foldHomePaths', () => {
  test.each([
    ['Users/alice', '~'],
    ['home/alice', '~'],
    ['/Users/alice/.ssh/config', '~/.ssh/config'],
    [
      "Users/alice and 1 other Target: 3 read Actions change from 'ask' to 'allow'.",
      "~ and 1 other Target: 3 read Actions change from 'ask' to 'allow'.",
    ],
    [
      "Users/alice only: 1 read Action changes from 'ask' to 'allow'.",
      "~ only: 1 read Action changes from 'ask' to 'allow'.",
    ],
    ['{"file_path":"/Users/alice/work/a.ts"}', '{"file_path":"~/work/a.ts"}'],
    ['cat /home/alice/a /Users/bob/b', 'cat ~/a ~/b'],
    ['etc/nginx', 'etc/nginx'],
    ['github.com/org/home/repo', 'github.com/org/home/repo'],
    ['cd work/home/alice', 'cd work/home/alice'],
    ['~/work/repo', '~/work/repo'],
  ])('%s is shown as %s', (input, expected) => {
    expect(foldHomePaths(input)).toBe(expected);
  });
});
