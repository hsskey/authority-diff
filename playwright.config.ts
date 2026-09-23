import { defineConfig, devices } from '@playwright/test';

// E2E for apps/web. The web app talks to the API only through /api routes, which
// each test stubs with page.route, so no backend is needed. The Vite dev server
// is started by Playwright and reused locally.
const PORT = 5173;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: 'apps/web/tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm --filter @authority/web dev',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
