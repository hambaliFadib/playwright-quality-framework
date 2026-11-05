'use strict';

const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const http = require('node:http');
const path = require('node:path');
const { promisify } = require('node:util');
const test = require('node:test');

const execFileAsync = promisify(execFile);

test('triage selftest never calls a configured AI provider', async () => {
  let requests = 0;
  const server = http.createServer((_request, response) => {
    requests += 1;
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify({
            classification: 'PRODUCT_BUG',
            confidence: 0.99,
            reason: 'External provider was contacted.',
          }),
        },
      }],
    }));
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  try {
    const root = path.resolve(__dirname, '../..');
    const endpoint = `http://127.0.0.1:${server.address().port}/v1/chat/completions`;
    const { stdout } = await execFileAsync(process.execPath, [
      '--env-file-if-exists=.env.ai',
      'scripts/ai-triage.js',
      '--selftest',
    ], {
      cwd: root,
      env: {
        ...process.env,
        AI_API_KEY: 'synthetic-selftest-key',
        AI_BASE_URL: endpoint,
        AI_MODEL: 'synthetic-selftest-model',
      },
      timeout: 5000,
    });

    const result = JSON.parse(stdout);
    assert.equal(requests, 0, 'Self-test must not call a configured provider');
    assert.equal(result.playwrightStatus, 'failed');
    assert.equal(result.triage.classification, 'INCONCLUSIVE');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
