# Evidence brief runtime continuation receipt

Date: 2026-10-06. Release owner: [site issue 74](https://github.com/frankxai/starlightintelligence.ai/issues/74); accepted product: [issue 77](https://github.com/frankxai/starlightintelligence.ai/issues/77). This correction is stacked on [runtime PR3](https://github.com/frankxai/openclaw-acos-skills-railway-template/pull/3), base `8a25742f0f6c6b400632d7e3e98bdc00c66ca9e5`. Original source history, PR2, runtime pin and upstream attribution remain intact.

## Decision and scope

The first buyer remains a developer-led automation studio or small product team producing a recurring approved-source evidence brief. The delivered artifact is an editable draft with source references, input digest, attempt history, human acceptance and portable recovery. Ownership is useful only when private access, receipts and recovery work. This slice repairs those boundaries before commercial or native installation acceptance.

Use the existing no-tools CLI and direct customer BYOK adapter for this task. Keep the Next/Vercel surface for discovery, local editing and honest demand capture; keep its existing Clerk identity and KV/Resend capture. No Supabase identity migration, queue, scheduler or hosted inference plane is needed for one bounded briefing. OpenClaw remains an optional broader runtime host, not evidence that this direct runner executes its agent skill. A lightweight CLI deployment is a serious future packaging alternative to the inherited full image; its distribution and cost have not been measured here.

## Reproduced failures and repairs

- Configured HTTP and WebSocket callers could acquire the owner's Gateway token anonymously. Both paths now verify setup authorization before delegating the internal token. Public health probes remain public. Wrong credentials are denied; authenticated requests delegate the Gateway token rather than the setup password.
- Two overlapping runners could overwrite the attempt history. Run, acceptance, recovery and export now share an exclusive job lock. A crash retains the lock; clearing it requires confirmation that every runner stopped. There is no automatic stale-lock takeover.
- Late cancelled output could be published. Abort checks before and after the request prevent that; known returned usage is retained where available. Provider-side cancellation/billing is not established.
- Credential-shaped retry notes could poison the receipt and block export. They are rejected before receipt mutation or provider calls.
- Changed inputs and edited accepted bytes could retain stale acceptance. Acceptance now binds the current inputs and exact reviewed draft. Edited accepted output requires renewed acceptance before export.
- Provider download used an unbounded JSON read, and token-limited output could become completed. Transport is capped at 256 KiB; non-stop termination is retained and requires review. The fixed temperature setting is omitted to avoid assuming support across model families.
- SIGKILL between draft publication and receipt finalization left unacceptably orphaned output. Explicit `recover` preserves the existing attempt/draft and marks it for review without another provider call. Only same-inode private temporary links are cleaned; external links fail closed.

## Verification

Lead: Codex in an isolated cloud checkout; available RAM measured 9270 MiB before admission. Windows machine contracts, route_work and PP executables are unavailable here; no claim of local machine admission is made. Runtime repository has no AGENTS.md at the inspected base; CONTRIBUTING and release packets were read.

Four new runner regression cases failed on the original source before repairs. An independent read-only subagent reproduced anonymous HTTP/upgrade delegation, receipt loss, acceptance drift and note leakage. This is a separate reviewer in the same harness/model family, **not independent provider signoff**.

Final lead checks: Node 24.19.0; `umask 0022; npm test` **45/45 passed**; syntax lint, Railway SDK typecheck, pack verification and diff whitespace check passed. Independent focused checks: **16/16 passed**, including configured HTTP/upgrade and SIGKILL recovery. Its earlier full suite passed 44/44 before the new recovery regression. No remaining must-fix source findings at the reviewed bytes:

| File | Independent SHA-256 |
| --- | --- |
| README.md | `89f64ae6730006aaeaff95d9a9a591d60063d0fe2c90ae4ddb42a292d30a0f89` |
| scripts/evidence-brief.js | `75b9b5c22fe86822e1cd30e2d6dc1d15e41c68174c4c1be64f29febf5f360e2c` |
| src/server.js | `612f301aef346c95a143957d0e20c48dc1743a3057a211697c7b84be80288929` |
| test/evidence-brief.test.js | `6caa06bd8bc9988c2dffd01a9b7f52538e0df97dd6c0fb12b685c78a19d36cda` |
| test/gateway-auth.test.js | `373b2ab0ba3f8f947e878d83f11463bde53f8b16a2ac9cfd09bb5d1924fd6cf6` |

## Honest comparison and release limits

The serious baseline is vanilla Codex or Claude on the same approved sources and decision. No legitimate live comparison/model grant was available for this slice. Output quality, repair effort, elapsed time, token/billing cost and repeat-use preference remain **unmeasured**. Local fixtures establish failure behavior, not a quality advantage, revenue or customer acceptance. Require all attempts on both workflows, human artifact scoring and real interruption/recovery before publishing comparative claims or ratifying price hypotheses.

Docker is unavailable in this harness. PR3's previous image receipt does not cover these corrected bytes. Final-head CI, a rebuilt image, independent provider/release review, clean native installation, actual HTTPS/WSS browser credential reuse and reconnect/reload, isolated Railway volume restart/restore, one real accepted brief and cost measurement remain open. No live provider request, production change, paid resource, template publication, checkout or price change occurred.

Same-user hostile filesystem mutation and privileged administrator access are outside the existing trusted/quiescent source boundary. SHA-256 identifies reviewed bytes; it does not authenticate a publisher or enforce human review.

## Next action and rollback

Integrate this correction into PR3 after exact-head review and CI, rebuild the image, then run issue74's independent fresh-host authentication/brief/restart/restore test. Verify actual browser WSS access without weakening anonymous denial. Keep issues74–77 open until their distinct acceptance gates pass.

Rollback the correction to base `8a25742`; preserve private jobs and exports. That source rollback also restores the inherited anonymous Gateway bypass and must not be exposed publicly. No state/volume migration is required by this patch; use an isolated restore destination for rehearsals.

Primary API sources read 2026-10-06: [Node AbortSignal](https://nodejs.org/api/globals.html#abortsignalthrowifaborted), [Node Web Streams](https://github.com/nodejs/node/blob/main/doc/api/webstreams.md), [OpenAI Chat Completions](https://developers.openai.com/api/reference/resources/chat). Broader official references remain in the original LIVE-VERIFIER packet; no framework/runtime pin or upstream CLI interface was changed in this correction.
