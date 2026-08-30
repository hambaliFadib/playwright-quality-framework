const fs = require('fs');
const { triageFailure } = require('../src/ai/triage');

function loadEvidence() {
  if (process.argv.includes('--demo')) {
    return {
      testName: 'demo failure keeps Playwright failed',
      playwrightStatus: 'failed',
      failureMessage: 'Expected heading Dashboard to be visible',
      stack: 'Error: expect(locator).toBeVisible() failed',
      retry: 0,
    };
  }
  const file = process.argv[2] || 'artifacts/playwright-results.json';
  if (!fs.existsSync(file)) return { testName: 'unknown', playwrightStatus: 'unknown', retry: 0 };
  const report = JSON.parse(fs.readFileSync(file, 'utf8'));
  const specs = report.suites?.flatMap(suite => suite.suites || []).flatMap(suite => suite.specs || []) || [];
  const spec = specs.find(candidate => candidate.tests?.some(test => test.status === 'failed'));
  const test = spec?.tests?.find(candidate => candidate.status === 'failed');
  const result = test?.results?.find(candidate => candidate.status === 'failed');
  return {
    testName: spec?.title || 'unknown',
    playwrightStatus: test?.status || 'unknown',
    failureMessage: result?.error?.message,
    stack: result?.error?.stack,
    retry: result?.retry || 0,
  };
}

(async () => {
  const evidence = loadEvidence();
  const triage = await triageFailure(evidence);
  console.log(JSON.stringify({ playwrightStatus: evidence.playwrightStatus, triage }, null, 2));
})();
