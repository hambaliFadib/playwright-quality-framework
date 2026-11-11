'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { setImmediate: scheduleImmediate } = require('node:timers');
const test = require('node:test');

const { _createExecutionCore } = require('../../src/core/execution-core');

const RUN_IDS = Array.from({ length: 30 }, (_, index) =>
  '123e4567-e89b-42d3-a456-' + String(index + 1).padStart(12, '0'),
);
const SPEC = {
  target: 'spec:auth/login.spec.js',
  tests: [{ id: 'spec:auth/login.spec.js', relativePath: 'auth/login.spec.js' }],
};
const ABSOLUTE_SPEC = '/repo/tests/e2e/auth/login.spec.js';

class FakeChild extends EventEmitter {
  constructor(pid) {
    super();
    this.pid = pid;
    this.killedSignals = [];
  }

  kill(signal) {
    this.killedSignals.push(signal);
    return true;
  }
}

function createScheduler() {
  const handles = [];
  return {
    handles,
    setTimeout(callback, milliseconds) {
      const handle = { callback, milliseconds, cleared: false, fired: false };
      handles.push(handle);
      return handle;
    },
    clearTimeout(handle) {
      if (handle) handle.cleared = true;
    },
    async fire(handle) {
      assert.ok(handle);
      assert.equal(handle.cleared, false);
      handle.fired = true;
      handle.callback();
      await Promise.resolve();
      await Promise.resolve();
    },
    pending(milliseconds) {
      return handles.find(handle =>
        !handle.cleared && !handle.fired &&
        (milliseconds === undefined || handle.milliseconds === milliseconds));
    },
  };
}

function createHarness(options = {}) {
  const scheduler = createScheduler();
  const spawnCalls = [];
  const children = [];
  const killCalls = [];
  let nextPid = 5000;
  let uuidIndex = 0;
  const taskkillPath = 'C:\\Windows\\System32\\taskkill.exe';

  const spawnImpl = options.spawn || ((command, args, spawnOptions) => {
    spawnCalls.push({ command, args, options: spawnOptions });
    const child = new FakeChild(command === taskkillPath ? undefined : nextPid++);
    children.push(child);
    return child;
  });

  const reporter = options.reporter || {
    async prepareRun() {},
    async readRun() {
      return {
        outcome: 'PASSED',
        summary: { total: 1, passed: 1, failed: 0, skipped: 0, flaky: 0 },
        errorCode: null,
      };
    },
  };

  const catalog = {
    listTests: async () => ({ tests: [SPEC.tests[0]] }),
    resolveTestTarget: options.resolveTestTarget || (async () =>
      options.empty ? { target: 'suite:all', tests: [] } : SPEC),
    revalidateResolvedTestTargetForExecution: options.revalidate || (async () => [ABSOLUTE_SPEC]),
  };

  const core = _createExecutionCore({
    spawn: spawnImpl,
    kill: (pid, signal) => {
      killCalls.push({ pid, signal });
      if (options.kill) return options.kill(pid, signal);
      return undefined;
    },
    setTimeout: scheduler.setTimeout,
    clearTimeout: scheduler.clearTimeout,
    now: (() => {
      let current = 1_800_000_000_000;
      return () => current++;
    })(),
    randomUUID: () => RUN_IDS[uuidIndex++],
    catalog,
    reporter,
    platform: options.platform || 'linux',
    execPath: '/usr/bin/node',
    playwrightCliPath: '/repo/node_modules/@playwright/test/cli.js',
    repositoryRoot: '/repo',
    systemRoot: 'C:\\Windows',
    env: { BASE_URL: 'https://example.invalid', [['SAUCEDEMO', 'PASSWORD'].join('_')]: 'not-returned' },
    terminationGraceMs: 1_000,
  });

  return { core, scheduler, spawnCalls, children, killCalls, taskkillPath, catalog };
}

async function start(harness, input = { target: SPEC.target }) {
  return harness.core.startRun(input);
}

async function flushAsyncLifecycle() {
  await new Promise(resolve => scheduleImmediate(resolve));
}

test('starts the fixed Node Playwright CLI asynchronously with shell disabled', async () => {
  const harness = createHarness();
  const response = await start(harness);

  assert.equal(response.lifecycle, 'RUNNING');
  assert.equal(response.runId, RUN_IDS[0]);
  assert.equal(harness.spawnCalls.length, 1);
  assert.equal(harness.spawnCalls[0].command, '/usr/bin/node');
  assert.deepEqual(harness.spawnCalls[0].args, [
    '--env-file-if-exists=/repo/.env',
    '/repo/node_modules/@playwright/test/cli.js',
    'test',
    ABSOLUTE_SPEC,
    '--project=chromium',
    '--workers=1',
    '--retries=0',
  ]);
  assert.equal(harness.spawnCalls[0].options.shell, false);
  assert.equal(harness.spawnCalls[0].options.cwd, '/repo');
  assert.equal(harness.spawnCalls[0].options.detached, true);
  assert.equal(harness.spawnCalls[0].options.stdio, 'ignore');
  assert.equal(harness.spawnCalls[0].options.env[['SAUCEDEMO', 'PASSWORD'].join('_')], 'not-returned');
  assert.equal(harness.spawnCalls[0].options.env.PQF_EXECUTION_RUN_ID, RUN_IDS[0]);
});

test('loads only the fixed repository .env file while preserving inherited environment', async () => {
  const harness = createHarness();
  await start(harness);
  const invocation = harness.spawnCalls[0];
  assert.equal(invocation.command, '/usr/bin/node');
  assert.equal(invocation.args[0], '--env-file-if-exists=/repo/.env');
  assert.equal(invocation.options.env.BASE_URL, 'https://example.invalid');
  assert.equal(invocation.args.some(arg => arg.includes('.env.ai')), false);
  assert.equal(invocation.options.shell, false);
});

test('revalidates resolved files immediately before spawning', async () => {
  let revalidated = false;
  const harness = createHarness({
    revalidate: async () => {
      revalidated = true;
      return [ABSOLUTE_SPEC];
    },
  });
  await start(harness);
  assert.equal(revalidated, true);
  assert.equal(harness.spawnCalls.length, 1);
});

test('does not spawn when execution-time filesystem revalidation fails', async () => {
  const harness = createHarness({
    revalidate: async () => {
      const error = new Error('CATALOG_INVALID');
      error.code = 'CATALOG_INVALID';
      throw error;
    },
  });
  assert.deepEqual(await start(harness), { ok: false, code: 'CATALOG_INVALID' });
  assert.equal(harness.spawnCalls.length, 0);
});

test('rejects invalid input without starting a process', async () => {
  const harness = createHarness();
  assert.deepEqual(await start(harness, { target: SPEC.target, command: 'node' }), {
    ok: false,
    code: 'INVALID_INPUT',
  });
  assert.equal(harness.spawnCalls.length, 0);
});

test('returns stable catalogue errors without starting a process', async () => {
  const harness = createHarness({
    resolveTestTarget: async () => {
      const error = new Error('TEST_NOT_FOUND');
      error.code = 'TEST_NOT_FOUND';
      throw error;
    },
  });
  assert.deepEqual(await start(harness), { ok: false, code: 'TEST_NOT_FOUND' });
  assert.equal(harness.spawnCalls.length, 0);
});

test('allows only one active execution and does not queue concurrent starts', async () => {
  const harness = createHarness();
  const first = await start(harness);
  const second = await start(harness);
  assert.equal(first.lifecycle, 'RUNNING');
  assert.deepEqual(second, { ok: false, code: 'EXECUTION_BUSY' });
  assert.equal(harness.spawnCalls.length, 1);
});

test('reserves the execution slot while asynchronous target resolution is pending', async () => {
  let releaseResolution;
  const resolution = new Promise(resolve => { releaseResolution = resolve; });
  const harness = createHarness({ resolveTestTarget: () => resolution });
  const firstPromise = start(harness);
  const second = await start(harness);
  assert.deepEqual(second, { ok: false, code: 'EXECUTION_BUSY' });
  releaseResolution(SPEC);
  const first = await firstPromise;
  assert.equal(first.lifecycle, 'RUNNING');
  assert.equal(harness.spawnCalls.length, 1);
});

test('natural process close waits for the validated reporter before publishing PASSED', async () => {
  const harness = createHarness();
  const response = await start(harness);
  harness.children[0].emit('close', 0, null);
  assert.equal(harness.core.getRunStatus(response.runId).lifecycle, 'RUNNING');
  assert.deepEqual(harness.core.getRunResult(response.runId), {
    available: false,
    runId: response.runId,
  });
  await flushAsyncLifecycle();
  const status = harness.core.getRunStatus(response.runId);
  assert.equal(status.lifecycle, 'COMPLETED');
  assert.equal(status.outcome, 'PASSED');
  assert.equal(harness.core.getRunResult(response.runId).result.summary.passed, 1);
});

test('a missing reporter creates terminal ERROR instead of a false PASS', async () => {
  const harness = createHarness({
    reporter: {
      async prepareRun() {},
      async readRun() { throw new Error('private report path'); },
    },
  });
  const response = await start(harness);
  harness.children[0].emit('close', 0, null);
  await flushAsyncLifecycle();
  const status = harness.core.getRunStatus(response.runId);
  assert.equal(status.lifecycle, 'COMPLETED');
  assert.equal(status.outcome, 'ERROR');
  assert.equal(status.errorCode, 'REPORT_INVALID');
  assert.equal(harness.core.getRunResult(response.runId).result.outcome, 'ERROR');
  assert.equal(JSON.stringify(harness.core.getRunResult(response.runId)).includes('private report path'), false);
});

test('result parsing keeps the execution slot locked until evidence is checked', async () => {
  let releaseRead;
  const pendingRead = new Promise(resolve => { releaseRead = resolve; });
  const harness = createHarness({
    reporter: {
      async prepareRun() {},
      readRun: () => pendingRead,
    },
  });
  const response = await start(harness);
  harness.children[0].emit('close', 0, null);
  assert.deepEqual(await start(harness), { ok: false, code: 'EXECUTION_BUSY' });
  assert.deepEqual(harness.core.cancelRun(response.runId), { ok: false, code: 'CANCEL_NOT_ALLOWED' });
  releaseRead({
    outcome: 'PASSED',
    summary: { total: 1, passed: 1, failed: 0, skipped: 0, flaky: 0 },
    errorCode: null,
  });
  await flushAsyncLifecycle();
  assert.equal(harness.core.getRunStatus(response.runId).outcome, 'PASSED');
  assert.equal((await start(harness)).lifecycle, 'RUNNING');
});

test('failed per-run directory preparation does not spawn or retain a busy slot', async () => {
  let deny = true;
  const harness = createHarness({
    reporter: {
      async prepareRun() {
        if (deny) {
          deny = false;
          throw new Error('private file name');
        }
      },
      async readRun() { throw new Error('REPORT_INVALID'); },
    },
  });
  assert.deepEqual(await start(harness), { ok: false, code: 'REPORT_INVALID' });
  assert.equal(harness.spawnCalls.length, 0);
  assert.equal((await start(harness)).lifecycle, 'RUNNING');
});

test('reporter FAILED and NO_TESTS classifications are reflected in public results', async () => {
  for (const classification of [
    { outcome: 'FAILED', summary: { total: 2, passed: 1, failed: 1, skipped: 0, flaky: 0 }, errorCode: null },
    { outcome: 'NO_TESTS', summary: { total: 0, passed: 0, failed: 0, skipped: 0, flaky: 0 }, errorCode: null },
  ]) {
    const harness = createHarness({
      reporter: { async prepareRun() {}, async readRun() { return classification; } },
    });
    const response = await start(harness);
    harness.children[0].emit('close', classification.outcome === 'FAILED' ? 1 : 0, null);
    await flushAsyncLifecycle();
    const status = harness.core.getRunStatus(response.runId);
    assert.equal(status.outcome, classification.outcome);
    assert.deepEqual(harness.core.getRunResult(response.runId).result.summary, classification.summary);
  }
});

test('spawn error becomes a stable ERROR result after child close', async () => {
  const harness = createHarness();
  const response = await start(harness);
  harness.children[0].emit('error', new Error('private spawn detail'));
  harness.children[0].emit('close', null, null);
  assert.equal(harness.core.getRunStatus(response.runId).outcome, 'ERROR');
  const result = harness.core.getRunResult(response.runId);
  assert.equal(result.available, true);
  assert.equal(result.result.errorCode, 'EXECUTION_START_FAILED');
  assert.equal(JSON.stringify(result).includes('private spawn detail'), false);
});

test('suite:all with an empty catalogue completes immediately as NO_TESTS', async () => {
  const harness = createHarness({ empty: true });
  const response = await start(harness, { target: 'suite:all' });
  assert.equal(response.lifecycle, 'COMPLETED');
  assert.equal(response.outcome, 'NO_TESTS');
  assert.equal(harness.spawnCalls.length, 0);
  assert.equal(harness.core.getRunResult(response.runId).result.outcome, 'NO_TESTS');
});

test('timeout enters CANCELLING and waits for process-group cleanup and child close', async () => {
  const harness = createHarness();
  const response = await start(harness, { target: SPEC.target, timeoutMs: 1_000 });
  const timeout = harness.scheduler.pending(1_000);
  await harness.scheduler.fire(timeout);

  assert.equal(harness.core.getRunStatus(response.runId).lifecycle, 'CANCELLING');
  assert.deepEqual(harness.killCalls, [{ pid: -5000, signal: 'SIGTERM' }]);

  harness.children[0].emit('close', null, 'SIGTERM');
  assert.equal(harness.core.getRunStatus(response.runId).lifecycle, 'CANCELLING');

  const grace = harness.scheduler.pending(1_000);
  await harness.scheduler.fire(grace);
  assert.deepEqual(harness.killCalls[1], { pid: -5000, signal: 'SIGKILL' });
  assert.equal(harness.core.getRunStatus(response.runId).lifecycle, 'COMPLETED');
  assert.equal(harness.core.getRunStatus(response.runId).outcome, 'TIMED_OUT');
});

test('cancellation is not terminal until child close and process-tree cleanup complete', async () => {
  const harness = createHarness();
  const response = await start(harness);
  assert.deepEqual(harness.core.cancelRun(response.runId), { ok: true });
  assert.equal(harness.core.getRunStatus(response.runId).lifecycle, 'CANCELLING');

  harness.children[0].emit('close', null, 'SIGTERM');
  assert.equal(harness.core.getRunStatus(response.runId).lifecycle, 'CANCELLING');

  await harness.scheduler.fire(harness.scheduler.pending(1_000));
  assert.equal(harness.core.getRunStatus(response.runId).lifecycle, 'COMPLETED');
  assert.equal(harness.core.getRunStatus(response.runId).outcome, 'CANCELLED');
});

test('repeated cancellation is idempotent while cleanup is in progress', async () => {
  const harness = createHarness();
  const response = await start(harness);
  assert.deepEqual(harness.core.cancelRun(response.runId), { ok: true });
  assert.deepEqual(harness.core.cancelRun(response.runId), { ok: true });
  assert.equal(harness.killCalls.length, 1);
});

test('POSIX process-group absence is treated as already terminated', async () => {
  const harness = createHarness({
    kill: () => {
      const error = new Error('no process group');
      error.code = 'ESRCH';
      throw error;
    },
  });
  const response = await start(harness);
  assert.deepEqual(harness.core.cancelRun(response.runId), { ok: true });
  harness.children[0].emit('close', null, 'SIGTERM');
  await flushAsyncLifecycle();
  assert.equal(harness.core.getRunStatus(response.runId).lifecycle, 'COMPLETED');
  assert.equal(harness.core.getRunStatus(response.runId).outcome, 'CANCELLED');
});

test('Windows cancellation uses absolute taskkill.exe with process-tree flags', async () => {
  const harness = createHarness({ platform: 'win32' });
  const response = await start(harness);
  assert.equal(harness.spawnCalls[0].options.detached, false);
  assert.deepEqual(harness.core.cancelRun(response.runId), { ok: true });

  const taskkillCall = harness.spawnCalls[1];
  assert.equal(taskkillCall.command, harness.taskkillPath);
  assert.deepEqual(taskkillCall.args, ['/PID', '5000', '/T', '/F']);
  assert.equal(taskkillCall.options.shell, false);

  harness.children[1].emit('close', 0, null);
  harness.children[0].emit('close', null, 'SIGKILL');
  await flushAsyncLifecycle();
  assert.equal(harness.core.getRunStatus(response.runId).lifecycle, 'COMPLETED');
  assert.equal(harness.core.getRunStatus(response.runId).outcome, 'CANCELLED');
});

test('Windows tree cleanup failure is reported as ERROR, not CANCELLED', async () => {
  const harness = createHarness({ platform: 'win32' });
  const response = await start(harness);
  harness.core.cancelRun(response.runId);
  harness.children[1].emit('close', 1, null);
  harness.children[0].emit('close', null, 'SIGKILL');
  await flushAsyncLifecycle();
  const status = harness.core.getRunStatus(response.runId);
  assert.equal(status.lifecycle, 'COMPLETED');
  assert.equal(status.outcome, 'ERROR');
  assert.equal(status.errorCode, 'PROCESS_CLEANUP_FAILED');
  assert.deepEqual(harness.children[0].killedSignals, ['SIGKILL']);
});

test('natural close clears the timeout timer', async () => {
  const harness = createHarness();
  const response = await start(harness);
  const timeout = harness.scheduler.pending(120_000);
  harness.children[0].emit('close', 1, null);
  assert.equal(timeout.cleared, true);
  assert.equal(harness.core.getRunStatus(response.runId).lifecycle, 'RUNNING');
  await flushAsyncLifecycle();
  assert.equal(harness.core.getRunStatus(response.runId).lifecycle, 'COMPLETED');
});

test('completed history retains only the latest twenty records', async () => {
  const harness = createHarness();
  const ids = [];
  for (let index = 0; index < 21; index += 1) {
    const response = await start(harness);
    ids.push(response.runId);
    harness.children[index].emit('close', 0, null);
    await flushAsyncLifecycle();
  }
  assert.deepEqual(harness.core.getRunStatus(ids[0]), { ok: false, code: 'RUN_NOT_FOUND' });
  assert.equal(harness.core.getRunStatus(ids[1]).lifecycle, 'COMPLETED');
  assert.equal(harness.core.getRunStatus(ids[20]).lifecycle, 'COMPLETED');
});

test('active execution is never evicted while completed history is trimmed', async () => {
  const harness = createHarness();
  const ids = [];
  for (let index = 0; index < 20; index += 1) {
    const response = await start(harness);
    ids.push(response.runId);
    harness.children[index].emit('close', 0, null);
    await flushAsyncLifecycle();
  }
  const active = await start(harness);
  assert.equal(harness.core.getRunStatus(active.runId).lifecycle, 'RUNNING');
  assert.equal(harness.core.getRunStatus(ids[0]).lifecycle, 'COMPLETED');
});

test('unknown and malformed run IDs return stable errors', async () => {
  const harness = createHarness();
  assert.deepEqual(harness.core.getRunStatus('not-a-uuid'), { ok: false, code: 'INVALID_INPUT' });
  assert.deepEqual(harness.core.getRunResult(RUN_IDS[29]), { ok: false, code: 'RUN_NOT_FOUND' });
  assert.deepEqual(harness.core.cancelRun(RUN_IDS[29]), { ok: false, code: 'RUN_NOT_FOUND' });
});

test('completed runs cannot be cancelled again', async () => {
  const harness = createHarness();
  const response = await start(harness);
  harness.children[0].emit('close', 0, null);
  assert.deepEqual(harness.core.cancelRun(response.runId), { ok: false, code: 'CANCEL_NOT_ALLOWED' });
  await flushAsyncLifecycle();
  assert.equal(harness.core.getRunStatus(response.runId).outcome, 'PASSED');
});

test('public status and result never expose process metadata or environment secrets', async () => {
  const harness = createHarness();
  const response = await start(harness);
  const publicValues = JSON.stringify({
    status: harness.core.getRunStatus(response.runId),
    result: harness.core.getRunResult(response.runId),
  });
  for (const forbidden of ['5000', '/repo', ['SAUCEDEMO', 'PASSWORD'].join('_'), 'not-returned', 'stdout', 'stderr']) {
    assert.equal(publicValues.includes(forbidden), false);
  }
});

test('start lock is released after a catalogue error so a later run can start', async () => {
  let shouldFail = true;
  const harness = createHarness({
    resolveTestTarget: async () => {
      if (shouldFail) {
        shouldFail = false;
        const error = new Error('CATALOG_UNAVAILABLE');
        error.code = 'CATALOG_UNAVAILABLE';
        throw error;
      }
      return SPEC;
    },
  });
  assert.deepEqual(await start(harness), { ok: false, code: 'CATALOG_UNAVAILABLE' });
  const response = await start(harness);
  assert.equal(response.lifecycle, 'RUNNING');
});
