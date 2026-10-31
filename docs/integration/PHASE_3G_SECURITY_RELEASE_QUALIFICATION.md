# Phase 3G — Security Release Qualification

**Status:** NO-GO. This PR adds a fail-closed dependency audit gate; it does
not remediate dependencies or authorize release.

## Current observed baseline

- PQF `main` after dependency remediation: `98fca464b74ef245b78f5ec076a592ee498c7e36` (PR #6 merged; post-merge CI passed).
- PQP private integration baseline: `bb7a25bb7299c4a5ff0e41e4dee58984aa914f92`.
- The previous high-severity findings were `brace-expansion` (GHSA-q2hr-2g5m-vwhr, GHSA-qhr7-859c-m2p7, GHSA-6j4f-fj2g-mc7p) and `zod` (GHSA-mrhx-c7xc-m3w5). PR #6 remediated these to `brace-expansion@1.1.21` and `zod@4.6.7`; owner-side Windows audit and full framework validation passed.
- GitHub repository inspection reported `main.protected=false` and **no
  repository rulesets**. Existing successful checks therefore do not enforce
  merge eligibility.

## Security audit gate

A separate `Dependency audit (Node 22)` job intended to become a required status check:

1. Uses immutable action commit SHAs and `persist-credentials: false`.
2. Installs the committed lockfile with `npm ci --ignore-scripts`.
3. Runs online `npm audit --audit-level=high --include=dev`.
4. **Fails** if npm finds a high/critical advisory or cannot retrieve its
   advisory report. Never replace with `--offline`, `|| true`, or
   `continue-on-error`.
5. Keeps dependency details within the GitHub Actions log. Do not upload
   private PQP artifacts, tokens, or a report containing secrets.

The updated PR branch includes the remediated lockfile from `main`. The audit job must pass on this exact PR head; any failure remains a blocking finding and must not be waived.

## Owner-side triage (Windows PowerShell)

Run in an authorized PQF checkout of the exact audited revision:

```powershell
npm --userconfig=/dev/null audit --audit-level=high --include=dev --json > pqf-audit-private.json
$AuditExitCode = $LASTEXITCODE
$Audit = Get-Content -LiteralPath pqf-audit-private.json -Raw | ConvertFrom-Json
$Audit.metadata.vulnerabilities
$Audit.vulnerabilities.PSObject.Properties |
    ForEach-Object {
        [pscustomobject]@{
            package = $_.Name
            severity = $_.Value.severity
            range = $_.Value.range
            fix_available = ($_.Value.fixAvailable | ConvertTo-Json -Compress)
            advisories = ($_.Value.via | Where-Object { $_ -isnot [string] } |
                ForEach-Object { $_.url }) -join "; "
        }
    } | Format-Table -AutoSize
Write-Host "npm audit exit code: $AuditExitCode"
```

**No automatic `npm audit fix`**. Remediation must be an isolated PR with
reviewed direct/transitive dependency changes, lockfile integrity checks,
`npm ci`, full framework validation, advisory-free audit, and PQP/PQF
qualification if integration-relevant bytes change.

## Branch protection (manual repository owner action)

Configure GitHub Settings → Branches / Rulesets to protect `main`:

- Require pull request before merging; zero additional human approvals can be
  selected for a solo maintainer.
- Require status checks **`validate`** and
  **`Dependency audit (Node 22)`** to succeed.
- Block force pushes and deletions, disallow bypass for routine changes.
- Require branch up to date before merge if supported by workflow.

Verify the effective ruleset after saving. This PR cannot apply GitHub admin
settings and intentionally does not assert they are already enabled.

## Release gates

- Online dependency audit: zero high/critical vulnerabilities.
- CI: all required checks pass on the reviewed head and after merge.
- Repository branch rules: required checks enforced on `main`.
- PQP remains private; reporter remains opt-in.
- Owner separately authorizes any merge, package publication or release.
