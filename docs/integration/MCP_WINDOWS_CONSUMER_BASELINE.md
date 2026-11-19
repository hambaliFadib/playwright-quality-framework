# PQF MCP Windows Consumer Qualification Baseline

**Qualification date:** 2026-11-19  
**Repository:** `hambaliFadib/playwright-quality-framework`  
**Source baseline:** `e061810292f211ba51db1f1db2c7f7fb83440214` (`main`)  
**Consumer:** Codex CLI on Windows  
**Consumer version:** `0.166.0`  
**Node.js:** `v22.23.5`  
**Transport:** local MCP STDIO  
**Overall result:** FUNCTIONAL QUALIFICATION PASS

This record captures the observed Windows Codex consumer qualification for the PQF MCP server. It records functional evidence; it is not a blanket production-readiness or security certification.

## 1. Scope and MCP tools

The consumer connected to `pqf_local` and discovered all five tools:

- `list_tests`
- `start_run`
- `get_run_status`
- `get_run_result`
- `cancel_run`

The catalogue contained three E2E entries:

| Catalogue ID | Relative path |
|---|---|
| `spec:auth/login.spec.js` | `auth/login.spec.js` |
| `spec:cart/add-to-cart.spec.js` | `cart/add-to-cart.spec.js` |
| `spec:cart/remove-from-cart.spec.js` | `cart/remove-from-cart.spec.js` |

The read-only qualification called `list_tests` once. It did not start an execution or mutate the repository.

## 2. Full-suite execution through Codex

**Run ID:** `b919ddd9-3b6b-468c-af26-05df83350b17`

**Lifecycle:** `RUNNING → RUNNING → COMPLETED`  
**Outcome:** `PASSED`

| Field | Observed |
|---|---:|
| Started at | `2026-11-19T01:54:06.651Z` |
| Finished at | `2026-11-19T01:54:12.735Z` |
| Duration | 6,085 ms |
| Total | 3 |
| Passed | 3 |
| Failed | 0 |
| Skipped | 0 |
| Flaky | 0 |
| Error code | `null` |

All expected values matched the MCP structured result.

## 3. Cancellation and recovery through Codex

### 3.1 Earlier attempt — not counted as a cancellation pass

**Run ID:** `aa1d201e-5999-4522-a4ed-3552357e7ede`

- `cancel_run` returned `ok: false`, code `CANCEL_NOT_ALLOWED`.
- The probe later reached `COMPLETED` with outcome `TIMED_OUT`.
- The available response/trace did not establish the cancel-call timestamp, so the cause of the rejection is undetermined.
- A subsequent login run `37a436b3-8ebf-44af-b56a-a35beba27e60` passed 1/1 after the probe had reached a terminal state. This only established recovery after timeout, not recovery after cancellation.

### 3.2 Successful cancellation attempt

**Probe run ID:** `0b86f41b-8646-46ff-ab34-86f46addf799`

- `cancel_run` was called immediately after `start_run` returned the run ID, in the same Codex operation.
- Cancellation response: `{"ok":true}`.
- Lifecycle: `RUNNING → COMPLETED`.
- Terminal outcome: `CANCELLED`.

| Field | Observed |
|---|---|
| Started at | `2026-11-19T02:25:38.283Z` |
| Finished at | `2026-11-19T02:27:09.026Z` |
| Summary total | 0 |
| Passed / failed | 0 / 0 |
| Skipped / flaky | 0 / 0 |
| Error code | `null` |

The probe duration from start to terminal completion was 90,743 ms. The cancel-call timestamp was not available in the MCP response or accessible trace; therefore this duration is **not** a cancellation-latency measurement.

### 3.3 Recovery after successful cancellation

**Recovery run ID:** `71d61999-8332-4170-a0c4-15d37c51f307`

- Lifecycle: `RUNNING → COMPLETED`.
- Outcome: `PASSED`.

| Field | Observed |
|---|---:|
| Started at | `2026-11-19T02:27:35.036Z` |
| Finished at | `2026-11-19T02:27:37.997Z` |
| Total | 1 |
| Passed | 1 |
| Failed | 0 |
| Skipped / flaky | 0 / 0 |
| Error code | `null` |

This proves that a new login execution could use the execution slot after the successful cancellation reached its terminal state.

## 4. Windows repository regression and cleanup

The Windows local integration qualification on the same source baseline reported:

| Check | Result |
|---|---|
| Integration self-test | 123 passed, 0 failed, 2 skipped (125 total) |
| Lint | Exit 0; 0 errors; 3 existing `playwright/no-conditional-in-test` warnings |
| MCP Inspector qualification | Initialize PASS; 5 tools listed; 3 catalogue entries |
| `policy:check` after temporary probe cleanup | PASS; 3 existing warnings reported |
| Temporary cancellation probe | Removed |
| Final catalogue | No temporary cancellation entry |
| Git branch / status | `main`, clean |
| HEAD | `e061810292f211ba51db1f1db2c7f7fb83440214` |

The two skipped integration tests are recorded as observed; their individual reasons were not included in the supplied qualification summary.

## 5. Security observations and limits

- The MCP structured result exposed run IDs, lifecycle, timestamps, summary counts, outcome, and error code as expected.
- The qualification instructions prohibited returning credentials, raw reports, filesystem paths, stdout/stderr, or process metadata. No such values were included in the supplied consumer reports.
- This is an observation from the tested interactions, not a comprehensive adversarial security assessment.
- Cancellation latency was not measured because the cancel-call timestamp was unavailable.
- The record does not establish concurrent-run behavior, stress/load limits, crash recovery, or public-release readiness.

## 6. Final disposition

**Functional Windows Codex consumer qualification: PASS** for the recorded source baseline.

Evidence supports:
1. MCP connection and discovery of all five tools.
2. Read-only catalogue retrieval with three expected entries.
3. Full-suite execution through Codex with 3/3 passing.
4. Accepted cancellation reaching `COMPLETED / CANCELLED`.
5. A subsequent login run passing 1/1 after cancellation.
6. Temporary probe cleanup and a clean repository state.

No production source change was required for this qualification. Any later source change should be qualified against its own commit; this baseline must not be treated as evidence for a different revision.
