'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const INSPECTOR_VERSION = '2.15.0';
const INSPECTOR_PACKAGE = '@modelcontextprotocol/inspector@' + INSPECTOR_VERSION;
const ROOT = path.resolve(__dirname, '..');
const SERVER_ENTRY = path.join(ROOT, 'scripts', 'run-mcp-server.js');
const EXPECTED_TOOLS = [
  'cancel_run',
  'get_run_result',
  'get_run_status',
  'list_tests',
  'start_run',
];

function runInspector(method, toolName, toolArgs) {
  const args = [
    '--yes',
    INSPECTOR_PACKAGE,
    '--cli',
    '--quiet',
    'node',
    SERVER_ENTRY,
    '--connect-timeout',
    '10000',
    '--method',
    method,
    '--format',
    'json',
  ];

  if (toolName) {
    args.push('--tool-name', toolName);
  }
  if (toolArgs) {
    args.push('--tool-args-json', JSON.stringify(toolArgs));
  }

  const result = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', args, {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      MCP_AUTO_OPEN_ENABLED: 'false',
    },
    timeout: 30_000,
    maxBuffer: 2 * 1024 * 1024,
    windowsHide: true,
  });

  if (result.error || result.status !== 0) {
    const reason = result.error && result.error.code === 'ETIMEDOUT'
      ? 'timed out'
      : 'exited unsuccessfully';
    throw new Error('MCP Inspector ' + method + ' ' + reason +
      ' (exit=' + String(result.status) + '). Runtime output is suppressed to avoid leaking local details.');
  }

  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error('MCP Inspector ' + method + ' did not return one valid JSON document.');
  }
}

function main() {
  assert.ok(
    process.versions.node && Number(process.versions.node.split('.')[0]) === 22 &&
      (Number(process.versions.node.split('.')[1]) > 23 ||
        (Number(process.versions.node.split('.')[1]) === 23 &&
          Number(process.versions.node.split('.')[2]) >= 4)),
    'MCP Inspector ' + INSPECTOR_VERSION + ' qualification requires Node.js 22.23.4 or newer in the 22.x line.',
  );

  const initialize = runInspector('initialize');
  assert.equal(initialize.result.serverInfo.name, 'playwright-quality-framework');
  assert.equal(typeof initialize.result.protocolVersion, 'string');
  assert.equal(typeof initialize.result.capabilities.tools, 'object');

  const listing = runInspector('tools/list');
  const actualTools = listing.result.tools.map(tool => tool.name).sort();
  assert.deepEqual(actualTools, EXPECTED_TOOLS);

  const listTests = runInspector('tools/call', 'list_tests', {});
  assert.notEqual(listTests.result.isError, true);
  const tests = listTests.result.structuredContent.tests;
  assert.ok(Array.isArray(tests) && tests.length > 0, 'list_tests must return at least one catalogue entry.');
  for (const descriptor of tests) {
    assert.equal(descriptor.id, 'spec:' + descriptor.relativePath);
    assert.equal(descriptor.relativePath.includes('\\'), false);
  }

  process.stdout.write(
    'MCP Inspector ' + INSPECTOR_VERSION +
    ': initialize PASS; tools/list PASS (' + actualTools.length +
    ' tools); list_tests PASS (' + tests.length + ' catalogue entries).\n',
  );
}

try {
  main();
} catch (error) {
  process.stderr.write(((error && error.message) || 'MCP Inspector qualification failed.') + '\n');
  process.exitCode = 1;
}
