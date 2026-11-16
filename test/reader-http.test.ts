import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../src/store.ts";
import { createApp } from "../src/http.ts";
test("integrated mode redirects shell and issues host-only secure cookies for the exact library origin", async () => {
  const store = new Store(":memory:");
  store.provision({
    alice: "test-alice-password",
    bob: "test-bob-password",
    instructor: "test-instructor-password",
    outsider: "test-outsider-password",
  });
  const origin = "https://library.libretexts.dev";
  const server = createApp(store, origin, {
    readerEntry: origin + "/chem_4b/",
    sessionCookieName: "sr_library_session",
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    for (const path of ["/", "/social-reading", "/social-reading/?book=evil"]) {
      const r = await fetch(base + path, { redirect: "manual" });
      assert.equal(r.status, 302);
      assert.equal(r.headers.get("location"), origin + "/chem_4b/");
    }
    const login = (requestOrigin: string) =>
      fetch(base + "/social-reading/api/login", {
        method: "POST",
        headers: { origin: requestOrigin, "content-type": "application/json" },
        body: JSON.stringify({
          username: "alice",
          password: "test-alice-password",
        }),
      });
    assert.equal((await login("https://libretexts.dev")).status, 403);
    const r = await login(origin);
    assert.equal(r.status, 200);
    const cookie = r.headers.get("set-cookie")!;
    assert.match(cookie, /^sr_library_session=/);
    assert.match(cookie, /HttpOnly; SameSite=Strict/);
    assert.match(cookie, /; Secure/);
    assert.doesNotMatch(cookie, /Domain=/i);
    assert.equal((await fetch(base + "/social-reading/app.js")).status, 404);
    assert.equal(
      (
        await fetch(base + "/social-reading/api/session", {
          headers: { cookie },
        })
      ).status,
      200,
    );
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    store.close();
  }
});

test("reader entry cannot redirect to its own root", () => {
  const s = new Store(":memory:");
  try {
    for (const suffix of ["/", "/?query=x", "/#part"])
      assert.throws(
        () =>
          createApp(s, "https://library.libretexts.dev", {
            readerEntry: "https://library.libretexts.dev" + suffix,
          }),
        /Reader entry/,
      );
  } finally {
    s.close();
  }
});
