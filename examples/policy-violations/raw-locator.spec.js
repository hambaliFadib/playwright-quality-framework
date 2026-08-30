const { test } = require('../../src/fixtures/test.fixture');

test('raw locator is rejected', async ({ page }) => {
  await page.locator('#login').click();
});
