import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../src/store.ts";
import { createApp } from "../src/http.ts";
test("public reading works; private API and cross-origin mutations are denied", async () => {
  const store = new Store(":memory:");
  const server = createApp(store, "http://127.0.0.1:4199");
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address() as { port: number };
  const base = `http://127.0.0.1:${addr.port}/social-reading/`;
  try {
    assert.equal((await fetch(base)).status, 200);
    assert.equal((await fetch(base + "api/threads")).status, 401);
    assert.equal(
      (
        await fetch(base + "api/login", {
          method: "POST",
          headers: {
            origin: "https://evil.example",
            "content-type": "application/json",
          },
          body: "{}",
        })
      ).status,
      403,
    );
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    store.close();
  }
});

test("UTF-8 split across network chunks preserves the exact contribution", async () => {
  const { request } = await import("node:http");
  const { passage } = await import("../src/store.ts");
  const store = new Store(":memory:");
  store.provision({
    alice: "test-alice-password",
    bob: "test-bob-password",
    instructor: "test-instructor-password",
    outsider: "test-outsider-password",
  });
  const token = store.login("alice", "test-alice-password");
  const server = createApp(store, "http://127.0.0.1:4199");
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as { port: number };
  try {
    const body = Buffer.from(
      JSON.stringify({
        actor: "alice",
        key: "unicode-test-01",
        kind: "question",
        text: "Careful observation 🌱",
        anchor: passage.anchor,
      }),
    );
    const split = body.indexOf(Buffer.from("🌱")) + 1;
    const status = await new Promise<number>((resolve, reject) => {
      const req = request(
        {
          hostname: "127.0.0.1",
          port,
          path: "/social-reading/api/commands",
          method: "POST",
          headers: {
            origin: "http://127.0.0.1:4199",
            "content-type": "application/json",
            cookie: `sr_session=${token}`,
          },
        },
        (res) => {
          res.resume();
          res.on("end", () => resolve(res.statusCode!));
        },
      );
      req.on("error", reject);
      req.write(body.subarray(0, split));
      setImmediate(() => req.end(body.subarray(split)));
    });
    assert.equal(status, 200);
    assert.equal(store.list(token)[0].text, "Careful observation 🌱");
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    store.close();
  }
});

test("account throttles cannot be bypassed by forged forwarded IPs and do not lock another account", async () => {
  const store = new Store(":memory:");
  store.provision({
    alice: "test-alice-password",
    bob: "test-bob-password",
    instructor: "test-instructor-password",
    outsider: "test-outsider-password",
  });
  const server = createApp(store, "http://127.0.0.1:4199");
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  const login = (username: string, password: string, ip: string) =>
    fetch(`http://127.0.0.1:${port}/social-reading/api/login`, {
      method: "POST",
      headers: {
        origin: "http://127.0.0.1:4199",
        "content-type": "application/json",
        "x-forwarded-for": ip,
        "x-social-reading-client-ip": ip,
      },
      body: JSON.stringify({ username, password }),
    });
  try {
    for (let n = 0; n < 15; n++)
      assert.equal(
        (await login("alice", "wrong-password", `198.51.100.${n + 1}`)).status,
        401,
      );
    assert.equal(
      (await login("alice", "test-alice-password", "203.0.113.8")).status,
      429,
    );
    assert.equal(
      (await login("bob", "test-bob-password", "203.0.113.8")).status,
      200,
    );
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    store.close();
  }
});

test("proxy identity is used only with explicit loopback trust, and peer limits remain enforced", async () => {
  for (const trustedLoopbackProxy of [false, true]) {
    const store = new Store(":memory:");
    store.provision({
      alice: "test-alice-password",
      bob: "test-bob-password",
      instructor: "test-instructor-password",
      outsider: "test-outsider-password",
    });
    const server = createApp(store, "http://127.0.0.1:4199", {
      trustedLoopbackProxy,
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const port = (server.address() as { port: number }).port;
    const login = (username: string, ip: string) =>
      fetch(`http://127.0.0.1:${port}/social-reading/api/login`, {
        method: "POST",
        headers: {
          origin: "http://127.0.0.1:4199",
          "content-type": "application/json",
          "x-social-reading-client-ip": ip,
        },
        body: JSON.stringify({ username, password: "test-bob-password" }),
      });
    try {
      for (let n = 0; n < 120; n++)
        assert.equal((await login(`unknown-${n}`, "198.51.100.1")).status, 401);
      assert.equal((await login("bob", "198.51.100.1")).status, 429);
      assert.equal(
        (await login("bob", "198.51.100.2")).status,
        trustedLoopbackProxy ? 200 : 429,
      );
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
      store.close();
    }
  }
});
