const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const plugin = require('eslint-plugin-playwright');
const { customerSchema } = require('../src/ai/test-data');
const { triageFailure } = require('../src/ai/triage');

const requiredRules = ['no-focused-test', 'no-skipped-test', 'no-wait-for-timeout', 'no-conditional-expect', 'no-force-option', 'expect-expect'];
const missing = requiredRules.filter(rule => !Object.prototype.hasOwnProperty.call(plugin.rules, rule));

function scanForEslintDisable(dir) {
  if (!fs.existsSync(dir)) return [];
  const failures = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) failures.push(...scanForEslintDisable(absolute));
    if (entry.isFile() && entry.name.endsWith('.js')) {
      const text = fs.readFileSync(absolute, 'utf8');
      if (/eslint-disable/.test(text)) failures.push(path.relative(process.cwd(), absolute));
    }
  }
  return failures;
}

const eslintDisableFiles = [...scanForEslintDisable('tests'), ...scanForEslintDisable('src')];
if (eslintDisableFiles.length) {
  console.error(`Inline ESLint disable comments are prohibited: ${eslintDisableFiles.join(', ')}`);
  process.exit(1);
}

if (missing.length) {
  console.error(`Missing eslint-plugin-playwright rules: ${missing.join(', ')}`);
  process.exit(1);
}

const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const eslintArgs = ['eslint', 'tests', 'src', 'scripts', 'demo-app', 'playwright.config.js', 'eslint.config.js'];

execFileSync(npxCommand, eslintArgs, {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

if (customerSchema.safeParse({ name: 'x', email: 'not-an-email' }).success) {
  console.error('Malformed AI customer data passed schema validation.');
  process.exit(1);
}

(async () => {
  const triage = await triageFailure({ testName: 'insufficient', playwrightStatus: 'failed', retry: 0 });
  if (triage.classification !== 'INCONCLUSIVE') {
    console.error('Insufficient triage evidence did not return INCONCLUSIVE.');
    process.exit(1);
  }
  console.log(`Verified eslint-plugin-playwright rules: ${requiredRules.join(', ')}`);
  console.log('Verified malformed AI data rejection and insufficient-evidence triage boundary.');
})();
