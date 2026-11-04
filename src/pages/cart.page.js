class CartPage {
  constructor(page) {
    this.title = page.locator('[data-test="title"]');
    this.itemNames = page.locator('[data-test="inventory-item-name"]');
    this.cartItems = page.locator('[data-test="inventory-item"]');
  }
}

module.exports = { CartPage };
