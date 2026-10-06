# Evidence brief live-verifier packet

## Exact source and runtime matrix

- Main base observed for this task: `3ef09c0e4fb712bcd9ac94ce34051a6e3f54fc92`.
- Task branch starting head: `c539004b85d5385bdcdfb205ea403b4b59f9788e`.
- PR2 remains separate and open: `chore/bump-openclaw-ref` at `9c64a09e876855a2b914a953245fcf9e2c84f5ab`, changing only the Docker build argument to `v2026.9.8`. Its current checks are pending/action-required with no jobs or logs. Do not treat that as a pass or merge it from this work.
- The `v2026.9.8` OpenClaw tag is signed and verified by GitHub (`b1c1c6d3af1f68bc82efbb6c92fb224c36df8683`, target commit `fc23bc864e4553c2d215e479eeec47b67a0bf943`). This source change does not incorporate the pin: the base still pins `v2026.2.9` until PR2 is separately reviewed and a full image build/smoke is successful.
- Wrapper: Node `>=22`, locked npm dependencies; `express@5.1.0`, `http-proxy@1.18.1`, `tar@7.5.4`. Railway TypeScript SDK `3.12.0`; current IaC check is local SDK validation only. Docker stages currently use `node:22-bookworm`.
- Brief model adapter: standard-library `fetch` to OpenAI Chat Completions; no OpenAI SDK dependency or OpenClaw agent/Gateway call. `OPENAI_API_KEY` and `EVIDENCE_BRIEF_MODEL` are customer-supplied environment values. The runner makes one request at a time with no tool definitions and no automatic retry. Actual model compatibility requires a customer run.

## Source/API checks

- [OpenClaw v2026.9.8 Gateway health docs](https://github.com/openclaw/openclaw/blob/v2026.9.8/docs/gateway/health.md): `/healthz` is a liveness probe; this Railway template's accepted `/setup/healthz` remains a separate wrapper healthcheck.
- [OpenClaw v2026.9.8 Gateway authentication docs](https://github.com/openclaw/openclaw/blob/v2026.9.8/docs/gateway/authentication.md) and [configuration docs](https://github.com/openclaw/openclaw/blob/v2026.9.8/docs/gateway/configuration.md): Gateway and model-provider credentials are different surfaces.
- [OpenClaw v2026.9.8 Chat Completions docs](https://github.com/openclaw/openclaw/blob/v2026.9.8/docs/gateway/openai-http-api.md): its Gateway API is disabled by default and carries operator authority. The brief runner deliberately does not enable or call that endpoint.
- [OpenAI's official API schema](https://github.com/openai/openai-openapi/blob/master/openapi.yaml) identifies `https://api.openai.com/v1`, API-key authorization, and Chat Completions. Provider errors are recorded by status only; raw response bodies and the key are not logged.
- [Railway IaC workflow](https://docs.railway.com/infrastructure-as-code), [TypeScript reference](https://docs.railway.com/infrastructure-as-code/reference), and [volumes reference](https://docs.railway.com/volumes/reference) were recorded in the existing migration runbook on 2026-10-01. The live Railway docs host was not reachable during this run; no IaC syntax or deployment operation was changed.

## Local evidence in this revision

The synthetic fixture is not customer evidence and does not invoke a model. Focused tests exercise editable input/output, citation validation, explicit human acceptance, interrupted receipt recovery, operator-noted retries, quota/timeout/cancellation status, private job-directory checks, corrupt/partial restore rejection, and export/restore to a fresh local directory. These are code/fixture results, not a Railway volume observation or live acceptance.

- Live model call: **not run**; no customer-authorized API key or model was supplied to this cloud session.
- Actual token usage and cost: **unknown** (the deterministic runner tests use injected responses).
- Railway deployment/volume/restart: **not run**; no Railway credentials, project approval, or observed volume was available.
- Vanilla Codex/Claude comparison: **pending**; no legitimate account/key or approved comparison run was available.
- Acceptance and activations: **pending**; do not close issues 74/75/76/77 based on this source work.

## Operator checklist

1. In an isolated customer-owned deployment, set separate deployment-scoped `SETUP_PASSWORD` and `OPENCLAW_GATEWAY_TOKEN`, plus the customer's own `OPENAI_API_KEY` and an enabled `EVIDENCE_BRIEF_MODEL`. Never put their values in source, command-line arguments, job notes, or exports.
2. Confirm `/setup/healthz` returns 200 only with the two distinct setup/Gateway secrets. Run `npm run brief -- init --job /data/briefs/verification`; replace the synthetic mission/source with the exact approved inputs.
3. Run `npm run brief -- run --job /data/briefs/verification`. Preserve the `receipt.json`, editable draft, provider/model identity, returned token counts, actual provider billing evidence (if available), all attempts and interventions. Review/edit the draft and record human acceptance.
4. Interrupt a separate non-consequential test run, restart the isolated service, verify its mounted job directory and receipt are still present, and confirm it requires an explicit reviewed retry. Export the job, restore it into a fresh isolated service/volume, verify the receipt and draft, then complete a second approved job. Record resource/volume identifiers and deployment ID; a local fixture is not a substitute.
5. Review the IaC plan against the actual service/volume IDs; reject unexpected deletes, mount/volume changes, or secret changes. The source starter is not an apply authorization.
6. Compare the same approved inputs with a legitimate vanilla Codex or Claude baseline and record every attempt, repair, time, usage/cost, acceptance and restore result. Keep missing measurements pending.

## Recovery and rollback

The brief bundle restores only into a new, empty, private directory. Preserve a separate private backup before deployment migration; do not replace the existing Railway volume during a rehearsal. If a restore fails validation, keep the original export and receipt unchanged and investigate in a disposable destination. A retry is another potentially billable model request, but cannot repeat a publish/send/tool action because the runner has no tool surface.

Rollback source by reverting this revision and restore the separately verified owner backup only into the isolated test target first. The new wrapper refuses to mark `/setup/healthz` healthy or allow setup/Gateway use if either secret is absent or the two are equal; keep distinct secrets configured during rollback. No template publication, production update, credential rotation, or resource deletion is authorized here.

## Remaining owner actions

- Release owner: use issue 74 for the real Railway deployment, observed persistent volume, restart/restore, and acceptance evidence. Issue access returned 404 in this session; no update was posted.
- Payment/fulfillment and ten-activation outcomes remain on issues 75 and 76, respectively. Issue 77 is the accepted product and remains open.
- Review/merge PR2 independently only after its required checks and compatibility/build result are available.
- Hermes/profile adapter and profile isolation remain assigned to `production-agent-patterns` issues 5 and 6; they are not implemented here.
