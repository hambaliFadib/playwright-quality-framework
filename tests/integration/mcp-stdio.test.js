'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const { Client } = require('@modelcontextprotocol/client');
const { StdioClientTransport } = require('@modelcontextprotocol/client/stdio');

const ROOT = path.resolve(__dirname, '../..');
const ENTRY = path.join(ROOT, 'scripts', 'run-mcp-server.js');

test('MCP stdio server performs handshake, advertises five tools, and routes validated calls', async () => {
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
      tests: [
        { id: 'spec:auth/login.spec.js', relativePath: 'auth/login.spec.js' },
        { id: 'spec:cart/add-to-cart.spec.js', relativePath: 'cart/add-to-cart.spec.js' },
        { id: 'spec:cart/remove-from-cart.spec.js', relativePath: 'cart/remove-from-cart.spec.js' },
        { id: 'spec:inventory/inventory.spec.js', relativePath: 'inventory/inventory.spec.js' },
      ],
    });

    const unknown = await client.callTool({
      name: 'get_run_status',
      arguments: { runId: '123e4567-e89b-42d3-a456-426614174001' },
    });
    assert.equal(unknown.isError, true);
    assert.deepEqual(unknown.structuredContent, { ok: false, code: 'RUN_NOT_FOUND' });
  } finally {
    await client.close().catch(() => {});
  }
});
