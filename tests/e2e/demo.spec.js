const { test, expect } = require('../../src/fixtures/test.fixture');

test('login shows dashboard', async ({ loginPage, dashboardPage }) => {
  await loginPage.goto();
  await loginPage.login('qa@example.test', 'correct-password');

  await expect(dashboardPage.heading).toBeVisible();
});

test('customer creation is visible and persisted through API evidence', async ({ loginPage, dashboardPage, customerData, request }) => {
  await loginPage.goto();
  await loginPage.login('qa@example.test', 'correct-password');
  await dashboardPage.addCustomer(customerData);

  await expect(dashboardPage.customerRow(customerData)).toBeVisible();
  const response = await request.get(`/api/customers/${encodeURIComponent(customerData.email)}`);
  await expect(response).toBeOK();
  const persistedCustomer = await response.json();
  expect(persistedCustomer).toMatchObject(customerData);
});
