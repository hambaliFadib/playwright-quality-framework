# Repository Instructions for Coding Agents

Follow `policies/ARCHITECTURE_CONTRACT.md` as the source of truth.

Use JavaScript and CommonJS only. Do not introduce TypeScript, transpilation, Dependency-Cruiser, custom ESLint plugins, AI DOM navigation, selector healing, CI sharding, or database adapters for this MVP.

## Default Task Mode

DEFAULT TASK MODE: AUTOMATION IMPLEMENTATION

When the user provides a recorded Playwright Codegen flow, manual test steps, a test scenario, or a feature flow, automatically:

1. Understand the scenario.
2. Inspect existing Page Objects, fixtures, and data factories.
3. Reuse existing implementation where appropriate.
4. Move UI locators into thin Page Objects.
5. Use the approved fixture entry point.
6. Keep deterministic assertions in tests.
7. Use existing data factories or create narrowly scoped data.
8. Replace hard waits with observable conditions.
9. Preserve the supplied expected behavior.
10. Run repository validation before handoff.

The user should not need to repeat repository rules such as using POM, fixtures, locator ownership, observable waits, or validation.

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

Review generated locators, reuse existing Page Objects, remove duplication, preserve the user flow, add only justified abstractions, and implement supplied expected behavior.

Before changing tests, run `npm run policy:check`. Before final handoff, run `npm run validate`, `npm run policy:selftest`, and `npm run triage:selftest`.
