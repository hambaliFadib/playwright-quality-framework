const { defineConfig, devices } = require('@playwright/test');
const { isPqpReporterEnabled, hasValidOptInValue } = require('./src/integration/pqp-reporter-config');

const pqpEvidenceOptIn = process.env.PQF_EVIDENCE_ENABLED;
if (!hasValidOptInValue(pqpEvidenceOptIn)) {
  console.error('PQF_EVIDENCE_ENABLED must be "true" or "false"; PQP integration remains disabled.');
}

const reporters = [
  ['list'],
  ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ['json', { outputFile: 'artifacts/playwright-results.json' }],
];
if (isPqpReporterEnabled(pqpEvidenceOptIn)) reporters.push(['./src/integration/pqp-reporter.js']);

const requestedBrowsers = new Set(
  (process.env.BROWSERS || '')
    .split(',')
    .map((browser) => browser.trim().toLowerCase())
    .filter(Boolean),
);

const browserProjects = [
  { name: 'chromium', device: 'Desktop Chrome' },
];

if (requestedBrowsers.has('all') || requestedBrowsers.has('firefox')) {
  browserProjects.push({ name: 'firefox', device: 'Desktop Firefox' });
}

if (requestedBrowsers.has('all') || requestedBrowsers.has('webkit')) {
  browserProjects.push({ name: 'webkit', device: 'Desktop Safari' });
}

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  fullyParallel: false,
  reporter: reporters,
  use: {
    ...devices['Desktop Chrome'],
    browserName: 'chromium',
    baseURL: process.env.BASE_URL || undefined,
    actionTimeout: 10_000,
    navigationTimeout: 10_000,
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  projects: browserProjects.map(({ name, device }) => ({
    name,
    use: { ...devices[device], browserName: name },
  })),
});
