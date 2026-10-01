# A useful first agent job

The first kit turns approved sources into a traceable private brief. A founder can compare a technology change, a developer can summarize release evidence, and an agency can produce a research draft in a customer-owned workspace. Delivery automation, customer isolation and measured business outcomes remain separate release gates.

## Install and export

Use a reviewed git revision. Node and the standard library are sufficient for the pack CLI; it does not call the cloud or need provider credentials.

```bash
node scripts/agent-pack.js verify
node scripts/agent-pack.js install --workspace /data/workspace
node scripts/agent-pack.js export --output /tmp/starlight-evidence-brief-1.0.0.json
node scripts/agent-pack.js verify --bundle /tmp/starlight-evidence-brief-1.0.0.json
```

An exported bundle can be moved to another trusted machine and installed with `install --workspace /absolute/workspace --bundle /absolute/pack.json`. Export reads the curated pack only, never workspace memory, credentials or Gateway state. It creates a new file exclusively; it will not overwrite an export. Keep the source revision alongside the bundle. SHA-256 verifies integrity relative to the manifest; it is not a publisher signature.

Installation creates `skills/starlight-evidence-brief-1-0-0` and a deterministic hash/version receipt. Identical reinstall is a no-op. Modified or unexpected installed files cause a hard failure. Files are read-only; the workspace owner can still edit or delete them, so this is an immutable release convention rather than an operating-system security boundary. Publish a new version/name for upgrades; do not modify the installed release.

Paths containing parent traversal, absolute manifest paths, Windows/encoded forms, symlinks, hardlinked source files or executable payloads are rejected. Destination workspace and skill root must be owned by the invoking user and not writable by other users. Write ancestors must be owned by that user or root; shared-writable ancestors are refused except root/user-owned sticky directories such as `/tmp`. Writes require POSIX ownership checks. Source files must come from a trusted reviewed checkout; hashes are unsigned. Run the installer while the workspace is quiescent; malicious concurrent processes under the same OS identity or a privileged administrator are outside the boundary. Interrupted installs can leave a hidden staging directory/lock; inspect and remove these only after confirming no installer is running, then retry.

The Docker image carries the CLI and curated pack at `/app`. An operator can invoke `node /app/scripts/agent-pack.js install --workspace /data/workspace` from an authorized Railway shell. Installation is explicit; the server does not activate the pack during onboarding.

## Personality and permission

`profiles/SOUL.md`, `IDENTITY.md` and `PERMISSIONS.md` are separate optional references inside the installed kit. The installer never replaces workspace root profiles, changes tool permissions, starts a schedule or registers connectors. Review and merge a desired personality into existing files. Enforce access through the runtime's actual policy and identity controls; Markdown does not enforce authorization.

Current [OpenClaw skill docs](https://docs.openclaw.ai/tools/skills) document workspace skill discovery and frontmatter names. Its [workspace docs](https://docs.openclaw.ai/concepts/agent-workspace) distinguish personality and identity files. This wrapper currently pins OpenClaw `v2026.2.9`; loading and running the job in a live deployment of that older pin still needs a smoke test. Hermes compatibility is not yet tested. The pack is portable text, but no Hermes adapter or equivalence claim is included.

## Release evidence

Local tests exercise export/import equality, idempotency, tamper detection, invalid payloads, conflicting installs and filesystem escape attempts. CI runs tests, syntax checks and Railway SDK type validation on Node 22/24. These checks do not prove research quality, a customer's paid outcome, Gateway security or a functioning cloud deployment.

The pack contains `references/evaluation-fixtures.json`: traceable evidence, stale pricing, injected instructions and missing inputs. Its explicit status is `authored-not-model-executed`. Provide these raw cases to the chosen runtime, keep output/traces, evaluate their acceptance criteria and measure usage when reported. Written criteria and installer tests do not prove a model obeys the skill. Stop before selling an outcome that has not been evaluated.

Rollback: remove only the versioned skill directory identified by its verified receipt from an inactive workspace. Existing profiles, memory and credentials were never replaced. Restore an owner-edited skill from a private backup instead of deleting it blindly.
