# Evidence Brief Kit 1.0.0 — source release receipt

Date: 2026-10-01. Repository: `frankxai/openclaw-acos-skills-railway-template`. Review branch: `agent/codex/railway-agent-kits-20261001`. Upstream base: `ec47e7c`. Exact source revision is the commit containing this receipt, not a moving release name.

## Implemented

- Installable `starlight-evidence-brief-1-0-0` workflow with source/status discipline and authored operator evaluation fixtures.
- Separate optional personality, identity and permissions references; no automatic profile activation or runtime permission changes.
- Offline deterministic export/import verification and versioned installation with hashes/receipt, overwrite rejection, path/symlink/hardlink checks, bounded transport and protected write ancestors.
- Railway TypeScript IaC starter validated against pinned `railway@3.12.0`; legacy Config as Code removal and explicit state-preserving migration procedure.
- Docker runtime carries the pack/CLI and uses the locked wrapper dependencies with `npm ci`.
- Compatible runtime dependency updates: Express 5.2.1, tar 7.5.22 and patched transitive packages; upstream MIT attribution preserved.

## Observed locally

Node 24.19.0: `npm test` passed **28/28**; syntax lint, Railway SDK typecheck, manifest verification and `git diff --check` passed. Tests execute the authored IaC with the actual SDK, the installer and CLI, and the HTTP wrapper's health/authentication path before onboarding. `npm audit --omit=dev` reported **0 known advisories** for the wrapper dependencies after compatible updates (previously 5). This audit does not include the separately built upstream OpenClaw dependency tree.

An independent static reviewer examined installation safety, source attribution, permissions separation and matching status claims. Review findings for writable ancestors were corrected and regression tested. CI is configured for Node 22 and 24; its result must be observed on the pushed exact revision separately.

## Pending release gates

Complete Docker image build was not run here because Docker is unavailable. OpenClaw remains pinned to `v2026.2.9`. No Railway config plan/apply, provisioning, public domain, marketplace slug, current-runtime compatibility, Gateway access-control review, persistence/recovery cloud smoke, model-run skill evaluation, cost measurement, Hermes adapter, external publication or paid outcome was observed.

The `authored-not-model-executed` fixtures are criteria, not model results. The pack's SHA-256 manifest is unsigned integrity metadata, not verified publisher identity. Installation assumes a reviewed source checkout and a quiescent POSIX workspace; same-user or privileged-administrator hostile concurrency is outside the boundary.

Release decision: **reviewable source kit**, not a verified hosted agent or production marketplace template. Rollback removes only the verified versioned skill from an inactive workspace; profile/memory/credential state was never replaced. Follow the migration runbook before restoring legacy Railway settings or changing a live volume.
