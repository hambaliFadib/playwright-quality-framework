# Quickstart

## 1. Record

```powershell
npm run record -- https://target-url.com
```

Perform the target flow in the browser opened by Playwright Codegen.

## 2. Implement

Give the recorded flow to the coding agent using `docs/AGENT_TASK_TEMPLATE.md`.

You do not need to repeat architecture instructions. `AGENTS.md` defines how the agent turns recorded steps into architecture-compliant automation.

## 3. Validate

```powershell
npm run validate
```

## 4. Run Visually

Preferred:

```powershell
npm run test:ui
```

Alternative:

```powershell
npm run test:headed
```

## 5. Report

```powershell
npm run report
```

## 6. Policy Self-Test

```powershell
npm run policy:selftest
```

## 7. AI Boundary

Playwright owns PASS/FAIL. AI triage is advisory only and never alters test status.

AI provider configuration lives in `.env.ai` (not `.env`). Normal deterministic validation does not require AI. AI must not heal selectors or change expected results.

```powershell
npm run triage:selftest
```
