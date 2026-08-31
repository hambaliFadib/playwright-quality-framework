# AI Usage

AI is used in two bounded runtime areas:

1. `src/ai/structured-data.js` may request caller-defined structured JSON from an OpenAI-compatible endpoint.
2. `src/ai/triage.js` may classify existing Playwright failure evidence.

AI provider configuration belongs in ignored `.env.ai`:

```text
AI_API_KEY=
AI_BASE_URL=
AI_MODEL=
```

Application test configuration such as `BASE_URL` belongs separately in ignored `.env`.

Both AI paths validate output with Zod. Missing API keys, provider failures, or malformed AI output fall back safely: caller-supplied deterministic fallback for structured data and `INCONCLUSIVE` advisory triage for failures.

Triage consumes evidence after Playwright has already determined the result. AI may classify the likely cause and provide confidence/reasoning, but it must not call `expect`, alter expected values, skip tests, change selectors at runtime, heal tests, or modify Playwright status. Failed remains failed.

`npm run triage` analyzes real Playwright failure evidence. `npm run triage:selftest` uses synthetic failure evidence only to verify the triage engine.
