const { test } = require('../../src/fixtures/test.fixture');

test('timeout wait is rejected', async ({ page }) => {
  await page.waitForTimeout(5000);
});
