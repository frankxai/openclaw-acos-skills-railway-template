import { defineRailway, github, project, service, volume } from "railway/iac";

// This repository owns only its agent service and volume in shared projects.
export const partial = "starlight-openclaw";

// New-project starter. Existing deployments must import their current names,
// variables and volume first; see docs/RAILWAY-MIGRATION.md before any apply.
export default defineRailway((ctx) => {
  const data = volume("openclaw-data", { sizeMB: 1024 });
  const agent = service("Starlight OpenClaw", {
    source: github("frankxai/openclaw-acos-skills-railway-template", { branch: "main" }),
    build: { builder: "DOCKERFILE", dockerfilePath: "Dockerfile" },
    start: "node src/server.js",
    healthcheck: "/setup/healthz",
    healthcheckTimeout: 300,
    replicas: 1,
    deploy: { restartPolicyType: "ON_FAILURE", requiredMountPath: "/data" },
    volumeMounts: { "/data": data },
    env: {
      OPENCLAW_STATE_DIR: "/data/.openclaw",
      OPENCLAW_WORKSPACE_DIR: "/data/workspace",
      // Operator creates shared secrets in Railway; none are generated in source.
      SETUP_PASSWORD: ctx.shared.SETUP_PASSWORD,
      OPENCLAW_GATEWAY_TOKEN: ctx.shared.OPENCLAW_GATEWAY_TOKEN,
    },
  });
  return project(ctx.projectName || "starlight-openclaw", { resources: [agent, data] });
});
