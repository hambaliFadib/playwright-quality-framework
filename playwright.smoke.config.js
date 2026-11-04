const { defineConfig } = require('@playwright/test');

// Keep browser readiness independent of application E2E and optional PQP reporters.
module.exports = defineConfig({
  testDir: './tests/browser-smoke',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  outputDir: 'test-results/browser-smoke',
  projects: [{ name: 'chromium', use: { browserName: 'chromium', headless: true } }],
});
