# Phase 3H — Final PQP/PQF Integration Qualification

**Status:** Ready for owner-side execution; not yet qualified.  
**PQP main:** bb7a25bb7299c4a5ff0e41e4dee58984aa914f92  
**PQF main:** 648689339ad5ab35aaad21b00d1864c35e955f0d  
**Package:** private @pqf/evidence-envelope@0.1.0  
**Release boundary:** PRIVATE_PACKAGE_ONLY / NO_GO

## 1. Purpose and boundary

This is the final integration requalification after PQF dependency remediation and the security audit gate were merged. It validates the exact current PQP package source against the exact current PQF consumer revision.

The qualification is performed in fresh, detached worktrees on the authorized Windows operator machine. The private tarball and evidence remain local. Do not upload the tarball, package source, registry credentials, or private qualification evidence to public PQF GitHub Actions artifacts.

This phase does **not** publish the package, activate the reporter in production, add a private package token to public CI, or authorize release.

## 2. Already verified on GitHub

| Repository | Exact main revision | CI evidence |
|---|---|---|
| PQP | bb7a25bb7299c4a5ff0e41e4dee58984aa914f92 | Node 22 and Node 24 PASS; [run 41029147203](https://github.com/hambaliFadib/playwright-quality-packages/actions/runs/41029147203) |
| PQF | 648689339ad5ab35aaad21b00d1864c35e955f0d | validate and Dependency audit (Node 22) PASS; [run 41192576729](https://github.com/hambaliFadib/playwright-quality-framework/actions/runs/41192576729) |

PQF main includes:
- zod@4.6.7.
- brace-expansion@1.1.21.
- The fail-closed online dependency audit job.
- The private PQP reporter still disabled by default.

PQP remains private and unpublished. Its package-scoped .gitattributes forces LF for the package manifest, README, and source file. The expected source SHA-256 is:

ca7aca8c3f700b5bf99d93486582845dbe348349b866d0dfa726c4ea911520f5

## 3. Exact operator procedure (Windows PowerShell)

Run the complete procedure in one PowerShell session. The paths match the current local repositories.

### 3.1 Create fresh detached worktrees

~~~powershell
$PqpRepo = "D:\Quality Assurance\Riset\playwright-quality-packages"
$PqfRepo = "D:\Quality Assurance\Riset\playwright-quality-framework"

$PqpCommit = "bb7a25bb7299c4a5ff0e41e4dee58984aa914f92"
$PqfCommit = "648689339ad5ab35aaad21b00d1864c35e955f0d"
$ExpectedSourceHash = "ca7aca8c3f700b5bf99d93486582845dbe348349b866d0dfa726c4ea911520f5"

$RunId = Get-Date -Format "yyyyMMdd-HHmmss"
$TempRoot = Join-Path $env:LOCALAPPDATA "Temp\pqp-pqf-phase3h-$RunId"
$PqpWorktree = Join-Path $TempRoot "pqp"
$PqfWorktree = Join-Path $TempRoot "pqf"
$ArtifactDir = Join-Path $TempRoot "artifacts"
$VerifyDir = Join-Path $TempRoot "tarball-verification"

New-Item -ItemType Directory -Force -Path $ArtifactDir, $VerifyDir | Out-Null

foreach ($Repo in @($PqpRepo, $PqfRepo)) {
    if (!(Test-Path -LiteralPath $Repo -PathType Container)) {
        throw "Repository path unavailable: $Repo"
    }
}

git -C $PqpRepo fetch origin main
if ($LASTEXITCODE -ne 0) { throw "PQP fetch failed" }

git -C $PqfRepo fetch origin main
if ($LASTEXITCODE -ne 0) { throw "PQF fetch failed" }

git -C $PqpRepo cat-file -e "$($PqpCommit)^{commit}"
if ($LASTEXITCODE -ne 0) { throw "PQP target commit unavailable" }

git -C $PqfRepo cat-file -e "$($PqfCommit)^{commit}"
if ($LASTEXITCODE -ne 0) { throw "PQF target commit unavailable" }

git -C $PqpRepo -c core.autocrlf=true worktree add --detach $PqpWorktree $PqpCommit
if ($LASTEXITCODE -ne 0) { throw "PQP worktree creation failed" }

git -C $PqfRepo worktree add --detach $PqfWorktree $PqfCommit
if ($LASTEXITCODE -ne 0) { throw "PQF worktree creation failed" }

if ((git -C $PqpWorktree rev-parse HEAD).Trim() -ne $PqpCommit) {
    throw "PQP worktree revision mismatch"
}
if ((git -C $PqfWorktree rev-parse HEAD).Trim() -ne $PqfCommit) {
    throw "PQF worktree revision mismatch"
}
~~~

Do not reuse the old Phase 3D/3F worktrees. Do not modify either repository's main.

### 3.2 Validate and pack PQP

~~~powershell
$PqpSource = Join-Path $PqpWorktree "packages\evidence-envelope\src\index.cjs"
$PackageDir = Join-Path $PqpWorktree "packages\evidence-envelope"

$SourceHash = (Get-FileHash -LiteralPath $PqpSource -Algorithm SHA256).Hash.ToLowerInvariant()
if ($SourceHash -ne $ExpectedSourceHash) {
    throw "PQP source integrity mismatch"
}

Push-Location $PqpWorktree
try {
    npm ci --ignore-scripts
    if ($LASTEXITCODE -ne 0) { throw "PQP npm ci failed" }

    npm audit --audit-level=high --include=dev
    if ($LASTEXITCODE -ne 0) { throw "PQP security audit failed" }

    npm run validate
    if ($LASTEXITCODE -ne 0) { throw "PQP full validation failed" }

    $PackOutput = npm pack $PackageDir --pack-destination $ArtifactDir --ignore-scripts --json
    if ($LASTEXITCODE -ne 0) { throw "PQP package pack failed" }
}
finally {
    Pop-Location
}

$Pack = ($PackOutput -join [Environment]::NewLine) | ConvertFrom-Json
$Tarball = Join-Path $ArtifactDir $Pack[0].filename
if (!(Test-Path -LiteralPath $Tarball -PathType Leaf)) {
    throw "PQP tarball missing"
}

tar -xzf $Tarball -C $VerifyDir
if ($LASTEXITCODE -ne 0) { throw "PQP tarball extraction failed" }

$PackedSource = Join-Path $VerifyDir "package\src\index.cjs"
$PackedHash = (Get-FileHash -LiteralPath $PackedSource -Algorithm SHA256).Hash.ToLowerInvariant()
if ($PackedHash -ne $ExpectedSourceHash) {
    throw "Packed PQP source integrity mismatch"
}

$PackedManifest = Get-Content -LiteralPath (Join-Path $VerifyDir "package\package.json") -Raw | ConvertFrom-Json
if ($PackedManifest.name -ne "@pqf/evidence-envelope" -or
    $PackedManifest.version -ne "0.1.0" -or
    $PackedManifest.private -ne $true) {
    throw "Packed PQP package identity mismatch"
}

$TarballHash = (Get-FileHash -LiteralPath $Tarball -Algorithm SHA256).Hash.ToLowerInvariant()
Write-Host "PQP_SOURCE_SHA256=$SourceHash"
Write-Host "PQP_PACKED_SOURCE_SHA256=$PackedHash"
Write-Host "PQP_TARBALL_SHA256=$TarballHash"
~~~

### 3.3 Validate exact PQF consumer revision

~~~powershell
Push-Location $PqfWorktree
try {
    npm ci
    if ($LASTEXITCODE -ne 0) { throw "PQF npm ci failed" }

    npm audit --audit-level=high --include=dev
    if ($LASTEXITCODE -ne 0) { throw "PQF security audit failed" }

    npm run validate
    if ($LASTEXITCODE -ne 0) { throw "PQF full validation failed" }

    npm run contract:ai
    if ($LASTEXITCODE -ne 0) { throw "PQF AI contract failed" }

    npm run triage:selftest
    if ($LASTEXITCODE -ne 0) { throw "PQF AI triage selftest failed" }

    npm run integration:qualify:full -- $Tarball
    if ($LASTEXITCODE -ne 0) { throw "PQF cross-package qualification failed" }

    npm run integration:qualify:e2e -- $Tarball
    if ($LASTEXITCODE -ne 0) { throw "PQF Playwright E2E qualification failed" }

    npm ls zod brace-expansion
    if ($LASTEXITCODE -ne 0) { throw "PQF dependency tree check failed" }

    git diff --check
    if ($LASTEXITCODE -ne 0) { throw "PQF diff check failed" }
}
finally {
    Pop-Location
}
~~~

Expected terminal markers:
- PQP_PQF_CROSS_PACKAGE_QUALIFICATION_PASS.
- Four PHASE3F_SCENARIO_PASS lines: disabled-pass, enabled-pass, enabled-fail, and missing-package-pass.
- PQP_PQF_PLAYWRIGHT_E2E_QUALIFICATION_PASS.

The E2E qualification launches the real Playwright CLI with a synthetic isolated test. It is **not** an AUT/browser journey: PQF currently has no application E2E specs configured, so npm run test:e2e reports that AUT execution is skipped.

## 4. Private evidence record

Only create this record after every command in Sections 3.2 and 3.3 exits with code 0 and all expected markers appear.

~~~powershell
$EvidencePath = Join-Path $TempRoot "phase3h-final-qualification-evidence.json"

$Evidence = [ordered]@{
    phase = "3H"
    status = "PASS"
    pqp_commit = (git -C $PqpWorktree rev-parse HEAD).Trim()
    pqf_commit = (git -C $PqfWorktree rev-parse HEAD).Trim()
    node_version = (node --version).Trim()
    npm_version = (npm --version).Trim()
    package_name = "@pqf/evidence-envelope"
    package_version = $PackedManifest.version
    package_private = $PackedManifest.private
    package_source_sha256 = $SourceHash
    packed_source_sha256 = $PackedHash
    tarball_sha256 = $TarballHash
    pqp_validation = "PASS"
    pqp_audit = "0_HIGH_OR_CRITICAL"
    pqf_validation = "PASS"
    pqf_audit = "0_HIGH_OR_CRITICAL"
    ai_contract = "PASS"
    ai_triage_selftest = "PASS"
    cross_package_result = "PQP_PQF_CROSS_PACKAGE_QUALIFICATION_PASS"
    playwright_scenarios_passed = 4
    playwright_e2e_result = "PQP_PQF_PLAYWRIGHT_E2E_QUALIFICATION_PASS"
    release_status = "PRIVATE_PACKAGE_ONLY / NO_GO"
}

$Evidence | ConvertTo-Json -Depth 5 |
    Set-Content -LiteralPath $EvidencePath -Encoding utf8

Write-Host "PRIVATE EVIDENCE: $EvidencePath"
Get-Content -LiteralPath $EvidencePath
~~~

Keep the evidence JSON and tarball under the local TempRoot. Do not commit or upload them to either repository.

## 5. Acceptance criteria

- [ ] Both worktrees match the exact commit pins above.
- [ ] PQP source and packed source SHA-256 both match the expected pin.
- [ ] Packed package identity remains private @pqf/evidence-envelope@0.1.0.
- [ ] PQP npm ci, audit, and full validation pass.
- [ ] PQF npm ci, audit, full validation, AI contract, and triage selftest pass.
- [ ] Direct cross-package qualification passes.
- [ ] All four real-Playwright-process scenarios pass with expected exit codes and event counts.
- [ ] PQF dependency tree reports zod@4.6.7 and brace-expansion@1.1.21.
- [ ] Evidence JSON records the exact commits and actual hashes.
- [ ] No private tarball or evidence is uploaded; no package is published.

## 6. Known limits and release decision

- GitHub public CI validates each repository independently. It does not download or qualify the private PQP tarball.
- Branch protection/rulesets are unavailable under the accepted private/free repository constraint. Use the documented manual PR, review, CI, and squash-merge checklist; this is a compensating process, not technical enforcement.
- Synthetic Playwright process qualification does not replace AUT E2E coverage.
- The reporter remains disabled by default. PQP remains private and unpublished.

Even if every Phase 3H criterion passes, the result is **integration qualified**, not release approved. Keep PRIVATE_PACKAGE_ONLY / NO_GO until the owner makes a separate release decision.
