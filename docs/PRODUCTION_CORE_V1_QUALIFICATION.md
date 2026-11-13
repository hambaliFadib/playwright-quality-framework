# Production Core v1 — P4 Qualification

## Release decision

P4 is the final release gate for Production Core v1. A successful merge is not a release decision. The release status is GO only when every required gate below is evidenced against the same candidate commit.

## Required qualification matrix

| Gate | Platform | Evidence | PASS condition |
|---|---|---|---|
| Framework integrity | Ubuntu, Node 22 | `npm run validate:framework` | Lint, policy, secret scan, all integration tests, AI contract, policy self-test, and triage self-test exit 0 |
| Browser smoke | Ubuntu, Chromium | `npm run test:browser-smoke` | All configured browser smoke tests pass |
| Process lifecycle | Windows | `execution-process-tree.test.js` | Timeout and cancellation terminate parent and grandchild; cleanup failure never reports successful cancellation |
| CLI compatibility | Windows | `cli-compatibility.test.js` | Legacy CLI entrypoints and report paths remain compatible |
| Evidence security | Ubuntu + Windows | `run-report.test.js` | Retention, report bounds, symlink protections, and platform-specific permission assertions pass |
| Dependency security | Ubuntu, Node 22 | `npm audit --audit-level=moderate --include=dev` | No moderate-or-higher advisories |
| Public contract | Ubuntu | Integration suite | Strict schemas; no process metadata, raw report data, paths, or secrets in public results |
| Final source state | Git | Candidate commit SHA | All evidence belongs to the exact release candidate; no uncommitted or unreviewed changes |

## Explicit negative cases

- A zero-test run must never be classified as PASSED.
- Missing, malformed, oversized, stale, mismatched, or foreign run evidence must fail closed.
- A timeout/cancellation must remain non-terminal until child close and process-tree cleanup complete.
- A failed process-tree cleanup must produce ERROR / PROCESS_CLEANUP_FAILED, not CANCELLED.
- A concurrent start must not create a second active execution.\n- A real Playwright process started through the execution core must produce a per-run report and a matching structured terminal result.
- Invalid target paths and symlinked catalogue/report paths must be rejected.
- Public results must not expose stdout, stderr, stack traces, process IDs, absolute paths, raw reporter content, or credentials.

## Release criteria

GO requires all required matrix gates PASS on the same candidate SHA, no unresolved security/code review findings, and explicit Product Owner approval.

NO-GO if any required gate is failed, skipped without an accepted documented reason, missing, or executed against a different SHA.

## Scope boundary

Included: local execution core, test discovery, lifecycle, cancellation/timeout, structured results, report isolation, filesystem security, CLI compatibility, and CI qualification.

Excluded: MCP transport/adapter, package publication, hosted execution, persistent database/queue, external AUT credentials, and new product features. These are post-Production-Core work.

## Known residual risk

Windows file symlink rejection uses a pre-open filesystem check where Windows does not expose POSIX `O_NOFOLLOW`; this leaves a narrow TOCTOU race. This must remain documented in the release decision. If the security review considers the risk unacceptable, P4 is NO-GO until a Windows-safe handle/reparse-point strategy is implemented and qualified.
