# AI Usage

AI is used in two bounded places:

1. `src/ai/test-data.js` may request structured customer JSON from an OpenAI-compatible endpoint.
2. `src/ai/triage.js` may classify existing Playwright failure evidence.

Both paths validate output with Zod. Missing API keys, provider failures, and malformed AI output fall back to deterministic behavior: Faker data for test data, and `INCONCLUSIVE` advisory triage for failures.

AI must not call `expect`, alter expected values, skip tests, change selectors at runtime, heal tests, or modify Playwright status. Failed remains failed.
