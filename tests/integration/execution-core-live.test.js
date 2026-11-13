'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { _createExecutionCore } = require('../../src/core/execution-core');
const { createRunReporter } = require('../../src/core/run-report');

const REPOSITORY_ROOT = path.resolve(__dirname, '../..');
const PLAYWRIGHT_CLI_PATH = path.join(
  REPOSITORY_ROOT, 'node_modules', '@playwright', 'test', 'cli.js',
);
const PLAYWRIGHT_PACKAGE = require.resolve('@playwright/test');

async function waitForResult(core, runId, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const status = core.getRunStatus(runId);
    assert.equal(status.ok, undefined, JSON.stringify(status));
    if (status.lifecycle === 'COMPLETED') {
      const response = core.getRunResult(runId);
      assert.equal(response.available, true);
      return response.result;
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('Live execution qualification timed out');
}

test('execution core runs real Chromium specs and returns isolated structured results', {
  timeout: 210_000,
}, async t => {
  const repositoryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'pqf-live-core-'));
  t.after(async () => fs.rm(repositoryRoot, { recursive: true, force: true }));

  const testsRoot = path.join(repositoryRoot, 'tests', 'e2e');
  await fs.mkdir(testsRoot, { recursive: true });

  const passSpec = path.join(testsRoot, 'live-pass.spec.js');
  const failSpec = path.join(testsRoot, 'live-fail.spec.js');
  const testImport = JSON.stringify(PLAYWRIGHT_PACKAGE);

  await fs.writeFile(passSpec, [
    "'use strict';",
    'const { test, expect } = require(' + testImport + ');',
    "test('real Chromium execution passes', async ({ page }) => {",
    "  await page.setContent('<main>production-core-live</main>');",
    "  await expect(page.locator('main')).toHaveText('production-core-live');",
    '});',
    '',
  ].join('\n'));

  await fs.writeFile(failSpec, [
    "'use strict';",
    'const { test, expect } = require(' + testImport + ');',
    "test('real Chromium execution fails honestly', async ({ page }) => {",
    "  await page.setContent('<main>actual</main>');",
    "  await expect(page.locator('main')).toHaveText('expected');",
    '});',
    '',
  ].join('\n'));

  await fs.writeFile(path.join(repositoryRoot, 'playwright.config.js'), [
    "'use strict';",
    'const path = require(\'node:path\');',
    'module.exports = {',
    "  testDir: path.join(__dirname, 'tests', 'e2e'),",
    '  workers: 1,',
    '  retries: 0,',
    '  reporter: [[\'json\', { outputFile: path.join(',
    "    __dirname, 'artifacts', 'runs', process.env.PQF_EXECUTION_RUN_ID,",
    "    'playwright-results.json',",
    '  ) }]],',
    "  projects: [{ name: 'chromium', use: { browserName: 'chromium', headless: true } }],",
    '};',
    '',
  ].join('\n'));

  const descriptors = new Map([
    ['spec:live-pass.spec.js', { id: 'spec:live-pass.spec.js', relativePath: 'live-pass.spec.js' }],
    ['spec:live-fail.spec.js', { id: 'spec:live-fail.spec.js', relativePath: 'live-fail.spec.js' }],
  ]);

  const catalog = {
    resolveTestTarget: async target => {
      const descriptor = descriptors.get(target);
      if (!descriptor) {
        const error = new Error('TEST_NOT_FOUND');
        error.code = 'TEST_NOT_FOUND';
        throw error;
      }
      return { target, tests: [descriptor] };
    },
    revalidateResolvedTestTargetForExecution: async resolved => (
      resolved.tests.map(item => path.join(testsRoot, item.relativePath))
    ),
  };

  const core = _createExecutionCore({
    repositoryRoot,
    playwrightCliPath: PLAYWRIGHT_CLI_PATH,
    catalog,
    reporter: createRunReporter(repositoryRoot),
    env: { ...process.env, CI: 'true' },
    terminationGraceMs: 500,
  });

  const passStart = await core.startRun({ target: 'spec:live-pass.spec.js', timeoutMs: 90_000 });
  assert.equal(passStart.lifecycle, 'RUNNING');
  const passed = await waitForResult(core, passStart.runId);
  assert.equal(passed.outcome, 'PASSED');
  assert.deepEqual(passed.summary, {
    total: 1, passed: 1, failed: 0, skipped: 0, flaky: 0,
  });

  const failStart = await core.startRun({ target: 'spec:live-fail.spec.js', timeoutMs: 90_000 });
  assert.equal(failStart.lifecycle, 'RUNNING');
  const failed = await waitForResult(core, failStart.runId);
  assert.equal(failed.outcome, 'FAILED');
  assert.deepEqual(failed.summary, {
    total: 1, passed: 0, failed: 1, skipped: 0, flaky: 0,
  });

  assert.notEqual(passStart.runId, failStart.runId);
  await fs.access(path.join(repositoryRoot, 'artifacts', 'runs', passStart.runId, 'playwright-results.json'));
  await fs.access(path.join(repositoryRoot, 'artifacts', 'runs', failStart.runId, 'playwright-results.json'));
});
