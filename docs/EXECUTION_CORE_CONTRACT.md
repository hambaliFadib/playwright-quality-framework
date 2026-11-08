# Execution Core Contract (P2.1)

This contract is the stable boundary for the future local execution engine. It does not start processes or expose an MCP/HTTP API.

## Operations

- \`listTests()\` returns stable \`spec:<POSIX-relative-path>\` IDs.
- \`startRun({ target, timeoutMs? })\` returns a UUID and \`RUNNING\` lifecycle response.
- \`getRunStatus(runId)\` returns lifecycle only.
- \`getRunResult(runId)\` returns \`available: false\` until a terminal result exists.
- \`cancelRun(runId)\` requests cancellation; completion is not reported until the process tree has closed.

## Lifecycle and outcome

Lifecycle describes process state: \`RUNNING\`, \`CANCELLING\`, \`COMPLETED\`.

Outcome describes the terminal test result: \`PASSED\`, \`FAILED\`, \`NO_TESTS\`, \`TIMED_OUT\`, \`CANCELLED\`, \`ERROR\`.

A process can be \`COMPLETED\` with any one of the six outcomes. \`PASSED\` requires at least one executed test and all tests passed, with no skipped or flaky tests. Exit code 0 alone is insufficient.

## Bounds

- Default timeout: 120,000 ms.
- Minimum timeout: 1,000 ms.
- Maximum timeout: 300,000 ms.
- Completed in-memory history: 20 records.
- Public run ID: UUID.
- Public error responses contain only a stable error code.

## Security boundary

Inputs are strict Zod objects. Arbitrary commands, arguments, caller environment variables, absolute paths, traversal, and Windows path separators are not part of the contract. Public result schemas do not include stdout, stderr, stack traces, URLs, credentials, process IDs, or absolute report paths.

## Current implementation slice

P2.1 defines schemas and validators only. Catalogue discovery, filesystem/symlink checks, process spawning, cancellation, run storage, and reporter parsing are deferred to P2.2–P2.4.


## P2.2 — Test discovery and target validation

- The catalogue root is fixed to the repository's `tests/e2e` directory; callers cannot supply a root path.
- Only regular files ending in `.spec.js` or `.test.js` are discovered, recursively.
- IDs use `spec:<POSIX-relative-path>`; output ordering is deterministic.
- `suite:all` resolves to every discovered spec, including an empty list when the catalogue is empty.
- A well-formed ID absent from the current catalogue returns `TEST_NOT_FOUND`; malformed or unsafe IDs return `INVALID_TARGET`.
- The repository root is the trusted filesystem anchor. Before walking, every component from that anchor through `tests/e2e` is checked with `lstat` and must be a real directory; symlinks in `tests`, `e2e`, or nested entries are rejected. Invalid spec path segments and non-directory roots fail closed. Filesystem availability failures return `CATALOG_UNAVAILABLE`.
- Discovery rechecks filesystem paths against the canonical catalogue root. Execution must still revalidate the selected file immediately before spawn to close time-of-check/time-of-use gaps.
- Root-injection helpers are internal test seams; the public `listTests()` and `resolveTestTarget()` always use the fixed repository root.


## P2.3 — Asynchronous execution and lifecycle

- startRun({ target, timeoutMs? }) resolves the target against the fixed catalogue, revalidates every selected file immediately before process creation, then starts the fixed local Playwright CLI through the current Node executable.
- The process uses shell: false, a fixed repository working directory, Chromium, one worker, and zero retries. Caller-supplied commands, arguments, paths, and environment overrides are not accepted.
- Only one execution may be active or being prepared. Concurrent starts return EXECUTION_BUSY; there is no queue.
- Default timeout is 120 seconds; accepted bounds remain 1–300 seconds.
- POSIX execution starts in a detached process group. Cancellation and timeout send SIGTERM, wait the bounded grace period, then send SIGKILL to the process group.
- Windows cancellation and timeout use the absolute System32 taskkill.exe path with /T /F. A failed tree cleanup falls back to killing the direct child but is reported as PROCESS_CLEANUP_FAILED, never as successful cancellation.
- A timeout/cancellation remains CANCELLING until both the child close event and process-tree cleanup have completed. The active slot is not released earlier.
- Completed run history is in memory and retains the latest 20 completed records. There is no persistent queue or database.
- An empty suite:all completes immediately with NO_TESTS.
- A natural process exit records COMPLETED lifecycle but leaves the outcome unavailable. P2.4 must classify it from a valid per-run Playwright JSON report; exit code 0 is never treated as PASSED.
- Process IDs, exit details, absolute spec paths, stdout/stderr, and environment values remain internal and are not returned by the public API.
