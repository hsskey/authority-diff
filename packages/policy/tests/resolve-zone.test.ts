import { describe, expect, test } from 'vitest';
import type { EnvironmentProfile, Zone } from '../schema.ts';
import { resolveZone } from '../evaluate.ts';
import { hostTarget, makeOperation, pathTarget, vcsRemoteTarget } from './support/factories.ts';
import baselinePolicyFixture from '../../../tests/fixtures/baseline-policy.json' with { type: 'json' };
import candidatePolicyFixture from '../../../tests/fixtures/candidate-policy.json' with { type: 'json' };

// A synthetic Environment that exercises every branch of the resolution order.
const ENV: EnvironmentProfile = {
  credentialPaths: ['~/.secrets/**'],
  agentConfigPaths: ['.claude/**'],
  trustedRemotes: ['trusted.example', 'trusted.example/**', 'shared.example'],
  publicRemotes: ['public.example', 'public.example/**', 'shared.example'],
  protectedBranches: ['main'],
  productionMarkers: ['\\bproduction\\b'],
};

describe('resolveZone resolution order', () => {
  // The eight ordered conditions, each isolated so only its condition fires.
  test('1 credentials wins even for a workspace path', () => {
    const op = makeOperation({ capability: 'read', target: pathTarget('~/.secrets/key', true) });
    expect(resolveZone(op, ENV)).toBe('credentials');
  });

  test('2 agent_config for an agent config path', () => {
    const op = makeOperation({
      capability: 'write',
      target: pathTarget('.claude/settings.json', true),
    });
    expect(resolveZone(op, ENV)).toBe('agent_config');
  });

  test('3 protected for a protected branch', () => {
    const op = makeOperation({
      capability: 'push',
      target: vcsRemoteTarget('trusted.example/owner/repo', 'main'),
    });
    expect(resolveZone(op, ENV)).toBe('protected');
  });

  test('4 workspace for a path inside the workspace', () => {
    const op = makeOperation({
      capability: 'write',
      target: pathTarget('~/project/file.ts', true),
    });
    expect(resolveZone(op, ENV)).toBe('workspace');
  });

  test('5 host for a path outside the workspace', () => {
    const op = makeOperation({ capability: 'write', target: pathTarget('/etc/hosts', false) });
    expect(resolveZone(op, ENV)).toBe('host');
  });

  test('6 public_remote for a public host', () => {
    const op = makeOperation({ capability: 'push', target: hostTarget('public.example') });
    expect(resolveZone(op, ENV)).toBe('public_remote');
  });

  test('7 trusted_remote for a trusted host', () => {
    const op = makeOperation({ capability: 'fetch', target: hostTarget('trusted.example') });
    expect(resolveZone(op, ENV)).toBe('trusted_remote');
  });

  test('8 unknown_remote for an unmatched remote host', () => {
    const op = makeOperation({ capability: 'push', target: hostTarget('other.example') });
    expect(resolveZone(op, ENV)).toBe('unknown_remote');
  });

  test('public_remote is checked before trusted_remote', () => {
    // shared.example is in both lists; the public check comes first.
    const op = makeOperation({ capability: 'push', target: hostTarget('shared.example') });
    expect(resolveZone(op, ENV)).toBe('public_remote');
  });
});

describe('resolveZone unknown target capability split', () => {
  test('unknown target with a local capability is host', () => {
    const op = makeOperation({ capability: 'execute', target: { kind: 'unknown' } });
    expect(resolveZone(op, ENV)).toBe('host');
  });

  test('unknown target with a network capability is unknown_remote', () => {
    const op = makeOperation({ capability: 'fetch', target: { kind: 'unknown' } });
    expect(resolveZone(op, ENV)).toBe('unknown_remote');
  });
});

describe('resolveZone production markers apply to deploy only', () => {
  test('a deploy fragment matching a production marker is protected', () => {
    const op = makeOperation({
      capability: 'deploy',
      target: { kind: 'deploy_target', label: 'staging' },
      fragment: 'kubectl apply to production cluster',
    });
    expect(resolveZone(op, ENV)).toBe('protected');
  });

  test('a non-deploy fragment matching a production marker is not protected', () => {
    const op = makeOperation({
      capability: 'execute',
      target: { kind: 'unknown' },
      fragment: 'echo production',
    });
    expect(resolveZone(op, ENV)).toBe('host');
  });
});

describe('resolveZone glob syntax', () => {
  function credentialEnv(pattern: string): EnvironmentProfile {
    return { ...ENV, credentialPaths: [pattern] };
  }
  function trustedEnv(pattern: string): EnvironmentProfile {
    return { ...ENV, credentialPaths: [], trustedRemotes: [pattern], publicRemotes: [] };
  }
  const pathZone = (pattern: string, path: string): Zone =>
    resolveZone(
      makeOperation({ capability: 'read', target: pathTarget(path, false) }),
      credentialEnv(pattern),
    );
  const remoteZone = (pattern: string, remoteKey: string): Zone =>
    resolveZone(
      makeOperation({ capability: 'push', target: vcsRemoteTarget(remoteKey, null) }),
      trustedEnv(pattern),
    );

  test('* does not cross a slash', () => {
    expect(pathZone('~/a/*', '~/a/b')).toBe('credentials');
    expect(pathZone('~/a/*', '~/a/b/c')).toBe('host');
  });

  test('** crosses a slash', () => {
    expect(pathZone('~/a/**', '~/a/b/c')).toBe('credentials');
  });

  test('? matches exactly one character', () => {
    expect(pathZone('~/a/?', '~/a/x')).toBe('credentials');
    expect(pathZone('~/a/?', '~/a/xy')).toBe('host');
  });

  test('a pattern must match the whole value', () => {
    expect(pathZone('~/abc', '~/abc')).toBe('credentials');
    expect(pathZone('~/abc', '~/abcd')).toBe('host');
    expect(pathZone('~/abc', 'x~/abc')).toBe('host');
  });

  test('path matching is case-sensitive', () => {
    expect(pathZone('~/Secret', '~/Secret')).toBe('credentials');
    expect(pathZone('~/Secret', '~/secret')).toBe('host');
  });

  test('remote values are lowercased before matching', () => {
    const op = makeOperation({ capability: 'fetch', target: hostTarget('Trusted.Example') });
    expect(
      resolveZone(op, { ...ENV, trustedRemotes: ['trusted.example'], publicRemotes: [] }),
    ).toBe('trusted_remote');
  });

  test('github.com/* does not match a three-part remote key but github.com/** does', () => {
    expect(remoteZone('github.com/*', 'github.com/owner/repo')).toBe('unknown_remote');
    expect(remoteZone('github.com/**', 'github.com/owner/repo')).toBe('trusted_remote');
  });
});

describe('resolveZone with the shared push fixture', () => {
  // The shared push Operation (tests/fixtures/action-for-replay.json).
  const pushOperation = makeOperation({
    index: 0,
    capability: 'push',
    target: vcsRemoteTarget('example.invalid/synthetic/project', 'feature/synthetic-contract'),
    program: 'git',
    fragment: 'synthetic redacted publish',
  });

  test('baseline environment resolves the push to unknown_remote', () => {
    expect(resolveZone(pushOperation, baselinePolicyFixture.environment)).toBe('unknown_remote');
  });

  test('candidate environment resolves the push to trusted_remote', () => {
    expect(resolveZone(pushOperation, candidatePolicyFixture.environment)).toBe('trusted_remote');
  });
});
