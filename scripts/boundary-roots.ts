import { existsSync } from 'node:fs';

// Single definition of the directories the architecture-boundary check cruises.
// Both `pnpm lint:boundaries` (scripts/cruise-boundaries.ts) and the boundary
// proof (scripts/prove-boundaries.ts) import this, so the two never drift.
export const BOUNDARY_ROOTS = ['packages', 'apps', 'tools'] as const;

// Only the roots that exist are passed to dependency-cruiser; apps/ and tools/
// are declared here but may not exist yet.
export function existingBoundaryRoots(): string[] {
  return BOUNDARY_ROOTS.filter((dir) => existsSync(dir));
}
