import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  acceptDraft,
  exportJob,
  initializeJob,
  restoreJob,
  runJob,
} from "../scripts/evidence-brief.js";

function temporary(t) {
  const root = fs.mkdtempSync(path.join("/tmp", "starlight-brief-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function job(t) {
  const root = path.join(temporary(t), "job");
  initializeJob(root);
  return root;
}

const draft = "## Decision\nKeep the fictional connector in preview only [S1].\n";
const response = async () => ({
  content: draft,
  model: "fixture-model",
  usage: { prompt_tokens: 40, completion_tokens: 12, total_tokens: 52 },
});

test("editable synthetic evidence input produces a cited draft and an explicit human acceptance receipt", async (t) => {
  const root = job(t);
  assert.equal(fs.readFileSync(path.join(root, "mission.md"), "utf8").includes("Synthetic"), true);
  const first = await runJob(root, { request: response });
  assert.equal(first.status, "completed");
  assert.equal(fs.readFileSync(path.join(root, "draft.md"), "utf8"), draft);
  const receipt = JSON.parse(fs.readFileSync(path.join(root, "receipt.json"), "utf8"));
  assert.equal(receipt.attempts.length, 1);
  assert.equal(receipt.attempts[0].usage.totalTokens, 52);
  assert.equal(receipt.attempts[0].usage.costUsd, null);
  assert.equal(receipt.humanAcceptance.status, "pending");
  assert.equal(receipt.output.editable, true);
  assert.equal(receipt.status, "completed");
  assert.equal((await runJob(root, { request: response }).catch((error) => error.message)).includes("already has a receipt"), true);
  fs.appendFileSync(path.join(root, "draft.md"), "\nHuman edit.\n");
  assert.equal(acceptDraft(root, "Reviewed all material claims").status, "accepted");
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, "receipt.json"), "utf8")).humanAcceptance.note, "Reviewed all material claims");
});

test("interrupted requests require an explicit retry and preserve every attempt and intervention", async (t) => {
  const root = job(t);
  const receiptPath = path.join(root, "receipt.json");
  fs.writeFileSync(receiptPath, JSON.stringify({
    schemaVersion: 1,
    jobId: "job",
    status: "running",
    attempts: [{ number: 1, status: "running", startedAt: "2026-10-06T00:00:00.000Z", inputDigest: "interrupted-input" }],
    interventions: [],
    humanAcceptance: { status: "pending" },
  }));
  let calls = 0;
  const request = async () => { calls++; return response(); };
  await assert.rejects(runJob(root, { request }), /use --retry/i);
  const interrupted = JSON.parse(fs.readFileSync(receiptPath, "utf8"));
  assert.equal(interrupted.attempts[0].status, "interrupted");
  assert.equal(calls, 0);
  const result = await runJob(root, { retry: true, intervention: "Confirmed prior process stopped", request });
  assert.equal(result.status, "completed");
  const recovered = JSON.parse(fs.readFileSync(receiptPath, "utf8"));
  assert.deepEqual(recovered.attempts.map((attempt) => attempt.status), ["interrupted", "completed"]);
  assert.equal(recovered.interventions[0].note, "Confirmed prior process stopped");
  assert.equal(calls, 1);
});

test("quota, timeout, cancellation, and invalid citations remain visible without automatic retries", async (t) => {
  for (const [name, error, expected] of [
    ["quota", Object.assign(new Error("private response body"), { status: 429 }), "quota"],
    ["timeout", Object.assign(new Error("private response body"), { name: "TimeoutError" }), "timeout"],
    ["cancelled", Object.assign(new Error("private response body"), { name: "AbortError" }), "cancelled"],
  ]) {
    const root = path.join(temporary(t), name);
    initializeJob(root);
    const result = await runJob(root, { request: async () => { throw error; } });
    assert.equal(result.status, expected);
    const receipt = JSON.parse(fs.readFileSync(path.join(root, "receipt.json"), "utf8"));
    assert.equal(receipt.attempts.length, 1);
    assert.equal(JSON.stringify(receipt).includes("private response body"), false);
  }
  const badCiteRoot = path.join(temporary(t), "bad-citation");
  initializeJob(badCiteRoot);
  const result = await runJob(badCiteRoot, { request: async () => ({ content: "Unsupported [S99].", usage: {} }) });
  assert.equal(result.status, "needs_review");
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(badCiteRoot, "receipt.json"), "utf8")).attempts[0].invalidCitations, ["S99"]);
});

test("export and restore preserve a draft without credentials and refuse corrupt, partial, or escaping imports", async (t) => {
  const root = job(t);
  await runJob(root, { request: response });
  const archive = path.join(temporary(t), "brief.json");
  const originalKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "DO_NOT_EXPORT_TEST";
  try {
    exportJob(root, archive);
  } finally {
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  }
  const serialized = fs.readFileSync(archive, "utf8");
  assert.equal(serialized.includes("DO_NOT_EXPORT_TEST"), false);
  const fresh = path.join(temporary(t), "fresh");
  assert.equal(restoreJob(archive, fresh).status, "restored");
  assert.equal(fs.readFileSync(path.join(fresh, "draft.md"), "utf8"), draft);
  assert.equal(JSON.parse(fs.readFileSync(path.join(fresh, "receipt.json"), "utf8")).attempts.length, 1);
  assert.throws(() => restoreJob(archive, fresh), /destination already exists/);
  const damagedBundle = JSON.parse(serialized);
  damagedBundle.files.find((file) => file.path === "draft.md").content = "corrupted draft";
  const damaged = path.join(temporary(t), "damaged.json");
  fs.writeFileSync(damaged, JSON.stringify(damagedBundle));
  const damagedTarget = path.join(temporary(t), "damaged-target");
  assert.throws(() => restoreJob(damaged, damagedTarget), /Integrity check failed/);
  assert.equal(fs.existsSync(damagedTarget), false);
  const malformed = path.join(temporary(t), "malformed.json");
  fs.writeFileSync(malformed, JSON.stringify({ schemaVersion: 1, files: [{ path: "../escape.md", content: "x" }] }));
  assert.throws(() => restoreJob(malformed, path.join(temporary(t), "bad")), /Unsupported evidence job export/);
  const traversal = path.join(temporary(t), "traversal.json");
  fs.writeFileSync(traversal, JSON.stringify({
    schemaVersion: 1,
    files: [
      { path: "mission.md", content: "safe" },
      { path: "sources.json", content: "[]" },
      { path: "sources/../../escaped.md", content: "unsafe" },
    ],
  }));
  const destination = path.join(temporary(t), "traversal-target");
  assert.throws(() => restoreJob(traversal, destination), /Unexpected file|Unsafe path/);
  assert.equal(fs.existsSync(path.join(path.dirname(destination), "escaped.md")), false);
  const partial = path.join(temporary(t), "partial.json");
  fs.writeFileSync(partial, JSON.stringify({ schemaVersion: 1, files: [{ path: "mission.md", content: "x" }] }));
  assert.throws(() => restoreJob(partial, path.join(temporary(t), "partial")), /Unsupported evidence job export/);
});

test("symlinked or shared-readable job state is denied", async (t) => {
  const parent = temporary(t);
  const target = path.join(parent, "target");
  initializeJob(target);
  const link = path.join(parent, "linked");
  fs.symlinkSync(target, link);
  await assert.rejects(runJob(link), /Symlink/);
  fs.chmodSync(target, 0o755);
  await assert.rejects(runJob(target), /private directory/);
});

test("missing BYOK credentials produce a failed live step, not a false success", (t) => {
  const root = job(t);
  const env = { ...process.env };
  delete env.OPENAI_API_KEY;
  delete env.EVIDENCE_BRIEF_MODEL;
  const result = spawnSync(process.execPath, ["scripts/evidence-brief.js", "run", "--job", root], {
    encoding: "utf8",
    env,
  });
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stdout).status, "error");
  const receipt = JSON.parse(fs.readFileSync(path.join(root, "receipt.json"), "utf8"));
  assert.equal(receipt.attempts[0].error, "configuration_missing_api_key");
});

test("credential-like source material is neither sent to the model nor exported", async (t) => {
  const root = job(t);
  const credential = ["Bearer", "A".repeat(24)].join(" ");
  fs.writeFileSync(path.join(root, "sources", "approved-release.md"), `Never transmit this: ${credential}`);
  let calls = 0;
  await assert.rejects(runJob(root, { request: async () => { calls++; return response(); } }), /Credential-like material/);
  assert.equal(calls, 0);
  assert.throws(() => exportJob(root, path.join(temporary(t), "bundle.json")), /Credential-like material/);
});
