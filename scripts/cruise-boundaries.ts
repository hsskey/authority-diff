import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { existingBoundaryRoots } from './boundary-roots.ts';

// `pnpm lint:boundaries`: cruise every existing boundary root through
// dependency-cruiser. The root list is shared with the boundary proof so the
// enforced surface and the proved surface are identical.
const roots = existingBoundaryRoots();
if (roots.length === 0) {
  process.stderr.write('cruise-boundaries: no boundary roots present.\n');
  process.exit(1);
}

const bin = join(process.cwd(), 'node_modules', '.bin', 'depcruise');
try {
  execFileSync(bin, roots, { stdio: 'inherit' });
} catch {
  process.exit(1);
}
