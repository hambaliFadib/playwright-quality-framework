# Repository Instructions for Coding Agents

Follow `policies/ARCHITECTURE_CONTRACT.md` as the source of truth.

Use JavaScript and CommonJS only. Do not introduce TypeScript, transpilation, Dependency-Cruiser, custom ESLint plugins, AI DOM navigation, selector healing, CI sharding, or database adapters for this MVP.

## Default Task Mode

DEFAULT TASK MODE: AUTOMATION IMPLEMENTATION

When the user provides a recorded Playwright Codegen flow, manual test steps, a test scenario, or a feature flow, use this workflow:

```text
UNDERSTAND SCENARIO
-> ARCHITECTURE OWNERSHIP PASS
-> INSPECT EXISTING MODULES
-> REUSE BEFORE CREATE
-> IMPLEMENT ONLY REQUIRED LAYERS
-> RUN TEST
-> RUN VALIDATION
```

The user should not need to repeat repository rules such as using POM, fixtures, locator ownership, observable waits, data separation, or validation.

## Architecture Ownership Pass

Before writing or modifying automation code, classify each supplied action, value, dependency, and expected result by ownership.

- UI locators and page-specific interactions -> `src/pages/**`.
- Reusable non-sensitive test input and scenario data -> `src/data/**`.
- Reusable setup, lifecycle, preconditions, authenticated state, API/DB clients, prepared state, and dependency injection -> `src/fixtures/**`, only when genuinely required.
- Scenario flow and deterministic expected behavior -> `tests/e2e/**`.
- Deterministic assertions -> `tests/e2e/**`; do not hide business truth in Page Objects, fixtures, data modules, or AI.
- Application test configuration -> `.env` / environment variables.
- AI provider configuration -> `.env.ai` / environment variables.
- Bounded AI runtime logic -> `src/ai/**`.

Do not create empty abstractions merely to satisfy folder structure. Modular means clear responsibility and correct ownership, not many files.

### Reuse Before Create

Before creating a Page Object, data module, or fixture:

1. Inspect the existing implementation.
2. Reuse an existing owner when responsibility matches.
3. Extend an existing module when appropriate.
4. Create a new module only when responsibility is genuinely different.
5. Do not duplicate locators, reusable data, setup logic, or abstractions.

### Fixture Decision Rule

A fixture is justified when the test needs reusable setup, lifecycle management, preconditions, authenticated state, clients, prepared application state, or dependency injection.

Do not create or modify a fixture merely because the fixtures folder exists. Do not bypass the behavior under test: a login test must exercise login, while an approval test may use prepared authentication or state when login/setup is not its focus.

### Test Data and Secrets

Reusable non-sensitive test input should live in `src/data/**` when reuse or scenario ownership justifies it. Do not move deterministic expected values such as `Products`, HTTP `200`, or `APPROVED` out of assertions merely because they are literals.

Real passwords, API keys, tokens, credentials, and sensitive environment-specific values must not be hardcoded in source. Application runtime values belong in `.env`; AI provider values belong in `.env.ai`. Both files must remain untracked. Public demo credentials may be represented as test data only when they are explicitly non-sensitive.

### Navigation and Environment Ownership

Do not hardcode the application-under-test base URL in Page Objects or tests.

- `BASE_URL` belongs to application runtime environment/configuration.
- `playwright.config.js` injects `process.env.BASE_URL` as Playwright `baseURL`.
- Page Objects should navigate using relative application routes such as `page.goto('/')` or `page.goto('/inventory.html')` when `baseURL` is configured.
- Normalize Codegen absolute `page.goto(...)` URLs that target the application under test.
- Genuine external or third-party URLs may remain explicit when they are actually part of the scenario.

## Anti-Hallucination Rule

If expected behavior or a business rule is not known, do not invent it.

If a recorded Codegen flow contains actions but no reliable expected result, preserve the recorded actions, identify the missing oracle, and ask or report what expected behavior is required.

Do not invent expected text, expected status, expected database values, expected API results, business rules, or permissions. AI may implement known intent. AI may not invent product truth.

## Framework Freeze

For ordinary test automation tasks, the framework itself is frozen.

Normal agent-write scope is primarily `tests/e2e/**`, `src/pages/**`, and `src/data/**`. Modify `src/fixtures/**` only when lifecycle or dependency-injection needs justify it.

Do not normally modify `AGENTS.md`, `policies/**`, `eslint.config.js`, `playwright.config.js`, `.github/workflows/**`, `scripts/policy-*`, `scripts/secret-*`, or architecture-level AI boundaries unless the user explicitly authorizes ARCHITECTURE MAINTENANCE or a verified framework defect requires remediation.

A new test must adapt to the framework. The framework must not be redesigned for each new test.

## Codegen Workflow

Playwright Codegen output is input, not final automation.

Standard flow:

```text
TARGET WEB -> Playwright Codegen -> raw recorded flow -> coding agent -> architecture-compliant automation -> deterministic assertion -> validation -> CI
```

Review generated locators, normalize application navigation, route reusable data to its owner, reuse existing modules, remove duplication, replace hard waits with observable conditions, preserve the user flow, add only justified abstractions, and implement supplied expected behavior.

Before changing tests, run `npm run policy:check`. Before final handoff, run `npm run validate`, `npm run policy:selftest`, and `npm run triage:selftest`.
