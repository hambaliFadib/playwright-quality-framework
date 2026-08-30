# Automation Rules

Use semantic locators in Page Objects. Tests must not own selector implementation.

Use observable waits only: Playwright actionability, `expect`, `waitForURL`, `waitForResponse`, or another visible state.

For mutation tests, verify resulting state or persistence. A toast alone is not enough.
