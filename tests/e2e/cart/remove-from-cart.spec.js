const { test, expect } = require('../../../src/fixtures/test.fixture');

test('standard user removes Sauce Labs Backpack and empties the cart', async ({
  loginPage, inventoryPage, cartPage,
}) => {
  const username = process.env.SAUCEDEMO_USERNAME;
  const password = process.env.SAUCEDEMO_PASSWORD;
  if (!process.env.BASE_URL || !username || !password) {
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

  await cartPage.removeBackpack();

  await expect(cartPage.cartItems).toHaveCount(0);
  await expect(inventoryPage.badge).toHaveCount(0);
});
