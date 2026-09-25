import { defineConfig, devices } from '@playwright/test';

// E2E for apps/web. The web app talks to the API only through /api routes, which
// each test stubs with page.route, so no backend is needed. The Vite dev server
// is started by Playwright and reused locally.
const PORT = 5173;
const baseURL = `http://localhost:${PORT}`;

// The chromium project renders the Korean catalog and the visual project the
// English one; each follows the browser locale.
// Visual screenshots pin rasterization to fonts shipped in the version-matched
// Playwright image (mcr.microsoft.com/playwright:v1.63.0-noble): Liberation Sans
// and Unifont. Capture and compare inside that image, on linux/amd64 like the
// `e2e-visual` CI job. The visual project is not part of `pnpm test:e2e`.
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
  expect: {
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide',
      maxDiffPixelRatio: 0.001,
      threshold: 0.2,
    },
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: /visual\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], locale: 'ko-KR' },
    },
    {
      name: 'visual',
      testMatch: /visual\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
        deviceScaleFactor: 1,
        locale: 'en-US',
        timezoneId: 'UTC',
      },
    },
  ],
  webServer: {
    command: 'pnpm --filter @authority/web dev',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
