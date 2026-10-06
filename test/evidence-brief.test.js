import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  acceptDraft,
  exportJob,
  initializeJob,
  requestOpenAI,
  recoverDraft,
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

test("late completion after cancellation does not create a draft", async (t) => {
  const root = job(t);
  const controller = new AbortController();
  const result = await runJob(root, { signal: controller.signal, request: async () => {
    controller.abort();
    return response();
  } });
  assert.equal(result.status, "cancelled");
  assert.equal(fs.existsSync(path.join(root, "draft.md")), false);
});

test("a second runner cannot interrupt or retry an active request", async (t) => {
  const root = job(t);
  let finish;
  const pending = runJob(root, { request: () => new Promise(resolve => { finish = resolve; }) });
  const before = fs.readFileSync(path.join(root, "receipt.json"), "utf8");
  try {
    await assert.rejects(runJob(root, { retry: true, intervention: "Retry", request: response }), /active|locked/i);
    assert.equal(fs.readFileSync(path.join(root, "receipt.json"), "utf8"), before);
  } finally {
    finish(await response());
    await pending;
  }
});

test("credential-like retry notes are denied before mutating the receipt or invoking a provider", async (t) => {
  const root = job(t);
  await runJob(root, { request: async () => { throw new Error("fixture"); } });
  const before = fs.readFileSync(path.join(root, "receipt.json"), "utf8");
  let calls = 0;
  await assert.rejects(runJob(root, { retry: true, intervention: `Bearer ${"A".repeat(24)}`, request: async () => { calls++; return response(); } }), /Credential/);
  assert.equal(calls, 0);
  assert.equal(fs.readFileSync(path.join(root, "receipt.json"), "utf8"), before);
});

test("acceptance binds current inputs and export cannot carry stale accepted bytes", async (t) => {
  const root = job(t);
  await runJob(root, { request: response });
  fs.appendFileSync(path.join(root, "mission.md"), "\nChanged decision\n");
  assert.throws(() => acceptDraft(root, "Reviewed"), /Inputs changed/i);
  fs.writeFileSync(path.join(root, "mission.md"), fs.readFileSync(new URL("../scripts/brief-templates/mission.md", import.meta.url)));
  acceptDraft(root, "Reviewed");
  fs.appendFileSync(path.join(root, "draft.md"), "\nUnreviewed change\n");
  assert.throws(() => exportJob(root, path.join(temporary(t), "bundle.json")), /acceptance|accepted/i);
  assert.equal(acceptDraft(root, "Reviewed changed draft").status, "accepted");
  assert.equal(exportJob(root, path.join(temporary(t), "bundle.json")).files, 5);
});

test("truncated provider output preserves usage and requires human review", async (t) => {
  const root = job(t);
  const result = await runJob(root, { request: async () => ({ ...await response(), finishReason: "length" }) });
  assert.equal(result.status, "needs_review");
  const receipt = JSON.parse(fs.readFileSync(path.join(root, "receipt.json"), "utf8"));
  assert.equal(receipt.attempts[0].finishReason, "length");
  assert.equal(receipt.attempts[0].usage.totalTokens, 52);
});

test("provider transport is bounded and omits model-specific sampling parameters", async (t) => {
  const originalKey = process.env.OPENAI_API_KEY;
  const originalModel = process.env.EVIDENCE_BRIEF_MODEL;
  process.env.OPENAI_API_KEY = "fixture-key";
  process.env.EVIDENCE_BRIEF_MODEL = "fixture-model";
  t.after(() => {
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = originalKey;
    if (originalModel === undefined) delete process.env.EVIDENCE_BRIEF_MODEL; else process.env.EVIDENCE_BRIEF_MODEL = originalModel;
  });
  let cancelled = false;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, "https://api.openai.com/v1/chat/completions");
    assert.equal("temperature" in JSON.parse(options.body), false);
    return new Response(new ReadableStream({
      pull(controller) { controller.enqueue(new Uint8Array(128 * 1024)); },
      cancel() { cancelled = true; },
    }));
  });
  await assert.rejects(requestOpenAI("fixture", new AbortController().signal), /transport limit/);
  assert.equal(cancelled, true);
});

test("a pre-cancelled job never invokes the provider and records cancellation", async (t) => {
  const root = job(t);
  let calls = 0;
  assert.equal((await runJob(root, { signal: AbortSignal.abort(), request: async () => { calls++; return response(); } })).status, "cancelled");
  assert.equal(calls, 0);
  assert.equal(fs.existsSync(path.join(root, ".brief-run.lock")), false);
});

test("SIGKILL after publishing a draft preserves it for explicit recovery without another provider request", async (t) => {
  const root = job(t);
  const script = `import fs from 'node:fs';
    import {runJob} from './scripts/evidence-brief.js';
    const link = fs.linkSync;
    fs.linkSync = (from, to) => { link(from, to); if (to.endsWith('/draft.md')) process.kill(process.pid, 'SIGKILL'); };
    await runJob(process.argv[1], {request: async () => ({content: 'Surviving evidence [S1].'})});`;
  const child = spawnSync(process.execPath, ["--input-type=module", "-e", script, root], { encoding: "utf8" });
  assert.equal(child.signal, "SIGKILL");
  assert.equal(fs.existsSync(path.join(root, ".brief-run.lock")), true);
  assert.throws(() => recoverDraft(root, "Stopped"), /locked/);
  // The child has exited; simulate the operator's explicitly verified stale-lock removal.
  fs.unlinkSync(path.join(root, ".brief-run.lock"));
  let calls = 0;
  await assert.rejects(runJob(root, { retry: true, intervention: "Stopped", request: async () => { calls++; return response(); } }), /use recover/);
  assert.equal(calls, 0);
  assert.equal(recoverDraft(root, "Confirmed killed runner; preserving its draft").status, "needs_review");
  const receipt = JSON.parse(fs.readFileSync(path.join(root, "receipt.json"), "utf8"));
  assert.equal(receipt.attempts.length, 1);
  assert.equal(receipt.humanAcceptance.status, "pending");
  assert.equal(acceptDraft(root, "Checked surviving draft").status, "accepted");
  const archive = path.join(temporary(t), "bundle.json");
  exportJob(root, archive);
  const restored = path.join(temporary(t), "restored");
  restoreJob(archive, restored);
  assert.equal(fs.readFileSync(path.join(restored, "draft.md"), "utf8"), "Surviving evidence [S1].\n");
});
