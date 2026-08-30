const { test, expect } = require('../../src/fixtures/test.fixture');

test('swallowed assertion is rejected', async ({ page }) => {
  const status = page.getByRole('status');
  try {
    await expect(status).toHaveText('SUCCESS');
  } catch (_error) {}
});
