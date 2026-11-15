# Phase 5 — MCP Adapter Contract

## Purpose

Expose the Production Core v1 execution contract to MCP clients over local stdio. The adapter is a transport boundary only; it does not implement process management, test discovery, report parsing, or outcome classification.

## Runtime and trust boundary

- Node.js 22.13+ and the repository's trusted local workspace.
- Official `@modelcontextprotocol/server` SDK, pinned in package.json/package-lock.json.
- stdio is the only transport in this phase. stdout is reserved for MCP protocol frames; diagnostics go to stderr.
- No HTTP listener, remote endpoint, OAuth flow, database, queue, or hosted execution.
- The existing Windows symlink TOCTOU risk acceptance applies only to trusted local workspaces. It does not authorize shared or untrusted writable workspaces.

## Tools

| Tool | Input | Behavior |
|---|---|---|
| `list_tests` | `{}` | Return fixed catalogue descriptors |
| `start_run` | `{ target, timeoutMs? }` | Start one bounded run; target is `suite:all` or a validated `spec:<POSIX-relative-path>` |
| `get_run_status` | `{ runId }` | Return RUNNING, CANCELLING, or COMPLETED lifecycle |
| `get_run_result` | `{ runId }` | Return `available:false` until a terminal structured result exists |
| `cancel_run` | `{ runId }` | Request cancellation; completion waits for child close and process-tree cleanup |

## Result and error behavior

- Tool responses provide both text JSON and structured content.
- Errors expose stable contract error codes only; filesystem paths, stack traces, process IDs, stdout/stderr, raw report JSON, and credentials are never returned.
- The adapter validates requests and responses against the same Zod schemas used by the core.
- `PASSED` is never inferred from exit code alone. It requires at least one executed test and a clean validated report.
- AI triage is advisory and cannot change Playwright outcomes.

## Security

- No arbitrary command, argument, path, environment override, or catalogue root is accepted.
- Only the core starts Playwright, with its existing process, timeout, evidence, and cancellation controls.
- `cancel_run` is explicitly annotated as destructive. Read-only operations are annotated accordingly.
- stdio server startup writes no banners or logs to stdout.

## Configuration

```powershell
npm ci
npm run mcp:serve
```

Configure an MCP client to launch `node` with argument `scripts/run-mcp-server.js` and working directory set to the trusted repository root. Pass required application configuration through the client's process environment or the repository's ignored `.env`; never put secrets in MCP arguments.

## Out of scope

HTTP/SSE, authentication, multi-user execution, remote agents, package publication, AI triage tools, resource subscriptions, prompts, and additional product features.

## Qualification gates

- SDK protocol handshake and tool discovery.
- All five tools callable through a real stdio client.
- Invalid inputs and unknown run IDs fail with stable error codes.
- No secrets, process metadata, raw report contents, or paths in tool output.
- stdout contains protocol frames only.
- Existing framework validation, Chromium smoke, Windows lifecycle, Windows CLI, and dependency audit remain green.
