'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const contract = require('../../src/core/execution-contract');

const runId = '123e4567-e89b-42d3-a456-426614174000';
const startedAt = '2026-11-08T03:00:00.000Z';
const finishedAt = '2026-11-08T03:00:01.000Z';
const summary = { total: 2, passed: 2, failed: 0, skipped: 0, flaky: 0 };

test('start input defaults timeout and rejects unknown fields', () => {
  assert.deepEqual(contract.validateStartRunInput({ target: 'suite:all' }), {
    ok: true, value: { target: 'suite:all', timeoutMs: contract.DEFAULT_TIMEOUT_MS },
  });
  assert.deepEqual(contract.validateStartRunInput({ target: 'suite:all', command: 'rm -rf /' }), {
    ok: false, code: 'INVALID_INPUT',
  });
});

test('start input enforces bounded integer timeout', () => {
  for (const timeoutMs of [0, 999, 300001, 1.5, '120000', null]) {
    assert.deepEqual(contract.validateStartRunInput({ target: 'suite:all', timeoutMs }), {
      ok: false, code: 'TIMEOUT_OUT_OF_RANGE',
    });
  }
  assert.equal(contract.validateStartRunInput({ target: 'suite:all', timeoutMs: 1000 }).ok, true);
  assert.equal(contract.validateStartRunInput({ target: 'suite:all', timeoutMs: 300000 }).ok, true);
});

test('target schemas reject traversal, absolute paths, and non-POSIX separators at every entry point', () => {
  assert.equal(contract.validateTestTarget('suite:all').ok, true);
  assert.equal(contract.validateTestTarget('spec:auth/login.spec.js').ok, true);
  assert.equal(contract.StartRunInputSchema.safeParse({ target: 'spec:.hidden/login.spec.js' }).success, true);
  const invalidTargets = [
    '../secret.spec.js', 'spec:../secret.spec.js', 'spec:/etc/passwd.spec.js',
    'spec:C:/secret.spec.js', 'spec:auth\\\\login.spec.js', 'spec:auth//login.spec.js',
    'spec:auth/./login.spec.js', 'spec:auth/../login.spec.js', 'spec:auth/login.js',
    ...[0x00, 0x1f, 0x7f].map(code => `spec:auth/${String.fromCharCode(code)}evil.spec.js`),
    'shell:node', null, 42,
  ];
  for (const target of invalidTargets) {
    assert.equal(contract.validateTestTarget(target).ok, false, String(target));
    assert.equal(contract.TestTargetSchema.safeParse(target).success, false, String(target));
    assert.equal(contract.StartRunInputSchema.safeParse({ target }).success, false, String(target));
  }
});

test('test descriptors require a safe relative path matching the stable spec ID', () => {
  assert.equal(contract.TestDescriptorSchema.safeParse({
    id: 'spec:auth/login.spec.js',
    relativePath: 'auth/login.spec.js',
  }).success, true);
  for (const descriptor of [
    { id: 'spec:auth/login.spec.js', relativePath: '../auth/login.spec.js' },
    { id: 'spec:auth/login.spec.js', relativePath: 'auth\\\\login.spec.js' },
    { id: 'spec:auth/other.spec.js', relativePath: 'auth/login.spec.js' },
    { id: 'suite:all', relativePath: 'auth/login.spec.js' },
  ]) assert.equal(contract.TestDescriptorSchema.safeParse(descriptor).success, false);
});

test('lifecycle is separate from outcome', () => {
  assert.equal(contract.LifecycleSchema.parse('RUNNING'), 'RUNNING');
  assert.equal(contract.OutcomeSchema.parse('PASSED'), 'PASSED');
  assert.equal(contract.RunStatusSchema.safeParse({ runId, lifecycle: 'RUNNING', startedAt }).success, true);
  assert.equal(contract.RunStatusSchema.safeParse({ runId, lifecycle: 'COMPLETED', startedAt, finishedAt, outcome: 'FAILED' }).success, true);
  assert.equal(contract.RunStatusSchema.safeParse({ runId, lifecycle: 'RUNNING', startedAt, outcome: 'PASSED' }).success, false);
});

test('start response requires UUID and RUNNING lifecycle', () => {
  assert.equal(contract.StartRunResponseSchema.safeParse({ runId, lifecycle: 'RUNNING', startedAt }).success, true);
  assert.equal(contract.StartRunResponseSchema.safeParse({ runId: '../bad', lifecycle: 'RUNNING', startedAt }).success, false);
});

test('PASSED requires at least one executed test and all tests passed', () => {
  const valid = { runId, outcome: 'PASSED', startedAt, finishedAt, durationMs: 1000, summary, errorCode: null };
  assert.equal(contract.RunResultSchema.safeParse(valid).success, true);
  assert.equal(contract.RunResultSchema.safeParse({ ...valid, summary: { total: 0, passed: 0, failed: 0, skipped: 0, flaky: 0 } }).success, false);
  assert.equal(contract.RunResultSchema.safeParse({ ...valid, summary: { ...summary, skipped: 1 } }).success, false);
});

test('FAILED requires failed, skipped, or flaky tests', () => {
  const base = { runId, outcome: 'FAILED', startedAt, finishedAt, durationMs: 1000, summary: { total: 1, passed: 0, failed: 1, skipped: 0, flaky: 0 }, errorCode: null };
  assert.equal(contract.RunResultSchema.safeParse(base).success, true);
  assert.equal(contract.RunResultSchema.safeParse({ ...base, summary }).success, false);
});

test('NO_TESTS cannot contain test counts', () => {
  const base = { runId, outcome: 'NO_TESTS', startedAt, finishedAt, durationMs: 0, summary: { total: 0, passed: 0, failed: 0, skipped: 0, flaky: 0 }, errorCode: null };
  assert.equal(contract.RunResultSchema.safeParse(base).success, true);
  assert.equal(contract.RunResultSchema.safeParse({ ...base, summary }).success, false);
});

test('ERROR requires a stable error code; terminal non-error outcomes do not', () => {
  const base = { runId, outcome: 'ERROR', startedAt, finishedAt, durationMs: 10, summary: { total: 0, passed: 0, failed: 0, skipped: 0, flaky: 0 }, errorCode: 'REPORT_INVALID' };
  assert.equal(contract.RunResultSchema.safeParse(base).success, true);
  assert.equal(contract.RunResultSchema.safeParse({ ...base, errorCode: null }).success, false);
  assert.equal(contract.RunResultSchema.safeParse({ ...base, outcome: 'CANCELLED', errorCode: 'REPORT_INVALID' }).success, false);
});

test('result rejects time inversion, unknown fields, and inconsistent counts', () => {
  const base = { runId, outcome: 'PASSED', startedAt, finishedAt, durationMs: 1000, summary, errorCode: null };
  assert.equal(contract.RunResultSchema.safeParse({ ...base, finishedAt: '2026-11-08T02:59:59.000Z' }).success, false);
  assert.equal(contract.RunResultSchema.safeParse({ ...base, secret: 'token' }).success, false);
  assert.equal(contract.RunResultSchema.safeParse({ ...base, summary: { ...summary, failed: 2 } }).success, false);
});

test('result response distinguishes unavailable from available result', () => {
  const result = { runId, outcome: 'PASSED', startedAt, finishedAt, durationMs: 1000, summary, errorCode: null };
  assert.equal(contract.GetRunResultResponseSchema.safeParse({ available: false, runId }).success, true);
  assert.equal(contract.GetRunResultResponseSchema.safeParse({ available: true, result }).success, true);
});

test('public errors are stable enums and do not carry free-form messages', () => {
  assert.equal(contract.ExecutionErrorSchema.safeParse({ ok: false, code: 'EXECUTION_BUSY' }).success, true);
  assert.equal(contract.ExecutionErrorSchema.safeParse({ ok: false, code: 'arbitrary shell output' }).success, false);
  assert.equal(contract.ExecutionErrorSchema.safeParse({ ok: false, code: 'RUN_NOT_FOUND', stack: 'secret' }).success, false);
});
