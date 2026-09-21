import { defineConfig } from 'vitest/config';

// Vitest 5 removed vitest.workspace.ts and the --workspace flag; test.projects
// is its documented successor. See docs/acr/0001-toolchain-version-exceptions.md.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'authority',
          include: [
            'packages/*/tests/**/*.test.ts',
            'tools/*/tests/**/*.test.ts',
            'scripts/tests/**/*.test.ts',
          ],
        },
      },
    ],
  },
});
