import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { Store, passage } from "../src/store.ts";
test("HTTP server process restart retains sessions and acknowledged posts", async () => {
  const dir = mkdtempSync(join(tmpdir(), "social-http-"));
  const file = join(dir, "db.sqlite");
  const store = new Store(file);
  store.provision({
    alice: "test-alice-password",
    bob: "test-bob-password",
    instructor: "test-instructor-password",
    outsider: "test-outsider-password",
  });
  store.close();
  const reserve = createServer();
  await new Promise<void>((r) => reserve.listen(0, "127.0.0.1", r));
  const port = (reserve.address() as { port: number }).port;
  await new Promise<void>((r) => reserve.close(() => r()));
  const origin = `http://127.0.0.1:${port}`;
  let child: ChildProcess | undefined;
  const start = () =>
    new Promise<void>((resolve, reject) => {
      child = spawn(
        process.execPath,
        ["--experimental-strip-types", "src/server.ts"],
        {
          env: {
            ...process.env,
            DATABASE: file,
            PORT: String(port),
            ORIGIN: origin,
          },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      child.on("error", reject);
      child.on("exit", (code) => {
        if (code !== 0) reject(new Error("Server failed to start"));
      });
      child.stdout!.once("data", () => resolve());
    });
  const stop = () =>
    new Promise<void>((resolve) => {
      child!.once("exit", () => resolve());
      child!.kill("SIGTERM");
    });
  try {
    await start();
    const login = await fetch(origin + "/social-reading/api/login", {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({
        username: "alice",
        password: "test-alice-password",
      }),
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    const saved = await fetch(origin + "/social-reading/api/commands", {
      method: "POST",
      headers: { origin, "content-type": "application/json", cookie },
      body: JSON.stringify({
        actor: "alice",
        key: "restart-test-01",
        kind: "question",
        text: "Preserve after restart",
        anchor: passage.anchor,
      }),
    });
    assert.equal(saved.status, 200);
    await stop();
    await start();
    const rows = await (
      await fetch(origin + "/social-reading/api/threads", {
        headers: { cookie },
      })
    ).json();
    assert.equal(rows[0].text, "Preserve after restart");
  } finally {
    if (child && child.exitCode === null) await stop();
    rmSync(dir, { recursive: true, force: true });
  }
});
