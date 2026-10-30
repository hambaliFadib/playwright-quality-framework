# Phase 3D — Cross-Package Qualification

**Target PQP revision:** `1ac8170b606768199e8cd83eed990791c6864e86`
**PQF base:** `0343596a2e310fe4cc935cf15b2b497d6d231873`
**Status:** Pending execution with the private tarball.

This phase qualifies the boundary between the frozen private PQP validator and the public PQF sanitizer/reporter. Public CI cannot retrieve the private package and must not receive a private registry token or a copied package source.

## Prepare the frozen tarball (authorized private workspace)

From the PQP checkout at the exact target revision:

```powershell
git checkout 1ac8170b606768199e8cd83eed990791c6864e86
npm pack .\\packages\\evidence-envelope --pack-destination "$env:TEMP" --ignore-scripts
```

Then from the PQF checkout at this Phase 3D branch:

```powershell
npm ci
npm run integration:qualify:full -- "$env:TEMP\\pqf-evidence-envelope-0.1.0.tgz"
```

Use the actual filename printed by `npm pack`. The command installs the tarball offline into a disposable consumer with lifecycle scripts disabled, invokes the production package loader, passes sanitized metadata through the real PQP validator, checks that forbidden test data does not cross the event boundary, and invokes the production reporter. It deletes the temporary consumer afterward.

## Evidence to record privately

- PQP source commit: exact target above.
- Tarball SHA-256: compute with `Get-FileHash -Algorithm SHA256`.
- PQF commit tested.
- Node and npm versions.
- Exact command and exit code.
- Required terminal token: `PQP_PQF_CROSS_PACKAGE_QUALIFICATION_PASS`.

Do not upload the tarball, package source, registry credentials, or private package artifacts to the public PQF repository or its CI artifacts. Missing tarball is a failure, not a skip. Public CI remains useful for unit tests but cannot claim this private-package qualification.

## Gate

Phase 3D passes only after the owner executes the command against the exact frozen tarball and records the private evidence. No production activation or release authorization is implied.
