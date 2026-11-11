'use strict';

const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const timers = require('node:timers');

const contract = require('./execution-contract');
const defaultCatalog = require('./test-catalog');
const { createRunReporter } = require('./run-report');

const REPOSITORY_ROOT = path.resolve(__dirname, '../..');
const PLAYWRIGHT_CLI_PATH = path.join(
  REPOSITORY_ROOT,
  'node_modules',
  '@playwright',
  'test',
  'cli.js',
);
const TERMINATION_GRACE_MS = 1_000;
const EMPTY_SUMMARY = Object.freeze({
  total: 0,
  passed: 0,
  failed: 0,
  skipped: 0,
  flaky: 0,
});

function timestamp(milliseconds) {
  return new Date(milliseconds).toISOString();
}

function isProcessGroupMissing(error) {
  return Boolean(error && error.code === 'ESRCH');
}

function createExecutionCore(overrides = {}) {
  const dependencies = {
    spawn: overrides.spawn || spawn,
    kill: overrides.kill || ((pid, signal) => process.kill(pid, signal)),
    setTimeout: overrides.setTimeout || timers.setTimeout,
    clearTimeout: overrides.clearTimeout || timers.clearTimeout,
    now: overrides.now || Date.now,
    randomUUID: overrides.randomUUID || randomUUID,
    catalog: overrides.catalog || defaultCatalog,
    reporter: overrides.reporter || createRunReporter(overrides.repositoryRoot || REPOSITORY_ROOT),
    platform: overrides.platform || process.platform,
    execPath: overrides.execPath || process.execPath,
    playwrightCliPath: overrides.playwrightCliPath || PLAYWRIGHT_CLI_PATH,
    repositoryRoot: overrides.repositoryRoot || REPOSITORY_ROOT,
    systemRoot: overrides.systemRoot || process.env.SystemRoot || process.env.WINDIR || 'C:\\Windows',
    env: overrides.env || process.env,
    terminationGraceMs: overrides.terminationGraceMs ?? TERMINATION_GRACE_MS,
  };

  const runs = new Map();
  const completedRunIds = [];
  let activeRunId = null;
  let startReservation = null;

  function publicError(code) {
    return contract.ExecutionErrorSchema.parse({ ok: false, code });
  }

  function publicSuccess() {
    return contract.ExecutionSuccessSchema.parse({ ok: true });
  }

  function rememberCompleted(run) {
    if (run.completed) return;
    run.completed = true;
    run.lifecycle = 'COMPLETED';
    run.finishedAt = timestamp(dependencies.now());

    if (activeRunId === run.runId) activeRunId = null;
    if (startReservation === run.reservation) startReservation = null;

    completedRunIds.push(run.runId);
    while (completedRunIds.length > contract.MAX_COMPLETED_RUNS) {
      const expiredRunId = completedRunIds.shift();
      runs.delete(expiredRunId);
    }
  }

  function makeResult(run, outcome, errorCode = null, summary = EMPTY_SUMMARY) {
    const durationMs = Math.max(0, dependencies.now() - run.startedAtMs);
    return contract.RunResultSchema.parse({
      runId: run.runId,
      outcome,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      durationMs,
      summary: { ...summary },
      errorCode,
    });
  }

  function finishWithKnownOutcome(run, outcome, errorCode = null, summary = EMPTY_SUMMARY) {
    rememberCompleted(run);
    run.outcome = outcome;
    run.errorCode = errorCode;
    run.result = makeResult(run, outcome, errorCode, summary);
  }

  async function finalizeNaturalExit(run) {
    try {
      const classification = await dependencies.reporter.readRun(
        run.runId, run.exitCode, run.signal,
      );
      if (run.completed || run.terminationReason) return;
      finishWithKnownOutcome(
        run, classification.outcome, classification.errorCode, classification.summary,
      );
    } catch {
      if (!run.completed && !run.terminationReason) {
        finishWithKnownOutcome(run, 'ERROR', 'REPORT_INVALID');
      }
    }
  }

  function delay(milliseconds) {
    return new Promise(resolve => dependencies.setTimeout(resolve, milliseconds));
  }

  async function terminatePosixProcessGroup(run) {
    const pid = run.child && run.child.pid;
    if (!Number.isInteger(pid) || pid <= 0) return false;

    try {
      dependencies.kill(-pid, 'SIGTERM');
    } catch (error) {
      if (isProcessGroupMissing(error)) return true;
    }

    await delay(dependencies.terminationGraceMs);

    try {
      dependencies.kill(-pid, 'SIGKILL');
      return true;
    } catch (error) {
      if (isProcessGroupMissing(error)) return true;
      try {
        run.child.kill('SIGKILL');
      } catch {
        // Cleanup remains failed; do not report a successful cancellation.
      }
      return false;
    }
  }

  function terminateWindowsProcessTree(run) {
    return new Promise(resolve => {
      const pid = run.child && run.child.pid;
      if (!Number.isInteger(pid) || pid <= 0) {
        resolve(false);
        return;
      }

      const taskkillPath = path.win32.join(
        dependencies.systemRoot,
        'System32',
        'taskkill.exe',
      );
      let taskkill;
      let settled = false;

      const finish = successful => {
        if (settled) return;
        settled = true;
        if (!successful) {
          try {
            run.child.kill('SIGKILL');
          } catch {
            // Cleanup remains failed; do not report a successful cancellation.
          }
        }
        resolve(successful);
      };

      try {
        taskkill = dependencies.spawn(
          taskkillPath,
          ['/PID', String(pid), '/T', '/F'],
          {
            cwd: dependencies.repositoryRoot,
            stdio: 'ignore',
            shell: false,
            windowsHide: true,
          },
        );
      } catch {
        finish(false);
        return;
      }

      taskkill.once('error', () => finish(false));
      taskkill.once('close', code => finish(code === 0));
    });
  }

  async function terminateProcessTree(run) {
    if (dependencies.platform === 'win32') {
      return terminateWindowsProcessTree(run);
    }
    return terminatePosixProcessGroup(run);
  }

  function finalizeTerminationIfReady(run) {
    if (run.completed || !run.childClosed || !run.cleanupComplete) return;

    if (run.spawnError) {
      finishWithKnownOutcome(run, 'ERROR', 'EXECUTION_START_FAILED');
    } else if (run.cleanupFailed) {
      finishWithKnownOutcome(run, 'ERROR', 'PROCESS_CLEANUP_FAILED');
    } else {
      finishWithKnownOutcome(run, run.terminationReason);
    }
  }

  function beginTermination(run, reason) {
    if (run.completed || run.childClosed) return Promise.resolve();
    if (run.terminationPromise) return run.terminationPromise;

    run.lifecycle = 'CANCELLING';
    run.terminationReason = reason;
    if (run.timeoutHandle) {
      dependencies.clearTimeout(run.timeoutHandle);
      run.timeoutHandle = null;
    }

    run.terminationPromise = terminateProcessTree(run)
      .then(successful => {
        run.cleanupComplete = true;
        run.cleanupFailed = !successful;
        finalizeTerminationIfReady(run);
      })
      .catch(() => {
        run.cleanupComplete = true;
        run.cleanupFailed = true;
        finalizeTerminationIfReady(run);
      });

    return run.terminationPromise;
  }

  function mapCatalogError(error) {
    const code = error && error.code;
    return contract.ERROR_CODES.includes(code) ? code : 'CATALOG_INVALID';
  }

  async function startRun(input) {
    const validation = contract.validateStartRunInput(input);
    if (!validation.ok) return publicError(validation.code);
    if (activeRunId || startReservation) return publicError('EXECUTION_BUSY');

    const reservation = {};
    startReservation = reservation;

    let resolvedTarget;
    try {
      resolvedTarget = await dependencies.catalog.resolveTestTarget(validation.value.target);
    } catch (error) {
      if (startReservation === reservation) startReservation = null;
      return publicError(mapCatalogError(error));
    }

    if (startReservation !== reservation) return publicError('EXECUTION_BUSY');

    const runId = dependencies.randomUUID();
    const startedAtMs = dependencies.now();
    const startedAt = timestamp(startedAtMs);

    if (resolvedTarget.tests.length === 0) {
      const run = {
        runId,
        lifecycle: 'COMPLETED',
        startedAt,
        startedAtMs,
        reservation,
        completed: false,
        result: null,
      };
      runs.set(runId, run);
      startReservation = null;
      finishWithKnownOutcome(run, 'NO_TESTS');
      return contract.StartRunResponseSchema.parse({
        runId,
        lifecycle: 'COMPLETED',
        startedAt,
        finishedAt: run.finishedAt,
        outcome: 'NO_TESTS',
      });
    }

    let absoluteSpecPaths;
    try {
      absoluteSpecPaths = await dependencies.catalog.revalidateResolvedTestTargetForExecution(
        resolvedTarget,
      );
    } catch (error) {
      if (startReservation === reservation) startReservation = null;
      return publicError(mapCatalogError(error));
    }

    if (startReservation !== reservation) return publicError('EXECUTION_BUSY');

    try {
      await dependencies.reporter.prepareRun(runId);
    } catch {
      if (startReservation === reservation) startReservation = null;
      return publicError('REPORT_INVALID');
    }

    const args = [
      '--env-file-if-exists=' + path.join(dependencies.repositoryRoot, '.env'),
      dependencies.playwrightCliPath,
      'test',
      ...absoluteSpecPaths,
      '--project=chromium',
      '--workers=1',
      '--retries=0',
    ];
    let child;
    try {
      child = dependencies.spawn(dependencies.execPath, args, {
        cwd: dependencies.repositoryRoot,
        env: { ...dependencies.env, PQF_EXECUTION_RUN_ID: runId },
        stdio: 'ignore',
        shell: false,
        windowsHide: true,
        detached: dependencies.platform !== 'win32',
      });
    } catch {
      if (startReservation === reservation) startReservation = null;
      return publicError('EXECUTION_START_FAILED');
    }

    const run = {
      runId,
      lifecycle: 'RUNNING',
      startedAt,
      startedAtMs,
      reservation,
      child,
      timeoutHandle: null,
      terminationReason: null,
      terminationPromise: null,
      childClosed: false,
      cleanupComplete: false,
      cleanupFailed: false,
      spawnError: false,
      completed: false,
      finishedAt: null,
      outcome: undefined,
      errorCode: undefined,
      result: null,
      exitCode: null,
      signal: null,
    };

    runs.set(runId, run);
    activeRunId = runId;
    startReservation = null;

    child.once('error', () => {
      run.spawnError = true;
    });

    child.once('close', (code, signal) => {
      run.childClosed = true;
      run.exitCode = code;
      run.signal = signal;
      if (run.timeoutHandle) {
        dependencies.clearTimeout(run.timeoutHandle);
        run.timeoutHandle = null;
      }

      if (run.terminationReason) {
        finalizeTerminationIfReady(run);
      } else if (run.spawnError) {
        finishWithKnownOutcome(run, 'ERROR', 'EXECUTION_START_FAILED');
      } else {
        void finalizeNaturalExit(run);
      }
    });

    run.timeoutHandle = dependencies.setTimeout(
      () => { void beginTermination(run, 'TIMED_OUT'); },
      validation.value.timeoutMs,
    );

    return contract.StartRunResponseSchema.parse({
      runId,
      lifecycle: 'RUNNING',
      startedAt,
    });
  }

  function getRunStatus(runId) {
    if (!contract.RunIdSchema.safeParse(runId).success) return publicError('INVALID_INPUT');
    const run = runs.get(runId);
    if (!run) return publicError('RUN_NOT_FOUND');

    const status = {
      runId: run.runId,
      lifecycle: run.lifecycle,
      startedAt: run.startedAt,
    };
    if (run.lifecycle === 'COMPLETED') {
      status.finishedAt = run.finishedAt;
      if (run.outcome) status.outcome = run.outcome;
      if (run.errorCode) status.errorCode = run.errorCode;
    }
    return contract.RunStatusSchema.parse(status);
  }

  function getRunResult(runId) {
    if (!contract.RunIdSchema.safeParse(runId).success) return publicError('INVALID_INPUT');
    const run = runs.get(runId);
    if (!run) return publicError('RUN_NOT_FOUND');
    if (!run.result) {
      return contract.GetRunResultResponseSchema.parse({ available: false, runId });
    }
    return contract.GetRunResultResponseSchema.parse({
      available: true,
      result: run.result,
    });
  }

  function cancelRun(runId) {
    if (!contract.RunIdSchema.safeParse(runId).success) return publicError('INVALID_INPUT');
    const run = runs.get(runId);
    if (!run) return publicError('RUN_NOT_FOUND');
    if (run.completed || (run.childClosed && !run.terminationReason)) return publicError('CANCEL_NOT_ALLOWED');
    if (run.lifecycle === 'CANCELLING') return publicSuccess();

    try {
      void beginTermination(run, 'CANCELLED');
      return publicSuccess();
    } catch {
      run.cleanupComplete = true;
      run.cleanupFailed = true;
      try {
        run.child.kill('SIGKILL');
      } catch {
        // Keep the active slot until the child close event is observed.
      }
      finalizeTerminationIfReady(run);
      return publicError('PROCESS_CLEANUP_FAILED');
    }
  }

  return Object.freeze({
    listTests: () => dependencies.catalog.listTests(),
    startRun,
    getRunStatus,
    getRunResult,
    cancelRun,
  });
}

const defaultExecutionCore = createExecutionCore();

module.exports = {
  listTests: defaultExecutionCore.listTests,
  startRun: defaultExecutionCore.startRun,
  getRunStatus: defaultExecutionCore.getRunStatus,
  getRunResult: defaultExecutionCore.getRunResult,
  cancelRun: defaultExecutionCore.cancelRun,
  _createExecutionCore: createExecutionCore,
};
