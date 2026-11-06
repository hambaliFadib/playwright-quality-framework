# Dependency Security Reconciliation — 2026-11-05

Status: **RECONCILED AT CI LEVEL; ISSUE #8 PENDING OWNER DISPOSITION**.

## Observed baseline and evidence

- Baseline: `1eab5a8d3cb82a61420e10d904850115a8000fa2`.
- GitHub Actions workflow run `41985818168`, Node 22 dependency-audit job: `npm --userconfig=/dev/null audit --audit-level=high --include=dev` reported **`found 0 vulnerabilities`** on 2026-11-05.
- Lockfile still contains `eslint@9.39.5` and `minimatch@3.1.5`; neither was silently upgraded.
- The published affected range of **GHSA-g3hv-75wg-m249** is reported as `>=7.0.0, <11.0.1`, which **does not include 3.1.5** at the current published range. Because clarification of older versions has been requested publicly, do not infer that 3.1.5 is patched or immune to every other advisory.
- ESLint v9 reached **end of life 2026-08-06**, regardless of the current `npm audit` output.

## Actions in this maintenance PR

1. Tighten the always-on dependency gate from `--audit-level=high` to `--audit-level=moderate`, including devDependencies. This is fail-closed if a moderate advisory reappears.
2. Add key deterministic AI contract, policy-negative, and triage self-tests to `npm run validate:framework` in CI (no AI provider or secret required).
3. Preserve package versions and lockfile; avoid `npm audit fix --force`, risky overrides, or implying that an EOL warning is repaired.

## Exit conditions

- [ ] `npm ci` PASS and dependency audit reports zero moderate/higher findings on the PR and after merge.
- [ ] `npm run validate:framework` PASS, including all contract and negative tests.
- [ ] E2E regressions (standalone 3/3 and repeat 9/9) PASS if AUT qualification workflow runs.
- [ ] Owner explicitly decides whether to close Issue #8 as **not applicable under the current advisory range** (NOT as a patched dependency), or keep it open pending authoritative clarification.
- [ ] Resolve ESLint v9 EOL in a separate lockfile-consistent upgrade PR. Require `npm ci`, ESLint policy selftests, API contract, E2E, and audits; do not publish a release in the meantime.

Sources:
- GitHub CI: https://github.com/hambaliFadib/playwright-quality-framework/actions/runs/41985818168
- GHSA: https://github.com/advisories/GHSA-g3hv-75wg-m249
- Version support: https://eslint.org/version-support/
- GitHub Issue #8: https://github.com/hambaliFadib/playwright-quality-framework/issues/8

The security audit result is a point-in-time report, not a proof of absence of every possible vulnerability.
