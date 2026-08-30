const assert = require('assert');
const { z } = require('zod');
const { generateStructuredData } = require('../src/ai/structured-data');
const { triageFailure } = require('../src/ai/triage');

async function main() {
  const schema = z.object({
    id: z.string().min(1),
    value: z.string().min(1),
  });

  const validData = await generateStructuredData({
    prompt: 'Return neutral structured data.',
    schema,
    identity: 'valid-branch',
    provider: async () => ({ id: 'valid-branch', value: 'accepted' }),
    fallback: async () => ({ id: 'fallback', value: 'unused' }),
  });
  assert.deepStrictEqual(validData, { id: 'valid-branch', value: 'accepted' });

  const invalidData = await generateStructuredData({
    prompt: 'Return neutral structured data.',
    schema,
    identity: 'invalid-branch',
    provider: async () => ({ id: '', value: '' }),
    fallback: async () => ({ id: 'fallback-invalid', value: 'accepted' }),
  });
  assert.deepStrictEqual(invalidData, { id: 'fallback-invalid', value: 'accepted' });

  const unavailableData = await generateStructuredData({
    prompt: 'Return neutral structured data.',
    schema,
    identity: 'provider-unavailable',
    provider: async () => { throw new Error('provider unavailable'); },
    fallback: async ({ identity }) => ({ id: identity, value: 'fallback' }),
  });
  assert.deepStrictEqual(unavailableData, { id: 'provider-unavailable', value: 'fallback' });

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

  console.log('AI data contract: valid provider accepted, invalid provider rejected, unavailable provider used supplied fallback.');
  console.log('AI triage contract: sufficient evidence returns validated advisory classification, insufficient/unavailable evidence returns INCONCLUSIVE, Playwright status unchanged.');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
