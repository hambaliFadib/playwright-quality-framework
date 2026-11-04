'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const playwright = require('@playwright/test');

const fixtureGatewayPath = '../../src/fixtures/test.fixture';

test('fixture gateway imports without unresolved module dependencies', () => {
  assert.doesNotThrow(() => require(fixtureGatewayPath));
});

test('fixture gateway exports the Playwright test and expect APIs', () => {
  const fixtureGateway = require(fixtureGatewayPath);

  assert.equal(typeof fixtureGateway.test, 'function');
  assert.equal(typeof fixtureGateway.expect, 'function');
  assert.strictEqual(fixtureGateway.test, playwright.test);
  assert.strictEqual(fixtureGateway.expect, playwright.expect);
});
