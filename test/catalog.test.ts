import { test } from "node:test";
import assert from "node:assert/strict";
import { importLibrary, LibraryCatalog } from "../src/catalog.ts";
test("imports exact book/page/passage identities and reports unsupported markup", async () => {
  const data = await importLibrary("fixtures/library");
  const catalog = new LibraryCatalog(data);
  assert.deepEqual(
    catalog.books().map((b) => b.key),
    ["alpha", "beta"],
  );
  const pages = catalog.pages("alpha");
  assert.equal(pages.length, 1);
  const page = catalog.page("alpha", "index.html")!;
  assert.equal(page.passages.length, 2);
  assert.equal(page.skipped, 1);
  assert.equal(
    page.passages[0].quote,
    "This invented passage describes a synthetic cell for testing.",
  );
  assert.equal(page.passages[0].block, "p-0");
  assert.equal(page.source, "https://library.libretexts.dev/alpha/");
  assert.equal(catalog.page("beta", "../alpha/index.html"), undefined);
});

test("private discussions remain isolated by book/page/passage and old fixture records survive", async () => {
  const { Store, passage } = await import("../src/store.ts");
  const catalog = new LibraryCatalog(await importLibrary("fixtures/library"));
  const s = new Store(":memory:", catalog);
  try {
    s.provision({
      alice: "test-alice-password",
      bob: "test-bob-password",
      instructor: "test-instructor-password",
      outsider: "test-outsider-password",
    });
    const a = s.login("alice", "test-alice-password"),
      b = s.login("bob", "test-bob-password"),
      o = s.login("outsider", "test-outsider-password");
    const alpha = { book: "alpha", page: "index.html", block: "p-0" },
      beta = { book: "beta", page: "index.html", block: "p-0" };
    const q = s.command(a, {
      actor: "alice",
      key: "alpha-question-1",
      kind: "question",
      context: alpha,
      anchor: catalog.content(alpha)!.anchor,
      text: "Alpha question",
    });
    assert.equal(s.list(a, alpha).length, 1);
    assert.equal(s.list(a, beta).length, 0);
    assert.throws(
      () =>
        s.command(b, {
          actor: "bob",
          key: "cross-book-0001",
          kind: "reply",
          context: beta,
          thread: q.thread,
          version: 1,
          text: "Wrong context",
        }),
      /unavailable/,
    );
    assert.throws(() => s.list(o, alpha));
    s.command(b, {
      actor: "bob",
      key: "alpha-reply-01",
      kind: "reply",
      context: alpha,
      thread: q.thread,
      version: 1,
      text: "Alpha reply",
    });
    assert.equal(s.list(a, alpha)[0].replies.length, 1);
    assert.equal(s.receipt(a, "alpha-question-1", beta), null);
    s.command(a, {
      actor: "alice",
      key: "legacy-question1",
      kind: "question",
      anchor: passage.anchor,
      text: "Original fixture",
    });
    assert.equal(s.list(a).length, 1);
    assert.equal(s.list(a, alpha).length, 1);
  } finally {
    s.close();
  }
});

test("changed revisions retain original quotes as orphans and refuse new writes", async () => {
  const { mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { Store } = await import("../src/store.ts");
  const dir = mkdtempSync(join(tmpdir(), "library-orphan-")),
    file = join(dir, "db.sqlite");
  const data = await importLibrary("fixtures/library");
  let s = new Store(file, new LibraryCatalog(data));
  try {
    s.provision({
      alice: "test-alice-password",
      bob: "test-bob-password",
      instructor: "test-instructor-password",
      outsider: "test-outsider-password",
    });
    const token = s.login("alice", "test-alice-password"),
      context = { book: "alpha", page: "index.html", block: "p-0" };
    const oldAnchor = s.content(context)!.anchor;
    const q = s.command(token, {
      actor: "alice",
      key: "orphan-library-1",
      kind: "question",
      context,
      anchor: oldAnchor,
      text: "Keep this original context",
    });
    s.close();
    data.books[0].pages[0].revision = "f".repeat(64);
    data.books[0].pages[0].passages[0].quote =
      "A changed synthetic source passage.";
    s = new Store(file, new LibraryCatalog(data));
    const thread = s.list(token, context)[0];
    assert.equal(thread.orphan, true);
    assert.deepEqual(thread.anchor, oldAnchor);
    assert.throws(
      () =>
        s.command(token, {
          actor: "alice",
          key: "orphan-write-01",
          kind: "reply",
          context,
          thread: q.thread,
          version: 1,
          text: "Refuse orphan",
        }),
      /orphaned/,
    );
  } finally {
    s.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("catalog bytes must match the deployment digest", async () => {
  const { loadLibrary } = await import("../src/catalog.ts");
  const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { createHash } = await import("node:crypto");
  const dir = mkdtempSync(join(tmpdir(), "catalog-pin-")),
    file = join(dir, "catalog.json");
  try {
    const raw = JSON.stringify(await importLibrary("fixtures/library"));
    writeFileSync(file, raw);
    const pin = createHash("sha256").update(raw).digest("hex");
    assert.equal(loadLibrary(file, pin).books().length, 2);
    writeFileSync(file, raw + " ");
    assert.throws(() => loadLibrary(file, pin), /digest mismatch/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("explicit hidden descendants are not flattened into offered quotations", async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import(
    "node:fs"
  );
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "hidden-book-"));
  try {
    mkdirSync(join(dir, "book"));
    writeFileSync(
      join(dir, "book/index.html"),
      '<title>Hidden fixture</title><main id="main-content"><p>A visible prefix <span hidden>hidden material</span> should not be flattened.</p><p hidden>Another hidden paragraph should not be offered.</p><p>This visible synthetic paragraph is available for annotation.</p></main>',
    );
    const d = await importLibrary(dir);
    assert.equal(d.books[0].pages[0].passages.length, 1);
    assert.equal(d.books[0].pages[0].skipped, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("special Books entry cannot follow a directory symlink outside the mirror", async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } =
    await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "catalog-link-"));
  try {
    mkdirSync(join(dir, "root"));
    mkdirSync(join(dir, "outside/book"), { recursive: true });
    writeFileSync(
      join(dir, "outside/book/index.html"),
      '<title>Outside</title><main id="main-content"><p>Outside fixture must never enter the catalog.</p></main>',
    );
    symlinkSync(join(dir, "outside"), join(dir, "root/Books"), "dir");
    await assert.rejects(importLibrary(join(dir, "root")), /symbolic|symlink/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("HTML line breaks retain normalized word boundaries in exact quotations", async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import(
    "node:fs"
  );
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "catalog-break-"));
  try {
    mkdirSync(join(dir, "book"));
    writeFileSync(
      join(dir, "book/index.html"),
      '<title>Breaks</title><main id="main-content"><p>First sentence.<br>Second sentence.</p></main>',
    );
    const d = await importLibrary(dir);
    assert.equal(
      d.books[0].pages[0].passages[0].quote,
      "First sentence. Second sentence.",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("publisher parity fixtures and external hooks preserve exact manifest identities", async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } =
    await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const fixtures = JSON.parse(
    readFileSync("fixtures/normalization.json", "utf8"),
  );
  const dir = mkdtempSync(join(tmpdir(), "manifest-parity-"));
  try {
    mkdirSync(join(dir, "book"));
    const main =
      '<main id="main-content">' +
      fixtures.map((f: { html: string }) => f.html).join("") +
      "</main>";
    writeFileSync(join(dir, "book/index.html"), main);
    const before = new LibraryCatalog(await importLibrary(dir));
    const manifest = before.manifest("book", "index.html")!;
    assert.deepEqual(
      manifest.blocks.map((b) => b.quote),
      fixtures.map((f: { quote: string }) => f.quote),
    );
    assert.equal(manifest.blocks[2].block, "p-2");
    assert.equal(manifest.schema, "social-reading-page-v1");
    assert.equal(Object.hasOwn(manifest, "sourceSha256"), false);
    writeFileSync(
      join(dir, "book/index.html"),
      main +
        '<script type="application/json" id="sr-manifest">' +
        JSON.stringify(manifest) +
        '</script><aside id="sr-panel"></aside>',
    );
    const after = new LibraryCatalog(await importLibrary(dir));
    assert.deepEqual(after.manifest("book", "index.html"), manifest);
    assert.notEqual(
      after.page("book", "index.html")!.sourceSha256,
      before.page("book", "index.html")!.sourceSha256,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("returned page cannot change the pinned quotation or manifest", async () => {
  const c = new LibraryCatalog(await importLibrary("fixtures/library"));
  const context = { book: "alpha", page: "index.html", block: "p-0" };
  const original = c.content(context)!;
  const manifest = c.manifest("alpha", "index.html");
  c.page("alpha", "index.html")!.passages[0].quote = "Tampered text";
  assert.deepEqual(c.content(context), original);
  assert.deepEqual(c.manifest("alpha", "index.html"), manifest);
});

test("hidden ancestor above main excludes its paragraph", async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import(
    "node:fs"
  );
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "above-main-"));
  try {
    mkdirSync(join(dir, "book"));
    writeFileSync(
      join(dir, "book/index.html"),
      '<div hidden><main id="main-content"><p>A sufficiently long hidden paragraph.</p></main></div>',
    );
    const data = await importLibrary(dir);
    assert.equal(data.books[0].pages[0].passages.length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("catalog serialization refuses UTF-8 bytes exceeding the loader admission limit", async () => {
  const { serializeLibrary } = await import("../src/catalog.ts");
  const data = await importLibrary("fixtures/library");
  const page = data.books[0].pages[0];
  data.books = [
    {
      key: "alpha",
      title: "Large synthetic catalog",
      pages: Array.from({ length: 300 }, (_, i) => ({
        ...page,
        id: `page-${i}/index.html`,
        source: `https://library.libretexts.dev/alpha/page-${i}/`,
        passages: Array.from({ length: 30 }, (_, j) => ({
          block: `p-${j}`,
          quote: "字".repeat(3900),
        })),
      })),
    },
  ];
  new LibraryCatalog(data);
  assert.throws(() => serializeLibrary(data), /loader byte limit/);
});
