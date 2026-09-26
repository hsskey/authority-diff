import type { Capability } from '@authority/action/schema';
import type { Reversibility, Zone } from '#schema';

// Local send/push zones are unreachable through classification, so they default to irreversible; the design table only specifies remote and protected (docs/design.md 13.4).

function everyZone(reversibility: Reversibility): Record<Zone, Reversibility> {
  return {
    workspace: reversibility,
    host: reversibility,
    credentials: reversibility,
    agent_config: reversibility,
    trusted_remote: reversibility,
    public_remote: reversibility,
    unknown_remote: reversibility,
    protected: reversibility,
  };
}

export const REVERSIBILITY_TABLE: Record<Capability, Record<Zone, Reversibility>> = {
  read: everyZone('reversible'),
  fetch: everyZone('reversible'),
  commit: everyZone('reversible'),
  write: {
    ...everyZone('recoverable'),
    workspace: 'reversible',
  },
  delete: {
    ...everyZone('irreversible'),
    workspace: 'recoverable',
  },
  execute: everyZone('recoverable'),
  install: everyZone('recoverable'),
  send: {
    ...everyZone('irreversible'),
    trusted_remote: 'recoverable',
  },
  push: {
    ...everyZone('irreversible'),
    trusted_remote: 'recoverable',
  },
  rewrite: everyZone('irreversible'),
  deploy: {
    ...everyZone('recoverable'),
    protected: 'irreversible',
  },
};

/** Looks up the Reversibility for a Capability in a resolved Zone. */
export function reversibilityFor(capability: Capability, zone: Zone): Reversibility {
  return REVERSIBILITY_TABLE[capability][zone];
}
