import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store, passage } from "../src/store.ts";
import { HighlightStore } from "../src/highlights.ts";
const passwords = {
  alice: "test-alice-password",
  bob: "test-bob-password",
  instructor: "test-instructor-password",
  outsider: "test-outsider-password",
};
const context = {
  book: "__sample__",
  page: "scientific-method",
  block: "scientific-method-p1",
};
test("personal exact highlights persist through reopen and remain private even from instructor", () => {
  const dir = mkdtempSync(join(tmpdir(), "sr-highlights-"));
  const file = join(dir, "store.sqlite");
  let store = new Store(file);
  store.provision(passwords);
  let marks = new HighlightStore(store);
  const alice = store.login("alice", passwords.alice),
    bob = store.login("bob", passwords.bob),
    instructor = store.login("instructor", passwords.instructor);
  const anchor = {
    ...passage.anchor,
    selector: { start: 0, end: 10, quote: passage.text.slice(0, 10) },
  };
  const command = {
    actor: "alice",
    key: "highlight-create-1",
    kind: "create" as const,
    context,
    anchor,
    text: "My private note",
    tags: ["Evidence"],
  };
  const receipt = marks.command(alice, command);
  assert.equal(
    marks.list(alice)[0].anchor.selector!.quote,
    anchor.selector.quote,
  );
  assert.deepEqual(marks.list(bob), []);
  assert.deepEqual(marks.list(instructor), []);
  assert.deepEqual(marks.command(alice, command), receipt);
  assert.throws(() => marks.command(alice, { ...command, text: "different" }), {
    status: 409,
  });
  store.close();
  store = new Store(file);
  marks = new HighlightStore(store);
  assert.equal(marks.list(alice)[0].text, "My private note");
  assert.deepEqual(marks.receipt(alice, command.key, context), receipt);
  assert.equal(marks.receipt(bob, command.key, context), null);
  assert.throws(
    () =>
      marks.command(bob, {
        actor: "bob",
        key: "foreign-update-1",
        kind: "update",
        context,
        highlight: receipt.highlight,
        version: 1,
        text: "steal",
      }),
    { status: 404 },
  );
  store.close();
  rmSync(dir, { recursive: true });
});
test("edits and deletion require current versions; stale anchors preserve read-only history", () => {
  const store = new Store(":memory:");
  store.provision(passwords);
  const marks = new HighlightStore(store);
  const token = store.login("alice", passwords.alice);
  const create = {
    actor: "alice",
    key: "highlight-edit-1",
    kind: "create" as const,
    context,
    anchor: passage.anchor,
  };
  const receipt = marks.command(token, create);
  const edit = {
    actor: "alice",
    key: "highlight-edit-2",
    kind: "update" as const,
    context,
    highlight: receipt.highlight,
    version: 1,
    text: "Changed",
    tags: ["topic"],
  };
  assert.equal(marks.command(token, edit).version, 2);
  assert.throws(
    () => marks.command(token, { ...edit, key: "highlight-edit-3" }),
    { status: 409 },
  );
  for (const invalid of [
    { tags: [""] },
    { tags: ["x".repeat(41)] },
    { tags: new Array(11).fill("tag") },
    { text: "x".repeat(4001) },
    {
      anchor: {
        ...passage.anchor,
        selector: { start: 0, end: 10, quote: "wrong" },
      },
    },
  ]) {
    assert.throws(() =>
      marks.command(token, { ...create, ...invalid, key: "invalid-key-1" }),
    );
  }
  const content = store.content.bind(store);
  store.content = () => undefined;
  assert.equal(marks.list(token)[0].orphan, true);
  assert.throws(
    () => marks.command(token, { ...edit, key: "orphan-edit-1", version: 2 }),
    { status: 409 },
  );
  assert.throws(
    () =>
      marks.command(token, {
        actor: "alice",
        key: "orphan-delete-1",
        kind: "delete",
        context,
        highlight: receipt.highlight,
        version: 2,
      }),
    { status: 409 },
  );
  assert.deepEqual(marks.command(token, create), receipt);
  store.content = content;
  const deleted = marks.command(token, {
    actor: "alice",
    key: "highlight-delete-1",
    kind: "delete",
    context,
    highlight: receipt.highlight,
    version: 2,
  });
  assert.equal(deleted.version, 3);
  assert.deepEqual(marks.list(token), []);
  assert.deepEqual(
    marks.receipt(token, "highlight-delete-1", context),
    deleted,
  );
  store.setMembership("alice", false);
  assert.throws(() => marks.command(token, create), { status: 403 });
  assert.throws(() => marks.receipt(token, create.key, context), {
    status: 403,
  });
  assert.throws(() => marks.export(token), { status: 403 });
  store.close();
});
test("search and export combine owned marks and visible course contributions without hidden or private leaks", () => {
  const store = new Store(":memory:");
  store.provision(passwords);
  const marks = new HighlightStore(store);
  const alice = store.login("alice", passwords.alice),
    bob = store.login("bob", passwords.bob),
    teacher = store.login("instructor", passwords.instructor);
  marks.command(alice, {
    actor: "alice",
    key: "my-search-mark",
    kind: "create",
    context,
    anchor: passage.anchor,
    text: "Searchable evidence",
    tags: ["evidence"],
  });
  marks.command(bob, {
    actor: "bob",
    key: "bob-secret-mark",
    kind: "create",
    context,
    anchor: passage.anchor,
    text: "private secret",
    tags: ["secret"],
  });
  const thread = store.command(alice, {
    actor: "alice",
    key: "course-question",
    kind: "question",
    context,
    anchor: passage.anchor,
    text: "Course evidence?",
    tags: ["evidence"],
  });
  const reply = store.command(bob, {
    actor: "bob",
    key: "course-reply-1",
    kind: "reply",
    context,
    thread: thread.thread,
    version: 1,
    text: "secret hidden evidence",
  });
  const replyID = store.list(alice)[0].replies[0].id;
  store.command(teacher, {
    actor: "instructor",
    key: "hide-course-reply",
    kind: "hide",
    context,
    thread: thread.thread,
    version: reply.version,
    reply: replyID,
  });
  assert.equal(marks.search(alice, { tag: "evidence" }).highlights.length, 1);
  assert.equal(marks.search(alice, { tag: "evidence" }).threads.length, 1);
  assert.deepEqual(marks.search(alice, { q: "secret" }), {
    highlights: [],
    threads: [],
  });
  assert.equal(marks.search(bob, { scope: "course" }).highlights.length, 0);
  assert.throws(
    () =>
      store.command(bob, {
        actor: "bob",
        key: "tags-unauthorized",
        kind: "tags",
        context,
        thread: thread.thread,
        version: 3,
        tags: ["steal"],
      }),
    { status: 403 },
  );
  store.command(alice, {
    actor: "alice",
    key: "tags-author-edit",
    kind: "tags",
    context,
    thread: thread.thread,
    version: 3,
    tags: ["revised"],
  });
  assert.equal(marks.search(alice, { tag: "revised" }).threads.length, 1);
  const exported = marks.export(alice);
  assert.equal(exported.type, "AnnotationPage");
  assert.equal(exported.items.length, 2);
  assert.ok(!JSON.stringify(exported).includes("private secret"));
  assert.ok(!JSON.stringify(exported).includes("secret hidden"));
  const item = exported.items[0] as any;
  assert.equal(item.type, "Annotation");
  assert.equal(item.target.source, passage.source);
  assert.equal(item.target["sr:anchor"].revision, passage.anchor.revision);
  assert.deepEqual(item.target.selector, {
    type: "TextQuoteSelector",
    exact: passage.text,
    prefix: "",
    suffix: "",
  });
  assert.ok(!JSON.stringify(exported).includes("TextPositionSelector"));
  assert.equal(item["sr:audience"], "private-owner");
  store.close();
});
test("HTTP annotation endpoints enforce session, Origin, filters, receipt scope and revocation", async () => {
  const { createApp } = await import("../src/http.ts");
  const store = new Store(":memory:");
  store.provision(passwords);
  const server = createApp(store, "http://127.0.0.1:4199");
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  const base = `http://127.0.0.1:${port}/social-reading/api`;
  const token = store.login("alice", passwords.alice);
  const headers = {
    cookie: `sr_session=${token}`,
    origin: "http://127.0.0.1:4199",
    "content-type": "application/json",
  };
  try {
    assert.equal((await fetch(base + "/highlights")).status, 401);
    const command = {
      actor: "alice",
      key: "http-highlight-1",
      kind: "create",
      context,
      anchor: passage.anchor,
      text: "HTTP note",
      tags: ["tag"],
    };
    const post = () =>
      fetch(base + "/highlights", {
        method: "POST",
        headers,
        body: JSON.stringify(command),
      });
    const response = await post();
    assert.equal(response.status, 200);
    const receipt = await response.json();
    assert.equal(
      (await (await fetch(base + "/highlights", { headers })).json()).length,
      1,
    );
    const query = new URLSearchParams(context);
    assert.deepEqual(
      await (
        await fetch(base + "/highlight-receipts/" + command.key + "?" + query, {
          headers,
        })
      ).json(),
      receipt,
    );
    assert.equal(
      (
        await fetch(base + "/highlights", {
          headers: { ...headers, origin: "https://evil.example" },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await fetch(base + "/annotation-export", {
          headers: { ...headers, origin: "https://evil.example" },
        })
      ).status,
      403,
    );
    assert.equal(
      (await fetch(base + "/highlights?garbage=x", { headers })).status,
      400,
    );
    assert.equal(
      (
        await fetch(base + "/annotation-search?q=" + "x".repeat(201), {
          headers,
        })
      ).status,
      400,
    );
    const search = await (
      await fetch(base + "/annotation-search?tag=tag", { headers })
    ).json();
    assert.equal(search.highlights.length, 1);
    const exported = await fetch(base + "/annotation-export?scope=mine", {
      headers,
    });
    assert.equal(exported.status, 200);
    assert.equal((await exported.json()).items.length, 1);
    store.setMembership("alice", false);
    for (const path of [
      "/highlights",
      "/annotation-search",
      "/annotation-export",
      "/highlight-receipts/" + command.key + "?" + query,
    ])
      assert.equal((await fetch(base + path, { headers })).status, 403);
    assert.equal((await post()).status, 403);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    store.close();
  }
});
test("page-wide filters include all exact blocks and isolate books, pages and private owners", async () => {
  const { importLibrary, LibraryCatalog } = await import("../src/catalog.ts");
  const catalog = new LibraryCatalog(await importLibrary("fixtures/library"));
  const store = new Store(":memory:", catalog);
  store.provision(passwords);
  const marks = new HighlightStore(store);
  const alice = store.login("alice", passwords.alice);
  const blocks = catalog.page("alpha", "index.html")!.passages;
  for (const [i, p] of blocks.entries()) {
    const c = { book: "alpha", page: "index.html", block: p.block };
    marks.command(alice, {
      actor: "alice",
      key: "alpha-mark-" + i,
      kind: "create",
      context: c,
      anchor: catalog.content(c)!.anchor,
    });
    store.command(alice, {
      actor: "alice",
      key: "alpha-thread-" + i,
      kind: "question",
      context: c,
      anchor: catalog.content(c)!.anchor,
      text: "Alpha " + i,
    });
  }
  const beta = { book: "beta", page: "index.html", block: "p-0" };
  marks.command(alice, {
    actor: "alice",
    key: "beta-mark-1",
    kind: "create",
    context: beta,
    anchor: catalog.content(beta)!.anchor,
  });
  store.command(alice, {
    actor: "alice",
    key: "beta-thread-1",
    kind: "question",
    context: beta,
    anchor: catalog.content(beta)!.anchor,
    text: "Beta",
  });
  const results = marks.search(alice, { book: "alpha", page: "index.html" });
  assert.equal(results.highlights.length, 2);
  assert.equal(results.threads.length, 2);
  assert.equal(
    marks.search(alice, { book: "alpha", page: "missing.html" }).threads.length,
    0,
  );
  assert.equal(
    marks.search(alice, { book: "beta", page: "index.html" }).highlights.length,
    1,
  );
  assert.equal(
    marks.search(alice, {
      book: "alpha",
      page: "index.html",
      block: blocks[1].block,
    }).highlights.length,
    1,
  );
  store.library = undefined;
  assert.ok(
    marks
      .search(alice, { book: "alpha", page: "index.html" })
      .highlights.every((m) => m.orphan),
  );
  assert.equal(
    marks.search(alice, { book: "alpha", page: "index.html" }).threads.length,
    2,
  );
  const exported = marks.export(alice, { book: "alpha", page: "index.html" });
  assert.equal(exported.items.length, 4);
  assert.ok(
    exported.items.every(
      (item: any) =>
        item.target.source === "https://library.libretexts.dev/alpha/",
    ),
  );
  store.close();
});
test("adding personal storage preserves existing questions and original receipts; request keys bind original actor and exact context", () => {
  const store = new Store(":memory:");
  store.provision(passwords);
  const alice = store.login("alice", passwords.alice);
  const question = {
    actor: "alice",
    key: "old-question-key",
    kind: "question" as const,
    anchor: passage.anchor,
    text: "Existing record",
  };
  const original = store.command(alice, question);
  const marks = new HighlightStore(store);
  assert.deepEqual(store.receipt(alice, question.key), original);
  assert.equal(store.list(alice)[0].text, "Existing record");
  assert.equal(store.list(alice)[0].version, 1);
  const create = {
    actor: "alice",
    key: "context-bound-key",
    kind: "create" as const,
    context,
    anchor: passage.anchor,
  };
  const receipt = marks.command(alice, create);
  assert.equal(
    marks.receipt(alice, create.key, { ...context, block: "missing" }),
    null,
  );
  assert.throws(() => marks.command(alice, { ...create, actor: "bob" }), {
    status: 409,
    code: "IDENTITY_CHANGED",
  });
  assert.deepEqual(
    marks.command(alice, {
      anchor: passage.anchor,
      context: { block: context.block, page: context.page, book: context.book },
      kind: "create",
      key: create.key,
      actor: "alice",
    }),
    receipt,
  );
  store.logout(alice);
  assert.throws(() => marks.receipt(alice, create.key, context), {
    status: 401,
  });
  store.close();
});
test("bounded annotation windows refuse partial lists and require narrower source filters", () => {
  const store = new Store(":memory:");
  store.provision(passwords);
  const marks = new HighlightStore(store),
    alice = store.login("alice", passwords.alice);
  for (let i = 0; i < 1001; i++)
    marks.command(alice, {
      actor: "alice",
      key: "bounded-highlight-" + i,
      kind: "create",
      context,
      anchor: passage.anchor,
    });
  assert.throws(() => marks.list(alice), { status: 413 });
  assert.throws(() => marks.export(alice, { scope: "mine" }), { status: 413 });
  assert.deepEqual(marks.list(alice, { book: "absent" }), []);
  assert.equal(marks.list(store.login("bob", passwords.bob)).length, 0);
  store.close();
});
test("portable selectors scope repeated non-BMP quotes to the second paragraph and preserve original UTF-16 range", async () => {
  const { mkdirSync, writeFileSync } = await import("node:fs");
  const { importLibrary, LibraryCatalog } = await import("../src/catalog.ts");
  const dir = mkdtempSync(join(tmpdir(), "sr-unicode-export-"));
  mkdirSync(join(dir, "unicode"));
  writeFileSync(
    join(dir, "unicode", "index.html"),
    '<html><head><title>Unicode</title></head><body><main id="main-content"><p>A 🌱 grows; another 🌱 grows in this synthetic example.</p><section><p>A 🌱 grows; another 🌱 grows in this synthetic example.</p></section></main></body></html>',
  );
  const catalog = new LibraryCatalog(await importLibrary(dir));
  const store = new Store(":memory:", catalog);
  store.provision(passwords);
  const marks = new HighlightStore(store),
    alice = store.login("alice", passwords.alice);
  const c = { book: "unicode", page: "index.html", block: "p-1" };
  const anchor = {
    ...catalog.content(c)!.anchor,
    selector: { start: 20, end: 22, quote: "🌱" },
  };
  marks.command(alice, {
    actor: "alice",
    key: "unicode-highlight-1",
    kind: "create",
    context: c,
    anchor,
    text: "<script>Never execute this</script>",
  });
  const item = marks.export(alice).items[0] as any;
  assert.deepEqual(item.target.selector, {
    type: "XPathSelector",
    value: "(//main[@id='main-content']//p)[2]",
    refinedBy: {
      type: "TextQuoteSelector",
      exact: "🌱",
      prefix: "A 🌱 grows; another ",
      suffix: " grows in this synthetic example.",
    },
  });
  assert.deepEqual(item.target["sr:anchor"], anchor);
  assert.deepEqual(item.target["sr:context"], c);
  assert.equal(item.target.source, "https://library.libretexts.dev/unicode/");
  assert.equal(
    item.target["sr:anchor"].revision,
    catalog.content(c)!.anchor.revision,
  );
  assert.ok(!JSON.stringify(item).includes("TextPositionSelector"));
  assert.equal(
    item.target["sr:rangeBasis"],
    "UTF-16 code units within sr:anchor.quote; end exclusive",
  );
  assert.equal(item.body[0].format, "text/plain");
  assert.equal(item.body[0].value, "<script>Never execute this</script>");
  store.close();
  rmSync(dir, { recursive: true });
});
