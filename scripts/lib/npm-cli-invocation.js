'use strict';

const path = require('node:path');

function createNpmCliInvocation(args, options = {}) {
  const platform = options.platform || process.platform;
  const nodeExecutable = options.nodeExecutable || process.execPath;
  const npmCli = options.npmCli === undefined ? process.env.npm_execpath : options.npmCli;
  const isAbsolute = platform === 'win32'
    ? value => {
      if (!path.win32.isAbsolute(value)) return false;
      const driveQualified = /^[A-Za-z]:[\\/]/.test(value);
      const uncQualified = /^(?:\\\\|\/\/)[^\\/]+[\\/][^\\/]+(?:[\\/]|$)/.test(value);
      return driveQualified || uncQualified;
    }
    : path.posix.isAbsolute;

  if (!Array.isArray(args) || args.some(argument => typeof argument !== 'string')) {
    throw new Error('NPM_ARGUMENTS_INVALID');
  }
  if (typeof nodeExecutable !== 'string' || !isAbsolute(nodeExecutable) ||
      typeof npmCli !== 'string' || !isAbsolute(npmCli)) {
    throw new Error('NPM_CLI_PATH_UNAVAILABLE');
  }

  return Object.freeze({
    command: nodeExecutable,
    args: Object.freeze([npmCli, ...args]),
  });
}

module.exports = { createNpmCliInvocation };
