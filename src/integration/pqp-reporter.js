'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const PACKAGE_NAME = '@pqf/evidence-envelope';
const PACKAGE_VERSION = '0.1.0';
const PACKAGE_SOURCE_SHA256 = 'ca7aca8c3f700b5bf99d93486582845dbe348349b866d0dfa726c4ea911520f5';
const SOURCE_ID = 'pqf-playwright-reporter';
const RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

// An execution UUID is generated once per reporter instance. This prevents
// PID reuse and multiple Playwright invocations within one CI job from colliding.
const EXECUTION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function createRunCompletedEnvelope({ env = process.env, executionId = crypto.randomUUID(), now = new Date() } = {}) {
  if (!EXECUTION_ID_PATTERN.test(executionId)) throw new Error('EXECUTION_ID_INVALID');
  const workflowId = typeof env.GITHUB_RUN_ID === 'string' && /^\d{1,20}$/.test(env.GITHUB_RUN_ID)
    ? env.GITHUB_RUN_ID
    : null;
  const attempt = typeof env.GITHUB_RUN_ATTEMPT === 'string' && /^\d{1,6}$/.test(env.GITHUB_RUN_ATTEMPT)
    ? env.GITHUB_RUN_ATTEMPT
    : '1';
  const runId = workflowId
    ? `gh-${workflowId}-a${attempt}-${executionId}`
    : `local-${executionId}`;
  if (!RUN_ID_PATTERN.test(runId) || `${runId}-completed`.length > 128) {
    throw new Error('RUN_ID_INVALID');
  }

  return {
    contractVersion: '1.0',
    eventId: `${runId}-completed`,
    eventType: 'run.completed',
    runId,
    occurredAt: now.toISOString(),
    source: SOURCE_ID,
  };
}

function loadValidator(packageRoot) {
  if (typeof packageRoot !== 'string' || !path.isAbsolute(packageRoot)) {
    throw new Error('PACKAGE_PATH_INVALID');
  }

  const root = path.resolve(packageRoot);
  const rootStat = fs.lstatSync(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error('PACKAGE_PATH_INVALID');

  const manifestPath = path.join(root, 'package.json');
  const sourcePath = path.join(root, 'src', 'index.cjs');
  const manifestStat = fs.lstatSync(manifestPath);
  const sourceStat = fs.lstatSync(sourcePath);
  if (!manifestStat.isFile() || manifestStat.isSymbolicLink() || !sourceStat.isFile() || sourceStat.isSymbolicLink()) {
    throw new Error('PACKAGE_FILES_INVALID');
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.name !== PACKAGE_NAME || manifest.version !== PACKAGE_VERSION || manifest.private !== true) {
    throw new Error('PACKAGE_IDENTITY_INVALID');
  }

  const source = fs.readFileSync(sourcePath);
  const sourceHash = crypto.createHash('sha256').update(source).digest('hex');
  if (sourceHash !== PACKAGE_SOURCE_SHA256) throw new Error('PACKAGE_INTEGRITY_INVALID');

  const validator = require(sourcePath);
  if (!validator || typeof validator.validateEnvelope !== 'function') throw new Error('PACKAGE_API_INVALID');
  return validator;
}

function safeWrite(write, message) {
  try {
    write(message);
  } catch {
    // Reporter diagnostics are best-effort and must not affect Playwright's result.
  }
}

function emitRunCompleted({ packageRoot, env = process.env, executionId = crypto.randomUUID(), now = new Date(), write = console.log, validator: injectedValidator } = {}) {
  try {
    const validator = injectedValidator || loadValidator(packageRoot || env.PQF_EVIDENCE_ENVELOPE_PATH);
    const envelope = createRunCompletedEnvelope({ env, executionId, now });
    const validation = validator.validateEnvelope(envelope);
    if (!validation || validation.ok !== true || !validation.value) {
      safeWrite(write, 'PQF evidence reporter: envelope rejected; event omitted.');
      return false;
    }

    safeWrite(write, `[pqf-evidence] ${JSON.stringify(validation.value)}`);
    return true;
  } catch {
    safeWrite(write, 'PQF evidence reporter: integration unavailable; event omitted.');
    return false;
  }
}

class PqpEvidenceReporter {
  constructor() {
    this.executionId = crypto.randomUUID();
  }
  onEnd() {
    emitRunCompleted({ executionId: this.executionId });
  }
}

PqpEvidenceReporter.createRunCompletedEnvelope = createRunCompletedEnvelope;
PqpEvidenceReporter.loadValidator = loadValidator;
PqpEvidenceReporter.emitRunCompleted = emitRunCompleted;
module.exports = PqpEvidenceReporter;
