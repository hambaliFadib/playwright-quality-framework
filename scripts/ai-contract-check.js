const assert = require('assert');
const { generateCustomerWithAI } = require('../src/ai/test-data');
const { buildCustomerData } = require('../src/data/customer.factory');
const { triageFailure } = require('../src/ai/triage');

async function main() {
  const validCustomer = await generateCustomerWithAI('valid-branch', async () => ({
    name: 'QA Valid Branch',
    email: 'qa-valid-branch@example.test',
  }));
  assert.deepStrictEqual(validCustomer, {
    name: 'QA Valid Branch',
    email: 'qa-valid-branch@example.test',
  });

  const invalidCustomer = await generateCustomerWithAI('invalid-branch', async () => ({
    name: 'x',
    email: 'bad@example.com',
  }));
  assert.strictEqual(invalidCustomer, null);

  const fallbackCustomer = await buildCustomerData('provider-unavailable', async () => {
    throw new Error('provider unavailable');
  });
  assert.match(fallbackCustomer.email, /^qa-provider-unavailable@example\.test$/);

  const failedEvidence = {
    testName: 'keeps failed status',
    playwrightStatus: 'failed',
    failureMessage: 'Expected visible heading',
    stack: 'Error: expect(locator).toBeVisible() failed',
    retry: 0,
  };
  const advisory = await triageFailure(failedEvidence, async () => ({
    classification: 'AUTOMATION_DEFECT',
    confidence: 0.77,
    reason: 'Selector contract did not match rendered page.',
  }));
  assert.strictEqual(failedEvidence.playwrightStatus, 'failed');
  assert.strictEqual(advisory.classification, 'AUTOMATION_DEFECT');

  const insufficient = { testName: 'missing message', playwrightStatus: 'failed', retry: 0 };
  const insufficientTriage = await triageFailure(insufficient, async () => ({
    classification: 'PRODUCT_BUG',
    confidence: 0.9,
    reason: 'Should not be used.',
  }));
  assert.strictEqual(insufficient.playwrightStatus, 'failed');
  assert.strictEqual(insufficientTriage.classification, 'INCONCLUSIVE');

  const previousApiKey = process.env.AI_API_KEY;
  const previousBaseUrl = process.env.AI_BASE_URL;
  const previousModel = process.env.AI_MODEL;
  delete process.env.AI_API_KEY;
  delete process.env.AI_BASE_URL;
  delete process.env.AI_MODEL;
  const unavailable = await triageFailure(failedEvidence);
  assert.strictEqual(failedEvidence.playwrightStatus, 'failed');
  assert.strictEqual(unavailable.classification, 'INCONCLUSIVE');
  process.env.AI_API_KEY = previousApiKey;
  process.env.AI_BASE_URL = previousBaseUrl;
  process.env.AI_MODEL = previousModel;

  console.log('AI data contract: valid provider accepted, invalid provider rejected, unavailable provider used Faker fallback.');
  console.log('AI triage contract: sufficient evidence returns validated advisory classification, insufficient/unavailable evidence returns INCONCLUSIVE, Playwright status unchanged.');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
