'use strict';

const ALLOWED_STATUSES = new Set(['passed', 'failed', 'timedOut', 'interrupted']);
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const ISO_MILLIS_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const MAX_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const REQUIRED_FIELDS = ['runId', 'status', 'startedAt', 'finishedAt', 'durationMs'];

function reject(code) {
  return { ok: false, code };
}

function readOwnDataProperties(input) {
  const values = Object.create(null);
  try {
    for (const key of REQUIRED_FIELDS) {
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
        return reject('INVALID_INPUT');
      }
      values[key] = descriptor.value;
    }
    return { ok: true, value: values };
  } catch {
    // Proxy traps and descriptor inspection failures are untrusted input failures.
    return reject('INVALID_INPUT');
  }
}

function sanitizeRunEvidence(input) {
  try {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return reject('INVALID_INPUT');
    }

    // Inspect descriptors only. Never evaluate caller-controlled getters.
    const inspected = readOwnDataProperties(input);
    if (!inspected.ok) return inspected;

    const { runId, status, startedAt, finishedAt, durationMs } = inspected.value;

    if (typeof runId !== 'string' || !SAFE_ID.test(runId)) return reject('INVALID_RUN_ID');
    if (!ALLOWED_STATUSES.has(status)) return reject('INVALID_STATUS');
    if (typeof startedAt !== 'string' || !ISO_MILLIS_UTC.test(startedAt) ||
        !Number.isFinite(Date.parse(startedAt)) || new Date(startedAt).toISOString() !== startedAt) {
      return reject('INVALID_STARTED_AT');
    }
    if (typeof finishedAt !== 'string' || !ISO_MILLIS_UTC.test(finishedAt) ||
        !Number.isFinite(Date.parse(finishedAt)) || new Date(finishedAt).toISOString() !== finishedAt) {
      return reject('INVALID_FINISHED_AT');
    }
    if (!Number.isSafeInteger(durationMs) || durationMs < 0 || durationMs > MAX_DURATION_MS) {
      return reject('INVALID_DURATION');
    }
    if (Date.parse(finishedAt) < Date.parse(startedAt)) return reject('INVALID_TIME_ORDER');

    // Construct a new allowlisted record. Never spread or serialize caller input.
    return {
      ok: true,
      value: {
        schemaVersion: '1.0',
        runId,
        status,
        startedAt,
        finishedAt,
        durationMs,
      },
    };
  } catch {
    // Fail closed with a bounded code for unexpected inspection/validation failures.
    return reject('INVALID_INPUT');
  }
}

module.exports = { sanitizeRunEvidence };
