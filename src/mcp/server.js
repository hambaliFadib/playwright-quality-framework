'use strict';

const { McpServer } = require('@modelcontextprotocol/server');
const { StdioServerTransport } = require('@modelcontextprotocol/server/stdio');
const { z } = require('zod');
const core = require('../core/execution-core');
const contract = require('../core/execution-contract');

const SERVER_INFO = Object.freeze({ name: 'playwright-quality-framework', version: '1.0.0' });

function textResult(value) {
  return { content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value };
}
function errorResult(code) {
  const safeCode = contract.ERROR_CODES.includes(code) ? code : 'INVALID_INPUT';
  return { ...textResult({ ok: false, code: safeCode }), isError: true };
}
function createMcpServer(executionCore = core) {
  const server = new McpServer(SERVER_INFO, {
    capabilities: { tools: {} },
    instructions: 'Trusted local Playwright execution only. Playwright is the deterministic test oracle. PASSED requires at least one executed test and all tests passing. AI triage is advisory only. Never infer or override an execution outcome.',
  });

  server.registerTool('list_tests', {
    title: 'List Playwright tests',
    description: 'List the fixed, validated Playwright E2E catalogue. Does not start execution.',
    inputSchema: contract.ListTestsInputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async () => {
    try {
      return textResult(contract.ListTestsResultSchema.parse(await executionCore.listTests()));
    } catch {
      return errorResult('CATALOG_UNAVAILABLE');
    }
  });

  server.registerTool('start_run', {
    title: 'Start Playwright run',
    description: 'Start one bounded local Playwright execution for suite:all or a catalogue spec ID. Only one execution can be active. Starts a real local process.',
    inputSchema: contract.StartRunInputSchema,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async input => {
    const parsed = contract.StartRunInputSchema.safeParse(input);
    if (!parsed.success) return errorResult('INVALID_INPUT');
    try {
      const result = await executionCore.startRun(parsed.data);
      if (result && result.ok === false) return errorResult(result.code);
      return textResult(contract.StartRunResponseSchema.parse(result));
    } catch {
      return errorResult('INVALID_INPUT');
    }
  });

  const runIdInput = z.object({ runId: contract.RunIdSchema }).strict();
  server.registerTool('get_run_status', {
    title: 'Get Playwright run status',
    description: 'Read lifecycle and terminal classification for a known run UUID.',
    inputSchema: runIdInput,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ runId }) => {
    try {
      const result = await executionCore.getRunStatus(runId);
      if (result && result.ok === false) return errorResult(result.code);
      return textResult(contract.RunStatusSchema.parse(result));
    } catch {
      return errorResult('INVALID_INPUT');
    }
  });

  server.registerTool('get_run_result', {
    title: 'Get Playwright run result',
    description: 'Read structured terminal result when evidence is available. Raw reports, paths, stdout, stderr, process metadata, and secrets are never returned.',
    inputSchema: runIdInput,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ runId }) => {
    try {
      const result = await executionCore.getRunResult(runId);
      if (result && result.ok === false) return errorResult(result.code);
      return textResult(contract.GetRunResultResponseSchema.parse(result));
    } catch {
      return errorResult('INVALID_INPUT');
    }
  });

  server.registerTool('cancel_run', {
    title: 'Cancel Playwright run',
    description: 'Request cancellation of an active run. Cancellation is not terminal until child close and process-tree cleanup complete.',
    inputSchema: runIdInput,
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  }, async ({ runId }) => {
    try {
      const result = await executionCore.cancelRun(runId);
      if (result && result.ok === false) return errorResult(result.code);
      return textResult(contract.ExecutionSuccessSchema.parse(result));
    } catch {
      return errorResult('CANCEL_NOT_ALLOWED');
    }
  });

  return server;
}
async function startStdioServer() {
  const server = createMcpServer();
  await server.connect(new StdioServerTransport());
  return server;
}
module.exports = { SERVER_INFO, createMcpServer, startStdioServer };
