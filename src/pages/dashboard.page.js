class DashboardPage {
  constructor(page) {
    this.page = page;
    this.heading = page.getByRole('heading', { name: 'Dashboard' });
    this.customerName = page.getByLabel('Customer name');
    this.email = page.getByLabel('Email');
    this.createCustomer = page.getByRole('button', { name: 'Create customer' });
    this.customers = page.getByLabel('Customers');
  }

  async addCustomer(customer) {
    await this.customerName.fill(customer.name);
    await this.email.fill(customer.email);
    await this.createCustomer.click();
  }

  customerRow(customer) {
    return this.customers.getByText(`${customer.name} <${customer.email}>`);
  }
}

module.exports = { DashboardPage };
