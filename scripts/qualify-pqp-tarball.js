'use strict';

// An explicitly invoked, offline qualification harness. It MUST NOT run in
// public CI without a private tarball; a skipped check is never a PASS.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const Reporter = require('../src/integration/pqp-reporter');

function qualify(tarball) {
  if (typeof tarball !== 'string' || !path.isAbsolute(tarball) || !tarball.endsWith('.tgz')) {
    throw new Error('PQP_QUALIFICATION_TARBALL_REQUIRED');
  }
  const stat = fs.lstatSync(tarball);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('PQP_QUALIFICATION_TARBALL_INVALID');

  const consumer = fs.mkdtempSync(path.join(os.tmpdir(), 'pqf-private-pqp-qual-'));
  try {
    fs.writeFileSync(path.join(consumer, 'package.json'),
      JSON.stringify({ name: 'pqf-private-package-qualification', version: '0.0.0', private: true }));
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const child = spawnSync(npm,
      ['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund',
        '--no-save', '--package-lock=false', tarball],
      { cwd: consumer, encoding: 'utf8', timeout: 60000, maxBuffer: 1024 * 1024,
        env: { ...process.env, npm_config_offline: 'true' } });
    assert.equal(child.error, undefined, 'PQP_QUALIFICATION_INSTALL_FAILED');
    assert.equal(child.status, 0, 'PQP_QUALIFICATION_INSTALL_FAILED');

    const root = path.join(consumer, 'node_modules', '@pqf', 'evidence-envelope');
    const validator = Reporter.loadValidator(root);
    assert.equal(typeof validator.validateEnvelope, 'function');

    const output = [];
    const emitted = Reporter.emitRunCompleted({
      packageRoot: root,
      env: { GITHUB_RUN_ID: '123456', GITHUB_RUN_ATTEMPT: '1' },
      executionId: '11111111-1111-4111-8111-111111111111',
      now: new Date('2026-10-29T16:00:00.123Z'),
      write: message => output.push(message),
    });
    assert.equal(emitted, true, 'PQP_QUALIFICATION_EMIT_REJECTED');
    assert.equal(output.length, 1);
    assert.match(output[0], /^\[pqf-evidence\] /);
    const envelope = JSON.parse(output[0].slice('[pqf-evidence] '.length));
    assert.equal(envelope.eventType, 'run.completed');
    assert.equal(envelope.evidenceRef, undefined);
    assert.equal(validator.validateEnvelope(envelope).ok, true);

    // Keep the approved identity, then tamper with the actual source file.
    // The production loader must fail before requiring changed code.
    const sourcePath = path.join(root, 'src', 'index.cjs');
    fs.appendFileSync(sourcePath, '\n// qualification tampering canary\n');
    assert.throws(() => Reporter.loadValidator(root), /PACKAGE_INTEGRITY_INVALID/);

    process.stdout.write('PQP_ISOLATED_TARBALL_QUALIFICATION_PASS\n');
  } finally {
    fs.rmSync(consumer, { recursive: true, force: true });
  }
}

if (require.main === module) {
  try {
    if (process.argv.length !== 3) {
      throw new Error('PQP_QUALIFICATION_TARBALL_REQUIRED');
    }
    qualify(process.argv[2]);
  } catch (error) {
    const allowed = new Set([
      'PQP_QUALIFICATION_TARBALL_REQUIRED',
      'PQP_QUALIFICATION_TARBALL_INVALID',
      'PQP_QUALIFICATION_INSTALL_FAILED',
      'PQP_QUALIFICATION_EMIT_REJECTED',
    ]);
    const message = allowed.has(error.message) ? error.message : 'PQP_QUALIFICATION_FAILED';
    process.stderr.write(message + '\n');
    process.exitCode = 2;
  }
}
module.exports = { qualify };
