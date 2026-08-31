const fs = require('fs');
const { triageFailure } = require('../src/ai/triage');

function stripAnsi(value) {
  if (typeof value !== 'string') return value;

  let output = '';
  let index = 0;

  while (index < value.length) {
    const code = value.charCodeAt(index);

    if (code === 27) {
      const next = value.charCodeAt(index + 1);

      if (next === 91) {
        index += 2;
        while (index < value.length) {
          const current = value.charCodeAt(index);
          index += 1;
          if (current >= 64 && current <= 126) break;
        }
        continue;
      }

      if (next === 93) {
        index += 2;
        while (index < value.length) {
          const current = value.charCodeAt(index);
          if (current === 7) {
            index += 1;
            break;
          }
          if (current === 27 && value.charCodeAt(index + 1) === 92) {
            index += 2;
            break;
          }
          index += 1;
        }
        continue;
      }

      index += Math.min(2, value.length - index);
      continue;
    }

    if (code === 155) {
      index += 1;
      while (index < value.length) {
        const current = value.charCodeAt(index);
        index += 1;
        if (current >= 64 && current <= 126) break;
      }
      continue;
    }

    output += value[index];
    index += 1;
  }

  return output;
}

function findFirstFailedResult(suites = []) {
  for (const suite of suites) {
    for (const spec of suite.specs || []) {
      for (const test of spec.tests || []) {
        const result = (test.results || []).find(candidate => candidate.status === 'failed');
        if (result) return { suite, spec, test, result };
      }
    }

    const nested = findFirstFailedResult(suite.suites || []);
    if (nested) return nested;
  }

  return null;
}

function extractEvidence(report) {
  const failed = findFirstFailedResult(report.suites || []);
  if (!failed) return { testName: 'unknown', playwrightStatus: 'unknown', retry: 0 };

  const { spec, test, result } = failed;
  const error = result.error || result.errors?.[0] || {};
  const failureMessage = error.message || result.errors?.[0]?.message;
  const stack = error.stack || result.errors?.[0]?.stack || failureMessage;

  return {
    testName: spec.title || test.title || 'unknown',
    playwrightStatus: result.status,
    failureMessage: stripAnsi(failureMessage),
    stack: stripAnsi(stack),
    retry: result.retry || 0,
  };
}

function loadEvidence(args = process.argv.slice(2)) {
  if (args.includes('--selftest')) {
    return {
      testName: 'self-test failure keeps Playwright failed',
      playwrightStatus: 'failed',
      failureMessage: 'Expected application state was not observed',
      stack: 'Error: expect(locator).toBeVisible() failed',
      retry: 0,
    };
  }

  const file = args.find(arg => !arg.startsWith('--')) || 'artifacts/playwright-results.json';
  if (!fs.existsSync(file)) return { testName: 'unknown', playwrightStatus: 'unknown', retry: 0 };

  const report = JSON.parse(fs.readFileSync(file, 'utf8'));
  return extractEvidence(report);
}

async function main() {
  const evidence = loadEvidence();
  const triage = await triageFailure(evidence);
  console.log(JSON.stringify({ playwrightStatus: evidence.playwrightStatus, triage }, null, 2));
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { stripAnsi, findFirstFailedResult, extractEvidence, loadEvidence };
