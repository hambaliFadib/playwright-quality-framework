const assert = require('assert');
const { z } = require('zod');
const { generateStructuredData } = require('../src/ai/structured-data');
const { triageFailure, parseTriageContent, triageSchema } = require('../src/ai/triage');
const { extractEvidence, stripAnsi } = require('./ai-triage');

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

  const exactAdvisory = await triageFailure(failedEvidence, async () => ({
    classification: 'AUTOMATION_DEFECT',
    confidence: 0.77,
    reason: 'Selector contract did not match rendered page.',
  }));
  assert.strictEqual(failedEvidence.playwrightStatus, 'failed');
  assert.strictEqual(exactAdvisory.classification, 'AUTOMATION_DEFECT');

  const fenced = parseTriageContent('```json\n{"classification":"AUTOMATION_DEFECT","confidence":0.8,"reason":"Fenced JSON accepted."}\n```');
  assert.strictEqual(triageSchema.safeParse(fenced).success, true);

  let retryCalls = 0;
  const retried = await triageFailure(failedEvidence, async (_evidence, options) => {
    retryCalls += 1;
    if (!options.correction) {
      return {
        classification: { failureCategory: 'ASSERTION_FAILURE' },
        confidence: 0.8,
        reason: 'Invalid nested classification.',
      };
    }
    return {
      classification: 'AUTOMATION_DEFECT',
      confidence: 0.8,
      reason: 'Corrected flat classification.',
    };
  });
  assert.strictEqual(retryCalls, 2);
  assert.strictEqual(retried.classification, 'AUTOMATION_DEFECT');
  assert.strictEqual(failedEvidence.playwrightStatus, 'failed');

  let invalidCalls = 0;
  const invalidFinal = await triageFailure(failedEvidence, async () => {
    invalidCalls += 1;
    return {
      classification: { failureCategory: 'ASSERTION_FAILURE' },
      confidence: 0.8,
      reason: 'Still invalid.',
    };
  });
  assert.strictEqual(invalidCalls, 2);
  assert.strictEqual(invalidFinal.classification, 'INCONCLUSIVE');
  assert.strictEqual(invalidFinal.confidence, 0.1);
  assert.strictEqual(failedEvidence.playwrightStatus, 'failed');

  const insufficient = { testName: 'missing message', playwrightStatus: 'failed', retry: 0 };
  const insufficientTriage = await triageFailure(insufficient, async () => ({
    classification: 'PRODUCT_BUG',
    confidence: 0.9,
    reason: 'Should not be used.',
  }));
  assert.strictEqual(insufficient.playwrightStatus, 'failed');
  assert.strictEqual(insufficientTriage.classification, 'INCONCLUSIVE');

  const nestedReport = {
    suites: [{
      title: 'outer',
      suites: [{
        title: 'inner',
        specs: [{
          title: 'real failed spec',
          tests: [{
            expectedStatus: 'passed',
            status: 'unexpected',
            results: [{
              status: 'failed',
              retry: 1,
              error: {
                message: '\u001b[31mExpected heading A but received heading B\u001b[39m',
                stack: '\u001b[2mError: assertion failed\u001b[22m',
              },
            }],
          }],
        }],
      }],
    }],
  };
  const extracted = extractEvidence(nestedReport);
  assert.strictEqual(extracted.testName, 'real failed spec');
  assert.strictEqual(extracted.playwrightStatus, 'failed');
  assert.strictEqual(extracted.retry, 1);
  assert.strictEqual(extracted.failureMessage.includes('\u001b'), false);
  assert.strictEqual(extracted.stack.includes('\u001b'), false);
  assert.strictEqual(stripAnsi('\u001b[31mfailed\u001b[39m'), 'failed');

  const noFailure = extractEvidence({ suites: [{ specs: [] }] });
  assert.strictEqual(noFailure.playwrightStatus, 'unknown');
  assert.strictEqual(noFailure.failureMessage, undefined);

  const previousApiKey = process.env.AI_API_KEY;
  const previousBaseUrl = process.env.AI_BASE_URL;
  const previousModel = process.env.AI_MODEL;
  delete process.env.AI_API_KEY;
  delete process.env.AI_BASE_URL;
  delete process.env.AI_MODEL;
  const unavailable = await triageFailure(failedEvidence);
  assert.strictEqual(failedEvidence.playwrightStatus, 'failed');
  assert.strictEqual(unavailable.classification, 'INCONCLUSIVE');
  if (previousApiKey === undefined) delete process.env.AI_API_KEY; else process.env.AI_API_KEY = previousApiKey;
  if (previousBaseUrl === undefined) delete process.env.AI_BASE_URL; else process.env.AI_BASE_URL = previousBaseUrl;
  if (previousModel === undefined) delete process.env.AI_MODEL; else process.env.AI_MODEL = previousModel;

  console.log('AI data contract: valid provider accepted, invalid provider rejected, unavailable provider used supplied fallback.');
  console.log('AI triage contract: exact/fenced JSON accepted, invalid output retried once, final invalid output becomes INCONCLUSIVE, Playwright status unchanged.');
  console.log('Playwright evidence contract: recursive failed-result extraction works, ANSI is removed, retry is preserved, and no failure fabricates no evidence.');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
