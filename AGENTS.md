# Repository Instructions for Coding Agents

Follow `policies/ARCHITECTURE_CONTRACT.md` as the source of truth.

Use JavaScript and CommonJS only. Do not introduce TypeScript, transpilation, Dependency-Cruiser, custom ESLint plugins, AI DOM navigation, selector healing, CI sharding, or database adapters for this MVP.

## Default Task Mode

DEFAULT TASK MODE: AUTOMATION IMPLEMENTATION

When the user provides the canonical input, a recorded Playwright Codegen flow, manual test steps, or a feature scenario, automatically:

1. Understand the input.
2. Identify the product capability.
3. Identify the behavior.
4. Perform the Test Suite Organization Pass.
5. Perform the Architecture Ownership Pass.
6. Inspect existing Page Objects, fixtures, and data modules.
7. Reuse existing implementation where appropriate.
8. Implement only the framework layers that have real responsibility.
9. Replace hard waits with observable conditions.
10. Preserve the supplied expected behavior.
11. Run the target test and repository validation.
12. Report results. Stop.

The user should not need to tell the agent which spec file to use, whether to use POM, where reusable data belongs, whether a fixture is justified, not to duplicate locators, not to over-abstract, not to hardcode BASE_URL, or how to organize scenarios. Those are repository responsibilities.

## Canonical User Input

The default automation input contract:

```
Feature:
<...>

Expected result:
<...>

Test data:
<...>

Pre-Condition:
<...>

Codegen / Manual flow:
<...>
```

Rules:

- All five headers should normally be present.
- Test data may be `N/A`.
- Pre-Condition may be `N/A`.
- Codegen / Manual flow may be `N/A`.
- Expected result must contain enough known behavior to establish the deterministic oracle.
- Test Case ID is not required. Never generate or invent a `TC-*` ID automatically.
- Business rules are not part of the canonical input. Do not introduce a Business rules field.

## Test Suite Organization

Tests are organized by: **CAPABILITY → BEHAVIOR → SCENARIO**.

Preferred structure:

```
tests/e2e/
  auth/
    login.spec.js
    session.spec.js
  inventory/
    inventory.spec.js
  cart/
    cart.spec.js
  checkout/
    checkout.spec.js
```

Rules:

- Organize by product capability and behavior.
- Positive/negative/validation/regression are scenario characteristics, not directory or spec ownership.
- Do not create folders such as `positive/`, `negative/`, `happy-path/`, `error/`, `success/`, or `failed/`.
- Do not create a separate spec only because a scenario is negative.
- Same capability + same behavior should normally remain in the same spec.
- A genuinely different behavior may justify a new spec.
- A different capability normally belongs in a different directory.
- Avoid giant application-wide spec files. Avoid excessive fragmentation.
- Reuse existing spec files before creating new ones.
- When a new test is added, place it in the correct capability directory. If the directory does not exist, create it. If the spec file for that behavior already exists, append to it.

Resolution example:

```
Feature: Login - Invalid Credential
→ Capability: Authentication
→ Behavior: Login
→ Scenario: Invalid Credential
→ Preferred owner: tests/e2e/auth/login.spec.js
```

Not `tests/e2e/auth/login-negative.spec.js`.

## Architecture Ownership

### Layer Responsibilities

| Layer | Owns |
|---|---|
| `tests/e2e/**` | scenario flow, business flow, deterministic assertions, expected product behavior |
| `src/pages/**` | locators, page-specific interactions, relative application navigation |
| `src/data/**` | reusable non-sensitive test input, public demo data, data factories when justified |
| `src/fixtures/**` | reusable setup, lifecycle, preconditions, authenticated/prepared state, clients, dependency injection |
| `src/ai/**` | bounded AI functionality only |
| `.env` | application runtime configuration |
| `.env.ai` | AI provider configuration |

### Ownership Rules

- Locators and page-specific UI interactions belong in `src/pages/**`. Tests must not own raw selector implementation. Do not duplicate a locator already owned by the appropriate Page Object.
- Reusable non-sensitive test input and scenario data belong in `src/data/**`.
- Application test configuration belongs in `.env`. AI provider configuration belongs in `.env.ai`. Secrets, passwords, tokens, API keys, and sensitive environment-specific configuration must use environment variables or approved secret management, never hardcoded source.
- Reusable setup, lifecycle, preconditions, authenticated state, API clients, DB clients, prepared application state, and dependency injection belong in `src/fixtures/**` only when genuinely required.
- Scenario flow and deterministic expected behavior belong in `tests/e2e/**`.
- Assertions belong in `tests/e2e/**`; never hide business truth inside Page Objects, fixtures, data modules, or AI.
- Expected business values must not be moved out of tests merely because they are string or numeric literals.

### Fixture Gateway

All E2E specs must obtain `test` and `expect` through the repository fixture gateway at `src/fixtures/test.fixture.js`. E2E specs must not import directly from `@playwright/test`. This complements ESLint enforcement.

### Fixture Decision Rule

#### FIXTURE LEVELS

There are 4 fixture levels. Always use the lowest level sufficient for the test.

- Level 1 — UI precondition only
- Level 2 — API client for setup and teardown
- Level 3 — DB access for validation or seed data
- Level 4 — Orchestration combining multiple layers

#### DECISION RULE PER LEVEL

Use Level 1 only if:

- The test requires UI state that cannot be prepared any other way, or
- The UI setup itself is the behavior under test.

Escalate to Level 2 only if:

- The precondition is not relevant to the UI behavior under test, and
- An API endpoint is available to prepare the state, and
- API setup is more deterministic and faster than UI for this case.

Escalate to Level 3 only if:

- The state to verify is not exposed via UI or API, or
- Required seed data cannot be created via API, and
- DB access is explicitly configured in the environment.

Escalate to Level 4 only if:

- The scenario genuinely requires a combination of layers, and
- Each layer used has its own justification per the rules above.
- Not because it seems more complete.

#### CONFIRMATION GATE

Agent must stop and request explicit confirmation before implementing Level 3 or Level 4 fixture. No code may be written until all confirmation points are answered by the engineer.

Confirmation format:

```text
CONFIRMATION REQUIRED — [Level 3 / Level 4] Fixture

1. [point specific to the fixture being implemented]
2. [point specific to the fixture being implemented]
3. ...
```

Wait for explicit answer to every point before proceeding.

#### CLEANUP RULE

Every fixture must have an explicit teardown.

- Level 1 — Automatic cleanup. Browser context reset or logout. No confirmation required.
- Level 2 — API cleanup must be defined alongside setup. Agent must confirm: which cleanup endpoint is available and whether it is safe to run automatically in CI.
- Level 3 — DB cleanup must be explicit. Agent must confirm: which tables and data will be deleted, foreign key dependencies, and whether the environment is safe for destructive operations.
- Level 4 — Cleanup follows the rule of each layer involved, executed in reverse order of setup. Confirmation required per layer.

### Navigation And Environment

Do not hardcode the application's environment-specific base URL in tests or Page Objects. `BASE_URL` belongs to `.env` and is injected into Playwright `baseURL`.

When Playwright `baseURL` is configured, Page Objects navigate with relative routes. Normalize Codegen output such as `page.goto('https://www.saucedemo.com/')` to `page.goto('/')` when the URL targets the application under test.

Page-specific routes may remain explicit in Page Objects, such as `page.goto('/inventory.html')`. Genuine external or third-party URLs that are part of the behavior under test may remain explicit when justified.

## Clean Code / Modularity Rules

### Reuse Before Create

Before creating any new spec, Page Object, data module, fixture, helper, or utility:

1. Inspect existing implementation first.
2. Existing owner fits? → reuse.
3. Existing owner can reasonably be extended? → extend.
4. Responsibility is genuinely different? → create.
5. Do not duplicate responsibility.

Modular does NOT mean many files. Modular means clear responsibility, correct ownership, reuse where appropriate, and minimal unnecessary abstraction.

### Architecture Correctness Before Reuse

Architecture correctness comes before reuse. The preferred decision model is:

```
CANONICAL OWNERSHIP
→ inspect existing implementation
→ reuse when compliant
→ migrate/refactor when responsibility is correct but structure is legacy/non-canonical
→ create only when genuinely required
```

Do not interpret "Reuse Before Create" as "preserve every existing file location forever." When a file exists in the wrong location but has correct responsibility, migrate it to the canonical path.

### Avoid Premature Abstraction

Do not automatically create helpers, managers, services, wrappers, base classes, factories, or utilities for logic that is simple, readable, scenario-specific, and used once.

Create abstractions because responsibility or reuse justifies them, not because a folder exists.

### Single Responsibility

A Page Object must not become an application-wide god object. `LoginPage` owns login-page locators and interactions. It must not gradually own inventory, cart, checkout, or unrelated workflows.

### Reusable Flow

If a page-specific action already exists, reuse it. Do not repeatedly reconstruct the same low-level sequence across specs.

## Pre-Condition Semantics

Pre-Condition is meaningful input, not documentation-only text. The agent uses it when deciding setup strategy.

Since login IS the behavior under test → do not use an authenticated fixture that bypasses login.

Since login is NOT the behavior under test → reusable authenticated/prepared setup may be justified.

Rule: **Never bypass the behavior under test.**

## Test Data Semantics

Test data supplied by the user is scenario input. Agent decides ownership based on reuse.

- Reusable + non-sensitive → `src/data/**` may be appropriate.
- Scenario-specific + simple → may remain local when clean and justified.
- Sensitive → must not be hardcoded.

Do not move deterministic expected results into data files merely for abstraction.

## Expected Result Semantics

Expected result is the deterministic business oracle supplied by the QA/user. The agent may translate the known expectation into appropriate Playwright assertions.

The agent must NOT invent stronger or different business truth.

If expected behavior is insufficient to create a reliable oracle, report the missing information rather than inventing it.

## Codegen Workflow

Codegen is interaction evidence, not final source code. The agent normalizes it into framework-compliant implementation.

Required transformation:

```
raw Codegen
→ understand interaction intent
→ normalize AUT navigation to relative routes
→ move locators to appropriate Page Objects
→ reuse existing page interactions
→ route reusable test data correctly
→ remove redundant/duplicated actions
→ replace hard waits with observable state
→ preserve supplied scenario intent
→ implement supplied expected result in the spec
```

Do not blindly paste raw Codegen into specs.

## Spec Readability

A spec should read primarily like a QA scenario, not raw browser automation.

Preferred shape:

```js
test('should reject invalid credentials', async ({ loginPage }) => {
  await loginPage.login(...);
  await expect(loginPage.errorMessage).toBeVisible();
});
```

Avoid specs dominated by `page.locator(...)`, `page.fill(...)`, `page.click(...)`. Locator implementation belongs to Page Objects. Business assertions remain visible in specs.

## Anti-Hallucination Rule

If expected behavior or a business rule is not known, do not invent it.

Do not invent expected text, expected status, expected database values, expected API results, business rules, or permissions. AI may implement known intent. AI may not invent product truth.

Existing Playwright specs describe *how* a test runs, not *what the business requires*. Never extract expected behavior from automation code and treat it as authoritative business truth.

## Framework Freeze / Write Scope

For ordinary test automation tasks, the framework itself is frozen.

Normal agent-write scope: `tests/e2e/**`, `src/pages/**`, `src/data/**`. Modify `src/fixtures/**` only when lifecycle or dependency-injection needs justify it.

Do not normally modify `AGENTS.md`, `policies/**`, `eslint.config.js`, `playwright.config.js`, `.github/workflows/**`, `scripts/policy-*`, `scripts/secret-*`, `src/ai/**`, or architecture-level boundaries unless the user explicitly authorizes ARCHITECTURE MAINTENANCE or a verified framework defect requires remediation.

A new test must adapt to the framework. The framework must not be redesigned for each new test.

## Git Authority

Normal automation-task default behavior: implement → test → validate → report → **STOP**.

Do NOT commit, push, merge, or create PR unless the user explicitly authorizes that Git action. The user should not need to repeatedly say "do not commit or push."

## Optional Test Case Support

Test Case ID support is optional and secondary. No TC ID is required for normal automation. Never invent a `TC-*` ID automatically.

If the user explicitly supplies an authoritative Test Case ID and corresponding manual/test-case documentation, preserve it and consume it as additional context. If only a Playwright spec references the ID, treat it as implementation reuse context only.

Test Case ID traceability, when applicable:

```
Manual Test Case → Playwright Spec → Playwright Report → Failure Evidence / Triage
```

Preserve existing TC IDs in test titles. Do not rename or generate replacement IDs.

## Validation

Before changing tests, run `npm run policy:check`. Before final handoff, run `npm run validate`, `npm run policy:selftest`, and `npm run triage:selftest`.
