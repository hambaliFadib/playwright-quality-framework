# Phase 3B — Private PQP Consumer Qualification

**Status:** Proof pending until the harness is run with a tarball packed from the frozen PQP revision.

The PQF repository is public; the PQP source and package remain private. Public CI cannot fetch the private package and must not embed a copy of the package or a privileged access token.

To qualify the integration, an authorized operator prepares the tarball from **PQP commit `1ac8170b606768199e8cd83eed990791c6864e86`** in a private workspace:

```sh
# Inside the checked-out, frozen PQP repository:
npm pack ./packages/evidence-envelope --pack-destination /path/to/private-artifacts --ignore-scripts

# Inside the PQF checkout containing Phase 3B:
npm run integration:qualify -- /absolute/path/to/private-artifacts/pqf-evidence-envelope-0.1.0.tgz
```

The qualification harness:

1. Creates a disposable, isolated npm consumer without using a registry.
2. Installs the explicit tarball offline with lifecycle scripts disabled.
3. Loads the package via the **production reporter loader**, verifying package identity, version, private flag, and exact SHA-256 of `src/index.cjs`.
4. Emits a `run.completed` envelope through the real validator (no injected mock).
5. Tamper-modifies the installed source while keeping its identity and verifies the production loader rejects it.
6. Removes the isolated consumer. It prints a fixed PASS token only after all gates succeed.

An absent tarball is a failure, not a skip. The regular public PQF CI exercises the self-tests but **does not qualify** private-package distribution. Record the source commit, tarball SHA-256, qualification command and result in private evidence before merge, without attaching the private tarball or source to the public repository.

The loader accepts an explicit **absolute package root path**. This is a temporary host-supplied qualification input, not a durable distribution mechanism. Runtime activation in a clean deployment remains a separate, owner-reviewed decision.

The reporter remains default-off; no AI, MCP, remote dispatch, evidence attachments, test status changes, or public release are authorized.
