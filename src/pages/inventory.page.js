class InventoryPage {
  constructor(page) {
    this.page = page;
    this.title = page.locator('[data-test="title"]');
    this.badge = page.locator('[data-test="shopping-cart-badge"]');
    this.cartLink = page.locator('[data-test="shopping-cart-link"]');
    this.productSort = page.getByRole('combobox', { name: 'Sort products' });
    this.productNames = page.locator('[data-test="inventory-item-name"]');
    this.productPrices = page.locator('[data-test="inventory-item-price"]');
  }

  async addBackpack() {
    await this.page.locator('[data-test="add-to-cart-sauce-labs-backpack"]').click();
  }

  async openCart() { await this.cartLink.click(); }

  async sortProductsByPrice(direction) {
    await this.productSort.selectOption(direction);
  }

  async getProductPrices() {
    const renderedPrices = await this.productPrices.allTextContents();
    return renderedPrices.map((price) => Number(price.replace('$', '')));
  }

  async getProductNames() {
    return this.productNames.allTextContents();
  }
}

module.exports = { InventoryPage };
