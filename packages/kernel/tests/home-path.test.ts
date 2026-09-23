import { describe, expect, test } from 'vitest';
import { homeToTilde } from '../index.ts';

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
