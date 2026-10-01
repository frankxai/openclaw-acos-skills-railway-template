import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  DEFAULT_PACK, exportPack, installPack, loadBundle, loadPack, packReceipt,
  stableJson, validateBundle, validateRelativePath,
} from "../src/agent-packs.js";

function temporary(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "starlight-pack-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
function fixture(t) {
  const root = temporary(t);
  const copy = path.join(root, "source");
  fs.cpSync(DEFAULT_PACK, copy, { recursive: true });
  return { root, copy };
}

test("curated pack verifies and exports deterministic portable bytes", (t) => {
  const root = temporary(t);
  const bundle = loadPack();
  const a = exportPack(path.join(root, "a.json"), bundle);
  const b = exportPack(path.join(root, "b.json"), bundle);
  assert.equal(a.sha256, b.sha256);
  assert.deepEqual(fs.readFileSync(a.file), fs.readFileSync(b.file));
  assert.deepEqual(loadBundle(a.file), bundle);
  assert.equal(packReceipt(bundle).version, "1.0.0");
  assert.equal(packReceipt(bundle).manifestSha256.length, 64);
});

test("a near-limit text pack round-trips despite JSON escaping overhead", (t) => {
  const root = temporary(t);
  const bundle = structuredClone(loadPack());
  const content = '"'.repeat(900000);
  const name = "references/large.md";
  bundle.files.push({ path: name, content });
  bundle.files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  bundle.manifest.files.push({ path: name, bytes: Buffer.byteLength(content), sha256: createHash("sha256").update(content).digest("hex") });
  bundle.manifest.files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  const exported = exportPack(path.join(root, "large.json"), bundle);
  assert.ok(exported.bytes > 1024 * 1024);
  assert.deepEqual(loadBundle(exported.file), bundle);
});

test("installation is complete, idempotent, versioned and keeps owner profiles", (t) => {
  const root = temporary(t);
  const workspace = path.join(root, "workspace");
  fs.mkdirSync(workspace);
  for (const name of ["SOUL.md", "IDENTITY.md", "PERMISSIONS.md", "USER.md"]) {
    fs.writeFileSync(path.join(workspace, name), `owner's ${name}\n`);
  }
  const first = installPack(workspace);
  assert.equal(first.changed, true);
  assert.equal(path.basename(first.destination), "starlight-evidence-brief-1-0-0");
  assert.deepEqual(loadPack(first.destination), loadPack());
  const second = installPack(workspace);
  assert.equal(second.changed, false);
  assert.deepEqual(second.receipt, first.receipt);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(first.destination, "receipt.json"))), first.receipt);
  assert.equal(fs.statSync(path.join(first.destination, "SKILL.md")).mode & 0o222, 0);
  for (const name of ["SOUL.md", "IDENTITY.md", "PERMISSIONS.md", "USER.md"]) {
    assert.equal(fs.readFileSync(path.join(workspace, name), "utf8"), `owner's ${name}\n`);
  }
  assert.equal(fs.existsSync(path.join(workspace, "bootstrap.sh")), false);
});

test("modified install and modified receipt are refused without replacing bytes", (t) => {
  const root = temporary(t);
  const install = installPack(path.join(root, "workspace"));
  const skill = path.join(install.destination, "SKILL.md");
  fs.chmodSync(skill, 0o600);
  fs.writeFileSync(skill, "owner edit");
  assert.throws(() => installPack(path.join(root, "workspace")), /Integrity mismatch/);
  assert.equal(fs.readFileSync(skill, "utf8"), "owner edit");
  fs.writeFileSync(skill, loadPack().files.find((file) => file.path === "SKILL.md").content);
  const receipt = path.join(install.destination, "receipt.json");
  fs.chmodSync(receipt, 0o600);
  fs.writeFileSync(receipt, '{"schemaVersion":999}');
  assert.throws(() => installPack(path.join(root, "workspace")), /receipt differs/);
});

test("export contains no workspace memory and never overwrites an existing file", (t) => {
  const root = temporary(t);
  const workspace = path.join(root, "workspace");
  installPack(workspace);
  fs.writeFileSync(path.join(workspace, "private-memory.md"), "EXAMPLE_SECRET_DO_NOT_EXPORT");
  const output = path.join(root, "pack.json");
  exportPack(output);
  const bytes = fs.readFileSync(output, "utf8");
  assert.equal(bytes.includes("EXAMPLE_SECRET_DO_NOT_EXPORT"), false);
  assert.throws(() => exportPack(output), /EEXIST/);
  assert.equal(fs.readFileSync(output, "utf8"), bytes);
});

test("tampering with source content or adding unlisted files fails verification", (t) => {
  const { copy } = fixture(t);
  fs.appendFileSync(path.join(copy, "SKILL.md"), "\nInjected change");
  assert.throws(() => loadPack(copy), /Integrity mismatch/);
  fs.writeFileSync(path.join(copy, "unlisted.md"), "unexpected");
  assert.throws(() => loadPack(copy), /unlisted/);
});

test("portable manifest paths reject traversal, encoding and executable payloads", () => {
  for (const name of ["../escape.md", "a/../escape.md", "/tmp/escape.md", "a//b.md", "./SKILL.md", "a\\b.md", "C:/escape.md", "%2e%2e/escape.md", "bootstrap.sh", "receipt.json", "a/./b.json"]) {
    assert.throws(() => validateRelativePath(name), undefined, name);
  }
  assert.equal(validateRelativePath("references/job-contract.json"), "references/job-contract.json");
});

test("a malicious manifest cannot read outside its source directory", (t) => {
  const { root, copy } = fixture(t);
  fs.writeFileSync(path.join(root, "outside.md"), "private file");
  const manifestPath = path.join(copy, "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath));
  manifest.files[0].path = "../outside.md";
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  assert.throws(() => loadPack(copy), /Invalid portable file path|Path traversal/);
});

test("symlinks in source, source parent and hardlinked files fail closed", (t) => {
  const { root, copy } = fixture(t);
  const outside = path.join(root, "outside.md");
  fs.writeFileSync(outside, "private file");
  fs.unlinkSync(path.join(copy, "SKILL.md"));
  fs.symlinkSync(outside, path.join(copy, "SKILL.md"));
  assert.throws(() => loadPack(copy), /Symlink/);
  const sourceLink = path.join(root, "source-link");
  fs.symlinkSync(copy, sourceLink);
  assert.throws(() => loadPack(sourceLink), /Symlink/);
  fs.unlinkSync(path.join(copy, "SKILL.md"));
  fs.linkSync(outside, path.join(copy, "SKILL.md"));
  assert.throws(() => loadPack(copy), /unlinked regular file/);
});

test("workspace, skills, destination and output symlinks cannot escape", (t) => {
  const root = temporary(t);
  const outside = path.join(root, "outside");
  fs.mkdirSync(outside);
  const workspaceLink = path.join(root, "workspace-link");
  fs.symlinkSync(outside, workspaceLink);
  assert.throws(() => installPack(workspaceLink), /Symlink/);
  const workspace = path.join(root, "workspace");
  fs.mkdirSync(workspace);
  fs.symlinkSync(outside, path.join(workspace, "skills"));
  assert.throws(() => installPack(workspace), /Symlink/);
  fs.unlinkSync(path.join(workspace, "skills"));
  fs.mkdirSync(path.join(workspace, "skills"));
  fs.symlinkSync(outside, path.join(workspace, "skills", loadPack().manifest.skillName));
  assert.throws(() => installPack(workspace), /Symlink/);
  const sentinel = path.join(outside, "sentinel.json");
  fs.writeFileSync(sentinel, "original");
  fs.symlinkSync(sentinel, path.join(root, "export.json"));
  assert.throws(() => exportPack(path.join(root, "export.json")), /Symlink/);
  assert.throws(() => exportPack(path.join(workspaceLink, "export.json")), /Symlink/);
  assert.equal(fs.readFileSync(sentinel, "utf8"), "original");
  assert.deepEqual(fs.readdirSync(outside), ["sentinel.json"]);
});

test("raw parent segments and shared-writable destinations are refused", (t) => {
  const root = temporary(t);
  assert.throws(() => installPack(`${root}/child/../workspace`), /Parent path/);
  const workspace = path.join(root, "workspace");
  fs.mkdirSync(workspace, { mode: 0o777 });
  fs.chmodSync(workspace, 0o777);
  assert.throws(() => installPack(workspace), /Unsafe writable ancestor|not writable by other users/);
  assert.deepEqual(fs.readdirSync(workspace), []);
});

test("non-sticky shared-writable ancestors block install and export before writes", (t) => {
  const root = temporary(t);
  const shared = path.join(root, "shared");
  fs.mkdirSync(shared);
  fs.chmodSync(shared, 0o777);
  assert.throws(() => installPack(path.join(shared, "workspace")), /Unsafe writable ancestor/);
  assert.throws(() => exportPack(path.join(shared, "export.json")), /Unsafe writable ancestor/);
  assert.deepEqual(fs.readdirSync(shared), []);
  // Root/current-user owned sticky parents are safe against a different user
  // renaming our child. Normal /tmp uses this convention.
  fs.chmodSync(shared, 0o1777);
  assert.equal(installPack(path.join(shared, "workspace")).changed, true);
});

test("malformed, duplicate, unsorted and integrity-mismatched bundles do not install", (t) => {
  const root = temporary(t);
  const bad = structuredClone(loadPack());
  bad.files[0].content += "changed";
  assert.throws(() => installPack(path.join(root, "workspace"), bad), /Integrity mismatch/);
  assert.equal(fs.existsSync(path.join(root, "workspace")), false);
  const duplicate = structuredClone(loadPack());
  duplicate.manifest.files[1] = duplicate.manifest.files[0];
  duplicate.files[1] = duplicate.files[0];
  assert.throws(() => validateBundle(duplicate), /unique and sorted/);
  const unordered = structuredClone(loadPack());
  unordered.manifest.files.reverse();
  unordered.files.reverse();
  assert.throws(() => validateBundle(unordered), /unique and sorted/);
  const name = structuredClone(loadPack());
  name.manifest.skillName = "arbitrary-name";
  assert.throws(() => validateBundle(name), /identity/);
  assert.throws(() => validateBundle({ schemaVersion: 0 }), /Unsupported/);
});

test("an exclusive installation lock prevents concurrent publication", (t) => {
  const root = temporary(t);
  const workspace = path.join(root, "workspace");
  const skills = path.join(workspace, "skills");
  fs.mkdirSync(skills, { recursive: true });
  const lock = path.join(skills, `.${loadPack().manifest.skillName}.install-lock`);
  fs.writeFileSync(lock, "another installer");
  assert.throws(() => installPack(workspace), /EEXIST/);
  assert.equal(fs.readFileSync(lock, "utf8"), "another installer");
  assert.deepEqual(fs.readdirSync(skills), [path.basename(lock)]);
});

test("CLI verifies, round-trips export and rejects malformed arguments", (t) => {
  const root = temporary(t);
  const run = (args) => spawnSync(process.execPath, ["scripts/agent-pack.js", ...args], { encoding: "utf8" });
  assert.equal(run(["verify"]).status, 0);
  const output = path.join(root, "pack.json");
  assert.equal(run(["export", "--output", output]).status, 0);
  const workspace = path.join(root, "workspace");
  const installed = run(["install", "--workspace", workspace, "--bundle", output]);
  assert.equal(installed.status, 0, installed.stderr);
  assert.equal(JSON.parse(installed.stdout).changed, true);
  assert.equal(stableJson(loadBundle(output)), stableJson(loadPack()));
  for (const args of [["install"], ["export"], ["verify", "--unknown", "x"], ["verify", "--bundle"], ["verify", "--bundle", output, "--bundle", output], ["deploy"]]) {
    const result = run(args);
    assert.equal(result.status, 1, args.join(" "));
    assert.match(result.stderr, /Agent pack:/);
  }
});
