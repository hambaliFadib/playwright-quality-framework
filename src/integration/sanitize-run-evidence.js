'use strict';

const ALLOWED_STATUSES = new Set(['passed', 'failed', 'timedOut', 'interrupted']);
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const ISO_MILLIS_UTC = /^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$/;
const MAX_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

function sanitizeRunEvidence(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, code: 'INVALID_INPUT' };
  }
  const runId = input.runId;
  const status = input.status;
  const startedAt = input.startedAt;
  const finishedAt = input.finishedAt;
  const durationMs = input.durationMs;

  if (typeof runId !== 'string' || !SAFE_ID.test(runId)) return { ok: false, code: 'INVALID_RUN_ID' };
  if (!ALLOWED_STATUSES.has(status)) return { ok: false, code: 'INVALID_STATUS' };
  if (typeof startedAt !== 'string' || !ISO_MILLIS_UTC.test(startedAt) ||
      !Number.isFinite(Date.parse(startedAt)) || new Date(startedAt).toISOString() !== startedAt) {
    return { ok: false, code: 'INVALID_STARTED_AT' };
  }
  if (typeof finishedAt !== 'string' || !ISO_MILLIS_UTC.test(finishedAt) ||
      !Number.isFinite(Date.parse(finishedAt)) || new Date(finishedAt).toISOString() !== finishedAt) {
    return { ok: false, code: 'INVALID_FINISHED_AT' };
  }
  if (!Number.isSafeInteger(durationMs) || durationMs < 0 || durationMs > MAX_DURATION_MS) {
    return { ok: false, code: 'INVALID_DURATION' };
  }
  if (Date.parse(finishedAt) < Date.parse(startedAt)) return { ok: false, code: 'INVALID_TIME_ORDER' };

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
}

module.exports = { sanitizeRunEvidence };
