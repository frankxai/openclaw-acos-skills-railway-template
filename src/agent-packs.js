import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

export const DEFAULT_PACK = fileURLToPath(new URL("../packs/starlight-evidence-brief", import.meta.url));
const MAX_BYTES = 1024 * 1024;
// JSON escaping can expand a UTF-8 text pack; bound the transport separately.
const MAX_BUNDLE_BYTES = 7 * MAX_BYTES;
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

// Accept portable, literal paths only; URLs, encoded segments and Windows forms fail closed.
export function validateRelativePath(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(value) || value.length > 240) {
    throw new Error("Invalid portable file path");
  }
  if (value.split("/").some((part) => !part || part === "." || part === "..") || path.posix.isAbsolute(value)) {
    throw new Error("Path traversal is forbidden");
  }
  if (!/\.(md|json)$/.test(value) || ["manifest.json", "receipt.json"].includes(value)) {
    throw new Error("Pack files must be non-executable Markdown or JSON");
  }
  return value;
}

function checkedPath(value, { missing = false, directory = false } = {}) {
  if (typeof value !== "string" || !value || value.includes("\0")) throw new Error("A path is required");
  if (value.includes("\\") || value.includes("%") || /^[A-Za-z]:/.test(value)) throw new Error("Use a literal POSIX path");
  // Check raw input before resolution so `symlink/..` cannot disappear in normalization.
  if (value.split(/[\\/]/).includes("..")) throw new Error("Parent path segments are forbidden");
  const absolute = path.resolve(value);
  let current = path.parse(absolute).root;
  for (const component of absolute.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, component);
    let stat;
    try { stat = fs.lstatSync(current); } catch (error) {
      if (missing && error.code === "ENOENT") return absolute;
      throw error;
    }
    if (stat.isSymbolicLink()) throw new Error(`Symlink path is forbidden: ${current}`);
    if (current !== absolute && !stat.isDirectory()) throw new Error(`Non-directory ancestor: ${current}`);
    if (current === absolute && directory && !stat.isDirectory()) throw new Error("Expected a directory");
  }
  return absolute;
}

function readRegularFile(file, maximumBytes = MAX_BYTES) {
  checkedPath(file);
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size > maximumBytes || stat.nlink !== 1) throw new Error("Expected a bounded, unlinked regular file");
    const bytes = fs.readFileSync(fd);
    if (bytes.length > maximumBytes) throw new Error("File exceeds pack size limit");
    return bytes;
  } finally { fs.closeSync(fd); }
}

function assertWriteAncestors(absolute) {
  if (!process.getuid) throw new Error("Pack writes require POSIX ownership checks");
  const uid = process.getuid();
  let current = path.parse(absolute).root;
  const directories = [current];
  for (const component of absolute.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, component);
    directories.push(current);
  }
  for (const directory of directories) {
    let stat;
    try { stat = fs.lstatSync(directory); } catch (error) {
      if (error.code === "ENOENT") break;
      throw error;
    }
    if (stat.isSymbolicLink()) throw new Error("Symlink ancestor is forbidden");
    if (!stat.isDirectory()) continue;
    if (stat.uid !== 0 && stat.uid !== uid) throw new Error("Write ancestors must be owned by the current user or root");
    // A root/current-user owned sticky directory such as /tmp cannot have our
    // child renamed by another unprivileged user. Other writable parents can.
    if ((stat.mode & 0o022) && !(stat.mode & 0o1000)) throw new Error("Unsafe writable ancestor for pack destination");
  }
}

function walkFiles(root, prefix = "") {
  const result = [];
  for (const entry of fs.readdirSync(path.join(root, prefix), { withFileTypes: true })) {
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw new Error(`Symlink in pack: ${name}`);
    if (entry.isDirectory()) result.push(...walkFiles(root, name));
    else if (entry.isFile()) result.push(name);
    else throw new Error(`Unsupported file in pack: ${name}`);
  }
  return result.sort();
}

export function validateBundle(bundle) {
  if (!bundle || bundle.schemaVersion !== 1 || !bundle.manifest || !Array.isArray(bundle.files)) throw new Error("Unsupported pack bundle");
  const manifest = bundle.manifest;
  if (manifest.schemaVersion !== 1 || typeof manifest.id !== "string" || !/^[a-z][a-z0-9-]{1,63}$/.test(manifest.id)) throw new Error("Invalid pack id");
  if (typeof manifest.version !== "string" || !/^\d+\.\d+\.\d+$/.test(manifest.version)) throw new Error("Invalid pack version");
  if (manifest.skillName !== `${manifest.id}-${manifest.version.replaceAll(".", "-")}` || manifest.license !== "MIT") throw new Error("Invalid skill identity or license");
  if (!Array.isArray(manifest.files) || manifest.files.length < 1 || manifest.files.length > 32 || bundle.files.length !== manifest.files.length) throw new Error("Invalid pack file count");
  const seen = new Set();
  let total = 0;
  for (let i = 0; i < manifest.files.length; i++) {
    const expected = manifest.files[i];
    const actual = bundle.files[i];
    validateRelativePath(expected.path);
    if (seen.has(expected.path) || (i && manifest.files[i - 1].path >= expected.path)) throw new Error("Pack paths must be unique and sorted");
    seen.add(expected.path);
    if (!actual || actual.path !== expected.path || typeof actual.content !== "string") throw new Error("Bundle file does not match manifest");
    const bytes = Buffer.from(actual.content, "utf8");
    total += bytes.length;
    if (total > MAX_BYTES || expected.bytes !== bytes.length || expected.sha256 !== sha256(bytes)) throw new Error(`Integrity mismatch: ${expected.path}`);
  }
  const skill = bundle.files.find((file) => file.path === "SKILL.md");
  if (!skill || !skill.content.startsWith(`---\nname: ${manifest.skillName}\n`)) throw new Error("Skill frontmatter must match versioned identity");
  if (Buffer.byteLength(`${stableJson(bundle)}\n`) > MAX_BUNDLE_BYTES) throw new Error("Serialized bundle exceeds transport size limit");
  return bundle;
}

export function loadPack(root = DEFAULT_PACK) {
  const absolute = checkedPath(root, { directory: true });
  const manifest = JSON.parse(readRegularFile(path.join(absolute, "manifest.json")));
  if (!Array.isArray(manifest.files)) throw new Error("Invalid pack manifest");
  // Validate paths before reading anything referenced by an untrusted manifest.
  for (const entry of manifest.files) validateRelativePath(entry.path);
  const actualPaths = walkFiles(absolute).filter((file) => !["manifest.json", "receipt.json"].includes(file));
  const expectedPaths = manifest.files.map((file) => file.path);
  if (stableJson(actualPaths) !== stableJson(expectedPaths)) throw new Error("Pack contains missing or unlisted files");
  const files = manifest.files.map(({ path: name }) => {
    const bytes = readRegularFile(path.join(absolute, name));
    const content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { path: name, content };
  });
  const bundle = validateBundle({ schemaVersion: 1, manifest, files });
  const receiptPath = path.join(absolute, "receipt.json");
  if (fs.existsSync(receiptPath) && stableJson(JSON.parse(readRegularFile(receiptPath))) !== stableJson(packReceipt(bundle))) {
    throw new Error("Installed receipt differs; refusing to trust pack");
  }
  return bundle;
}

export function loadBundle(file) {
  return validateBundle(JSON.parse(readRegularFile(file, MAX_BUNDLE_BYTES)));
}

export function packReceipt(bundle) {
  validateBundle(bundle);
  return {
    schemaVersion: 1,
    id: bundle.manifest.id,
    version: bundle.manifest.version,
    skillName: bundle.manifest.skillName,
    manifestSha256: sha256(stableJson(bundle.manifest)),
    files: bundle.manifest.files,
  };
}

function ensureDirectory(directory) {
  checkedPath(directory, { missing: true });
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  checkedPath(directory, { directory: true });
  const stat = fs.statSync(directory);
  if ((stat.mode & 0o022) || (process.getuid && stat.uid !== process.getuid())) {
    throw new Error("Pack destination must be owned by the current user and not writable by other users");
  }
}

export function installPack(workspace, bundle = loadPack()) {
  validateBundle(bundle);
  const root = checkedPath(workspace, { missing: true });
  assertWriteAncestors(root);
  ensureDirectory(root);
  const skills = path.join(root, "skills");
  ensureDirectory(skills);
  const destination = path.join(skills, bundle.manifest.skillName);
  checkedPath(destination, { missing: true });
  const receipt = packReceipt(bundle);
  if (fs.existsSync(destination)) {
    const installed = loadPack(destination);
    if (stableJson(installed) !== stableJson(bundle)) throw new Error("Installed version differs; refusing to overwrite");
    const previousReceipt = JSON.parse(readRegularFile(path.join(destination, "receipt.json")));
    if (stableJson(previousReceipt) !== stableJson(receipt)) throw new Error("Installed receipt differs; refusing to overwrite");
    return { destination, receipt, changed: false };
  }
  // An exclusive lock prevents concurrent installers using this CLI. Same-user hostile
  // processes are outside the boundary; do not install while agents mutate the workspace.
  const lock = path.join(skills, `.${bundle.manifest.skillName}.install-lock`);
  const lockFd = fs.openSync(lock, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
  let stage;
  try {
    stage = fs.mkdtempSync(path.join(skills, ".starlight-pack-"));
    for (const file of bundle.files) {
      const target = path.join(stage, file.path);
      fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
      fs.writeFileSync(target, file.content, { flag: "wx", mode: 0o444 });
    }
    fs.writeFileSync(path.join(stage, "manifest.json"), `${stableJson(bundle.manifest)}\n`, { flag: "wx", mode: 0o444 });
    fs.writeFileSync(path.join(stage, "receipt.json"), `${stableJson(receipt)}\n`, { flag: "wx", mode: 0o444 });
    // Re-check before publishing the complete directory. Partial installs are never active.
    checkedPath(skills, { directory: true });
    checkedPath(destination, { missing: true });
    if (fs.existsSync(destination)) throw new Error("Installation conflict; refusing to overwrite");
    fs.renameSync(stage, destination);
    stage = undefined;
    return { destination, receipt, changed: true };
  } finally {
    if (stage) fs.rmSync(stage, { recursive: true, force: true });
    fs.closeSync(lockFd);
    fs.unlinkSync(lock);
  }
}

export function exportPack(file, bundle = loadPack()) {
  validateBundle(bundle);
  const target = checkedPath(file, { missing: true });
  const parent = path.dirname(target);
  checkedPath(parent, { directory: true });
  assertWriteAncestors(parent);
  const content = `${stableJson(bundle)}\n`;
  const fd = fs.openSync(target, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
  try { fs.writeFileSync(fd, content); } finally { fs.closeSync(fd); }
  return { file: target, sha256: sha256(content), bytes: Buffer.byteLength(content), receipt: packReceipt(bundle) };
}
