import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store, passage } from "../src/store.ts";

test("acknowledged annotation and reply survive reopening the database", () => {
  const dir = mkdtempSync(join(tmpdir(), "social-reading-"));
  const file = join(dir, "test.sqlite");
  let s = new Store(file);
  try {
    s.provision({
      alice: "test-alice-password",
      bob: "test-bob-password",
      instructor: "test-instructor-password",
      outsider: "test-outsider-password",
    });
    const alice = s.login("alice", "test-alice-password");
    const bob = s.login("bob", "test-bob-password");
    const a = s.command(alice, {
      actor: "alice",
      key: "question-0001",
      kind: "question",
      text: "Why does repeatability matter?",
      anchor: passage.anchor,
    });
    s.command(bob, {
      actor: "bob",
      key: "reply-000001",
      kind: "reply",
      thread: a.thread,
      version: 1,
      text: "It lets others check the observation.",
    });
    s.close();
    s = new Store(file);
    const threads = s.list(alice);
    assert.equal(threads.length, 1);
    assert.equal(threads[0].replies.length, 1);
    assert.equal(threads[0].version, 2);
    assert.equal(threads[0].unanswered, false);
  } finally {
    s.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

function fixture() {
  const s = new Store(":memory:");
  s.provision({
    alice: "test-alice-password",
    bob: "test-bob-password",
    instructor: "test-instructor-password",
    outsider: "test-outsider-password",
  });
  return {
    s,
    a: s.login("alice", "test-alice-password"),
    b: s.login("bob", "test-bob-password"),
    i: s.login("instructor", "test-instructor-password"),
    o: s.login("outsider", "test-outsider-password"),
  };
}
test("anonymous, outsider and revoked members cannot read, write or recover receipts", () => {
  const { s, a, o } = fixture();
  try {
    const c = {
      actor: "alice",
      key: "deny-case-001",
      kind: "question" as const,
      text: "Private question",
      anchor: passage.anchor,
    };
    s.command(a, c);
    for (const token of ["", o]) {
      assert.throws(() => s.list(token));
      assert.throws(() => s.command(token, c));
      assert.throws(() => s.receipt(token, c.key));
    }
    s.setMembership("alice", false);
    assert.throws(() => s.list(a));
    assert.throws(() => s.command(a, c));
    assert.throws(() => s.receipt(a, c.key));
  } finally {
    s.close();
  }
});
test("same-key retry recovers one receipt and changed payload is refused", () => {
  const { s, a } = fixture();
  try {
    const c = {
      actor: "alice",
      key: "retry-case-001",
      kind: "question" as const,
      text: "A question",
      anchor: passage.anchor,
    };
    const r = s.command(a, c);
    assert.deepEqual(s.command(a, c), r);
    assert.deepEqual(s.receipt(a, c.key), r);
    assert.equal(s.list(a).length, 1);
    assert.throws(
      () => s.command(a, { ...c, text: "Changed" }),
      /different content/,
    );
  } finally {
    s.close();
  }
});
test("resolution is independent of eligible replies and guarded by actor/version", () => {
  const { s, a, b, i } = fixture();
  try {
    const r = s.command(a, {
      actor: "alice",
      key: "resolve-test-01",
      kind: "question",
      text: "A question",
      anchor: passage.anchor,
    });
    s.command(a, {
      actor: "alice",
      key: "self-reply-001",
      kind: "reply",
      thread: r.thread,
      version: 1,
      text: "My clarification",
    });
    assert.equal(s.list(a)[0].unanswered, true);
    assert.throws(
      () =>
        s.command(b, {
          actor: "bob",
          key: "bad-resolve-01",
          kind: "resolve",
          thread: r.thread,
          version: 2,
        }),
      /Only the author/,
    );
    s.command(i, {
      actor: "instructor",
      key: "good-resolve-1",
      kind: "resolve",
      thread: r.thread,
      version: 2,
    });
    assert.equal(s.list(a)[0].resolved, 1);
    assert.equal(s.list(a)[0].unanswered, true);
    assert.throws(
      () =>
        s.command(b, {
          actor: "bob",
          key: "stale-reply-01",
          kind: "reply",
          thread: r.thread,
          version: 2,
          text: "Stale",
        }),
      /changed/,
    );
    s.command(b, {
      actor: "bob",
      key: "new-reply-0001",
      kind: "reply",
      thread: r.thread,
      version: 3,
      text: "An explanation",
    });
    const reply = s.list(a)[0].replies.find((x) => x.author === "bob")!;
    s.command(i, {
      actor: "instructor",
      key: "hide-reply-001",
      kind: "hide",
      thread: r.thread,
      version: 4,
      reply: reply.id,
    });
    assert.equal(s.list(a)[0].unanswered, true);
    assert.equal(s.list(a)[0].resolved, 1);
    s.command(a, {
      actor: "alice",
      key: "reopen-case-01",
      kind: "reopen",
      thread: r.thread,
      version: 5,
    });
    assert.equal(s.list(a)[0].resolved, 0);
  } finally {
    s.close();
  }
});
test("stale or invented anchor refuses posting without guessed reattachment", () => {
  const { s, a } = fixture();
  try {
    assert.throws(
      () =>
        s.command(a, {
          actor: "alice",
          key: "orphan-test-01",
          kind: "question",
          text: "Lost context",
          anchor: { ...passage.anchor, revision: "old" },
        }),
      /orphaned/,
    );
    assert.equal(s.list(a).length, 0);
  } finally {
    s.close();
  }
});

test("two independent SQLite writers racing one version accept exactly one reply", async () => {
  const { spawn } = await import("node:child_process");
  const dir = mkdtempSync(join(tmpdir(), "social-race-"));
  const file = join(dir, "db.sqlite");
  const s = new Store(file);
  try {
    s.provision({
      alice: "test-alice-password",
      bob: "test-bob-password",
      instructor: "test-instructor-password",
      outsider: "test-outsider-password",
    });
    const a = s.login("alice", "test-alice-password"),
      b = s.login("bob", "test-bob-password");
    const q = s.command(a, {
      actor: "alice",
      kind: "question",
      key: "race-question-1",
      text: "Race question",
      anchor: passage.anchor,
    });
    const run = (key: string) =>
      new Promise<string>((resolve, reject) => {
        const child = spawn(
          process.execPath,
          ["--experimental-strip-types", "test/helpers/race.ts"],
          { stdio: ["pipe", "pipe", "pipe"] },
        );
        let output = "";
        child.stdout.on("data", (chunk) => (output += chunk));
        child.on("error", reject);
        child.on("close", (code) =>
          code === 0
            ? resolve(output.trim())
            : reject(new Error("race worker failed")),
        );
        child.stdin.end(
          JSON.stringify({
            file,
            token: b,
            command: {
              actor: "bob",
              kind: "reply",
              key,
              thread: q.thread,
              version: 1,
              text: "One reply",
            },
          }),
        );
      });
    assert.deepEqual(
      (
        await Promise.all([run("race-reply-0001"), run("race-reply-0002")])
      ).sort(),
      ["accepted", "conflict"],
    );
    assert.equal(s.list(a)[0].replies.length, 1);
  } finally {
    s.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("uncertain command cannot change authors after a different account signs in", () => {
  const { s, a, b } = fixture();
  try {
    const command = {
      actor: "alice",
      kind: "question" as const,
      key: "identity-retry-01",
      text: "Original author only",
      anchor: passage.anchor,
    };
    const r = s.command(a, command);
    assert.equal(s.receipt(b, command.key), null);
    assert.throws(() => s.command(b, command), /identity changed/);
    assert.deepEqual(s.command(a, command), r);
    assert.equal(s.list(a).length, 1);
  } finally {
    s.close();
  }
});

test("provisioning rejects passwords that login cannot accept and rolls back the fixture", () => {
  const s = new Store(":memory:");
  try {
    assert.throws(
      () =>
        s.provision({
          alice: "a".repeat(257),
          bob: "test-bob-password",
          instructor: "test-instructor-password",
          outsider: "test-outsider-password",
        }),
      /256/,
    );
    s.provision({
      alice: "test-alice-password",
      bob: "test-bob-password",
      instructor: "test-instructor-password",
      outsider: "test-outsider-password",
    });
    assert.ok(s.login("alice", "test-alice-password"));
  } finally {
    s.close();
  }
});
