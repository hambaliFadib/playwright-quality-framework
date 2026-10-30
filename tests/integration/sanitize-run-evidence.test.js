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

test('rejects accessor properties without invoking getters', () => {
  let invoked = false;
  const input = { ...valid };
  Object.defineProperty(input, 'runId', {
    enumerable: true,
    configurable: true,
    get() {
      invoked = true;
      throw new Error('caller-controlled getter executed');
    },
  });
  assert.deepEqual(sanitizeRunEvidence(input), { ok: false, code: 'INVALID_INPUT' });
  assert.equal(invoked, false);
});

test('getter cannot mutate another field before validation', () => {
  let invoked = false;
  const input = { ...valid, durationMs: -1 };
  Object.defineProperty(input, 'status', {
    enumerable: true,
    configurable: true,
    get() {
      invoked = true;
      input.durationMs = 1250;
      return 'passed';
    },
  });
  assert.deepEqual(sanitizeRunEvidence(input), { ok: false, code: 'INVALID_INPUT' });
  assert.equal(invoked, false);
  assert.equal(input.durationMs, -1);
});

test('rejects inherited required fields instead of reading the prototype chain', () => {
  const input = Object.create({ ...valid });
  assert.deepEqual(sanitizeRunEvidence(input), { ok: false, code: 'INVALID_INPUT' });
});

test('proxy descriptor inspection failures return a static rejection code', () => {
  const input = new Proxy({ ...valid }, {
    getOwnPropertyDescriptor() {
      throw new Error('proxy inspection failed');
    },
  });
  assert.deepEqual(sanitizeRunEvidence(input), { ok: false, code: 'INVALID_INPUT' });
});

test('rejects revoked proxies without throwing', () => {
  const { proxy, revoke } = Proxy.revocable({ ...valid }, {});
  revoke();
  assert.deepEqual(sanitizeRunEvidence(proxy), { ok: false, code: 'INVALID_INPUT' });
});
