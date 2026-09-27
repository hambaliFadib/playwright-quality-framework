# Agent Rules

AI coding agents may create compliant tests, fixtures, Page Objects, and data modules.

Ordinary automation tasks must not create or modify `src/ai/**`. Creation or modification of AI runtime modules is ARCHITECTURE MAINTENANCE and requires explicit authorization.

Agents must not delete or weaken assertions, add `test.only`, `test.skip`, `test.fixme`, arbitrary sleeps, force clicks, ESLint disables, hardcoded credentials, self-healing selectors, or LLM pass/fail decisions.

All E2E tests must import `test` and `expect` from `src/fixtures/test.fixture.js`.
