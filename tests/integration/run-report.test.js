'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  outputFileFromEnvironment,
  classifyReport,
  createRunReporter,
  _readRun,
  _runReportFile,
} = require('../../src/core/run-report');

const IDS = [
  '123e4567-e89b-42d3-a456-426614174000',
  '123e4567-e89b-42d3-a456-426614174001',
];

function spec(statuses) {
  return {
    title: 'auth test',
    tests: statuses.map(status => ({ status, projectName: 'chromium', results: [] })),
  };
}

function report(statuses, errors = []) {
  return {
    suites: [{ title: 'auth', specs: [spec(statuses)], suites: [] }],
    errors,
    stats: {
      expected: statuses.filter(x => x === 'expected').length,
      unexpected: statuses.filter(x => x === 'unexpected').length,
      flaky: statuses.filter(x => x === 'flaky').length,
      skipped: statuses.filter(x => x === 'skipped').length,
    },
  };
}

async function fixture(t) {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'pqf-report-isolation-'));
  t.after(async () => fs.rm(folder, { recursive: true, force: true }));
  const reporter = createRunReporter(folder);
  return { folder, reporter };
}

test('human CLI retains the legacy reporter path when no run identity is present', () => {
  assert.equal(outputFileFromEnvironment('/repo', {}), path.join('/repo', 'artifacts', 'playwright-results.json'));
  assert.equal(outputFileFromEnvironment('/repo', { PQF_EXECUTION_RUN_ID: IDS[0] }),
    _runReportFile('/repo', IDS[0]));
});

test('report paths reject arbitrary IDs and traversal without inspecting filesystem', () => {
  for (const id of ['../escape', 'a/b', 'x', '', null, 'C:\\secrets']) {
    assert.throws(() => _runReportFile('/repo', id), /REPORT_INVALID/);
  }
});

test('classification requires a positive clean test count and exit code zero for PASSED', () => {
  assert.deepEqual(classifyReport(report(['expected', 'expected']), 0), {
    outcome: 'PASSED',
    summary: { total: 2, passed: 2, failed: 0, skipped: 0, flaky: 0 },
    errorCode: null,
  });
  assert.deepEqual(classifyReport(report([]), 0).outcome, 'NO_TESTS');
  assert.deepEqual(classifyReport(report(['expected']), 1).outcome, 'ERROR');
});

test('failed skipped unexpected or flaky tests cannot be PASS even with exit code zero', () => {
  for (const status of ['unexpected', 'flaky', 'skipped']) {
    const result = classifyReport(report(['expected', status]), 0);
    assert.equal(result.outcome, 'FAILED');
    assert.equal(result.summary.total, 2);
  }
  assert.equal(classifyReport(report(['unexpected']), 1).outcome, 'FAILED');
});

test('suite hierarchy is recursively counted without losing nested specs', () => {
  const doc = report([]);
  doc.suites[0].suites.push({
    title: 'nested',
    suites: [],
    specs: [spec(['expected', 'skipped'])],
  });
  doc.stats.expected = 1;
  doc.stats.skipped = 1;
  assert.equal(classifyReport(doc, 0).outcome, 'FAILED');
});

test('missing malformed and inconsistent JSON is rejected with REPORT_INVALID', () => {
  for (const doc of [
    null, {}, [], { suites: [], stats: {}, errors: [] },
    { ...report(['expected']), stats: { ...report(['expected']).stats, expected: 2 } },
    report(['unknown']),
    { ...report(['expected']), errors: null },
  ]) assert.throws(() => classifyReport(doc, 0), /REPORT_INVALID/);
});

test('runner failures without reliable evidence cannot be PASS', () => {
  assert.equal(classifyReport(report(['expected']), 2).outcome, 'ERROR');
  assert.equal(classifyReport(report(['expected']), null, 'SIGTERM').outcome, 'ERROR');
  assert.equal(classifyReport(report(['expected'], [{ message: 'runner failure' }]), 0).outcome, 'ERROR');
});

test('each run gets an exclusive directory and cannot reuse an old report', async t => {
  const { folder, reporter } = await fixture(t);
  const one = await reporter.prepareRun(IDS[0]);
  const two = await reporter.prepareRun(IDS[1]);
  assert.notEqual(one, two);
  assert.ok(one.startsWith(path.join(folder, 'artifacts', 'runs')));
  await assert.rejects(reporter.prepareRun(IDS[0]), /REPORT_INVALID/);
  assert.equal(one, _runReportFile(folder, IDS[0]));
});

test('missing current-run report does not fall back to a previous valid report', async t => {
  const { folder, reporter } = await fixture(t);
  const previous = await reporter.prepareRun(IDS[0]);
  await fs.writeFile(previous, JSON.stringify(report(['expected'])));
  await reporter.prepareRun(IDS[1]);
  await assert.rejects(reporter.readRun(IDS[1], 0), /REPORT_INVALID/);
  assert.equal((await reporter.readRun(IDS[0], 0)).outcome, 'PASSED');
  assert.equal((await _readRun(folder, IDS[0], 0)).summary.passed, 1);
});

test('report parsing rejects malformed JSON, symlinked files, and oversized files', async t => {
  const { reporter } = await fixture(t);
  const file = await reporter.prepareRun(IDS[0]);
  await fs.writeFile(file, '{not-json');
  await assert.rejects(reporter.readRun(IDS[0], 0), /REPORT_INVALID/);
  await fs.writeFile(file, 'x'.repeat(16 * 1024 * 1024 + 1));
  await assert.rejects(reporter.readRun(IDS[0], 0), /REPORT_INVALID/);
});

test('symlinked report directory is not accepted for reading', async t => {
  const { folder, reporter } = await fixture(t);
  const file = await reporter.prepareRun(IDS[0]);
  await fs.writeFile(file, JSON.stringify(report(['expected'])));
  const directory = path.dirname(file);
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'pqf-report-outside-'));
  t.after(async () => fs.rm(outside, { recursive: true, force: true }));
  await fs.rename(directory, path.join(outside, 'real-dir'));
  await fs.symlink(path.join(outside, 'real-dir'), directory, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(reporter.readRun(IDS[0], 0), /REPORT_INVALID/);
});

test('public summaries and classification never include raw reporter content', () => {
  const doc = report(['expected']);
  doc.suites[0].specs[0].title = 'Sensitive test details';
  doc.errors = [];
  const result = classifyReport(doc, 0);
  assert.deepEqual(Object.keys(result).sort(), ['errorCode', 'outcome', 'summary']);
  assert.equal(JSON.stringify(result).includes('Sensitive test details'), false);
});
