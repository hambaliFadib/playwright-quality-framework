const base = require('@playwright/test');

const test = base.test.extend({
  // Project-specific fixtures are added here by automation tasks.
});

module.exports = { test, expect: base.expect };
