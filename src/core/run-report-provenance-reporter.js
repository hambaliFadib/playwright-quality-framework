'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');

const { RunIdSchema } = require('./execution-contract');
const {
  _readBoundedFile,
  _runReportFile,
  isValidReportToken,
  MAX_REPORT_BYTES,
  MAX_MANIFEST_BYTES,
  MANIFEST_FILE_NAME,
} = require('./run-report');

class RunReportProvenanceReporter {
  constructor(options = {}) {
    this.options = options;
  }

  printsToStdio() {
    return false;
  }

  async onExit() {
    const { outputFile, repositoryRoot, runId, reportToken } = this.options;
    if (typeof repositoryRoot !== 'string' ||
        !RunIdSchema.safeParse(runId).success ||
        !isValidReportToken(reportToken) ||
        typeof outputFile !== 'string' ||
        !path.isAbsolute(outputFile) ||
        path.resolve(outputFile) !== _runReportFile(repositoryRoot, runId)) {
      throw new Error('REPORT_INVALID');
    }

    const reportBytes = await _readBoundedFile(outputFile, MAX_REPORT_BYTES);
    const manifest = {
      version: 1,
      runId,
      reportToken,
      reportSha256: createHash('sha256').update(reportBytes).digest('hex'),
    };
    const manifestBytes = Buffer.from(JSON.stringify(manifest), 'utf8');
    if (manifestBytes.length > MAX_MANIFEST_BYTES) throw new Error('REPORT_INVALID');

    const manifestPath = path.join(path.dirname(outputFile), MANIFEST_FILE_NAME);
    const handle = await fs.open(manifestPath, 'wx', 0o600);
    try {
      await handle.writeFile(manifestBytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
  }
}

module.exports = RunReportProvenanceReporter;
