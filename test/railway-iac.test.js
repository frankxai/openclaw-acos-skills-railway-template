import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRailwayContext, project } from "railway/iac";
import ts from "typescript";

// Compile the exact authored TypeScript with the pinned SDK. A temporary module
// beside the source preserves bare-package resolution on every supported Node 22.
const source = new URL("../.railway/railway.ts", import.meta.url);
const temporary = new URL(`../.railway/.iac-test-${process.pid}.mjs`, import.meta.url);
const compiled = ts.transpileModule(fs.readFileSync(source, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
fs.writeFileSync(temporary, compiled.outputText, { flag: "wx" });
let authored;
try { authored = await import(temporary.href); } finally { fs.unlinkSync(temporary); }

test("Railway SDK renders one isolated volume-backed service and literal-free secrets", async () => {
  const intent = await authored.default(createRailwayContext({ projectName: "isolated-test", environment: "preview" }), project);
  assert.equal(authored.partial, "starlight-openclaw");
  assert.equal(intent.name, "isolated-test");
  assert.equal(intent.resources.length, 2);
  const agent = intent.resources.find((resource) => resource.type === "service");
  const volume = intent.resources.find((resource) => resource.type === "volume");
  assert.equal(agent.source.repo, "frankxai/openclaw-acos-skills-railway-template");
  assert.equal(agent.build.builder, "DOCKERFILE");
  assert.equal(agent.deploy.numReplicas, 1);
  assert.equal(agent.deploy.healthcheckPath, "/setup/healthz");
  assert.equal(agent.deploy.healthcheckTimeout, 300);
  assert.equal(agent.deploy.restartPolicyType, "ON_FAILURE");
  assert.equal(agent.deploy.requiredMountPath, "/data");
  assert.equal(agent.volumeAttachments[volume.name].mountPath, "/data");
  assert.equal(agent.volumeAttachments[volume.name].volume, volume.address);
  assert.deepEqual(agent.variables.SETUP_PASSWORD, { type: "sharedReference", name: "SETUP_PASSWORD" });
  assert.deepEqual(agent.variables.OPENCLAW_GATEWAY_TOKEN, { type: "sharedReference", name: "OPENCLAW_GATEWAY_TOKEN" });
  assert.equal(agent.variables.OPENCLAW_WORKSPACE_DIR.value, "/data/workspace");
  assert.equal(Object.hasOwn(agent.variables, "PORT"), false);
});
