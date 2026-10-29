'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const Reporter = require('../../src/integration/pqp-reporter');
const { isPqpReporterEnabled, hasValidOptInValue } = require('../../src/integration/pqp-reporter-config');

const fixedDate = new Date('2026-10-29T16:00:00.123Z');
const validValidator = {
  validateEnvelope(envelope) {
    const allowed = ['contractVersion', 'eventId', 'eventType', 'runId', 'occurredAt', 'source'];
    const keys = Object.keys(envelope);
    const valid = keys.length === allowed.length && allowed.every(key => keys.includes(key)) &&
      envelope.contractVersion === '1.0' && envelope.eventType === 'run.completed' &&
      /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(envelope.eventId) &&
      /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(envelope.runId) &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(envelope.occurredAt) &&
      envelope.source === 'pqf-playwright-reporter';
    return valid ? { ok: true, value: envelope } : { ok: false, issues: [{ field: 'envelope', code: 'INVALID' }] };
  },
};

test('PQP reporter is disabled unless the opt-in value is exactly true', () => {
  for (const value of [undefined, '', 'false', 'TRUE', '1', 'yes']) assert.equal(isPqpReporterEnabled(value), false);
  assert.equal(isPqpReporterEnabled('true'), true);
  assert.equal(hasValidOptInValue(undefined), true);
  assert.equal(hasValidOptInValue(''), true);
  assert.equal(hasValidOptInValue('false'), true);
  assert.equal(hasValidOptInValue('true'), true);
  assert.equal(hasValidOptInValue('TRUE'), false);
});

test('run.completed envelope contains only the allowlisted contract fields', () => {
  const envelope = Reporter.createRunCompletedEnvelope({
    env: { GITHUB_RUN_ID: '12345', GITHUB_RUN_ATTEMPT: '2' },
    pid: 999,
    now: fixedDate,
  });
  assert.deepEqual(Object.keys(envelope), ['contractVersion', 'eventId', 'eventType', 'runId', 'occurredAt', 'source']);
  assert.deepEqual(envelope, {
    contractVersion: '1.0',
    eventId: 'gh-12345-a2-completed',
    eventType: 'run.completed',
    runId: 'gh-12345-a2',
    occurredAt: '2026-10-29T16:00:00.123Z',
    source: 'pqf-playwright-reporter',
  });
});

test('event identity is stable for the same CI run and attempt', () => {
  const env = { GITHUB_RUN_ID: '12345', GITHUB_RUN_ATTEMPT: '2' };
  const first = Reporter.createRunCompletedEnvelope({ env, now: fixedDate });
  const second = Reporter.createRunCompletedEnvelope({ env, now: new Date('2026-10-29T16:01:00.456Z') });
  assert.equal(first.eventId, second.eventId);
  assert.equal(first.runId, second.runId);
  assert.notEqual(first.occurredAt, second.occurredAt);
});

test('local run identity does not include arbitrary environment strings', () => {
  const envelope = Reporter.createRunCompletedEnvelope({ env: { GITHUB_RUN_ID: 'bad/id\nsecret' }, pid: 321, now: fixedDate });
  assert.equal(envelope.runId, 'local-321');
  assert.equal(envelope.eventId, 'local-321-completed');
});

test('valid event is emitted as metadata only and does not mutate a Playwright result', () => {
  const messages = [];
  const result = { status: 'failed', errors: [{ message: 'sensitive app payload' }] };
  const before = JSON.stringify(result);
  const emitted = Reporter.emitRunCompleted({
    env: { GITHUB_RUN_ID: '77', GITHUB_RUN_ATTEMPT: '1' },
    now: fixedDate,
    write: message => messages.push(message),
    validator: validValidator,
  });
  assert.equal(emitted, true);
  assert.equal(messages.length, 1);
  assert.match(messages[0], /^\[pqf-evidence\] /);
  assert.equal(messages[0].includes('sensitive app payload'), false);
  assert.equal(JSON.stringify(result), before);
});

test('invalid envelope is omitted with a bounded diagnostic', () => {
  const messages = [];
  const emitted = Reporter.emitRunCompleted({
    env: { GITHUB_RUN_ID: '77', GITHUB_RUN_ATTEMPT: '1' },
    now: fixedDate,
    write: message => messages.push(message),
    validator: { validateEnvelope: () => ({ ok: false, issues: [{ field: 'runId', code: 'INVALID_ID' }] }) },
  });
  assert.equal(emitted, false);
  assert.deepEqual(messages, ['PQF evidence reporter: envelope rejected; event omitted.']);
});

test('missing or incompatible private package fails soft without throwing', () => {
  const messages = [];
  const emitted = Reporter.emitRunCompleted({
    packageRoot: path.join(os.tmpdir(), 'pqp-package-that-does-not-exist'),
    env: { GITHUB_RUN_ID: '77', GITHUB_RUN_ATTEMPT: '1' },
    now: fixedDate,
    write: message => messages.push(message),
  });
  assert.equal(emitted, false);
  assert.deepEqual(messages, ['PQF evidence reporter: integration unavailable; event omitted.']);
});

test('loader rejects a relative package root before loading code', () => {
  assert.throws(() => Reporter.loadValidator('node_modules/@pqf/evidence-envelope'), /PACKAGE_PATH_INVALID/);
});

test('loader rejects a package with an unexpected identity or version', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pqf-pqp-package-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'src'));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: '@attacker/evidence-envelope', version: '9.9.9', private: true }));
  fs.writeFileSync(path.join(root, 'src', 'index.cjs'), 'module.exports = { validateEnvelope() { return { ok: true }; } };\n');
  assert.throws(() => Reporter.loadValidator(root), /PACKAGE_IDENTITY_INVALID/);
});

test('reporter lifecycle is best effort and never throws when package path is absent', () => {
  const reporter = new Reporter();
  assert.doesNotThrow(() => reporter.onEnd({ status: 'failed', errors: [{ message: 'must not be serialized' }] }));
});
