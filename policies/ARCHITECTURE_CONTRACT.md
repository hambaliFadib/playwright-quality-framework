# Architecture Contract

Playwright is the deterministic oracle. AI may generate bounded test data and advisory triage only.

Layers:
- `tests/e2e`: behavior scenarios and deterministic `expect` assertions.
- `src/fixtures`: fixture gateway, lifecycle, dependency injection, and data injection.
- `src/pages`: thin Page Objects that own locators and page interactions.
- `src/data`: collision-safe data factories independent of UI implementation.
- `src/ai`: schema-validated AI data and advisory triage; no assertions or selector healing.
- `src/core`: reserved for small cross-cutting primitives.

Governed boundary: static policy blocks common syntactic weakening, but arbitrary semantic assertion weakening requires human review.
