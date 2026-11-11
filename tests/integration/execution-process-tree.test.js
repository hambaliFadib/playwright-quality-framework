'use strict';

const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { setTimeout: sleep } = require('node:timers/promises');

const { _createExecutionCore } = require('../../src/core/execution-core');

const RUN_TARGET = 'spec:fixtures/process-tree.spec.js';
const WINDOWS_ONLY = { skip: process.platform !== 'win32' };

function isAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return Boolean(error && error.code === 'EPERM');
  }
}

async function pollUntil(predicate, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await predicate();
    if (value) return value;
    await sleep(100);
  }
  assert.fail('Timed out waiting for ' + label);
}

async function prepareFixture(t) {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'pqf-windows-tree-'));
  const marker = path.join(folder, 'processes.json');
  const script = path.join(folder, 'fixture-cli.js');
  const childScript = path.join(folder, 'grandchild.js');
  const spec = path.join(folder, 'process-tree.spec.js');
  let recorded = null;

  t.after(async () => {
    // This safety net is intentionally outside the execution contract. A failed
    // test must not leave an orphaned fixture process on a GitHub runner.
    try {
      const bytes = await fs.readFile(marker, 'utf8');
      recorded = JSON.parse(bytes);
    } catch {
      // The test may have failed before the fixture created its process markers.
    }
    for (const pid of [recorded && recorded.child, recorded && recorded.parent]) {
      if (isAlive(pid)) {
        try { process.kill(pid, 'SIGKILL'); } catch { /* process already gone */ }
      }
    }
    await fs.rm(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  await fs.writeFile(spec, '// test target is validated by an injected fake catalogue\n');
  await fs.writeFile(childScript, 'setInterval(() => {}, 1000);\n');
  await fs.writeFile(script, [
    "'use strict';",
    "const fs = require('node:fs');",
    "const path = require('node:path');",
    "const { spawn } = require('node:child_process');",
    "const child = spawn(process.execPath, [path.join(__dirname, 'grandchild.js')], {",
    "  shell: false, windowsHide: true, stdio: 'ignore',",
    "});",
    "fs.writeFileSync(process.env.PQF_PROCESS_MARKER, JSON.stringify({ parent: process.pid, child: child.pid }));",
    "setInterval(() => {}, 1000);",
    '',
  ].join('\n'));

  const catalog = {
    async listTests() {
      return { tests: [{ id: RUN_TARGET, relativePath: 'fixtures/process-tree.spec.js' }] };
    },
    async resolveTestTarget(target) {
      assert.equal(target, RUN_TARGET);
      return {
        target,
        tests: [{ id: RUN_TARGET, relativePath: 'fixtures/process-tree.spec.js' }],
      };
    },
    async revalidateResolvedTestTargetForExecution() {
      return [spec];
    },
  };
  const core = _createExecutionCore({
    catalog,
    repositoryRoot: folder,
    playwrightCliPath: script,
    env: { ...process.env, PQF_PROCESS_MARKER: marker },
    randomUUID,
  });

  async function awaitProcessTree() {
    const pids = await pollUntil(async () => {
      let result;
      try {
        result = JSON.parse(await fs.readFile(marker, 'utf8'));
      } catch {
        return null;
      }
      if (!Number.isInteger(result.parent) || !Number.isInteger(result.child)) return null;
      if (!isAlive(result.parent) || !isAlive(result.child)) return null;
      return result;
    }, 10_000, 'fixture parent and grandchild');
    recorded = pids;
    return pids;
  }

  async function awaitStopped(runId, pids, expectedOutcome) {
    const final = await pollUntil(() => {
      const status = core.getRunStatus(runId);
      return status.lifecycle === 'COMPLETED' ? status : null;
    }, 20_000, 'terminal lifecycle');
    assert.equal(final.outcome, expectedOutcome);

    await pollUntil(() =>
      !isAlive(pids.parent) && !isAlive(pids.child),
    10_000, 'all fixture processes to exit');

    assert.deepEqual(core.cancelRun(runId), {
      ok: false,
      code: 'CANCEL_NOT_ALLOWED',
    });
  }

  return { core, awaitProcessTree, awaitStopped };
}

test('Windows cancellation terminates parent and grandchild in a real process tree', WINDOWS_ONLY, async t => {
  const fixture = await prepareFixture(t);
  const run = await fixture.core.startRun({ target: RUN_TARGET, timeoutMs: 30_000 });
  assert.equal(run.lifecycle, 'RUNNING');
  const pids = await fixture.awaitProcessTree();
  assert.equal(isAlive(pids.parent), true);
  assert.equal(isAlive(pids.child), true);

  assert.deepEqual(fixture.core.cancelRun(run.runId), { ok: true });
  await fixture.awaitStopped(run.runId, pids, 'CANCELLED');
});

test('Windows timeout terminates parent and grandchild in a real process tree', WINDOWS_ONLY, async t => {
  const fixture = await prepareFixture(t);
  const run = await fixture.core.startRun({ target: RUN_TARGET, timeoutMs: 5_000 });
  assert.equal(run.lifecycle, 'RUNNING');
  const pids = await fixture.awaitProcessTree();
  assert.equal(isAlive(pids.parent), true);
  assert.equal(isAlive(pids.child), true);

  await fixture.awaitStopped(run.runId, pids, 'TIMED_OUT');
});
