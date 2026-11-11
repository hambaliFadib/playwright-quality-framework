'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '../..');
const RUN_ID = '123e4567-e89b-42d3-a456-426614175004';

function runNode(args, { cwd = ROOT, env = process.env } = {}) {
  return spawnSync(process.execPath, args, {
    cwd,
    env,
    encoding: 'utf8',
    timeout: 20_000,
    windowsHide: true,
    shell: false,
  });
}

function reporterOutput(runId) {
  const env = { ...process.env, PQF_EVIDENCE_ENABLED: 'false' };
  if (runId === undefined) delete env.PQF_EXECUTION_RUN_ID;
  else env.PQF_EXECUTION_RUN_ID = runId;

  const inspect = [
    "const config = require('./playwright.config.js');",
    "const json = config.reporter.find(entry => entry[0] === 'json');",
    "process.stdout.write(JSON.stringify(json[1].outputFile));",
  ].join('');
  const result = runNode(['-e', inspect], { env });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test('existing human CLI commands remain callable through package scripts', () => {
  const scripts = require('../../package.json').scripts;
  assert.equal(scripts['test:e2e'], 'node --env-file-if-exists=.env scripts/run-e2e.js');
  assert.equal(scripts.report, 'playwright show-report');
  assert.equal(scripts['test:ui'], 'node --env-file-if-exists=.env ./node_modules/@playwright/test/cli.js test --ui');
  assert.equal(scripts['test:browser-smoke'], 'node ./node_modules/@playwright/test/cli.js test --config=playwright.smoke.config.js');
});

test('human Playwright configuration retains its original JSON report location', () => {
  assert.equal(reporterOutput(), path.join(ROOT, 'artifacts', 'playwright-results.json'));
});

test('core-managed Playwright configuration isolates JSON by run ID', () => {
  assert.equal(reporterOutput(RUN_ID),
    path.join(ROOT, 'artifacts', 'runs', RUN_ID, 'playwright-results.json'));
});

test('invalid internal run ID fails closed instead of writing into arbitrary paths', () => {
  const env = { ...process.env, PQF_EVIDENCE_ENABLED: 'false', PQF_EXECUTION_RUN_ID: '../wrong' };
  const result = runNode(['-e', "require('./playwright.config.js')"], { env });
  assert.equal(result.status === 0, false);
  assert.equal(result.error, undefined);
  assert.equal(result.stderr.includes('REPORT_INVALID'), true);
});

test('human E2E command skips an empty application suite without an AUT dependency', t => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'pqf-cli-compat-'));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const result = runNode([path.join(ROOT, 'scripts', 'run-e2e.js')], { cwd });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /No application E2E tests configured yet/);
});

test('direct Playwright CLI remains invocable without shell delegation', () => {
  const cli = path.join(ROOT, 'node_modules', '@playwright', 'test', 'cli.js');
  const result = runNode([cli, '--version']);
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^Version \d+\.\d+\.\d+/);
});
