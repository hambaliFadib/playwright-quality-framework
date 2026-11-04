const { test, expect } = require('../../../src/fixtures/test.fixture');

test('locked-out SauceDemo user is rejected with an explicit message', async ({ loginPage }) => {
  const password = process.env.SAUCEDEMO_PASSWORD;
  if (!process.env.BASE_URL || !password) {
    throw new Error('SauceDemo qualification requires BASE_URL and SAUCEDEMO_PASSWORD');
  }

  await loginPage.open();
  await loginPage.signIn('locked_out_user', password);

  await expect(loginPage.errorMessage).toHaveText('Epic sadface: Sorry, this user has been locked out.');
  await expect(loginPage.loginButton).toBeVisible();
});
