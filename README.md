# Starlight OpenClaw Kit for Railway

Give an agent a useful first job: turn approved sources into an evidence brief you can act on.

This is the **Starlight-maintained fork** of [Vignesh N's OpenClaw Railway template](https://github.com/vignesh07/clawdbot-railway-template). The upstream wrapper supplies the password-protected setup wizard, persistent Gateway and backup flow. Starlight adds a versioned evidence briefing workflow, separate personality references and an offline install/export CLI. The original [MIT license](LICENSE) and copyright are preserved; the new pack includes its own MIT notice.

**Status:** implemented with local tests and CI configuration; no Starlight-owned marketplace template, live deployment, paid outcome or current Hermes compatibility is established by this repository. The Dockerfile currently pins OpenClaw `v2026.2.9`; a current-runtime rebase and isolated cloud smoke test remain release gates. This fork is independently maintained, without implied OpenClaw or Railway endorsement.

## What you get

- **OpenClaw Gateway + Control UI** (served at `/` and `/openclaw`)
- A friendly **Setup Wizard** at `/setup` (protected by a password)
- Persistent state via **Railway Volume** (so config/credentials/memory survive redeploys)
- One-click **Export backup** (so users can migrate off Railway later)
- **Import backup** from `/setup` (advanced recovery)
- **Evidence briefing skill** with dated sources, uncertainty and a concrete next action
- **Offline pack CLI** with content hashes, immutable version receipts, deterministic export and guarded installation
- **Optional personality references** that stay separate from runtime permission controls

## Try the first job

```bash
node scripts/agent-pack.js verify
node scripts/agent-pack.js install --workspace /absolute/path/to/your/workspace
node scripts/agent-pack.js export --output /tmp/starlight-evidence-brief-1.0.0.json
```

The installer adds one versioned skill and leaves existing workspace profiles alone. Use a reviewed git revision. Give the agent a decision and approved source list; the skill returns a private evidence brief. It does not schedule jobs, configure credentials, send messages or provision infrastructure. Read [the pack contract and installation boundary](docs/AGENT-PACKS.md).

## How it works (high level)

- The container runs a wrapper web server.
- The wrapper protects `/setup` with `SETUP_PASSWORD`.
- During setup, the wrapper runs `openclaw onboard --non-interactive ...` inside the container, writes state to the volume, and then starts the gateway.
- After setup, **`/` is OpenClaw**. The wrapper reverse-proxies all traffic (including WebSockets) to the local gateway process.

## Railway deployment and template preparation

Current Railway project configuration is authored in [`.railway/railway.ts`](.railway/railway.ts). The legacy `railway.toml` has been removed: Railway documents a 2026-12-01 cutoff for existing Config as Code and disallows it for new services. **Before changing an existing service, follow [the migration and persistence gate](docs/RAILWAY-MIGRATION.md)**. The starter must be adapted to its real service and volume names. Removing the old file does not automatically apply IaC.

The following composer flow prepares a future template; it does not mean this fork has a published deploy link:

In Railway Template Composer:

1) Create a new template from this GitHub repo.
2) Add a **Volume** mounted at `/data`.
3) Set the following variables:

Required:
- `SETUP_PASSWORD` — user-provided password to access `/setup`

Recommended:
- `OPENCLAW_STATE_DIR=/data/.openclaw`
- `OPENCLAW_WORKSPACE_DIR=/data/workspace`

Optional:
- None. `OPENCLAW_GATEWAY_TOKEN` is required and must be distinct from `SETUP_PASSWORD`; the wrapper will not generate or persist a fallback token.

Notes:
- This template pins OpenClaw to a released version by default via Docker build arg `OPENCLAW_GIT_REF` (override if you want `main`).

4) Enable **Public Networking** (HTTP). Railway will assign a domain.
   - This service listens on Railway’s injected `PORT` at runtime (recommended).
5) Deploy.

Then:
- Visit `https://<your-app>.up.railway.app/setup`
- Complete setup
- Visit `https://<your-app>.up.railway.app/` and `/openclaw`

## Run an editable evidence brief

The runtime includes a bounded, no-tools briefing runner. It sends the mission and only the source files named in `sources.json` directly to OpenAI using the customer-owned `OPENAI_API_KEY`; choose a model supported by the customer's account in `EVIDENCE_BRIEF_MODEL`. Set both as deployment environment variables. The runner does not read or write OpenClaw credentials, does not expose a Gateway HTTP endpoint, and cannot publish or invoke agent tools.

```bash
mkdir -m 700 -p /data/briefs /data/recovered
node /app/scripts/evidence-brief.js init --job /data/briefs/connector-check
# Edit mission.md, sources.json, and the approved source files in /data/briefs/connector-check.
node /app/scripts/evidence-brief.js run --job /data/briefs/connector-check
# Review and edit draft.md, then explicitly record human acceptance.
node /app/scripts/evidence-brief.js accept --job /data/briefs/connector-check --note "Reviewed cited claims"
node /app/scripts/evidence-brief.js export --job /data/briefs/connector-check --output /data/briefs/connector-check-export.json
node /app/scripts/evidence-brief.js restore --bundle /data/briefs/connector-check-export.json --job /data/recovered/connector-check
```

`init` installs a clearly labeled synthetic fixture; replace it with approved customer sources before using the brief for a real decision. Source paths must stay inside the private job directory. The run receipt stores input hashes, every attempt, timing, token counts when returned, an explicit unknown USD cost, retry/intervention notes, citation-check results, and human acceptance. An interrupted request is never retried automatically: inspect its receipt, then use `run --retry --intervention "..."` if another model call is authorized. A retry may incur another provider charge. Export is a customer-selected data artifact containing mission, cited source files, draft and receipt; it never reads environment variables or includes the API key. Store exports as private customer data.

This runner is a separate OpenAI Chat Completions adapter, not a claim that the skill was executed by OpenClaw or another provider. Its fixture tests are not live model evaluation. See the [live-verifier packet](docs/LIVE-VERIFIER.md) for exact remaining gates.

## Support and attribution

- This fork's issues: https://github.com/frankxai/openclaw-acos-skills-railway-template/issues
- Upstream wrapper: https://github.com/vignesh07/clawdbot-railway-template
- OpenClaw documentation: https://docs.openclaw.ai

For a bug report, include a redacted description of:
- `/healthz`
- `/setup/api/debug` (after authenticating to /setup; remove tokens and private configuration)

## Getting chat tokens (so you don’t have to scramble)

### Telegram bot token
1) Open Telegram and message **@BotFather**
2) Run `/newbot` and follow the prompts
3) BotFather will give you a token that looks like: `123456789:AA...`
4) Paste that token into `/setup`

### Discord bot token
1) Go to the Discord Developer Portal: https://discord.com/developers/applications
2) **New Application** → pick a name
3) Open the **Bot** tab → **Add Bot**
4) Copy the **Bot Token** and paste it into `/setup`
5) Invite the bot to your server (OAuth2 URL Generator → scopes: `bot`, `applications.commands`; then choose permissions)

## Persistence (Railway volume)

Railway containers have an ephemeral filesystem. Only the mounted volume at `/data` persists across restarts/redeploys.

What persists cleanly today:
- **Custom skills / code:** anything under `OPENCLAW_WORKSPACE_DIR` (default: `/data/workspace`)
- **Node global tools (npm/pnpm):** this template configures defaults so global installs land under `/data`:
  - npm globals: `/data/npm` (binaries in `/data/npm/bin`)
  - pnpm globals: `/data/pnpm` (binaries) + `/data/pnpm-store` (store)
- **Python packages:** create a venv under `/data` (example below). The runtime image includes Python + venv support.

What does *not* persist cleanly:
- `apt-get install ...` (installs into `/usr/*`)
- Homebrew installs (typically `/opt/homebrew` or similar)

### Optional bootstrap hook

If `/data/workspace/bootstrap.sh` exists, the wrapper will run it on startup (best-effort) before starting the gateway.
Use this to initialize persistent install prefixes or create a venv.

Example `bootstrap.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

# Example: create a persistent python venv
python3 -m venv /data/venv || true

# Example: ensure npm/pnpm dirs exist
mkdir -p /data/npm /data/npm-cache /data/pnpm /data/pnpm-store
```

## Troubleshooting

### “disconnected (1008): pairing required” / dashboard health offline

This is not a crash — it means the gateway is running, but no device has been approved yet.

Fix:
- Open `/setup`
- Use the **Debug Console**:
  - `openclaw devices list`
  - `openclaw devices approve <requestId>`

If `openclaw devices list` shows no pending request IDs:
- Make sure you’re visiting the Control UI at `/openclaw` (or your native app) and letting it attempt to connect
  - Note: the Railway wrapper now proxies the gateway and injects the auth token automatically, so you should not need to paste the gateway token into the Control UI when using `/openclaw`.
- Ensure your state dir is the Railway volume (recommended): `OPENCLAW_STATE_DIR=/data/.openclaw`
- Check `/setup/api/debug` for the active state/workspace dirs + gateway readiness

### “unauthorized: gateway token mismatch”

The Control UI connects using `gateway.remote.token` and the gateway validates `gateway.auth.token`.

Fix:
- Re-run `/setup` so the wrapper writes both tokens.
- Or set both values to the same token in config.

### “Application failed to respond” / 502 Bad Gateway

Most often this means the wrapper is up, but the gateway can’t start or can’t bind.

Checklist:
- Ensure you mounted a **Volume** at `/data` and set:
  - `OPENCLAW_STATE_DIR=/data/.openclaw`
  - `OPENCLAW_WORKSPACE_DIR=/data/workspace`
- Ensure **Public Networking** is enabled (Railway will inject `PORT`).
- Check Railway logs for the wrapper error: it will show `Gateway not ready:` with the reason.

### Legacy CLAWDBOT_* env vars / multiple state directories

If you see warnings about deprecated `CLAWDBOT_*` variables or state dir split-brain (e.g. `~/.openclaw` vs `/data/...`):
- Use `OPENCLAW_*` variables only
- Ensure `OPENCLAW_STATE_DIR=/data/.openclaw` and `OPENCLAW_WORKSPACE_DIR=/data/workspace`
- Redeploy after fixing Railway Variables

### Build OOM (out of memory) on Railway

Building OpenClaw from source can exceed small memory tiers.

Recommendations:
- Use a plan with **2GB+ memory**.
- If you see `Reached heap limit Allocation failed - JavaScript heap out of memory`, upgrade memory and redeploy.

## Local smoke test

```bash
docker build -t clawdbot-railway-template .

docker run --rm -p 8080:8080 \
  -e PORT=8080 \
  -e SETUP_PASSWORD=test \
  -e OPENCLAW_STATE_DIR=/data/.openclaw \
  -e OPENCLAW_WORKSPACE_DIR=/data/workspace \
  -v $(pwd)/.tmpdata:/data \
  clawdbot-railway-template

# open http://localhost:8080/setup (password: test)
```

---

## Upstream lineage

The setup wrapper was created by **Vignesh N (@vignesh07)** and is reused under MIT. Historical upstream announcement screenshots in `assets/` refer to that original project. They are not evidence of endorsement, adoption or deployment counts for the Starlight fork. Contributions to this fork are tracked through its own issues and reviewed revisions.
