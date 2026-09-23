import { defineConfig } from 'vitest/config';

// Integration tests run against the database from docker-compose.test.yml via `pnpm test:int`.
export default defineConfig({
  test: {
    name: 'authority-int',
    include: ['packages/*/tests/**/*.int.test.ts', 'apps/*/tests/**/*.int.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    globalSetup: ['tests/int-global-setup.ts'],
  },
});
