'use strict';

const fs = require('node:fs/promises');
const fsConstants = require('node:fs').constants;
const path = require('node:path');
const { RunIdSchema, RunSummarySchema } = require('./execution-contract');

const REPORT_FILE_NAME = 'playwright-results.json';
const MAX_REPORT_BYTES = 16 * 1024 * 1024;
const MAX_REPORT_TESTS = 1_000_000;
const EVIDENCE_RETENTION_DAYS = 30;
const EVIDENCE_RETENTION_MS = EVIDENCE_RETENTION_DAYS * 24 * 60 * 60 * 1000;

function runReportFile(repositoryRoot, runId) {
  if (!RunIdSchema.safeParse(runId).success) throw new Error('REPORT_INVALID');
  return path.join(repositoryRoot, 'artifacts', 'runs', runId, REPORT_FILE_NAME);
}

function outputFileFromEnvironment(repositoryRoot, env = process.env) {
  const runId = env.PQF_EXECUTION_RUN_ID;
  if (runId === undefined || runId === '') {
    return path.join(repositoryRoot, 'artifacts', REPORT_FILE_NAME);
  }
  return runReportFile(repositoryRoot, runId);
}

async function assertDirectory(directory) {
  const stat = await fs.lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('REPORT_INVALID');
}

async function pruneExpiredRunEvidence(repositoryRoot, now = Date.now()) {
  const runs = path.join(repositoryRoot, 'artifacts', 'runs');
  try {
    await assertDirectory(path.join(repositoryRoot, 'artifacts'));
    await assertDirectory(runs);
    const entries = await fs.readdir(runs, { withFileTypes: true });
    for (const entry of entries) {
      if (!RunIdSchema.safeParse(entry.name).success) continue;
      const candidate = path.join(runs, entry.name);
      let stat;
      try {
        stat = await fs.lstat(candidate);
      } catch {
        continue;
      }
      if (!stat.isDirectory() || stat.isSymbolicLink()) continue;
      if (now - stat.mtimeMs <= EVIDENCE_RETENTION_MS) continue;
      await fs.rm(candidate, { recursive: true, force: false });
    }
  } catch (error) {
    if (error && error.code === 'ENOENT') return;
    throw new Error('REPORT_INVALID', { cause: error });
  }
}

async function prepareRun(repositoryRoot, runId) {
  const reportPath = runReportFile(repositoryRoot, runId);
  const artifacts = path.join(repositoryRoot, 'artifacts');
  const runs = path.join(artifacts, 'runs');
  const own = path.dirname(reportPath);
  try {
    await fs.mkdir(artifacts, { recursive: true, mode: 0o700 });
    await assertDirectory(artifacts);
    await fs.chmod(artifacts, 0o700);
    await fs.mkdir(runs, { recursive: true, mode: 0o700 });
    await assertDirectory(runs);
    await fs.chmod(runs, 0o700);
    // Exclusive mkdir ensures a repeated UUID cannot read a previous run's report.
    await fs.mkdir(own, { mode: 0o700 });
    await assertDirectory(own);
    await fs.chmod(own, 0o700);
    await pruneExpiredRunEvidence(repositoryRoot);
  } catch {
    throw new Error('REPORT_INVALID');
  }
  return reportPath;
}

function collectStatuses(suites) {
  if (!Array.isArray(suites)) throw new Error('REPORT_INVALID');
  const counts = { expected: 0, unexpected: 0, flaky: 0, skipped: 0 };
  const stack = suites.slice();
  let examined = 0;

  while (stack.length > 0) {
    const suite = stack.pop();
    if (!suite || typeof suite !== 'object' || Array.isArray(suite)) throw new Error('REPORT_INVALID');
    if (!Array.isArray(suite.specs) ||
        (suite.suites !== undefined && !Array.isArray(suite.suites))) {
      throw new Error('REPORT_INVALID');
    }
    for (const nested of suite.suites || []) stack.push(nested);
    for (const spec of suite.specs) {
      if (!spec || !Array.isArray(spec.tests)) throw new Error('REPORT_INVALID');
      for (const entry of spec.tests) {
        if (!entry || !Object.prototype.hasOwnProperty.call(counts, entry.status)) {
          throw new Error('REPORT_INVALID');
        }
        counts[entry.status] += 1;
        examined += 1;
        if (examined > MAX_REPORT_TESTS) throw new Error('REPORT_INVALID');
      }
    }
  }
  return counts;
}

function classifyReport(report, exitCode, signal = null) {
  if (!report || typeof report !== 'object' || Array.isArray(report)) throw new Error('REPORT_INVALID');
  if (!Array.isArray(report.errors) || !report.stats || typeof report.stats !== 'object') {
    throw new Error('REPORT_INVALID');
  }

  const { expected, unexpected, flaky, skipped } = report.stats;
  const values = [expected, unexpected, flaky, skipped];
  if (values.some(value => !Number.isSafeInteger(value) || value < 0 || value > MAX_REPORT_TESTS)) {
    throw new Error('REPORT_INVALID');
  }
  const counts = collectStatuses(report.suites);
  if (expected !== counts.expected || unexpected !== counts.unexpected ||
      flaky !== counts.flaky || skipped !== counts.skipped) {
    throw new Error('REPORT_INVALID');
  }
  const total = expected + unexpected + flaky + skipped;
  if (total > MAX_REPORT_TESTS) throw new Error('REPORT_INVALID');

  const summary = { total, passed: expected, failed: unexpected, flaky, skipped };
  if (!RunSummarySchema.safeParse(summary).success) throw new Error('REPORT_INVALID');

  if (signal !== null || (exitCode !== 0 && exitCode !== 1) || report.errors.length > 0) {
    return { outcome: 'ERROR', summary, errorCode: 'REPORT_INVALID' };
  }
  if (total === 0) return { outcome: 'NO_TESTS', summary, errorCode: null };
  if (unexpected + skipped + flaky > 0) return { outcome: 'FAILED', summary, errorCode: null };
  if (exitCode !== 0) return { outcome: 'ERROR', summary, errorCode: 'REPORT_INVALID' };
  return { outcome: 'PASSED', summary, errorCode: null };
}

async function readRun(repositoryRoot, runId, exitCode, signal = null) {
  const file = runReportFile(repositoryRoot, runId);
  try {
    await assertDirectory(path.join(repositoryRoot, 'artifacts'));
    await assertDirectory(path.join(repositoryRoot, 'artifacts', 'runs'));
    await assertDirectory(path.dirname(file));
    const noFollow = fsConstants.O_NOFOLLOW || 0;
    const handle = await fs.open(file, fsConstants.O_RDONLY | noFollow);
    let content;
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size === 0 || stat.size > MAX_REPORT_BYTES) {
        throw new Error('REPORT_INVALID');
      }
      content = await handle.readFile({ encoding: 'utf8' });
      if (Buffer.byteLength(content, 'utf8') > MAX_REPORT_BYTES) {
        throw new Error('REPORT_INVALID');
      }
    } finally {
      await handle.close();
    }
    return classifyReport(JSON.parse(content), exitCode, signal);
  } catch {
    throw new Error('REPORT_INVALID');
  }
}

function createRunReporter(repositoryRoot) {
  return Object.freeze({
    prepareRun: runId => prepareRun(repositoryRoot, runId),
    readRun: (runId, exitCode, signal) => readRun(repositoryRoot, runId, exitCode, signal),
  });
}

module.exports = {
  outputFileFromEnvironment,
  classifyReport,
  createRunReporter,
  _prepareRun: prepareRun,
  _readRun: readRun,
  _runReportFile: runReportFile,
  _pruneExpiredRunEvidence: pruneExpiredRunEvidence,
};
