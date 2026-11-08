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
