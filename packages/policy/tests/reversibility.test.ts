import { describe, expect, test } from 'vitest';
import type { Capability } from '@authority/action/schema';
import type { Reversibility, Zone } from '../schema.ts';
import { REVERSIBILITY_TABLE } from '../evaluate.ts';

const ALL_ZONES: readonly Zone[] = [
  'workspace',
  'host',
  'credentials',
  'agent_config',
  'trusted_remote',
  'public_remote',
  'unknown_remote',
  'protected',
];

// One literal expectation per row of docs/design.md section 13.4.
const ROWS: ReadonlyArray<readonly [Capability, Zone, Reversibility]> = [
  ['read', 'workspace', 'reversible'],
  ['read', 'unknown_remote', 'reversible'],
  ['fetch', 'protected', 'reversible'],
  ['commit', 'public_remote', 'reversible'],
  ['write', 'workspace', 'reversible'],
  ['write', 'host', 'recoverable'],
  ['write', 'protected', 'recoverable'],
  ['delete', 'workspace', 'recoverable'],
  ['delete', 'host', 'irreversible'],
  ['execute', 'workspace', 'recoverable'],
  ['execute', 'protected', 'recoverable'],
  ['install', 'trusted_remote', 'recoverable'],
  ['send', 'trusted_remote', 'recoverable'],
  ['send', 'public_remote', 'irreversible'],
  ['send', 'unknown_remote', 'irreversible'],
  ['send', 'protected', 'irreversible'],
  ['push', 'trusted_remote', 'recoverable'],
  ['push', 'public_remote', 'irreversible'],
  ['push', 'unknown_remote', 'irreversible'],
  ['push', 'protected', 'irreversible'],
  ['rewrite', 'workspace', 'irreversible'],
  ['rewrite', 'unknown_remote', 'irreversible'],
  ['deploy', 'protected', 'irreversible'],
  ['deploy', 'host', 'recoverable'],
];

describe('REVERSIBILITY_TABLE', () => {
  test.each(ROWS)('%s in %s is %s', (capability, zone, expected) => {
    expect(REVERSIBILITY_TABLE[capability][zone]).toBe(expected);
  });

  const ALL_CAPABILITIES: readonly Capability[] = [
    'read',
    'write',
    'delete',
    'execute',
    'install',
    'fetch',
    'send',
    'commit',
    'push',
    'rewrite',
    'deploy',
  ];

  const REVERSIBILITY_VALUES: readonly Reversibility[] = [
    'reversible',
    'recoverable',
    'irreversible',
  ];

  test('is total over every capability and zone', () => {
    for (const capability of ALL_CAPABILITIES) {
      for (const zone of ALL_ZONES) {
        expect(REVERSIBILITY_VALUES).toContain(REVERSIBILITY_TABLE[capability][zone]);
      }
    }
  });
});
