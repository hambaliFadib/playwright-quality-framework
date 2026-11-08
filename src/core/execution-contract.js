'use strict';

const { z } = require('zod');

const DEFAULT_TIMEOUT_MS = 120_000;
const MIN_TIMEOUT_MS = 1_000;
const MAX_TIMEOUT_MS = 300_000;
const MAX_COMPLETED_RUNS = 20;
const MAX_SUMMARY_COUNT = 1_000_000;
const ISO_MILLIS_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const RUN_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SPEC_ID_PATTERN = /^spec:(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._/-]+(?:\.spec|\.test)\.js$/;
const ERROR_CODES = Object.freeze([
  'INVALID_INPUT',
  'INVALID_TARGET',
  'TEST_NOT_FOUND',
  'EXECUTION_BUSY',
  'RUN_NOT_FOUND',
  'RESULT_NOT_READY',
  'TIMEOUT_OUT_OF_RANGE',
  'EXECUTION_START_FAILED',
  'REPORT_INVALID',
  'CANCEL_NOT_ALLOWED',
]);

const LifecycleSchema = z.enum(['RUNNING', 'CANCELLING', 'COMPLETED']);
const OutcomeSchema = z.enum(['PASSED', 'FAILED', 'NO_TESTS', 'TIMED_OUT', 'CANCELLED', 'ERROR']);
const ErrorCodeSchema = z.enum(ERROR_CODES);
const UtcTimestampSchema = z.string().regex(ISO_MILLIS_UTC).refine(value => {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}, 'Expected a valid UTC timestamp with millisecond precision');
const RunIdSchema = z.string().regex(RUN_ID_PATTERN);
const TestTargetSchema = z.union([
  z.literal('suite:all'),
  z.string().regex(SPEC_ID_PATTERN),
]);

const StartRunInputSchema = z.object({
  target: TestTargetSchema,
  timeoutMs: z.number().int().min(MIN_TIMEOUT_MS).max(MAX_TIMEOUT_MS).default(DEFAULT_TIMEOUT_MS),
}).strict();

const ListTestsInputSchema = z.object({}).strict();

const TestDescriptorSchema = z.object({
  id: TestTargetSchema,
  relativePath: z.string().min(1).max(512).regex(/^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._/-]+$/),
}).strict();

const ListTestsResultSchema = z.object({
  tests: z.array(TestDescriptorSchema).max(10_000),
}).strict();

const RunSummarySchema = z.object({
  total: z.number().int().min(0).max(MAX_SUMMARY_COUNT),
  passed: z.number().int().min(0).max(MAX_SUMMARY_COUNT),
  failed: z.number().int().min(0).max(MAX_SUMMARY_COUNT),
  skipped: z.number().int().min(0).max(MAX_SUMMARY_COUNT),
  flaky: z.number().int().min(0).max(MAX_SUMMARY_COUNT),
}).strict().refine(summary =>
  summary.passed + summary.failed + summary.skipped + summary.flaky <= summary.total,
'Summary categories cannot exceed total tests');

const RunResultSchema = z.object({
  runId: RunIdSchema,
  outcome: OutcomeSchema,
  startedAt: UtcTimestampSchema,
  finishedAt: UtcTimestampSchema,
  durationMs: z.number().int().min(0).max(7 * 24 * 60 * 60 * 1000),
  summary: RunSummarySchema,
  errorCode: ErrorCodeSchema.nullable(),
}).strict().refine(value => Date.parse(value.finishedAt) >= Date.parse(value.startedAt),
'finishedAt must not precede startedAt').refine(value => {
  if (value.outcome === 'PASSED') {
    return value.summary.total > 0 && value.summary.passed === value.summary.total &&
      value.summary.failed === 0 && value.summary.skipped === 0 && value.summary.flaky === 0 &&
      value.errorCode === null;
  }
  if (value.outcome === 'NO_TESTS') return value.summary.total === 0 && value.errorCode === null;
  if (value.outcome === 'FAILED') return value.summary.failed + value.summary.skipped + value.summary.flaky > 0 && value.errorCode === null;
  if (value.outcome === 'TIMED_OUT') return value.errorCode === null;
  if (value.outcome === 'CANCELLED') return value.errorCode === null;
  return value.outcome === 'ERROR' && value.errorCode !== null;
}, 'Outcome and summary/errorCode are inconsistent');

const RunStatusSchema = z.discriminatedUnion('lifecycle', [
  z.object({
    runId: RunIdSchema,
    lifecycle: z.literal('RUNNING'),
    startedAt: UtcTimestampSchema,
  }).strict(),
  z.object({
    runId: RunIdSchema,
    lifecycle: z.literal('CANCELLING'),
    startedAt: UtcTimestampSchema,
  }).strict(),
  z.object({
    runId: RunIdSchema,
    lifecycle: z.literal('COMPLETED'),
    startedAt: UtcTimestampSchema,
    finishedAt: UtcTimestampSchema,
    outcome: OutcomeSchema,
  }).strict().refine(value => Date.parse(value.finishedAt) >= Date.parse(value.startedAt)),
]);

const StartRunResponseSchema = z.object({
  runId: RunIdSchema,
  lifecycle: z.literal('RUNNING'),
  startedAt: UtcTimestampSchema,
}).strict();

const GetRunResultResponseSchema = z.discriminatedUnion('available', [
  z.object({ available: z.literal(false), runId: RunIdSchema }).strict(),
  z.object({ available: z.literal(true), result: RunResultSchema }).strict(),
]);

const ExecutionErrorSchema = z.object({
  ok: z.literal(false),
  code: ErrorCodeSchema,
}).strict();

const ExecutionSuccessSchema = z.object({ ok: z.literal(true) }).strict();

function validateStartRunInput(input) {
  const parsed = StartRunInputSchema.safeParse(input);
  if (parsed.success) return { ok: true, value: parsed.data };
  const timeoutIssue = parsed.error.issues.some(issue => issue.path.includes('timeoutMs'));
  return { ok: false, code: timeoutIssue ? 'TIMEOUT_OUT_OF_RANGE' : 'INVALID_INPUT' };
}

function validateTestTarget(target) {
  const parsed = TestTargetSchema.safeParse(target);
  if (!parsed.success) return { ok: false, code: 'INVALID_TARGET' };
  if (parsed.data.startsWith('spec:')) {
    const relativePath = parsed.data.slice('spec:'.length);
    if (relativePath.includes('\\') || relativePath.includes(':') || relativePath.startsWith('.') ||
        relativePath.split('/').some(part => !part || part === '.' || part === '..')) {
      return { ok: false, code: 'INVALID_TARGET' };
    }
  }
  return { ok: true, value: parsed.data };
}

module.exports = {
  DEFAULT_TIMEOUT_MS,
  MIN_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
  MAX_COMPLETED_RUNS,
  ERROR_CODES,
  LifecycleSchema,
  OutcomeSchema,
  ErrorCodeSchema,
  UtcTimestampSchema,
  RunIdSchema,
  TestTargetSchema,
  StartRunInputSchema,
  ListTestsInputSchema,
  TestDescriptorSchema,
  ListTestsResultSchema,
  RunSummarySchema,
  RunResultSchema,
  RunStatusSchema,
  StartRunResponseSchema,
  GetRunResultResponseSchema,
  ExecutionErrorSchema,
  ExecutionSuccessSchema,
  validateStartRunInput,
  validateTestTarget,
};
