import { defineConfig } from 'vitest/config';

// vitest 5 removed vitest.workspace.ts; test.projects is its successor.
// Integration tests (*.int.test.ts) need a database and run via vitest.int.config.ts.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'authority',
          include: [
            'packages/*/tests/**/*.test.ts',
            'apps/*/tests/**/*.test.ts',
            'tools/*/tests/**/*.test.ts',
            'scripts/tests/**/*.test.ts',
          ],
          exclude: ['**/*.int.test.ts', '**/node_modules/**', '**/dist/**'],
        },
      },
    ],
  },
});
