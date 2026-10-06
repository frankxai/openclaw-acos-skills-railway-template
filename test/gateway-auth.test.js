import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import net from "node:net";
import { spawn } from "node:child_process";
import { once } from "node:events";

test("configured Gateway authenticates HTTP and WebSocket callers before delegating its token", { timeout: 15000 }, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "starlight-gateway-auth-"));
  const password = "fixture-setup-password";
  const token = "fixture-gateway-token";
  const calls = [];
  const gateway = http.createServer((req, res) => {
    calls.push({ path: req.url, authorization: req.headers.authorization });
    res.end(JSON.stringify({ ok: true }));
  });
  gateway.on("upgrade", (req, socket) => {
    calls.push({ path: req.url, authorization: req.headers.authorization });
    socket.end("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n");
  });
  gateway.listen(0, "127.0.0.1");
  await once(gateway, "listening");
  const reservation = net.createServer();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  fs.mkdirSync(path.join(root, "state"));
  fs.writeFileSync(path.join(root, "state/openclaw.json"), "{}");
  const entry = path.join(root, "fake-entry.cjs");
  fs.writeFileSync(entry, "if (process.argv.includes('gateway')) setInterval(() => {}, 1000);");
  const child = spawn(process.execPath, ["src/server.js"], { env: {
    ...process.env, PORT: String(port), SETUP_PASSWORD: password,
    OPENCLAW_GATEWAY_TOKEN: token, OPENCLAW_ENTRY: entry, OPENCLAW_NODE: process.execPath,
    INTERNAL_GATEWAY_PORT: String(gateway.address().port),
    OPENCLAW_STATE_DIR: path.join(root, "state"), OPENCLAW_WORKSPACE_DIR: path.join(root, "workspace"),
  }, stdio: ["ignore", "pipe", "pipe"] });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, "exit");
      child.kill("SIGTERM");
      await exited;
    }
    gateway.closeAllConnections();
    await new Promise(resolve => gateway.close(resolve));
    fs.rmSync(root, { recursive: true, force: true });
  });
  await new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => reject(new Error("Wrapper startup timed out")), 5000);
    child.once("error", error => { clearTimeout(timer); reject(error); });
    child.stdout.on("data", bytes => {
      output += bytes;
      if (output.includes(`[wrapper] listening on :${port}`)) { clearTimeout(timer); resolve(); }
    });
  });
  const base = `http://127.0.0.1:${port}`;
  const auth = `Basic ${Buffer.from(`operator:${password}`).toString("base64")}`;
  for (const authorization of [undefined, "Basic invalid", `Bearer ${token}`]) {
    assert.equal((await fetch(`${base}/private-output`, { headers: authorization ? { Authorization: authorization } : {} })).status, 401);
  }
  assert.equal(calls.some(call => call.path === "/private-output"), false);
  assert.equal((await fetch(`${base}/private-output`, { headers: { Authorization: auth } })).status, 200);
  assert.deepEqual(calls.filter(call => call.path === "/private-output"), [{ path: "/private-output", authorization: `Bearer ${token}` }]);
  const upgrade = (authorization, route = "/private-ws") => new Promise((resolve, reject) => {
    const socket = net.connect(port, "127.0.0.1");
    let bytes = "";
    socket.setTimeout(3000, () => { socket.destroy(); reject(new Error("Upgrade timed out")); });
    socket.on("error", reject);
    socket.on("connect", () => socket.write(`GET ${route} HTTP/1.1\r\nHost: localhost\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n${authorization ? `Authorization: ${authorization}\r\n` : ""}\r\n`));
    socket.on("data", chunk => { bytes += chunk; if (bytes.includes("\r\n\r\n")) { socket.destroy(); resolve(bytes); } });
  });
  assert.match(await upgrade(), /401 Unauthorized/);
  assert.match(await upgrade("Basic invalid"), /401 Unauthorized/);
  assert.match(await upgrade(undefined, "/setup/api/debug"), /401 Unauthorized/);
  assert.equal(calls.some(call => call.path === "/private-ws"), false);
  assert.match(await upgrade(auth), /101 Switching Protocols/);
  assert.deepEqual(calls.filter(call => call.path === "/private-ws"), [{ path: "/private-ws", authorization: `Bearer ${token}` }]);
  assert.equal((await fetch(`${base}/setup/healthz`)).status, 200);
});
