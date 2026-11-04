const base = require('@playwright/test');
const { LoginPage } = require('../pages/login.page');
const { InventoryPage } = require('../pages/inventory.page');
const { CartPage } = require('../pages/cart.page');

const test = base.test.extend({
  loginPage: async ({ page }, use) => { await use(new LoginPage(page)); },
  inventoryPage: async ({ page }, use) => { await use(new InventoryPage(page)); },
  cartPage: async ({ page }, use) => { await use(new CartPage(page)); },
});

module.exports = { test, expect: base.expect };
