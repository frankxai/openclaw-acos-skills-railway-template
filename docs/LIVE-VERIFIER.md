# Evidence brief live-verifier packet

## Exact source and runtime matrix

- Main base observed for this task: `3ef09c0e4fb712bcd9ac94ce34051a6e3f54fc92`.
- Task branch starting head: `c539004b85d5385bdcdfb205ea403b4b59f9788e`.
- PR2 remains separate and open: `chore/bump-openclaw-ref` at `9c64a09e876855a2b914a953245fcf9e2c84f5ab`, changing only the Docker build argument to `v2026.9.8`. This task branch carries that candidate ref plus a Node 24 base-image adjustment; PR2's branch is untouched. Its current checks are pending/action-required with no jobs or logs.
- The `v2026.9.8` OpenClaw tag is signed and verified by GitHub (`b1c1c6d3af1f68bc82efbb6c92fb224c36df8683`, target commit `fc23bc864e4553c2d215e479eeec47b67a0bf943`). An isolated build on the original Node 22 base failed in upstream's package preinstall: it requires Node `>=24.16.0 <25 || >=26.1.0`. Both Docker stages are now Node 24; the corrected build and local image smoke passed. The test image digest was `sha256:f89cfde1b0c27a2968f4833ac858167a1dae51c8012bd1b8c84b1a4767860d65` (local only; not published).
- Wrapper: Node `>=22`, locked npm dependencies resolved in this checkout to `express@5.2.1`, `http-proxy@1.18.1`, `tar@7.5.22`; Railway TypeScript SDK `3.12.0`. Local runtime is Node `24.21.0`. Current IaC check is local SDK validation only. Docker stages now use `node:24-bookworm` to satisfy the candidate upstream runtime floor.
- Brief model adapter: standard-library `fetch` to OpenAI Chat Completions; no OpenAI SDK dependency or OpenClaw agent/Gateway call. `OPENAI_API_KEY` and `EVIDENCE_BRIEF_MODEL` are customer-supplied environment values. The runner makes one request at a time with no tool definitions and no automatic retry. Actual model compatibility requires a customer run.

## Source/API checks

- [OpenClaw v2026.9.8 Gateway health docs](https://github.com/openclaw/openclaw/blob/v2026.9.8/docs/gateway/health.md): `/healthz` is a liveness probe; this Railway template's accepted `/setup/healthz` remains a separate wrapper healthcheck.
- [OpenClaw v2026.9.8 Gateway authentication docs](https://github.com/openclaw/openclaw/blob/v2026.9.8/docs/gateway/authentication.md) and [configuration docs](https://github.com/openclaw/openclaw/blob/v2026.9.8/docs/gateway/configuration.md): Gateway and model-provider credentials are different surfaces.
- [OpenClaw v2026.9.8 Chat Completions docs](https://github.com/openclaw/openclaw/blob/v2026.9.8/docs/gateway/openai-http-api.md): its Gateway API is disabled by default and carries operator authority. The brief runner deliberately does not enable or call that endpoint.
- [OpenClaw v2026.9.8 onboarding automation docs](https://github.com/openclaw/openclaw/blob/v2026.9.8/docs/start/wizard-cli-automation.md) and [CLI reference](https://github.com/openclaw/openclaw/blob/v2026.9.8/docs/cli/onboard.md): `--non-interactive`, `--accept-risk`, `--skip-health`, `--no-install-daemon`, `--gateway-auth token`, and `--gateway-token-ref-env` are documented; env SecretRefs are preferred to plaintext Gateway tokens.
- [OpenAI's official API schema](https://github.com/openai/openai-openapi/blob/master/openapi.yaml) identifies `https://api.openai.com/v1`, API-key authorization, and Chat Completions. Provider errors are recorded by status only; raw response bodies and the key are not logged.
- [Railway IaC workflow](https://docs.railway.com/infrastructure-as-code), [TypeScript reference](https://docs.railway.com/infrastructure-as-code/reference), and [volumes reference](https://docs.railway.com/volumes/reference) were recorded in the existing migration runbook on 2026-10-01. The live Railway docs host was not reachable during this run; no IaC syntax or deployment operation was changed.

## Local evidence in this revision

The synthetic fixture is not customer evidence and does not invoke a model. Focused tests exercise editable input/output, citation validation, explicit human acceptance, interrupted receipt recovery, operator-noted retries, quota/timeout/cancellation status, private job-directory checks, corrupt/partial restore rejection, and export/restore to a fresh local directory. These are code/fixture results, not a Railway volume observation or live acceptance.

- `npm ci`: passed; zero dependency advisories reported. Locked direct versions observed: Express `5.2.1`, http-proxy `1.18.1`, tar `7.5.22`, Railway SDK `3.12.0`, TypeScript `5.9.3`.
- `npm run lint`, `npm run pack:verify`, `npm run iac:check`: passed.
- `(umask 0022; npm test)`: **36/36 passed**. Under this runner's default `umask 0002`, three pre-existing pack installer tests fail because the workspace created by those tests is group-writable; the installer correctly rejects it. No test or installer policy was weakened.
- Host `npm run smoke`: unavailable because OpenClaw is not installed on the host. Equivalent image smoke passed: `openclaw ok: OpenClaw 2026.9.8 (fc23bc8)`.
- Isolated `docker build`: passed with the corrected Node 24 base. The local image is 5,446,147,882 bytes (5.07 GiB uncompressed; registry transfer size not measured). The upstream Control UI build reported its startup CSS at 49.6 KiB, 368 bytes below the 50 KiB hard ceiling and above its 45 KiB advisory target; no UI asset or style was changed.
- Container smoke: `/setup/healthz` returned 200 with distinct secrets; bad setup credentials returned 401; correct setup credentials returned 200; credential values did not appear in logs. The packaged runner initialized a private job and exited 1 with receipt code `configuration_missing_api_key`, without calling a provider.
- Current task PR Actions runs remain `action_required` with zero jobs/logs; this is not a CI pass. Historical successful Docker build 36928975741 is not evidence for this revision.

- Live model call: **not run**; no customer-authorized API key or model was supplied to this cloud session.
- Actual token usage and cost: **unknown** (the deterministic runner tests use injected responses).
- Railway deployment/volume/restart: **not run**; no Railway credentials, project approval, or observed volume was available.
- Vanilla Codex/Claude comparison: **pending**; no legitimate account/key or approved comparison run was available.
- Acceptance and activations: **pending**; do not close issues 74/75/76/77 based on this source work.

## Operator checklist

1. In an isolated customer-owned deployment, set separate deployment-scoped `SETUP_PASSWORD` and `OPENCLAW_GATEWAY_TOKEN`, plus the customer's own `OPENAI_API_KEY` and an enabled `EVIDENCE_BRIEF_MODEL`. Never put their values in source, command-line arguments, job notes, or exports.
2. Create private parent directories, e.g. `mkdir -m 700 -p /data/briefs /data/recovered`. Confirm `/setup/healthz` returns 200 only with the two distinct setup/Gateway secrets. Run `npm run brief -- init --job /data/briefs/verification`; replace the synthetic mission/source with the exact approved inputs.
3. Run `npm run brief -- run --job /data/briefs/verification`. Preserve the `receipt.json`, editable draft, provider/model identity, returned token counts, actual provider billing evidence (if available), all attempts and interventions. Review/edit the draft and record human acceptance.
4. Interrupt a separate non-consequential test run, restart the isolated service, verify its mounted job directory and receipt are still present, and confirm it requires an explicit reviewed retry. Export the job, create a new restore destination, restore it into a fresh isolated service/volume, verify the receipt and draft, then complete a second approved job. Record resource/volume identifiers and deployment ID; a local fixture is not a substitute.
5. Review the IaC plan against the actual service/volume IDs; reject unexpected deletes, mount/volume changes, or secret changes. The source starter is not an apply authorization.
6. Compare the same approved inputs with a legitimate vanilla Codex or Claude baseline and record every attempt, repair, time, usage/cost, acceptance and restore result. Keep missing measurements pending.

## Recovery and rollback

The brief bundle restores only into a new, empty, private directory. Preserve a separate private backup before deployment migration; do not replace the existing Railway volume during a rehearsal. If a restore fails validation, keep the original export and receipt unchanged and investigate in a disposable destination. A retry is another potentially billable model request, but cannot repeat a publish/send/tool action because the runner has no tool surface.

Rollback source by reverting this revision and restore the separately verified owner backup only into the isolated test target first. The new wrapper refuses to mark `/setup/healthz` healthy or allow setup/Gateway use if either secret is absent or the two are equal; keep distinct secrets configured during rollback. No template publication, production update, credential rotation, or resource deletion is authorized here.

## Remaining owner actions

- Release owner: use issue 74 for the real Railway deployment, observed persistent volume, restart/restore, and acceptance evidence. Issue access returned 404 in this session; no update was posted.
- Payment/fulfillment and ten-activation outcomes remain on issues 75 and 76, respectively. Issue 77 is the accepted product and remains open.
- Keep PR2 open and unchanged; this task branch carries its same source tag plus the Node 24 compatibility fix. PR2's action-required status still needs the repository owner/reviewer action.
- Hermes/profile adapter and profile isolation remain assigned to `production-agent-patterns` issues 5 and 6; they are not implemented here.
