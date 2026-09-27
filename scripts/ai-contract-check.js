const assert = require('assert');
const { z } = require('zod');
const { generateStructuredData } = require('../src/ai/structured-data');
const { triageFailure } = require('../src/ai/triage');
const { evidenceFromReport } = require('./ai-triage');

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

  const fenced = await triageFailure(failedEvidence, async () => '```json\n{"classification":"FLAKY","confidence":0.61,"reason":"Failure passed after retry evidence."}\n```');
  assert.strictEqual(failedEvidence.playwrightStatus, 'failed');
  assert.strictEqual(fenced.classification, 'FLAKY');

  let retryCount = 0;
  const retryAdvisory = await triageFailure(failedEvidence, async (_evidence, correction) => {
    retryCount += 1;
    if (!correction) {
      return {
        classification: { value: 'PRODUCT_BUG' },
        confidence: 0.9,
        reason: 'Invalid nested classification.',
      };
    }
    return {
      classification: 'PRODUCT_BUG',
      confidence: 0.8,
      reason: 'Retry returned the required flat enum value.',
    };
  });
  assert.strictEqual(retryCount, 2);
  assert.strictEqual(failedEvidence.playwrightStatus, 'failed');
  assert.strictEqual(retryAdvisory.classification, 'PRODUCT_BUG');

  const invalidFinal = await triageFailure(failedEvidence, async () => ({
    classification: { value: 'PRODUCT_BUG' },
    confidence: 0.9,
    reason: 'Still invalid.',
  }));
  assert.strictEqual(failedEvidence.playwrightStatus, 'failed');
  assert.deepStrictEqual(invalidFinal, {
    classification: 'INCONCLUSIVE',
    confidence: 0.1,
    reason: 'AI triage output was unavailable or invalid.',
  });

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

  const nestedReport = {
    suites: [{
      title: 'root',
      suites: [{
        title: 'child',
        suites: [{
          title: 'recursive child',
          specs: [{
            title: 'should preserve real Playwright failure',
            tests: [{
              expectedStatus: 'passed',
              status: 'unexpected',
              results: [{
                status: 'failed',
                retry: 1,
                error: {
                  message: '\x1B[31mExpected red text\x1B[39m',
                  stack: 'Error: \x1B[32mstack text\x1B[39m',
                },
              }],
            }],
          }],
        }],
      }],
    }],
  };
  const extracted = evidenceFromReport(nestedReport);
  assert.deepStrictEqual(extracted, {
    testName: 'should preserve real Playwright failure',
    playwrightStatus: 'failed',
    failureMessage: 'Expected red text',
    stack: 'Error: stack text',
    retry: 1,
  });

  const errorsFallbackReport = {
    suites: [{
      specs: [{
        title: 'should use errors fallback',
        tests: [{
          results: [{
            status: 'failed',
            retry: 0,
            errors: [{ message: '\x1B[2mFallback message\x1B[22m' }],
          }],
        }],
      }],
    }],
  };
  const fallbackExtracted = evidenceFromReport(errorsFallbackReport);
  assert.strictEqual(fallbackExtracted.playwrightStatus, 'failed');
  assert.strictEqual(fallbackExtracted.failureMessage, 'Fallback message');
  assert.strictEqual(fallbackExtracted.stack, 'Fallback message');

  const noFailure = evidenceFromReport({ suites: [{ specs: [{ title: 'passes', tests: [{ results: [{ status: 'passed' }] }] }] }] });
  assert.deepStrictEqual(noFailure, { testName: 'unknown', playwrightStatus: 'unknown', retry: 0 });

  console.log('AI data contract: valid provider accepted, invalid provider rejected, unavailable provider used supplied fallback.');
  console.log('AI triage contract: exact JSON accepted, fenced JSON accepted, invalid output retried once, final invalid output becomes INCONCLUSIVE, Playwright status unchanged.');
  console.log('Playwright report extraction contract: nested failed result found, ANSI stripped, retry preserved, no failure remains insufficient.');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
