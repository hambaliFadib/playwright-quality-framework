const base = require('@playwright/test');
const { LoginPage } = require('../pages/login.page');
const { DashboardPage } = require('../pages/dashboard.page');
const { makeCustomerData } = require('../data/customer.factory');
const { createServer } = require('../../demo-app/server');

const test = base.test.extend({
  demoServer: [async ({ browser: _browser }, use) => {
    void _browser;
    const server = createServer();
    await new Promise(resolve => server.listen(4173, '127.0.0.1', resolve));
    await use(server);
    await new Promise(resolve => server.close(resolve));
  }, { scope: 'worker', auto: true }],
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },
  dashboardPage: async ({ page }, use) => {
    await use(new DashboardPage(page));
  },
  customerData: async ({ browser: _browser }, use, testInfo) => {
    void _browser;
    await use(await makeCustomerData(testInfo));
  },
});

module.exports = { test, expect: base.expect };
