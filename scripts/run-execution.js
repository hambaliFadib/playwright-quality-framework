'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');

const {
  _readBoundedFile,
  _runReportFile,
  _runReportManifest,
  isValidReportToken,
  MAX_REPORT_BYTES,
  MAX_MANIFEST_BYTES,
} = require('../src/core/run-report');
const { RunIdSchema } = require('../src/core/execution-contract');

async function assertDirectory(directory) {
  const stat = await fs.lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('REPORT_INVALID');
}

async function writeRunManifest(repositoryRoot, runId, reportToken) {
  if (!RunIdSchema.safeParse(runId).success || !isValidReportToken(reportToken)) {
    throw new Error('REPORT_INVALID');
  }

  const reportPath = _runReportFile(repositoryRoot, runId);
  const manifestPath = _runReportManifest(repositoryRoot, runId);
  await assertDirectory(path.join(repositoryRoot, 'artifacts'));
  await assertDirectory(path.join(repositoryRoot, 'artifacts', 'runs'));
  await assertDirectory(path.dirname(reportPath));

  const reportBytes = await _readBoundedFile(reportPath, MAX_REPORT_BYTES);
  const manifest = {
    version: 1,
    runId,
    reportToken,
    reportSha256: createHash('sha256').update(reportBytes).digest('hex'),
  };
  const manifestBytes = Buffer.from(JSON.stringify(manifest), 'utf8');
  if (manifestBytes.length > MAX_MANIFEST_BYTES) throw new Error('REPORT_INVALID');

  const handle = await fs.open(manifestPath, 'wx', 0o600);
  try {
    await handle.writeFile(manifestBytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function main() {
  const [cliPath, ...args] = process.argv.slice(2);
  if (typeof cliPath !== 'string' || !path.isAbsolute(cliPath) || args.length === 0) {
    process.exitCode = 1;
    return;
  }

  const repositoryRoot = process.cwd();
  const runId = process.env.PQF_EXECUTION_RUN_ID;
  const reportToken = process.env.PQF_EXECUTION_REPORT_TOKEN;
  if (!RunIdSchema.safeParse(runId).success || !isValidReportToken(reportToken)) {
    process.exitCode = 1;
    return;
  }

  await new Promise(resolve => {
    let settled = false;
    let child;
    const finish = async (code, signal, spawnFailed = false) => {
      if (settled) return;
      settled = true;
      if (spawnFailed || signal !== null || (code !== 0 && code !== 1)) {
        process.exitCode = code === null ? 1 : code;
        resolve();
        return;
      }
      try {
        await writeRunManifest(repositoryRoot, runId, reportToken);
        process.exitCode = code;
      } catch {
        process.exitCode = 1;
      }
      resolve();
    };

    try {
      child = spawn(process.execPath, [cliPath, ...args], {
        cwd: repositoryRoot,
        env: process.env,
        stdio: 'inherit',
        shell: false,
        windowsHide: true,
      });
    } catch {
      void finish(1, null, true);
      return;
    }
    child.once('error', () => { void finish(1, null, true); });
    child.once('close', (code, signal) => { void finish(code, signal); });
  });
}

void main().catch(() => {
  process.exitCode = 1;
});
