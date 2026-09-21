import type { Capability } from '@authority/action/schema';
import type { Reversibility, Zone } from '../../schema.ts';

// Reversibility derived from Capability and resolved Zone.
// Source of truth: docs/design.md section 13.4. Each entry below is one cell of
// that table; `everyZone(x)` fills a row whose design value is "all", then the
// listed zones override the exceptions.
//
// The design table specifies send/push only for the remote and protected zones.
// The local zones (workspace, host, credentials, agent_config) are not reachable
// for a send/push through classification, so they default to the conservative
// `irreversible` here; no default template Rule reads send/push reversibility.

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
