'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { createRunReporter } = require('../../src/core/run-report');

const CLI = path.resolve(__dirname, '../../node_modules/@playwright/test/cli.js');
const PACKAGE = require.resolve('@playwright/test');
const RUN_IDS = [
  '123e4567-e89b-42d3-a456-426614175001',
  '123e4567-e89b-42d3-a456-426614175002',
  '123e4567-e89b-42d3-a456-426614175003',
];

async function runLive(t, runId, scenario) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pqf-live-json-report-'));
  t.after(async () => fs.rm(root, { recursive: true, force: true }));
  const tests = path.join(root, 'e2e');
  await fs.mkdir(tests);

  const reporter = createRunReporter(root);
  const outputFile = await reporter.prepareRun(runId);
  const specBody = scenario === 'pass'
    ? "test('passes', () => { expect(2 + 2).toBe(4); });"
    : scenario === 'fail'
      ? "test('fails', () => { expect(2 + 2).toBe(5); });"
      : "test.skip('intentionally skipped', () => {});";
  const source = [
    "'use strict';",
    'const { test, expect } = require(' + JSON.stringify(PACKAGE) + ');',
    specBody,
    '',
  ].join('\n');
  await fs.writeFile(path.join(tests, 'fixture.spec.js'), source);

  const config = path.join(root, 'playwright.config.js');
  await fs.writeFile(config, [
    "'use strict';",
    'module.exports = {',
    '  testDir: ' + JSON.stringify(tests) + ',',
    "  reporter: [['json', { outputFile: " + JSON.stringify(outputFile) + " }]],",
    '  workers: 1,',
    '  retries: 0,',
    '};',
    '',
  ].join('\n'));

  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI, 'test', '--config', config], {
      cwd: root,
      env: { ...process.env, CI: 'true' },
      stdio: 'ignore',
      shell: false,
      windowsHide: true,
    });
    child.once('error', reject);
    child.once('close', (code, signal) => {
      if (signal !== null) reject(new Error('Unexpected termination signal'));
      else resolve(code);
    });
  });
  return { result: await reporter.readRun(runId, exitCode), exitCode };
}

test('real Playwright JSON reporter evidence classifies PASS FAIL and SKIP', { timeout: 45_000 }, async t => {
  const passed = await runLive(t, RUN_IDS[0], 'pass');
  assert.equal(passed.exitCode, 0);
  assert.equal(passed.result.outcome, 'PASSED');
  assert.deepEqual(passed.result.summary, {
    total: 1, passed: 1, failed: 0, skipped: 0, flaky: 0,
  });

  const failed = await runLive(t, RUN_IDS[1], 'fail');
  assert.notEqual(failed.exitCode, 0);
  assert.equal(failed.result.outcome, 'FAILED');
  assert.deepEqual(failed.result.summary, {
    total: 1, passed: 0, failed: 1, skipped: 0, flaky: 0,
  });

  const skipped = await runLive(t, RUN_IDS[2], 'skip');
  assert.equal(skipped.result.outcome, 'FAILED');
  assert.deepEqual(skipped.result.summary, {
    total: 1, passed: 0, failed: 0, skipped: 1, flaky: 0,
  });
});
