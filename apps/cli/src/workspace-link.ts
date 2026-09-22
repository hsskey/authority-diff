import { existsSync } from 'node:fs';
import { join } from 'node:path';

export function workspaceLinkWarnings(repoRoot: string): readonly string[] {
  const warnings: string[] = [];

  const tsxEntry = join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  if (!existsSync(tsxEntry)) {
    warnings.push('tsx is not installed. Run pnpm install in the repository root.');
  }

  const kernelLinked =
    existsSync(join(repoRoot, 'node_modules', '@authority', 'kernel', 'package.json')) ||
    existsSync(
      join(repoRoot, 'apps', 'cli', 'node_modules', '@authority', 'kernel', 'package.json'),
    );
  if (!kernelLinked) {
    warnings.push(
      'Workspace package @authority/kernel is not linked. Run pnpm install in the repository root before hook commands can load.',
    );
  }

  return warnings;
}
