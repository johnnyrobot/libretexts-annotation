import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../src/store.ts";
import { LibraryCatalog, importLibrary } from "../src/catalog.ts";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("substring anchors preserve whole-block records, receipts and replies across reopening", async () => {
  const data = await importLibrary("fixtures/library");
  data.books[0].pages[0].passages[0].quote = "A cell 🧬 has a membrane.";
  const library = new LibraryCatalog(data);
  const dir = mkdtempSync(join(tmpdir(), "sr-selector-"));
  const file = join(dir, "db.sqlite");
  let s = new Store(file, library);
  try {
    s.provision({
      alice: "test-alice-password",
      bob: "test-bob-password",
      instructor: "test-instructor-password",
      outsider: "test-outsider-password",
    });
    const token = s.login("alice", "test-alice-password");
    const context = { book: "alpha", page: "index.html", block: "p-0" };
    const anchor = s.content(context)!.anchor;
    s.command(token, {
      actor: "alice",
      key: "whole-block-001",
      kind: "question",
      context,
      anchor,
      text: "Whole block",
    });
    const selected = { ...anchor, selector: { start: 7, end: 9, quote: "🧬" } };
    const command = {
      actor: "alice",
      key: "substring-0001",
      kind: "question" as const,
      context,
      anchor: selected,
      text: "Selected symbol",
    };
    const receipt = s.command(token, command);
    assert.deepEqual(s.command(token, command), receipt);
    s.close();
    s = new Store(file, library);
    const rows = s.list(token, context);
    assert.equal(rows.length, 2);
    assert.ok(rows.every((r) => !r.orphan));
    assert.deepEqual(
      rows.find((r) => r.id === receipt.thread)!.anchor,
      selected,
    );
    s.command(s.login("bob", "test-bob-password"), {
      actor: "bob",
      key: "substring-reply",
      kind: "reply",
      context,
      thread: receipt.thread,
      version: 1,
      text: "Reply after reopening",
    });
    assert.deepEqual(s.receipt(token, command.key, context), receipt);
    for (const selector of [
      null,
      {},
      { start: 8, end: 9, quote: "\uddec" },
      { start: 7, end: 8, quote: "\ud83e" },
      { start: -1, end: 1, quote: "A" },
      { start: 0, end: 0, quote: "" },
      { start: 0, end: 100, quote: "A" },
      { start: 0.5, end: 1, quote: "A" },
      { start: 0, end: 1, quote: "B" },
      { start: 0, end: 1, quote: "A", extra: true },
    ]) {
      assert.throws(
        () =>
          s.command(token, {
            ...command,
            key: "bad-selection-1",
            anchor: { ...anchor, selector },
          }),
        /anchor|selector/i,
      );
    }
    assert.equal(s.list(token, context).length, 2);
  } finally {
    s.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
