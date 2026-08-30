# Policy-Driven Playwright AI Automation Template

Reusable JavaScript Playwright template for human QA engineers and AI coding agents.

## Fast Workflow

```text
Record -> Agent -> Validate -> Demo
```

```powershell
npm run record -- <URL>
npm run validate
npm run test:ui
npm run report
```

Codegen captures the interaction. The coding agent implements it according to `AGENTS.md`. Playwright remains the deterministic test oracle.

See `docs/DEMO_QUICKSTART.md` for the live-demo workflow.

```mermaid
flowchart TD
  T[tests/e2e] --> F[src/fixtures]
  F --> P[src/pages]
  F --> D[src/data]
  D --> AI[src/ai test data]
  PW[Playwright PASS/FAIL] --> R[JSON evidence]
  R --> AT[src/ai triage]
  AT --> ADV[advisory only]
```

Playwright assertions are the test oracle. AI can provide schema-validated data and advisory triage, but cannot decide pass or fail.

## Directories

- `tests/e2e`: deterministic scenarios and assertions.
- `src/fixtures`: approved test entry point and dependency injection.
- `src/pages`: thin Page Objects and locators.
- `src/data`: collision-safe data factories.
- `src/ai`: bounded AI data and triage modules.
- `demo-app`: minimal local AUT for offline validation.
- `examples/policy-violations`: intentionally bad specs used by `npm run policy:demo`.
- `scripts`: policy, secret, and triage commands.

## Setup

```powershell
npm ci
npx playwright install chromium
```

Optional `.env` values are shown in `.env.example`. Do not commit `.env` or storage state files.

## Commands

- `npm run lint`
- `npm run policy:check`
- `npm run secret:check`
- `npm run test:e2e`
- `npm run test:ui`
- `npm run test:headed`
- `npm run test:debug`
- `npm run record -- <URL>`
- `npm run report`
- `npm run policy:demo`
- `npm run demo:triage`
- `npm run validate`

## Policy As Code

ESLint Flat Config and scripts reject direct `@playwright/test` imports from E2E tests, raw locators in tests, `waitForTimeout`, swallowed assertions, focused/skipped tests, force clicks, inline ESLint disables, Page Object assertions, and AI module assertions.

## AI Boundary

AI data must be JSON and pass Zod validation. Invalid or unavailable AI output falls back to Faker. AI triage consumes failure evidence after Playwright runs and returns an advisory classification. `INCONCLUSIVE` is a triage classification, not a Playwright status.

## Demos

`npm run policy:demo` proves three bad examples are rejected. `npm run demo:triage` prints a failed Playwright status with advisory triage and does not alter the status.

## Known Limitations

Static checks do not prove arbitrary semantic assertion equivalence, such as changing an exact expected value to a weaker partial value. That remains a governed human review boundary.

## Production Backlog

Consider Dependency-Cruiser, semantic diffing, richer evidence reports, worker account strategy, API cleanup helpers, sharding, and broader browser coverage only when project scale justifies them.
