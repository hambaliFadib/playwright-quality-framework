const { test, expect } = require('../../../src/fixtures/test.fixture');

test('standard user adds one Sauce Labs Backpack to the cart', async ({
  loginPage, inventoryPage, cartPage,
}) => {
  const username = process.env.SAUCEDEMO_USERNAME;
  const password = process.env.SAUCEDEMO_PASSWORD;
  if (!username || !password || !process.env.BASE_URL) {
    throw new Error('SauceDemo qualification requires BASE_URL, SAUCEDEMO_USERNAME and SAUCEDEMO_PASSWORD');
  }

  await loginPage.open();
  await loginPage.signIn(username, password);

  await expect(inventoryPage.title).toHaveText('Products');
  await inventoryPage.addBackpack();
  await expect(inventoryPage.badge).toHaveText('1');

  await inventoryPage.openCart();
  await expect(cartPage.title).toHaveText('Your Cart');
  await expect(cartPage.cartItems).toHaveCount(1);
  await expect(cartPage.itemNames).toHaveText('Sauce Labs Backpack');
});
