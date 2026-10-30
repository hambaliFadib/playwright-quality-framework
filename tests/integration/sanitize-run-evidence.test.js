'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { sanitizeRunEvidence } = require('../../src/integration/sanitize-run-evidence');

const valid = {
  runId: 'run-123',
  status: 'passed',
  startedAt: '2026-10-30T03:00:00.000Z',
  finishedAt: '2026-10-30T03:00:01.250Z',
  durationMs: 1250,
};

test('returns only allowlisted metadata and drops unknown sensitive fields', () => {
  const result = sanitizeRunEvidence({
    ...valid,
    error: 'password=super-secret',
    url: 'https://user:pass@example.test/private?token=secret',
    attachments: [{ path: '/private/report.zip' }],
    title: 'Customer account 123456',
  });
  assert.equal(result.ok, true);
  assert.deepEqual(Object.keys(result.value), ['schemaVersion', 'runId', 'status', 'startedAt', 'finishedAt', 'durationMs']);
  assert.equal(JSON.stringify(result).includes('secret'), false);
  assert.equal(JSON.stringify(result).includes('customer'), false);
});

test('rejects invalid status and does not normalize unknown values', () => {
  for (const status of ['skipped', 'flaky', 'unexpected', 'unknown', null]) {
    assert.deepEqual(sanitizeRunEvidence({ ...valid, status }), { ok: false, code: 'INVALID_STATUS' });
  }
});

test('rejects unsafe run identifiers and path-like identifiers', () => {
  for (const runId of ['../secret', 'https://example.test', 'a'.repeat(129), '', null]) {
    assert.deepEqual(sanitizeRunEvidence({ ...valid, runId }), { ok: false, code: 'INVALID_RUN_ID' });
  }
});

test('rejects malformed timestamps and time inversion', () => {
  assert.deepEqual(sanitizeRunEvidence({ ...valid, startedAt: 'yesterday' }), { ok: false, code: 'INVALID_STARTED_AT' });
  assert.deepEqual(sanitizeRunEvidence({ ...valid, finishedAt: '2026-10-29T03:00:00.000Z' }), { ok: false, code: 'INVALID_TIME_ORDER' });
});

test('rejects negative, fractional, non-finite and excessive duration', () => {
  for (const durationMs of [-1, 1.5, Infinity, 7 * 24 * 60 * 60 * 1000 + 1]) {
    assert.deepEqual(sanitizeRunEvidence({ ...valid, durationMs }), { ok: false, code: 'INVALID_DURATION' });
  }
});

test('rejects null, arrays and primitive inputs', () => {
  for (const input of [null, [], 'record', 1]) {
    assert.deepEqual(sanitizeRunEvidence(input), { ok: false, code: 'INVALID_INPUT' });
  }
});
