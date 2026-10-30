'use strict';

// Offline cross-package qualification. Requires the frozen private PQP tarball.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createNpmCliInvocation } = require('./lib/npm-cli-invocation');
const Reporter = require('../src/integration/pqp-reporter');
const { sanitizeRunEvidence } = require('../src/integration/sanitize-run-evidence');

const FIXED_EXECUTION_ID = '11111111-1111-4111-8111-111111111111';

function qualify(tarball) {
  if (typeof tarball !== 'string' || !path.isAbsolute(tarball) || !tarball.endsWith('.tgz')) {
    throw new Error('PQP_QUALIFICATION_TARBALL_REQUIRED');
  }
  const stat = fs.lstatSync(tarball);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('PQP_QUALIFICATION_TARBALL_INVALID');

  const consumer = fs.mkdtempSync(path.join(os.tmpdir(), 'pqf-pqp-integration-'));
  try {
    fs.writeFileSync(path.join(consumer, 'package.json'),
      JSON.stringify({ name: 'pqf-pqp-integration-qualification', version: '0.0.0', private: true }));
    const invocation = createNpmCliInvocation([
      'install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund',
      '--no-save', '--package-lock=false', tarball,
    ]);
    const install = spawnSync(invocation.command, invocation.args,
      { cwd: consumer, encoding: 'utf8', timeout: 60000, maxBuffer: 1024 * 1024,
        env: { ...process.env, npm_config_offline: 'true' }, shell: false });
    assert.equal(install.error, undefined, 'PQP_QUALIFICATION_INSTALL_FAILED');
    assert.equal(install.status, 0, 'PQP_QUALIFICATION_INSTALL_FAILED');

    const packageRoot = path.join(consumer, 'node_modules', '@pqf', 'evidence-envelope');
    const validator = Reporter.loadValidator(packageRoot);
    const sanitized = sanitizeRunEvidence({
      runId: 'qualification-run-1',
      status: 'passed',
      startedAt: '2026-10-30T03:00:00.000Z',
      finishedAt: '2026-10-30T03:00:01.250Z',
      durationMs: 1250,
      title: 'must-not-cross-boundary',
      error: 'must-not-cross-boundary',
      attachments: [{ path: 'must-not-cross-boundary' }],
    });
    assert.equal(sanitized.ok, true, 'SANITIZER_REJECTED_VALID_RUN');
    assert.deepEqual(Object.keys(sanitized.value),
      ['schemaVersion', 'runId', 'status', 'startedAt', 'finishedAt', 'durationMs']);

    const envelope = Reporter.createRunCompletedEnvelope({
      env: { GITHUB_RUN_ID: '123456', GITHUB_RUN_ATTEMPT: '1' },
      executionId: FIXED_EXECUTION_ID,
      now: new Date(sanitized.value.finishedAt),
    });
    const validation = validator.validateEnvelope(envelope);
    assert.equal(validation.ok, true, 'PQP_VALIDATOR_REJECTED_PQF_ENVELOPE');
    assert.deepEqual(Object.keys(validation.value),
      ['contractVersion', 'eventId', 'eventType', 'runId', 'occurredAt', 'source']);
    const serialized = JSON.stringify(validation.value);
    for (const forbidden of ['must-not-cross-boundary', 'attachments', 'error', 'title', 'durationMs', 'status']) {
      assert.equal(serialized.includes(forbidden), false, 'UNAPPROVED_FIELD_CROSSED_BOUNDARY');
    }

    const messages = [];
    const emitted = Reporter.emitRunCompleted({
      packageRoot,
      env: { GITHUB_RUN_ID: '123456', GITHUB_RUN_ATTEMPT: '1' },
      executionId: FIXED_EXECUTION_ID,
      now: new Date(sanitized.value.finishedAt),
      write: message => messages.push(message),
    });
    assert.equal(emitted, true, 'PRODUCTION_REPORTER_EMIT_FAILED');
    assert.equal(messages.length, 1);
    const emittedEnvelope = JSON.parse(messages[0].slice('[pqf-evidence] '.length));
    assert.equal(validator.validateEnvelope(emittedEnvelope).ok, true);

    process.stdout.write('PQP_PQF_CROSS_PACKAGE_QUALIFICATION_PASS\n');
  } finally {
    fs.rmSync(consumer, { recursive: true, force: true });
  }
}

if (require.main === module) {
  try {
    if (process.argv.length !== 3) throw new Error('PQP_QUALIFICATION_TARBALL_REQUIRED');
    qualify(process.argv[2]);
  } catch (error) {
    const allowed = new Set(['PQP_QUALIFICATION_TARBALL_REQUIRED', 'PQP_QUALIFICATION_TARBALL_INVALID',
      'NPM_CLI_PATH_UNAVAILABLE',
      'PQP_QUALIFICATION_INSTALL_FAILED', 'SANITIZER_REJECTED_VALID_RUN',
      'PQP_VALIDATOR_REJECTED_PQF_ENVELOPE', 'UNAPPROVED_FIELD_CROSSED_BOUNDARY',
      'PRODUCTION_REPORTER_EMIT_FAILED']);
    process.stderr.write((allowed.has(error.message) ? error.message : 'PQP_QUALIFICATION_FAILED') + '\n');
    process.exitCode = 2;
  }
}
module.exports = { qualify };
