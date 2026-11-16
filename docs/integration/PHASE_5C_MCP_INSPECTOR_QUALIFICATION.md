# Phase 5C — MCP Inspector Qualification

## Purpose

Verify the committed local stdio server with the official MCP Inspector CLI, then perform an interactive local inspection. This phase adds no server tools and does not change Production Core behavior.

## Automated Inspector qualification

Run with Node.js 22.23.4 or newer in the Node 22 line:

```powershell
npm ci
npm run mcp:inspector:qualify
```

The script pins `@modelcontextprotocol/inspector@2.15.0` through npx and uses the official CLI. It performs three bounded, non-destructive requests against `scripts/run-mcp-server.js`:

1. `initialize` — verifies protocol handshake, server identity and tool capability.
2. `tools/list` — verifies the exact five-tool catalogue.
3. `tools/call list_tests` — verifies structured catalogue response and safe POSIX-relative descriptors.

The script does not call `start_run` or `cancel_run`; it cannot launch browser tests or change local application data. Output is reduced to pass/fail counts so runtime paths, environment values, and stderr diagnostics are not published into CI logs. The workflow runs this check before Chromium smoke.

## Interactive Inspector qualification

Start the official Inspector web UI:

```powershell
npx --yes @modelcontextprotocol/inspector@2.15.0
```

In the Inspector connection form choose **STDIO** and configure:

- Command: `node`
- Arguments: `scripts/run-mcp-server.js`
- Working directory: the trusted PQF repository root
- Environment: only the minimum trusted local variables required by the E2E target

Connect, then confirm:

- Initialize identifies `playwright-quality-framework`.
- Tools list contains exactly `list_tests`, `start_run`, `get_run_status`, `get_run_result`, and `cancel_run`.
- Tool annotations identify read-only tools and the destructive cancellation operation.
- `list_tests` returns the expected local test catalogue.

### Execution and cancellation scenario

Only continue on a disposable local test environment with a known-safe E2E target.

1. Call `start_run` with `{"target":"spec:auth/login.spec.js"}`.
2. Record the returned `runId`; do not guess or substitute an ID.
3. Call `get_run_status` with that ID and verify `RUNNING`.
4. Call `get_run_result` while running and verify `available:false`.
5. If the run is still active and safe to stop, call `cancel_run` with that ID.
6. Poll `get_run_status` until `COMPLETED`; cancellation is not complete until process-tree cleanup finishes.
7. Call `get_run_result` and verify the terminal `CANCELLED` result. Do not interpret cancellation as PASS.

If the E2E target finishes naturally before step 5, verify its actual terminal result instead. Do not restart a run merely to force a cancellation scenario unless the disposable test environment is reset.

### Security inspection

- Confirm responses contain no absolute filesystem paths, PID/process metadata, stdout/stderr, raw report JSON, or environment secrets.
- Do not paste secrets into tool arguments or save them in Inspector configuration.
- Keep Inspector and the server local; do not expose the Inspector proxy or stdio server to an untrusted network.
- Capture sanitized screenshots or redacted JSON only. Never attach raw environment dumps or credentials.

## Acceptance criteria

- Automated official Inspector CLI qualification passes in CI.
- Interactive STDIO connection and initialize succeed.
- Exactly five tools are discoverable with correct annotations.
- `list_tests` returns schema-valid structured catalogue data.
- A disposable E2E run produces a real run ID and truthful lifecycle/result.
- Cancellation, if exercised, reaches COMPLETED only after process-tree cleanup.
- No secret, absolute path, PID, raw evidence, stdout, or stderr leaks to MCP tool responses.
- Existing framework, Chromium, Windows lifecycle, Windows CLI, and dependency-audit jobs remain green.

## Boundaries

This phase does not qualify remote/HTTP transport, multi-user execution, authentication, package publication, AI-agent integration, or arbitrary production customer environments. The automated Inspector CLI check is not a substitute for the interactive execution/cancellation scenario.
