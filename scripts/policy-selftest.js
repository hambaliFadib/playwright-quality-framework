const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const root = process.cwd();
const tempDir = path.join(root, '.policy-selftest');

const cases = [
  {
    file: 'tests/e2e/raw-locator.spec.js',
    text: 'Raw locator usage is prohibited',
    body: "const { test, expect } = require('../../../src/fixtures/test.fixture');\n\ntest('raw locator is rejected', async ({ page }) => {\n  await page.locator('#login').click();\n  expect(true).toBe(false);\n});\n",
  },
  {
    file: 'tests/e2e/wait-timeout.spec.js',
    text: 'no-wait-for-timeout',
    body: "const { test, expect } = require('../../../src/fixtures/test.fixture');\n\ntest('timeout wait is rejected', async ({ page }) => {\n  await page.waitForTimeout(5000);\n  expect(true).toBe(false);\n});\n",
  },
  {
    file: 'tests/e2e/swallowed-assertion.spec.js',
    text: 'Assertions must not be swallowed',
    body: "const { test, expect } = require('../../../src/fixtures/test.fixture');\n\ntest('swallowed assertion is rejected', async ({ page }) => {\n  const status = page.getByRole('status');\n  try {\n    await expect(status).toHaveText('SUCCESS');\n  } catch {}\n});\n",
  },
  {
    file: 'tests/e2e/focused.spec.js',
    text: 'no-focused-test',
    body: "const { test } = require('../../../src/fixtures/test.fixture');\n\ntest.only('focused test is rejected', async () => {});\n",
  },
  {
    file: 'tests/e2e/skipped.spec.js',
    text: 'no-skipped-test',
    body: "const { test } = require('../../../src/fixtures/test.fixture');\n\ntest.skip('skipped test is rejected', async () => {});\n",
  },
  {
    file: 'tests/e2e/fixme.spec.js',
    text: 'Committed skipped/fixme tests are prohibited',
    body: "const { test } = require('../../../src/fixtures/test.fixture');\n\ntest.fixme('fixme test is rejected', async () => {});\n",
  },
  {
    file: 'tests/e2e/force-click.spec.js',
    text: 'no-force-option',
    body: "const { test, expect } = require('../../../src/fixtures/test.fixture');\n\ntest('force click is rejected', async ({ page }) => {\n  await page.getByRole('button', { name: 'Save' }).click({ force: true });\n  expect(true).toBe(false);\n});\n",
  },
  {
    file: 'tests/e2e/direct-playwright-import.spec.js',
    text: '@playwright/test',
    body: "const { test } = require('@playwright/test');\n\ntest('direct import is rejected', async () => {});\n",
  },
  {
    file: 'src/ai/expect-boundary.js',
    text: 'AI modules must not use Playwright expect',
    body: "function invalidAIOracle(expect) {\n  expect(true).toBe(true);\n}\n\nmodule.exports = { invalidAIOracle };\n",
  },
];

function cleanup() {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

cleanup();
fs.mkdirSync(tempDir, { recursive: true });

let failed = false;
try {
  for (const item of cases) {
    const fullPath = path.join(tempDir, item.file);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, item.body);

    const relativePath = path.relative(root, fullPath);
    const result = spawnSync(npxCommand, ['eslint', '--config', 'eslint.config.js', relativePath], {
      encoding: 'utf8',
      shell: process.platform === 'win32',
    });
    const output = `${result.stdout}\n${result.stderr}`;
    const rejected = result.status !== 0 && output.includes(item.text);
    console.log(`${rejected ? 'POLICY REJECTED' : 'POLICY SELFTEST FAILED'}: ${item.file}`);
    if (!rejected) {
      console.log(output);
      failed = true;
    }
  }
} finally {
  cleanup();
}

if (failed) process.exit(1);
console.log('All policy self-test violations were mechanically rejected.');
