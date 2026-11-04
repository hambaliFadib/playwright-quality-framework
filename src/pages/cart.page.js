class CartPage {
  constructor(page) {
    this.title = page.locator('[data-test="title"]');
    this.itemNames = page.locator('[data-test="inventory-item-name"]');
    this.cartItems = page.locator('[data-test="inventory-item"]');
    this.removeBackpackButton = page.locator('[data-test="remove-sauce-labs-backpack"]');
  }

  async removeBackpack() { await this.removeBackpackButton.click(); }
}

module.exports = { CartPage };
