import type { Operation, Target } from '@authority/action/schema';

// Test builders. Defaults are deliberately inert (an analyzable read of an
// unknown target) so each test states only the fields it exercises.

export function makeOperation(overrides: Partial<Operation> = {}): Operation {
  return {
    index: 0,
    capability: 'read',
    target: { kind: 'unknown' },
    analyzability: 'full',
    program: null,
    fragment: '',
    signals: [],
    ...overrides,
  };
}

export function pathTarget(path: string, isInsideWorkspace: boolean): Target {
  return { kind: 'path', path, isInsideWorkspace };
}

export function vcsRemoteTarget(remoteKey: string | null, branch: string | null): Target {
  return { kind: 'vcs_remote', remoteName: null, remoteKey, branch };
}

export function hostTarget(host: string): Target {
  return { kind: 'host', host, scheme: 'https' };
}
