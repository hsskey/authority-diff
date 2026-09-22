import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, test } from 'vitest';
import { workspaceLinkWarnings } from '../src/workspace-link.ts';

describe('workspaceLinkWarnings', () => {
  test('warns when tsx and workspace packages are missing', () => {
    const repoRoot = mkdtempSync(join(tmpdir(), 'authority-cli-'));
    const warnings = workspaceLinkWarnings(repoRoot);
    expect(warnings).toContain('tsx is not installed. Run pnpm install in the repository root.');
    expect(warnings).toContain(
      'Workspace package @authority/kernel is not linked. Run pnpm install in the repository root before hook commands can load.',
    );
  });

  test('is empty when tsx and kernel are linked at the repo root', () => {
    const repoRoot = mkdtempSync(join(tmpdir(), 'authority-cli-'));
    mkdirSync(join(repoRoot, 'node_modules', 'tsx', 'dist'), { recursive: true });
    mkdirSync(join(repoRoot, 'node_modules', '@authority', 'kernel'), { recursive: true });
    writeFileSync(join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs'), '', 'utf8');
    writeFileSync(
      join(repoRoot, 'node_modules', '@authority', 'kernel', 'package.json'),
      '{}',
      'utf8',
    );

    expect(workspaceLinkWarnings(repoRoot)).toEqual([]);
  });
});
