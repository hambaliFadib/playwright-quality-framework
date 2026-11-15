'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { once } = require('node:events');
const test = require('node:test');

const { Client } = require('@modelcontextprotocol/client');
const { StdioClientTransport } = require('@modelcontextprotocol/client/stdio');

const ROOT = path.resolve(__dirname, '../..');
const ENTRY = path.join(ROOT, 'scripts', 'run-mcp-server.js');
const RUN_ID = '123e4567-e89b-42d3-a456-426614174000';

function createCore() {
  const calls = [];
  const child = new EventEmitter();
  const core = {
    async listTests() {
      calls.push(['listTests']);
      return { tests: [{ id: 'spec:auth/login.spec.js', relativePath: 'auth/login.spec.js' }] };
    },
    async startRun(input) {
      calls.push(['startRun', input]);
      return { runId: RUN_ID, lifecycle: 'RUNNING', startedAt: '2026-11-15T00:00:00.000Z' };
    },
    getRunStatus(runId) {
      calls.push(['getRunStatus', runId]);
      if (runId !== RUN_ID) return { ok: false, code: 'RUN_NOT_FOUND' };
      return { runId, lifecycle: 'RUNNING', startedAt: '2026-11-15T00:00:00.000Z' };
    },
    getRunResult(runId) {
      calls.push(['getRunResult', runId]);
      if (runId !== RUN_ID) return { ok: false, code: 'RUN_NOT_FOUND' };
      return { available: false, runId };
    },
    cancelRun(runId) {
      calls.push(['cancelRun', runId]);
      if (runId !== RUN_ID) return { ok: false, code: 'RUN_NOT_FOUND' };
      return { ok: true };
    },
  };
  return { core, calls, child };
}

function readJsonLines(stream, onLine) {
  let buffer = '';
  stream.setEncoding('utf8');
  stream.on('data', chunk => {
    buffer += chunk;
    while (buffer.includes('\n')) {
      const index = buffer.indexOf('\n');
      const line = buffer.slice(0, index);
      buffer = buffer.slice(index + 1);
      if (line.trim()) onLine(JSON.parse(line));
    }
  });
}

test('MCP stdio server performs handshake, advertises five tools, and routes validated calls', async () => {
  const fixture = createCore();
  const server = spawn(process.execPath, [ENTRY], {
    cwd: ROOT,
    env: { ...process.env, PQF_MCP_TEST_MODE: '1' },
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: false,
  });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [ENTRY],
    cwd: ROOT,
    env: process.env,
    stderr: 'pipe',
  });
  const client = new Client({ name: 'pqf-mcp-integration-test', version: '1.0.0' });
  try {
    await client.connect(transport);
    const listed = await client.listTools();
    const names = listed.tools.map(tool => tool.name).sort();
    assert.deepEqual(names, ['cancel_run', 'get_run_result', 'get_run_status', 'list_tests', 'start_run']);

    const catalogue = await client.callTool({ name: 'list_tests', arguments: {} });
    assert.deepEqual(catalogue.structuredContent, {
      tests: [{ id: 'spec:auth/login.spec.js', relativePath: 'auth/login.spec.js' }],
    });

    const invalid = await client.callTool({
      name: 'start_run',
      arguments: { target: 'spec:../outside.spec.js' },
    });
    assert.equal(invalid.isError, true);
    assert.deepEqual(invalid.structuredContent, { ok: false, code: 'INVALID_INPUT' });

    const unknown = await client.callTool({
      name: 'get_run_status',
      arguments: { runId: '123e4567-e89b-42d3-a456-426614174001' },
    });
    assert.equal(unknown.isError, true);
    assert.deepEqual(unknown.structuredContent, { ok: false, code: 'RUN_NOT_FOUND' });
  } finally {
    await client.close().catch(() => {});
    if (server.exitCode === null) server.kill();
  }
});
