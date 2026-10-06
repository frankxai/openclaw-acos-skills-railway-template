import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import { once } from "node:events";

test("wrapper dependencies preserve health and setup authentication before onboarding", { timeout: 10000 }, async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "starlight-wrapper-smoke-"));
  const reservation = net.createServer();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const password = "isolated-test-password";
  const child = spawn(process.execPath, ["src/server.js"], {
    env: {
      PORT: String(port),
      SETUP_PASSWORD: password,
      OPENCLAW_GATEWAY_TOKEN: "isolated-test-gateway-token",
      OPENCLAW_STATE_DIR: path.join(directory, "state"),
      OPENCLAW_WORKSPACE_DIR: path.join(directory, "workspace"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, "exit");
      child.kill("SIGTERM");
      await exited;
    }
    fs.rmSync(directory, { recursive: true, force: true });
  });
  await new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => reject(new Error("Wrapper startup timed out")), 5000);
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("exit", (code) => { clearTimeout(timer); reject(new Error(`Wrapper exited before ready: ${code}`)); });
    child.stdout.on("data", (bytes) => {
      output += bytes;
      if (output.includes(`[wrapper] listening on :${port}`)) { clearTimeout(timer); resolve(); }
    });
  });
  const base = `http://127.0.0.1:${port}`;
  const check = await fetch(`${base}/setup/healthz`);
  assert.equal(check.status, 200);
  assert.deepEqual(await check.json(), { ok: true });
  const health = await fetch(`${base}/healthz`);
  const healthBody = await health.json();
  assert.equal(healthBody.wrapper.configured, false);
  assert.equal(healthBody.gateway.reachable, false);
  assert.equal(JSON.stringify(healthBody).includes(password), false);
  assert.equal((await fetch(`${base}/setup`, {
    headers: { Authorization: `Basic ${Buffer.from("operator:wrong-password").toString("base64")}` },
  })).status, 401);
  assert.equal((await fetch(`${base}/setup`)).status, 401);
  const headers = { Authorization: `Basic ${Buffer.from(`operator:${password}`).toString("base64")}` };
  const setup = await fetch(`${base}/setup`, { headers });
  assert.equal(setup.status, 200);
  assert.match(setup.headers.get("content-type"), /html/);
  assert.equal(fs.existsSync(path.join(directory, "state", "openclaw.json")), false);
});

test("setup access and the accepted healthcheck fail closed when secrets are absent or reused", { timeout: 10000 }, async (t) => {
  for (const [label, secretMode] of [["missing", "missing"], ["reused", "reused"]]) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), `starlight-wrapper-${label}-`));
    const reservation = net.createServer();
    reservation.listen(0, "127.0.0.1");
    await once(reservation, "listening");
    const port = reservation.address().port;
    await new Promise((resolve) => reservation.close(resolve));
    const password = "private-setup-test";
    const gatewayToken = secretMode === "reused" ? password : "private-gateway-test";
    const env = {
      ...process.env,
      PORT: String(port),
      SETUP_PASSWORD: password,
      OPENCLAW_GATEWAY_TOKEN: gatewayToken,
      OPENCLAW_STATE_DIR: path.join(directory, "state"),
      OPENCLAW_WORKSPACE_DIR: path.join(directory, "workspace"),
    };
    if (secretMode === "missing") delete env.OPENCLAW_GATEWAY_TOKEN;
    const child = spawn(process.execPath, ["src/server.js"], { env, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (bytes) => { output += bytes; });
    child.stderr.on("data", (bytes) => { output += bytes; });
    t.after(async () => {
      if (child.exitCode === null && child.signalCode === null) {
        const exited = once(child, "exit");
        child.kill("SIGTERM");
        await exited;
      }
      fs.rmSync(directory, { recursive: true, force: true });
    });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Wrapper startup timed out")), 5000);
      child.once("error", (error) => { clearTimeout(timer); reject(error); });
      child.once("exit", (code) => { clearTimeout(timer); reject(new Error(`Wrapper exited before ready: ${code}`)); });
      child.stdout.on("data", () => {
        if (output.includes(`[wrapper] listening on :${port}`)) { clearTimeout(timer); resolve(); }
      });
    });
    const base = `http://127.0.0.1:${port}`;
    assert.equal((await fetch(`${base}/setup/healthz`)).status, 503);
    const auth = `Basic ${Buffer.from(`operator:${password}`).toString("base64")}`;
    assert.equal((await fetch(`${base}/setup`, { headers: { Authorization: auth } })).status, 503);
    assert.equal(output.includes(password), false);
    assert.equal(output.includes(gatewayToken), false);
  }
});
