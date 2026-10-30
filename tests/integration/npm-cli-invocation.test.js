'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createNpmCliInvocation } = require('../../scripts/lib/npm-cli-invocation');

test('npm CLI launcher uses Node to execute npm-cli.js on Windows', () => {
  const invocation = createNpmCliInvocation(
    ['install', '--offline', 'C:\\private artifacts\\package.tgz'],
    {
      platform: 'win32',
      nodeExecutable: 'C:\\Program Files\\nodejs\\node.exe',
      npmCli: 'C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js',
    },
  );

  assert.equal(invocation.command, 'C:\\Program Files\\nodejs\\node.exe');
  assert.deepEqual(invocation.args, [
    'C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js',
    'install',
    '--offline',
    'C:\\private artifacts\\package.tgz',
  ]);
  assert.equal(Object.isFrozen(invocation), true);
  assert.equal(Object.isFrozen(invocation.args), true);
});

test('npm CLI launcher uses the current Node executable and npm lifecycle path', () => {
  const npmCli = process.env.npm_execpath;
  if (!npmCli) return;
  const invocation = createNpmCliInvocation(['--version']);
  assert.equal(invocation.command, process.execPath);
  assert.equal(invocation.args[0], npmCli);
  assert.equal(invocation.args[1], '--version');
});

test('npm CLI launcher rejects missing or relative npm CLI paths', () => {
  assert.throws(
    () => createNpmCliInvocation(['install'], { platform: 'win32', nodeExecutable: 'C:\\node.exe', npmCli: null }),
    error => error.message === 'NPM_CLI_PATH_UNAVAILABLE',
  );
  assert.throws(
    () => createNpmCliInvocation(['install'], {
      platform: 'win32',
      nodeExecutable: 'C:\\node.exe',
      npmCli: 'npm.cmd',
    }),
    error => error.message === 'NPM_CLI_PATH_UNAVAILABLE',
  );
  assert.throws(
    () => createNpmCliInvocation(['install'], {
      platform: 'win32',
      nodeExecutable: 'C:\\node.exe',
      npmCli: '/opt/node/npm-cli.js',
    }),
    error => error.message === 'NPM_CLI_PATH_UNAVAILABLE',
  );
});

test('npm CLI launcher rejects non-string command arguments', () => {
  assert.throws(
    () => createNpmCliInvocation(['install', null], {
      platform: 'win32',
      nodeExecutable: 'C:\\node.exe',
      npmCli: 'C:\\npm\\npm-cli.js',
    }),
    error => error.message === 'NPM_ARGUMENTS_INVALID',
  );
});
