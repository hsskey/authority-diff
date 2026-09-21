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
      {
        test: {
          name: 'arch',
          include: ['tests/arch/**/*.arch.test.ts'],
          // archunit's Vitest adapter registers its matcher on import and requires
          // the global expect to exist.
          globals: true,
          testTimeout: 60000,
        },
      },
    ],
  },
});
