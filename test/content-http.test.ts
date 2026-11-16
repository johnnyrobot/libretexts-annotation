import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../src/store.ts";
import { createApp } from "../src/http.ts";
import { importLibrary, LibraryCatalog } from "../src/catalog.ts";
test("source text cannot inject HTML or recursively expand template placeholders", async () => {
  const data = await importLibrary("fixtures/library");
  data.books[0].pages[0].passages[0].quote =
    "Literal %%BOOK%% <b>not markup</b> stays exact.";
  const store = new Store(":memory:", new LibraryCatalog(data)),
    server = createApp(store, "http://127.0.0.1:4199");
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/social-reading/`;
  try {
    const response = await fetch(
      base + "?book=alpha&page=index.html&block=p-0",
    );
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.ok(
      html.includes(
        "Literal %%BOOK%% &lt;b&gt;not markup&lt;/b&gt; stays exact.",
      ),
    );
    assert.ok(!html.includes("<b>not markup</b>"));
    assert.equal(
      (
        await fetch(
          base +
            "api/page?book=alpha&page=../../.secrets/demo-credentials.json",
        )
      ).status,
      404,
    );
    assert.equal((await fetch(base + "?page=missing")).status, 400);
    assert.equal((await fetch(base + "api/health")).status, 200);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    store.close();
  }
});

test("bounded multilingual source quotes and comments fit the command envelope", async () => {
  const data = await importLibrary("fixtures/library");
  data.books[0].pages[0].passages[0].quote = "字".repeat(4000);
  const library = new LibraryCatalog(data),
    store = new Store(":memory:", library);
  store.provision({
    alice: "test-alice-password",
    bob: "test-bob-password",
    instructor: "test-instructor-password",
    outsider: "test-outsider-password",
  });
  const token = store.login("alice", "test-alice-password");
  const server = createApp(store, "http://127.0.0.1:4199");
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port,
    context = { book: "alpha", page: "index.html", block: "p-0" };
  try {
    const response = await fetch(
      `http://127.0.0.1:${port}/social-reading/api/commands`,
      {
        method: "POST",
        headers: {
          origin: "http://127.0.0.1:4199",
          "content-type": "application/json",
          cookie: `sr_session=${token}`,
        },
        body: JSON.stringify({
          actor: "alice",
          key: "multilingual-001",
          kind: "question",
          context,
          anchor: library.content(context)!.anchor,
          text: "問".repeat(4000),
        }),
      },
    );
    assert.equal(response.status, 200);
    assert.equal(store.list(token, context)[0].text.length, 4000);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    store.close();
  }
});

test("books preview cookie namespace cannot consume the original demo session cookie", async () => {
  const store = new Store(":memory:");
  store.provision({
    alice: "test-alice-password",
    bob: "test-bob-password",
    instructor: "test-instructor-password",
    outsider: "test-outsider-password",
  });
  const token = store.login("alice", "test-alice-password");
  const server = createApp(store, "http://127.0.0.1:4199", {
    sessionCookieName: "sr_books_session",
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/social-reading/api/`;
  try {
    assert.equal(
      (
        await fetch(base + "threads", {
          headers: { cookie: `sr_session=${token}` },
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await fetch(base + "threads", {
          headers: { cookie: `sr_books_session=${token}` },
        })
      ).status,
      200,
    );
    const logout = await fetch(base + "logout", {
      method: "POST",
      headers: {
        origin: "http://127.0.0.1:4199",
        "content-type": "application/json",
        cookie: `sr_session=${token}`,
      },
      body: "{}",
    });
    assert.match(logout.headers.get("set-cookie")!, /^sr_books_session=;/);
    assert.equal(store.actor(token).id, "alice");
    assert.throws(
      () =>
        createApp(store, "http://127.0.0.1:4199", {
          sessionCookieName: "sr_bad; Domain=example.com",
        }),
      /Invalid session cookie/,
    );
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    store.close();
  }
});
