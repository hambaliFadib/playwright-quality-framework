# Main Branch Governance — Solo Developer

Status: **CONFIGURATION REQUIRED**, not enforced by documentation alone.

## Objective

Require PR-based change control and successful always-on CI before merging to `main`, without requiring a second reviewer. Do not weaken deterministic test or dependency gates.

## Configure in GitHub UI (repository administrator)

1. Open repository **Settings → Rules → Rulesets → New ruleset → New branch ruleset**.
2. Name: `PQF main — PR + CI`; enforcement: **Active**; target branch: `main` (not all branches).
3. Require a pull request before merging. Set **required approvals = 0**; do not enable dismissal / code-owner reviewer requirements.
4. Require status checks to pass before merging, choosing the **exact** observed job check names: `validate` and `Dependency audit (Node 22)`. Select GitHub Actions as source when available.
5. Block force pushes and branch deletion (defaults/restrictions as presented in GitHub). Keep emergency bypass actors empty unless the owner explicitly authorizes one.
6. Do **not** add the conditional `SauceDemo qualification (3x)` check as globally required: AUT workflow uses path filters and may not run on unrelated changes.
7. Save. Recheck repository rulesets, `main` protection, and a PR's check requirements. Do not claim governance CLOSED until live settings confirm enforcement.

## Acceptance criteria

- [ ] GitHub shows an **active** ruleset targeting precisely `main`.
- [ ] Merging into `main` without `validate` or `Dependency audit (Node 22)` passing is blocked.
- [ ] A solo developer can still squash-merge a green PR without another reviewer.
- [ ] Direct pushes, force pushes, and deletion of `main` are blocked according to the chosen rules.
- [ ] A docs-only PR is not blocked by a missing conditional AUT check.
- [ ] Changes to AUT code continue to trigger `SauceDemo AUT Qualification`; manual dispatch remains available for other dependencies.

## Policy boundaries

This is a **public** repository. GitHub Free supports rulesets on public repositories. This file does **not** modify repository administration settings.

Do not enable required approval count = 1 for a solo repository. Do not configure a conditional/path-filtered job as a globally required check. Revisit the ruleset if the workflow job names change.

References: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/creating-rulesets-for-a-repository

## CI evidence baseline

- Phase 4C baseline: `1eab5a8d3cb82a61420e10d904850115a8000fa2`.
- Always-on checks: `validate`, `Dependency audit (Node 22)`.
- Conditional check: `SauceDemo qualification (3x)`, intentionally outside global required checks.
