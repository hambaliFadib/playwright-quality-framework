'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const playwright = require('@playwright/test');

const fixtureGatewayPath = '../../src/fixtures/test.fixture';

test('fixture gateway imports without unresolved module dependencies', () => {
  assert.doesNotThrow(() => require(fixtureGatewayPath));
});

test('fixture gateway exports an extended Playwright test and the standard expect API', () => {
  const gateway = require(fixtureGatewayPath);
  assert.equal(typeof gateway.test, 'function');
  assert.equal(typeof gateway.expect, 'function');
  assert.equal(typeof gateway.test.extend, 'function');
  assert.strictEqual(gateway.expect, playwright.expect);
  assert.notStrictEqual(gateway.test, playwright.test);
});
