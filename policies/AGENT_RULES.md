# Agent Rules

AI coding agents may create compliant tests, fixtures, Page Objects, data factories, and bounded AI modules.

Agents must not delete or weaken assertions, add `test.only`, `test.skip`, `test.fixme`, arbitrary sleeps, force clicks, ESLint disables, hardcoded credentials, self-healing selectors, or LLM pass/fail decisions.

All E2E tests must import `test` and `expect` from `src/fixtures/test.fixture.js`.
