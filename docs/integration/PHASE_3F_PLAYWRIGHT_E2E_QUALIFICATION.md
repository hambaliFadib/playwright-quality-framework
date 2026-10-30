# Phase 3F — Real Playwright Process Qualification

**Status:** Harness candidate; not qualified until the authorized private tarball run passes.
**PQP source baseline:** \`bb7a25bb7299c4a5ff0e41e4dee58984aa914f92\` (3E LF attributes merged).
**PQF base:** \`ad8f32021d86f871f4788886ff6a9cabb41ce344\`.

Phase 3D qualified the loader/validator directly. Phase 3F invokes the **real
Playwright CLI** with the production configuration opt-in decision and reporter
class, without requiring a browser or an external AUT.

## Operator procedure (PowerShell)

Use an authorized local PQP checkout with the latest 3E merged revision; create
a **fresh** detached worktree, with LF enforced by package-scoped
\`.gitattributes\`. Do not reuse the CRLF-polluted old 3D worktree.

\`\`\`powershell
$PqpRepo = "D:\Quality Assurance\Riset\playwright-quality-packages"
$PqfRepo = "D:\Quality Assurance\Riset\playwright-quality-framework"
$PqpCommit = "bb7a25bb7299c4a5ff0e41e4dee58984aa914f92"
$TempRoot = Join-Path $env:TEMP "pqp-pqf-phase3f"
$PqpFresh = Join-Path $TempRoot "pqp"
$Artifacts = Join-Path $TempRoot "artifacts"
New-Item -ItemType Directory -Force $Artifacts | Out-Null
git -C $PqpRepo fetch origin main
if ($LASTEXITCODE -ne 0) { throw "PQP fetch failed" }
git -C $PqpRepo -c core.autocrlf=true worktree add --detach $PqpFresh $PqpCommit
if ($LASTEXITCODE -ne 0) { throw "PQP worktree failed" }
$SourceFile = Join-Path $PqpFresh "packages\evidence-envelope\src\index.cjs"
$Expected = "ca7aca8c3f700b5bf99d93486582845dbe348349b866d0dfa726c4ea911520f5"
$Actual = (Get-FileHash -LiteralPath $SourceFile -Algorithm SHA256).Hash.ToLowerInvariant()
if ($Actual -ne $Expected) { throw "Fresh Windows LF checkout integrity failed" }
$PackJson = npm pack (Join-Path $PqpFresh "packages\evidence-envelope") --pack-destination $Artifacts --ignore-scripts --json
if ($LASTEXITCODE -ne 0) { throw "PQP npm pack failed" }
$Pack = ($PackJson -join "\`n") | ConvertFrom-Json
$Tarball = Join-Path $Artifacts $Pack[0].filename
if (!(Test-Path -LiteralPath $Tarball -PathType Leaf)) { throw "Tarball unavailable" }
# Use a local PQF checkout at the reviewed 3F PR head; after merge use merged main.
Push-Location $PqfRepo
try {
    npm ci
    if ($LASTEXITCODE -ne 0) { throw "PQF install failed" }
    npm run integration:qualify:e2e -- $Tarball
    if ($LASTEXITCODE -ne 0) { throw "Phase 3F qualification failed" }
} finally {
    Pop-Location
}
\`\`\`

## Acceptance

- Fresh Windows worktree with \`core.autocrlf=true\` preserves source SHA-256.
- Package installs offline and production PQF loader validates the real source.
- Reporter disabled: normal Playwright success, **zero evidence events**.
- Reporter enabled: normal Playwright success, **one valid run.completed event**.
- Reporter enabled and Playwright test fails: exit **nonzero**, with one valid event.
- Reporter enabled with a missing package: Playwright success unchanged, **zero events** and bounded diagnostic.
- Temporary tests, consumer and reports are removed.
- Public CI runs no private-package qualification and has no private token or tarball.

Expected local marker:
\`PQP_PQF_PLAYWRIGHT_E2E_QUALIFICATION_PASS\`.

Record PQP and PQF exact commit hashes, Node/npm versions, SHA-256 tarball,
exit code, and marker in **private evidence only**. A harness commit alone
is not proof of execution. No production reporter activation or release
decision is implied.
