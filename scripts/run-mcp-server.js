'use strict';

const { startStdioServer } = require('../src/mcp/server');

startStdioServer().catch(error => {
  process.stderr.write(`PQF MCP server failed to start: ${error && error.message ? error.message : 'unknown error'}\n`);
  process.exitCode = 1;
});
