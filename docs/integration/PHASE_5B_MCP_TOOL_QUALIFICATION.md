# Phase 5B — MCP Tool Qualification

## Purpose

Qualify every registered MCP tool through the MCP protocol while reusing the actual Production Core execution implementation. This phase adds no runtime tools and does not change execution behavior.

## Automated protocol coverage

`tests/integration/mcp-tool-qualification.test.js` connects the official MCP client and server over the SDK's linked in-memory transport. The handlers call the real execution core with deterministic process, clock, catalogue, and reporter dependencies; no browser, network, external AUT, or real process is started by these tests.

The qualification covers:

- `list_tests`: valid catalogue output and read-only annotation.
- `start_run`: valid start, invalid target rejection, and active-run conflict.
- `get_run_status`: RUNNING, CANCELLING, COMPLETED, malformed UUID, and unknown run.
- `get_run_result`: unavailable-before-terminal, validated PASSED result, terminal CANCELLED result, and unknown run.
- `cancel_run`: first cancellation, idempotent repeated cancellation, process-group cleanup ordering, cancellation after completion, and unknown run.
- Stable error codes and parity between `structuredContent` and text JSON.
- Strict output-schema rejection for unexpected fields, including PID, filesystem paths, raw report data, environment secrets, stdout, and stderr.
- MCP tool annotations for read-only and destructive operations.

The separate `mcp-stdio.test.js` remains the real child-process stdio handshake and tool-discovery smoke test.

## Manual MCP Inspector check

The Inspector is an interactive diagnostic tool, not a replacement for automated acceptance tests. Start it with:

```bash
npx @modelcontextprotocol/inspector
```

Choose stdio transport and configure:

- Command: `node`
- Arguments: `scripts/run-mcp-server.js`
- Working directory: repository root
- Environment: only the trusted local application environment required by the test target

Run the five tools in order: `list_tests`, `start_run`, `get_run_status`, `get_run_result`, and `cancel_run`. Use a disposable test environment. Do not paste credentials into tool arguments or save them in Inspector configuration. The server must emit protocol frames only on stdout; diagnostics belong on stderr.

Inspector version requirements may be newer than the framework's Node engine. Run it under a Node version supported by the installed Inspector release; do not raise the framework engine requirement solely for this optional manual check.

## Security boundary

- Local stdio and trusted local workspace only.
- No arbitrary commands, paths, environment overrides, HTTP listener, hosted execution, or multi-user support.
- Playwright and the validated reporter remain the sole execution oracle.
- Raw report files and process metadata remain private to the core.
- No MCP tool can convert a failed, empty, timed-out, cancelled, or invalid execution into PASS.

## Acceptance criteria

- All five tools are invoked through an MCP client, not by directly calling their handlers.
- Positive, negative, and lifecycle transitions match the execution contract.
- Every terminal result is schema-validated before publication.
- No secret, raw evidence, absolute path, PID, stdout, or stderr appears in public MCP output.
- Real stdio handshake and tool discovery continue to pass.
- Framework validation, Chromium smoke, Windows lifecycle, Windows CLI compatibility, and dependency audit remain green.
- Code review reports no unresolved findings.

## Out of scope

New MCP tools, prompts/resources, HTTP/SSE, remote execution, multi-user access, authentication, package publication, and AI-agent product integration.
