const { chromium } = require('@playwright/test');
const { test, expect } = require('../../src/fixtures/test.fixture');

test('headless Chromium opens a deterministic page and closes cleanly', async () => {
  const html = '<!doctype html><html><head><title>PQF Browser Smoke</title></head>'
    + '<body><main data-testid="smoke-status">Browser ready</main></body></html>';
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage();
    await page.goto(`data:text/html;base64,${Buffer.from(html).toString('base64')}`);
    await expect(page).toHaveTitle('PQF Browser Smoke');
    await expect(page.getByTestId('smoke-status')).toHaveText('Browser ready');
  } finally {
    await browser.close();
  }

  expect(browser.isConnected()).toBe(false);
});
