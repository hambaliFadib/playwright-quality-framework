const js = require('@eslint/js');
const playwright = require('eslint-plugin-playwright');

module.exports = [
  { ignores: ['node_modules/**', 'playwright-report/**', 'test-results/**', 'artifacts/**', 'package-lock.json'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        console: 'readonly',
        process: 'readonly',
        module: 'readonly',
        require: 'readonly',
        __dirname: 'readonly',
        Buffer: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        setTimeout: 'readonly',
      },
    },
  },
  {
    files: ['tests/e2e/**/*.js', 'examples/policy-violations/**/*.js'],
    plugins: { playwright },
    rules: {
      ...playwright.configs['flat/recommended'].rules,
      'playwright/no-focused-test': 'error',
      'playwright/no-skipped-test': 'error',
      'playwright/no-wait-for-timeout': 'error',
      'playwright/no-conditional-expect': 'error',
      'playwright/no-force-option': 'error',
      'playwright/expect-expect': 'error',
      'no-restricted-modules': ['error', {
        paths: [{ name: '@playwright/test', message: 'E2E tests must import test and expect from src/fixtures/test.fixture.js.' }],
      }],
      'no-restricted-syntax': [
        'error',
        { selector: "CallExpression[callee.property.name='locator']", message: 'Raw locator usage is prohibited in test files. Use Page Objects.' },
        { selector: "CallExpression[callee.property.name='$']", message: 'page.$ is prohibited in test files. Use Page Objects.' },
        { selector: "CallExpression[callee.property.name='$$']", message: 'page.$$ is prohibited in test files. Use Page Objects.' },
        { selector: "CallExpression[callee.name='require'] Literal[value=/src\\/pages/]", message: 'Tests must not directly import Page Objects. Use the fixture gateway.' },
        { selector: "CallExpression[callee.property.name='only']", message: 'Focused tests are prohibited.' },
        { selector: "CallExpression[callee.property.name=/^(skip|fixme)$/]", message: 'Committed skipped/fixme tests are prohibited.' },
        { selector: 'TryStatement AwaitExpression CallExpression[callee.name="expect"]', message: 'Assertions must not be swallowed in try/catch.' },
        { selector: 'IfStatement AwaitExpression CallExpression[callee.name="expect"]', message: 'Assertions must not be conditional.' },
        { selector: 'CallExpression[callee.name="expect"] Literal[value=true]', message: 'Trivial expect(true) assertions are prohibited.' },
      ],
    },
  },
  {
    files: ['src/pages/**/*.js'],
    rules: {
      'no-restricted-modules': ['error', { paths: ['@playwright/test'], patterns: ['../fixtures/*', '../ai/*', '../../tests/*'] }],
      'no-restricted-syntax': ['error', { selector: 'CallExpression[callee.name="expect"]', message: 'Page Objects must not contain business assertions.' }],
    },
  },
  {
    files: ['src/ai/**/*.js'],
    rules: {
      'no-restricted-modules': ['error', { paths: ['@playwright/test'], patterns: ['../pages/*', '../fixtures/*', '../../tests/*'] }],
      'no-restricted-syntax': ['error', { selector: 'CallExpression[callee.name="expect"]', message: 'AI modules must not use Playwright expect or act as a test oracle.' }],
    },
  },
  {
    files: ['src/data/**/*.js'],
    rules: { 'no-restricted-modules': ['error', { patterns: ['../pages/*', '../../tests/*'] }] },
  },
];
