'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { setImmediate: scheduleImmediate } = require('node:timers');
const test = require('node:test');

const { Client, InMemoryTransport } = require('@modelcontextprotocol/client');
const { _createExecutionCore } = require('../../src/core/execution-core');
const { createMcpServer } = require('../../src/mcp/server');

const RUN_ID = '123e4567-e89b-42d3-a456-426614174000';
const UNKNOWN_RUN_ID = '123e4567-e89b-42d3-a456-426614174001';
const SPEC_TARGET = 'spec:auth/login.spec.js';
const STARTED_AT = '2026-11-16T00:00:00.000Z';
const ROOT = '/trusted/pqf-workspace';
const SECRET = 'PQF_MCP_PRIVATE_SECRET_MARKER';

class FakeChild extends EventEmitter {
  constructor(pid) { super(); this.pid = pid; this.killedSignals = []; }
  kill(signal) { this.killedSignals.push(signal); return true; }
}
function createScheduler() {
  const handles = [];
  return {
    setTimeout(callback, milliseconds) {
      const handle = { callback, milliseconds, cleared: false, fired: false };
      handles.push(handle); return handle;
    },
    clearTimeout(handle) { if (handle) handle.cleared = true; },
    async fire(handle) {
      assert.ok(handle); assert.equal(handle.cleared, false);
      handle.fired = true; handle.callback();
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    },
    pending(milliseconds) {
      return handles.find(h => !h.cleared && !h.fired && h.milliseconds === milliseconds);
    },
  };
}
function createCoreHarness() {
  const scheduler = createScheduler();
  const child = new FakeChild(6543);
  const killCalls = [];
  const spawnCalls = [];
  let now = Date.parse(STARTED_AT);
  const descriptor = { id: SPEC_TARGET, relativePath: 'auth/login.spec.js' };
  const catalog = {
    async listTests() { return { tests: [descriptor] }; },
    async resolveTestTarget(target) {
      if (target !== SPEC_TARGET && target !== 'suite:all') {
        const error = new Error('TEST_NOT_FOUND'); error.code = 'TEST_NOT_FOUND'; throw error;
      }
      return { target, tests: [descriptor] };
    },
    async revalidateResolvedTestTargetForExecution() {
      return [ROOT + '/tests/e2e/auth/login.spec.js'];
    },
  };
  const reporter = {
    async prepareRun() {},
    async readRun() {
      return { outcome: 'PASSED', summary: { total: 1, passed: 1, failed: 0, skipped: 0, flaky: 0 }, errorCode: null };
    },
  };
  const core = _createExecutionCore({
    spawn(command, args, options) { spawnCalls.push({ command, args, options }); return child; },
    kill(pid, signal) { killCalls.push({ pid, signal }); },
    setTimeout: scheduler.setTimeout,
    clearTimeout: scheduler.clearTimeout,
    now: () => now++,
    randomUUID: () => RUN_ID,
    catalog, reporter, platform: 'linux', execPath: '/usr/bin/node',
    playwrightCliPath: ROOT + '/node_modules/@playwright/test/cli.js',
    repositoryRoot: ROOT, env: { [SECRET]: 'never-return-this-value' }, terminationGraceMs: 1_000,
  });
  return { core, scheduler, child, killCalls, spawnCalls };
}
async function connectMcp(executionCore) {
  const server = createMcpServer(executionCore);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'pqf-mcp-qualification', version: '1.0.0' });
  await server.connect(serverTransport); await client.connect(clientTransport);
  return { client, async close() { await client.close().catch(() => {}); await server.close().catch(() => {}); } };
}
function assertToolResult(result, expected, isError = false) {
  assert.equal(result.isError === true, isError);
  assert.deepEqual(result.structuredContent, expected);
  assert.deepEqual(JSON.parse(result.content[0].text), expected);
}
async function assertInvalidCall(client, params) {
  let result; let thrown;
  try { result = await client.callTool(params); } catch (error) { thrown = error; }
  assert.ok(thrown || (result && result.isError === true), 'Invalid MCP arguments must be rejected');
}

test('all five MCP tools exercise the real execution core through MCP protocol transport', async t => {
  const h = createCoreHarness();
  const connection = await connectMcp(h.core);
  t.after(connection.close);
  const { client } = connection;
  const listing = await client.listTools();
  const tools = Object.fromEntries(listing.tools.map(tool => [tool.name, tool]));
  assert.deepEqual(Object.keys(tools).sort(), ['cancel_run', 'get_run_result', 'get_run_status', 'list_tests', 'start_run']);
  assert.equal(tools.list_tests.annotations.readOnlyHint, true);
  assert.equal(tools.get_run_status.annotations.readOnlyHint, true);
  assert.equal(tools.get_run_result.annotations.readOnlyHint, true);
  assert.equal(tools.cancel_run.annotations.destructiveHint, true);

  const catalogue = await client.callTool({ name: 'list_tests', arguments: {} });
  assertToolResult(catalogue, { tests: [{ id: SPEC_TARGET, relativePath: 'auth/login.spec.js' }] });
  await assertInvalidCall(client, { name: 'start_run', arguments: { target: 'spec:../outside.spec.js' } });
  await assertInvalidCall(client, { name: 'get_run_status', arguments: { runId: 'not-a-uuid' } });
  assert.equal(h.spawnCalls.length, 0);

  const started = await client.callTool({ name: 'start_run', arguments: { target: SPEC_TARGET } });
  assertToolResult(started, { runId: RUN_ID, lifecycle: 'RUNNING', startedAt: STARTED_AT });
  assert.equal(h.spawnCalls.length, 1);
  const busy = await client.callTool({ name: 'start_run', arguments: { target: SPEC_TARGET } });
  assertToolResult(busy, { ok: false, code: 'EXECUTION_BUSY' }, true);
  const running = await client.callTool({ name: 'get_run_status', arguments: { runId: RUN_ID } });
  assertToolResult(running, { runId: RUN_ID, lifecycle: 'RUNNING', startedAt: STARTED_AT });
  const notReady = await client.callTool({ name: 'get_run_result', arguments: { runId: RUN_ID } });
  assertToolResult(notReady, { available: false, runId: RUN_ID });

  for (const name of ['get_run_status', 'get_run_result', 'cancel_run']) {
    const unknown = await client.callTool({ name, arguments: { runId: UNKNOWN_RUN_ID } });
    assertToolResult(unknown, { ok: false, code: 'RUN_NOT_FOUND' }, true);
  }
  const cancelled = await client.callTool({ name: 'cancel_run', arguments: { runId: RUN_ID } });
  assertToolResult(cancelled, { ok: true });
  const repeated = await client.callTool({ name: 'cancel_run', arguments: { runId: RUN_ID } });
  assertToolResult(repeated, { ok: true });
  const cancelling = await client.callTool({ name: 'get_run_status', arguments: { runId: RUN_ID } });
  assertToolResult(cancelling, { runId: RUN_ID, lifecycle: 'CANCELLING', startedAt: STARTED_AT });

  h.child.emit('close', null, 'SIGTERM');
  const grace = h.scheduler.pending(1_000);
  assert.ok(grace);
  const beforeCleanup = await client.callTool({ name: 'get_run_status', arguments: { runId: RUN_ID } });
  assertToolResult(beforeCleanup, { runId: RUN_ID, lifecycle: 'CANCELLING', startedAt: STARTED_AT });
  await h.scheduler.fire(grace);

  const completed = await client.callTool({ name: 'get_run_status', arguments: { runId: RUN_ID } });
  assertToolResult(completed, {
    runId: RUN_ID, lifecycle: 'COMPLETED', startedAt: STARTED_AT,
    finishedAt: '2026-11-16T00:00:00.001Z', outcome: 'CANCELLED',
  });
  const available = await client.callTool({ name: 'get_run_result', arguments: { runId: RUN_ID } });
  assertToolResult(available, {
    available: true,
    result: {
      runId: RUN_ID, outcome: 'CANCELLED', startedAt: STARTED_AT,
      finishedAt: '2026-11-16T00:00:00.001Z', durationMs: 2,
      summary: { total: 0, passed: 0, failed: 0, skipped: 0, flaky: 0 }, errorCode: null,
    },
  });
  const cancelCompleted = await client.callTool({ name: 'cancel_run', arguments: { runId: RUN_ID } });
  assertToolResult(cancelCompleted, { ok: false, code: 'CANCEL_NOT_ALLOWED' }, true);
  assert.deepEqual(h.killCalls, [{ pid: -6543, signal: 'SIGTERM' }, { pid: -6543, signal: 'SIGKILL' }]);

  const output = JSON.stringify([catalogue, started, running, notReady, cancelling, completed, available]);
  for (const forbidden of ['6543', ROOT, SECRET, 'never-return-this-value', 'stdout', 'stderr', 'reportToken']) {
    assert.equal(output.includes(forbidden), false, 'Public MCP output leaked ' + forbidden);
  }
});

test('MCP adapter preserves stable execution error codes and sanitizes thrown errors', async t => {
  const privateError = new Error('private path /srv/pqf/.env token=' + SECRET);
  const executionCore = {
    async listTests() { throw privateError; },
    async startRun() { return { ok: false, code: 'EXECUTION_BUSY' }; },
    getRunStatus() { return { ok: false, code: 'RUN_NOT_FOUND' }; },
    getRunResult() { return { ok: false, code: 'RESULT_NOT_READY' }; },
    cancelRun() { return { ok: false, code: 'PROCESS_CLEANUP_FAILED' }; },
  };
  const connection = await connectMcp(executionCore);
  t.after(connection.close);
  const { client } = connection;
  const results = await Promise.all([
    client.callTool({ name: 'list_tests', arguments: {} }),
    client.callTool({ name: 'start_run', arguments: { target: SPEC_TARGET } }),
    client.callTool({ name: 'get_run_status', arguments: { runId: RUN_ID } }),
    client.callTool({ name: 'get_run_result', arguments: { runId: RUN_ID } }),
    client.callTool({ name: 'cancel_run', arguments: { runId: RUN_ID } }),
  ]);
  const expected = [
    { ok: false, code: 'CATALOG_UNAVAILABLE' },
    { ok: false, code: 'EXECUTION_BUSY' },
    { ok: false, code: 'RUN_NOT_FOUND' },
    { ok: false, code: 'RESULT_NOT_READY' },
    { ok: false, code: 'PROCESS_CLEANUP_FAILED' },
  ];
  for (let i = 0; i < results.length; i += 1) assertToolResult(results[i], expected[i], true);
  const output = JSON.stringify(results);
  assert.equal(output.includes('/srv/pqf/.env'), false);
  assert.equal(output.includes(SECRET), false);
  assert.equal(output.includes('private path'), false);
});

test('MCP adapter rejects unexpected core fields instead of exposing process or evidence metadata', async t => {
  const executionCore = {
    async listTests() { return { tests: [], rawReportPath: '/private/report.json', token: SECRET }; },
    async startRun() { return { runId: RUN_ID, lifecycle: 'RUNNING', startedAt: STARTED_AT, pid: 6543, reportPath: '/private/report.json', token: SECRET }; },
    getRunStatus() { return { runId: RUN_ID, lifecycle: 'RUNNING', startedAt: STARTED_AT, pid: 6543, stdout: SECRET }; },
    getRunResult() { return { available: false, runId: RUN_ID, rawReport: SECRET }; },
    cancelRun() { return { ok: true, processId: 6543, token: SECRET }; },
  };
  const connection = await connectMcp(executionCore);
  t.after(connection.close);
  const { client } = connection;
  const results = await Promise.all([
    client.callTool({ name: 'list_tests', arguments: {} }),
    client.callTool({ name: 'start_run', arguments: { target: SPEC_TARGET } }),
    client.callTool({ name: 'get_run_status', arguments: { runId: RUN_ID } }),
    client.callTool({ name: 'get_run_result', arguments: { runId: RUN_ID } }),
    client.callTool({ name: 'cancel_run', arguments: { runId: RUN_ID } }),
  ]);
  const expected = [
    { ok: false, code: 'CATALOG_UNAVAILABLE' },
    { ok: false, code: 'INVALID_INPUT' },
    { ok: false, code: 'INVALID_INPUT' },
    { ok: false, code: 'INVALID_INPUT' },
    { ok: false, code: 'CANCEL_NOT_ALLOWED' },
  ];
  for (let i = 0; i < results.length; i += 1) assertToolResult(results[i], expected[i], true);
  const output = JSON.stringify(results);
  for (const forbidden of ['/private/report.json', SECRET, '6543', 'processId', 'rawReport', 'stdout']) {
    assert.equal(output.includes(forbidden), false, 'MCP adapter leaked ' + forbidden);
  }
});


test('MCP result becomes available only after a natural process close and validated PASS report', async t => {
  const h = createCoreHarness();
  const connection = await connectMcp(h.core);
  t.after(connection.close);
  const { client } = connection;

  const started = await client.callTool({ name: 'start_run', arguments: { target: SPEC_TARGET } });
  assert.equal(started.structuredContent.lifecycle, 'RUNNING');

  const beforeClose = await client.callTool({
    name: 'get_run_result', arguments: { runId: RUN_ID },
  });
  assertToolResult(beforeClose, { available: false, runId: RUN_ID });

  h.child.emit('close', 0, null);
  await new Promise(resolve => scheduleImmediate(resolve));
  await new Promise(resolve => scheduleImmediate(resolve));

  const status = await client.callTool({
    name: 'get_run_status', arguments: { runId: RUN_ID },
  });
  assert.equal(status.structuredContent.lifecycle, 'COMPLETED');
  assert.equal(status.structuredContent.outcome, 'PASSED');

  const result = await client.callTool({
    name: 'get_run_result', arguments: { runId: RUN_ID },
  });
  assert.equal(result.structuredContent.available, true);
  assert.deepEqual(result.structuredContent.result.summary, {
    total: 1, passed: 1, failed: 0, skipped: 0, flaky: 0,
  });
  assert.equal(result.structuredContent.result.outcome, 'PASSED');
});
