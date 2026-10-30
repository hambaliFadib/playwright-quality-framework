'use strict';

// Explicit private-package Playwright E2E qualification; never used by public CI.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createNpmCliInvocation } = require('./lib/npm-cli-invocation');
const Reporter = require('../src/integration/pqp-reporter');

const ROOT = path.resolve(__dirname, '..');
const MARKER = '[pqf-evidence] ';

function qualify(tarball) {
  if (typeof tarball !== 'string' || !path.isAbsolute(tarball) ||
      !tarball.toLowerCase().endsWith('.tgz')) {
    throw new Error('TARBALL_REQUIRED');
  }
  const stat = fs.lstatSync(tarball);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('TARBALL_INVALID');

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pqf-phase3f-'));
  try {
    const consumer = path.join(tmp, 'consumer');
    const cases = path.join(tmp, 'cases');
    fs.mkdirSync(consumer);
    fs.mkdirSync(cases);
    fs.writeFileSync(path.join(consumer, 'package.json'), JSON.stringify({
      name: 'pqf-phase3f-private-consumer', version: '0.0.0', private: true
    }));

    const npm = createNpmCliInvocation([
      'install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund',
      '--no-save', '--package-lock=false', tarball
    ]);
    const installed = spawnSync(npm.command, npm.args, {
      cwd: consumer, encoding: 'utf8', shell: false, timeout: 60000,
      maxBuffer: 1024 * 1024,
      env: { ...process.env, npm_config_offline: 'true' }
    });
    assert.equal(installed.error, undefined, 'INSTALL_SPAWN_FAILED');
    assert.equal(installed.status, 0, 'INSTALL_FAILED');

    const packageRoot = path.join(consumer, 'node_modules', '@pqf', 'evidence-envelope');
    const validator = Reporter.loadValidator(packageRoot);
    const testModule = require.resolve('@playwright/test');
    const cli = require.resolve('@playwright/test/cli');
    const originalConfig = path.join(ROOT, 'playwright.config.js');
    const reporterPath = path.join(ROOT, 'src', 'integration', 'pqp-reporter.js');
    const configPath = path.join(tmp, 'playwright.config.cjs');
    const specPath = path.join(cases, 'qualification.spec.cjs');

    fs.writeFileSync(specPath, [
      "'use strict';",
      'const { test, expect } = require(' + JSON.stringify(testModule) + ');',
      "test('phase3f isolated Playwright execution', () => {",
      '  expect(1 + 1).toBe(2);',
      "  if (process.env.PQF_PHASE3F_FORCE_FAIL === 'true') {",
      "    throw new Error('PHASE3F_PRIVATE_TEST_SENTINEL');",
      '  }',
      '});', ''
    ].join('\n'));

    // Load the real production config, preserving its opt-in decision.
    // Use a disposable test directory and suppress Playwright report artifacts.
    fs.writeFileSync(configPath, [
      "'use strict';",
      'const config = require(' + JSON.stringify(originalConfig) + ');',
      'const reporter = ' + JSON.stringify('./src/integration/pqp-reporter.js') + ';',
      'const enabled = config.reporter.some(entry => Array.isArray(entry) && entry[0] === reporter);',
      'module.exports = { ...config, testDir: ' + JSON.stringify(cases) + ',',
      '  outputDir: ' + JSON.stringify(path.join(tmp, 'results')) + ',',
      '  projects: [{ name: "phase3f", use: {} }], retries: 0, workers: 1,',
      '  reporter: enabled ? [["list"], [' + JSON.stringify(reporterPath) + ']] : [["list"]]',
      '};', ''
    ].join('\n'));

    const scenarios = [
      { name: 'disabled-pass', enabled: false, fail: false, installed: true, code: 0, count: 0 },
      { name: 'enabled-pass', enabled: true, fail: false, installed: true, code: 0, count: 1 },
      { name: 'enabled-fail', enabled: true, fail: true, installed: true, code: 1, count: 1 },
      { name: 'missing-package-pass', enabled: true, fail: false, installed: false, code: 0, count: 0 }
    ];
    for (const scenario of scenarios) {
      const env = { ...process.env,
        PQF_EVIDENCE_ENABLED: scenario.enabled ? 'true' : 'false',
        PQF_EVIDENCE_ENVELOPE_PATH: scenario.installed ? packageRoot : path.join(tmp, 'missing-package'),
        PQF_PHASE3F_FORCE_FAIL: scenario.fail ? 'true' : 'false',
        CI: 'true'
      };
      // Run the actual Playwright CLI, with the actual production reporter class.
      const result = spawnSync(process.execPath, [
        cli, 'test', '--config', configPath, '--workers=1'
      ], {
        cwd: ROOT, env, encoding: 'utf8', timeout: 120000,
        maxBuffer: 2 * 1024 * 1024, shell: false
      });
      assert.equal(result.error, undefined, 'PLAYWRIGHT_SPAWN_FAILED');
      assert.equal(result.status, scenario.code, 'PLAYWRIGHT_EXIT_STATUS_INVALID');
      const output = String(result.stdout || '') + '\n' + String(result.stderr || '');
      const events = output.split(/\r?\n/).filter(line => line.startsWith(MARKER));
      assert.equal(events.length, scenario.count, 'EVENT_COUNT_INVALID');
      for (const event of events) {
        const envelope = JSON.parse(event.slice(MARKER.length));
        const validated = validator.validateEnvelope(envelope);
        assert.equal(validated.ok, true, 'REAL_VALIDATOR_REJECTED_EVENT');
        assert.equal(validated.value.eventType, 'run.completed');
        assert.deepEqual(Object.keys(validated.value),
          ['contractVersion', 'eventId', 'eventType', 'runId', 'occurredAt', 'source']);
      }
      assert.equal(output.includes('PHASE3F_PRIVATE_TEST_SENTINEL'), scenario.fail);
      if (!scenario.installed) {
        assert.equal(output.includes('PQF evidence reporter: integration unavailable; event omitted.'), true);
      }
      if (!scenario.enabled) {
        assert.equal(output.includes('PQF evidence reporter:'), false);
      }
      process.stdout.write('PHASE3F_SCENARIO_PASS ' + scenario.name + '\n');
    }
    process.stdout.write('PQP_PQF_PLAYWRIGHT_E2E_QUALIFICATION_PASS\n');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

if (require.main === module) {
  try {
    if (process.argv.length !== 3) throw new Error('TARBALL_REQUIRED');
    qualify(process.argv[2]);
  } catch {
    process.stderr.write('PQP_PQF_PLAYWRIGHT_E2E_QUALIFICATION_FAILED\n');
    process.exitCode = 2;
  }
}

module.exports = { qualify };
