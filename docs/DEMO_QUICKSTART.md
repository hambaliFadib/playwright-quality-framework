# Demo Quickstart

## 1. Record

```powershell
npm run record -- https://target-url.com
```

Manually perform the target flow in the browser opened by Playwright Codegen.

## 2. Give Flow to Agent

Use this minimal task format:

```text
Feature:
<feature>

Expected result:
<expected business result>

Codegen:
<generated Playwright code>
```

You do not need to repeat architecture instructions. `AGENTS.md` defines how the agent turns the recorded flow into architecture-compliant automation.

## 3. Validate

```powershell
npm run validate
```

## 4. Visual Demo

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

## 6. Policy Differentiator

```powershell
npm run policy:demo
```

## 7. AI Boundary

```powershell
npm run demo:triage
```
