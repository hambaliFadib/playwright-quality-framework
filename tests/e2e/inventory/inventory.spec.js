const { test, expect } = require('../../../src/fixtures/test.fixture');

test.describe('inventory price sorting', () => {
  test.beforeEach(async ({ loginPage }) => {
    const username = process.env.SAUCEDEMO_USERNAME;
    const password = process.env.SAUCEDEMO_PASSWORD;
    if (!process.env.BASE_URL || !username || !password) {
      throw new Error('SauceDemo qualification requires BASE_URL, SAUCEDEMO_USERNAME, and SAUCEDEMO_PASSWORD');
    }

    await loginPage.open();
    await loginPage.signIn(username, password);
  });

  test('standard user sorts products by price ascending', async ({ inventoryPage }) => {
    await inventoryPage.sortProductsByPrice('lohi');

    const names = await inventoryPage.getProductNames();
    const prices = await inventoryPage.getProductPrices();
    expect(names).toEqual([
      'Sauce Labs Onesie',
      'Sauce Labs Bike Light',
      'Sauce Labs Bolt T-Shirt',
      'Test.allTheThings() T-Shirt (Red)',
      'Sauce Labs Backpack',
      'Sauce Labs Fleece Jacket',
    ]);
    expect(prices).toEqual([7.99, 9.99, 15.99, 15.99, 29.99, 49.99]);
  });

  test('standard user sorts products by price descending', async ({ inventoryPage }) => {
    await inventoryPage.sortProductsByPrice('hilo');

    const names = await inventoryPage.getProductNames();
    const prices = await inventoryPage.getProductPrices();
    expect(names).toEqual([
      'Sauce Labs Fleece Jacket',
      'Sauce Labs Backpack',
      'Sauce Labs Bolt T-Shirt',
      'Test.allTheThings() T-Shirt (Red)',
      'Sauce Labs Bike Light',
      'Sauce Labs Onesie',
    ]);
    expect(prices).toEqual([49.99, 29.99, 15.99, 15.99, 9.99, 7.99]);
  });
});
