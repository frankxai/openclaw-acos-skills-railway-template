# Railway IaC migration and release gate

Status: authored and locally SDK-validated; not applied to Railway. No service, volume, domain or billable resource was created by this change.

Primary sources checked 2026-10-01: [IaC workflow](https://docs.railway.com/infrastructure-as-code), [TypeScript reference](https://docs.railway.com/infrastructure-as-code/reference), [volume limitations](https://docs.railway.com/volumes/reference). TypeScript IaC is generally available. Existing Config as Code stops being read on 2026-12-01; new services cannot opt into it. Railway evaluates IaC through CLI plan/apply, not automatically during GitHub deployment.

## New-project starter

`.railway/railway.ts` describes one Dockerfile agent service with one `/data` volume, one replica, healthcheck, injected runtime port and two shared secret references. `railway@3.12.0` is pinned for local type validation. The named partial limits ownership to the declared resources in a shared project.

Create the `SETUP_PASSWORD` and `OPENCLAW_GATEWAY_TOKEN` shared variables through Railway's secret controls before applying. Set provider and channel credentials only in the authenticated setup flow. Enable public networking through the dashboard; generated Railway domains are not authored by this starter. Do not set `PORT` manually. A template marketplace publication is a separate operation; this repo has no verified Starlight-owned deploy slug yet.

Install Railway CLI from its official instructions, authenticate and link the intended project/environment, then preview with `railway config plan`. Review exact resource and variable changes before `railway config apply`. Applying provisions resources and can incur charges; this repository has no automatic apply workflow.

The GitHub source points to `main`. Validate a preview from the review branch or exact commit; do not claim this upgrade is live until that revision is merged and observed in a running service.

## Existing deployment — preserve state first

Do not apply this new-project starter over an existing agent. Its example names and 1 GiB volume may differ from live resources.

1. Export a private state backup from the authenticated setup wizard; verify restore into an isolated test workspace. Record the existing project/environment, service name, volume name, mount, size, region and relevant settings. Keep backup content and secrets out of public issues and git.
2. Import current configuration with `railway config pull` in a separate reviewed checkout. Preserve the actual service/volume names, placement, provider/channel variables and secret values (`preserve()` where appropriate). Do not use `--include-variables` in a public repository. Import the partial ownership arrangement before renaming resources.
3. Translate the original `railway.toml` settings retained in git history: Dockerfile builder; `/setup/healthz`; 300-second healthcheck timeout; `ON_FAILURE`; required `/data` mount; state `/data/.openclaw`; workspace `/data/workspace`. Keep required settings in the dashboard until reviewed IaC owns them. Clear any legacy custom config-file path in Railway service settings. The old file is removed in this change to avoid two config owners.
4. Run `railway config plan`. Reject unexpected deletes, secret/variable removals, volume detach/shrink/placement changes, unrelated resources, or removal of a tracing configuration. Current official docs warn that SDK support can lag tracing settings. A typecheck alone does not prove a safe migration.
5. Apply only the reviewed live plan. Smoke the setup healthcheck, onboarding, authenticated access, Gateway readiness, workspace persistence across a restart and backup/restore. Record exact commit and deployment ID. Roll back source/config and restore the verified backup in an isolated recovery environment when necessary; never silently replace the original volume.

Railway volumes do not support service replicas. Scale stateful agents as isolated service-plus-volume workspaces. A shared Gateway/workspace is one trust domain. A separate stateless job pool, queue, database, browser workers, per-tenant identity and quota enforcement are future work; none are installed by this release.

## Concrete follow-up issue

**Title:** Rebase pinned OpenClaw and prove an isolated Railway deployment before marketplace release

Acceptance: select a current upstream release and review wrapper API compatibility; pin a reviewed source revision; build the complete image; scan runtime dependencies; test setup authentication and Gateway access independently; verify persistence and recovery on a fresh isolated service; run a no-destructive-change IaC migration plan; record resource/model cost measurements; create and verify a Starlight-owned template slug only after those checks. Keep upstream attribution. Do not reuse upstream endorsements or deploy counts as this fork's evidence.
