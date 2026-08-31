# Quickstart

## 1. Configure Runtime

Create local ignored environment files from the safe examples.

Application test runtime:

```text
.env
BASE_URL=https://target-application.example
```

Optional AI runtime:

```text
.env.ai
AI_API_KEY=...
AI_BASE_URL=...
AI_MODEL=...
```

Do not commit either runtime file.

## 2. Record

```powershell
npm run record -- https://target-url.com
```

Perform the target flow in the browser opened by Playwright Codegen. Codegen output is raw interaction input, not final automation.

## 3. Implement

Give the recorded flow to the coding agent using `docs/AGENT_TASK_TEMPLATE.md`.

You do not need to repeat architecture instructions. `AGENTS.md` requires an architecture ownership pass, reuse-before-create, relative application navigation, deterministic assertions in tests, and only justified fixtures/data modules.

## 4. Run

```powershell
npm run test:e2e
```

If the test fails and real failure evidence exists:

```powershell
npm run triage
```

Review the AI classification against the Playwright evidence. AI is advisory only and cannot change PASS/FAIL.

After correcting an automation defect or resolving the actual cause, retest.

## 5. Validate

```powershell
npm run validate
```

This is the deterministic local quality gate. It runs lint, policy checks, secret/runtime-artifact checks, and the configured E2E suite.

## 6. Run Visually

Preferred:

```powershell
npm run test:ui
```

Alternative:

```powershell
npm run test:headed
```

## 7. Report

```powershell
npm run report
```

## 8. Policy Self-Test

```powershell
npm run policy:selftest
```

## 9. AI Triage Self-Test

```powershell
npm run triage:selftest
```

This command uses synthetic failed evidence to verify the triage engine. It does not report the status of the current application test suite.
