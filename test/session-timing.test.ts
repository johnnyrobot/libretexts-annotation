import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../src/store.ts";
test("deliberate session extensions preserve actor, support ten extensions and never revive expiry or revocation", (t) => {
  let now = 1000000;
  t.mock.method(Date, "now", () => now);
  const s = new Store(":memory:");
  try {
    s.provision({
      alice: "test-alice-password",
      bob: "test-bob-password",
      instructor: "test-instructor-password",
      outsider: "test-outsider-password",
    });
    const token = s.login("alice", "test-alice-password");
    const initial = s.session(token);
    assert.equal(initial.id, "alice");
    assert.deepEqual(initial.timing, {
      serverNow: now,
      expiresAt: now + 28800000,
      warningSeconds: 300,
      extensionSeconds: 28800,
      canExtend: true,
    });
    assert.throws(() => s.extendSession(token, "bob"), /identity/i);
    for (let i = 0; i < 11; i++) {
      now += 28700000;
      const result = s.extendSession(token, "alice");
      assert.equal(result.timing.expiresAt, now + 28800000);
      assert.equal(result.id, "alice");
    }
    s.setMembership("alice", false);
    assert.throws(() => s.extendSession(token, "alice"), /access/);
    s.setMembership("alice", true);
    now += 28800000;
    assert.throws(() => s.extendSession(token, "alice"), /Sign in/);
    assert.throws(() => s.session(token), /Sign in/);
  } finally {
    s.close();
  }
});

test("HTTP exposes field errors and origin-protected session extension without leaking submitted text", async () => {
  const { createApp } = await import("../src/http.ts");
  const { passage } = await import("../src/store.ts");
  const s = new Store(":memory:");
  s.provision({
    alice: "test-alice-password",
    bob: "test-bob-password",
    instructor: "test-instructor-password",
    outsider: "test-outsider-password",
  });
  const token = s.login("alice", "test-alice-password");
  const origin = "https://library.libretexts.dev";
  const server = createApp(s, origin);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/social-reading/api/`;
  const post = (path: string, body: unknown, requestOrigin = origin) =>
    fetch(base + path, {
      method: "POST",
      headers: {
        origin: requestOrigin,
        "content-type": "application/json",
        cookie: `sr_session=${token}`,
      },
      body: JSON.stringify(body),
    });
  try {
    const invalid = await post("commands", {
      actor: "alice",
      key: "validation-001",
      kind: "question",
      anchor: passage.anchor,
      text: "",
    });
    assert.equal(invalid.status, 400);
    const error = await invalid.json();
    assert.equal(error.code, "VALIDATION_FAILED");
    assert.deepEqual(error.fieldErrors, {
      text: "Enter between 1 and 4000 characters.",
    });
    assert.equal(typeof error.error, "string");
    assert.equal(
      (await post("session/extend", { actor: "alice" }, "https://evil.example"))
        .status,
      403,
    );
    const wrong = await post("session/extend", { actor: "bob" });
    assert.equal(wrong.status, 409);
    assert.equal((await wrong.json()).code, "IDENTITY_CHANGED");
    const extended = await post("session/extend", { actor: "alice" });
    assert.equal(extended.status, 200);
    assert.equal((await extended.json()).timing.extensionSeconds, 28800);
    assert.match(
      extended.headers.get("set-cookie")!,
      /HttpOnly; SameSite=Strict; Max-Age=28800; Secure/,
    );
    s.logout(token);
    assert.equal(
      (await post("session/extend", { actor: "alice" })).status,
      401,
    );
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    s.close();
  }
});
