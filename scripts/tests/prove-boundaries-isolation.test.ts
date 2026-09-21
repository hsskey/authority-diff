import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { resolveInsideRoot, runAllProofs } from '../prove-boundaries.ts';

const repoRoot = join(import.meta.dirname, '..', '..');

describe('resolveInsideRoot', () => {
  it('resolves a path inside the temp root', () => {
    expect(resolveInsideRoot('/tmp/proof-root', 'packages/kernel/lib/hash.ts')).toBe(
      '/tmp/proof-root/packages/kernel/lib/hash.ts',
    );
  });

  it('rejects a relative path that escapes the temp root', () => {
    expect(() => resolveInsideRoot('/tmp/proof-root', '../../etc/passwd')).toThrow(
      /outside the temp root/,
    );
  });

  it('rejects an absolute path outside the temp root', () => {
    expect(() => resolveInsideRoot('/tmp/proof-root', '/etc/passwd')).toThrow(
      /outside the temp root/,
    );
  });
});

describe('runAllProofs isolation', () => {
  // runAllProofs spawns depcruise once per boundary proof (8 subprocesses), which
  // overruns Vitest's 5s default on slower CI runners. Give it a generous budget.
  it('proves every boundary rule without touching real-named entry point files', () => {
    // Place real-named files the old proof used to overwrite and delete. Running the
    // proof must leave them byte-identical, because every fixture lives in a temp tree.
    const sentinels = [
      {
        path: join(repoRoot, 'packages', 'trace', 'client.ts'),
        content: '// isolation sentinel: trace client\nexport const sentinel = 1;\n',
      },
      {
        path: join(repoRoot, 'packages', 'policy', 'evaluate.ts'),
        content: '// isolation sentinel: policy evaluate\nexport const sentinel = 2;\n',
      },
    ];
    const created = sentinels.filter((sentinel) => !existsSync(sentinel.path));
    for (const sentinel of created) {
      mkdirSync(join(sentinel.path, '..'), { recursive: true });
      writeFileSync(sentinel.path, sentinel.content);
    }

    try {
      const result = runAllProofs(repoRoot);
      expect(result.allPassed).toBe(true);
      expect(result.gitStable).toBe(true);
      for (const sentinel of created) {
        expect(readFileSync(sentinel.path, 'utf8')).toBe(sentinel.content);
      }
    } finally {
      for (const sentinel of created) {
        rmSync(sentinel.path, { force: true });
      }
    }
  }, 60_000);
});
