import { test } from "node:test";
import assert from "node:assert/strict";
import { Store, passage } from "../src/store.ts";
import { HighlightStore } from "../src/highlights.ts";
import { displayName } from "../src/display-name.ts";

const passwords = {
  alice: "test-alice-password",
  bob: "test-bob-password",
  instructor: "test-instructor-password",
  outsider: "test-outsider-password",
};

// Databases provisioned before LT-561 hold these exact names; provisioning skips existing users.
const legacy: Record<string, string> = {
  alice: "Alex · demo learner",
  bob: "Sam · demo learner",
  instructor: "Morgan · demo instructor",
  outsider: "Outside participant · demo",
};

function legacyStore() {
  const s = new Store(":memory:");
  s.provision(passwords);
  for (const [id, name] of Object.entries(legacy))
    s.db.prepare("UPDATE users SET name=? WHERE id=?").run(name, id);
  return s;
}

test("displayName strips only the exact legacy seeded qualifier for the exact account", () => {
  assert.equal(displayName("alice", "Alex · demo learner"), "Alex");
  assert.equal(displayName("bob", "Sam · demo learner"), "Sam");
  assert.equal(displayName("instructor", "Morgan · demo instructor"), "Morgan");
  assert.equal(
    displayName("outsider", "Outside participant · demo"),
    "Outside participant",
  );
  // Same suffix on another account, or a renamed seeded account, is left alone.
  assert.equal(
    displayName("carol", "Carol · demo learner"),
    "Carol · demo learner",
  );
  assert.equal(
    displayName("bob", "Alex · demo learner"),
    "Alex · demo learner",
  );
  assert.equal(
    displayName("alice", "Alexis · demo learner"),
    "Alexis · demo learner",
  );
  assert.equal(displayName("alice", "Alex"), "Alex");
});

test("fresh provisioning stores clean seeded names", () => {
  const s = new Store(":memory:");
  s.provision(passwords);
  const rows = s.db.prepare("SELECT id,name FROM users ORDER BY id").all();
  assert.deepEqual(
    rows.map((r) => ({ ...r })),
    [
      { id: "alice", name: "Alex" },
      { id: "bob", name: "Sam" },
      { id: "instructor", name: "Morgan" },
      { id: "outsider", name: "Outside participant" },
    ],
  );
  s.close();
});

test("legacy seeded records render clean in session, threads, replies and history without writes", () => {
  const s = legacyStore();
  const highlights = new HighlightStore(s);
  try {
    const a = s.login("alice", passwords.alice);
    const b = s.login("bob", passwords.bob);
    const m = s.login("instructor", passwords.instructor);
    const o = s.login("outsider", passwords.outsider);

    const session = s.session(a);
    assert.equal(session.name, "Alex");
    assert.equal(session.id, "alice");
    assert.equal(session.role, "learner");
    assert.equal(session.member, 1);
    assert.equal(s.extendSession(m, "instructor").name, "Morgan");
    assert.equal(s.extendSession(m, "instructor").role, "instructor");
    // Outsider is still refused; the display change does not grant membership.
    assert.throws(() => s.session(o), { status: 403 });

    const q = s.command(a, {
      actor: "alice",
      key: "question-0001",
      kind: "question",
      text: "Why does repeatability matter?",
      anchor: passage.anchor,
    });
    s.command(b, {
      actor: "bob",
      key: "reply-000001",
      kind: "reply",
      thread: q.thread,
      version: 1,
      text: "It lets others check.",
    });
    s.command(m, {
      actor: "instructor",
      key: "resolve-0001",
      kind: "resolve",
      thread: q.thread,
      version: 2,
    });

    const [t] = s.list(b);
    assert.equal(t.author, "alice");
    assert.equal(t.name, "Alex");
    assert.deepEqual(
      t.replies.map((r) => [r.author, r.name]),
      [["bob", "Sam"]],
    );
    assert.deepEqual(
      t.history.map((h) => ({ ...h })),
      [{ kind: "resolve", created: t.history[0].created, name: "Morgan" }],
    );
    assert.equal(t.canResolve, false);
    assert.equal(s.list(m)[0].canResolve, true);

    // Search by the clean display name finds the thread; export still carries ids only.
    const found = highlights.search(a, { author: "Sam" });
    assert.equal(found.threads.length, 1);
    const exported = JSON.stringify(highlights.export(a));
    assert.ok(!exported.includes("· demo"));
    assert.ok(exported.includes('"creator":"alice"'));

    // Stored data is untouched.
    const stored = s.db.prepare("SELECT id,name FROM users").all() as {
      id: string;
      name: string;
    }[];
    for (const r of stored) assert.equal(r.name, legacy[r.id]);
  } finally {
    s.close();
  }
});

test("custom names sharing the demo suffix are preserved everywhere", () => {
  const s = legacyStore();
  try {
    s.db
      .prepare("UPDATE users SET name=? WHERE id=?")
      .run("Alexis · demo learner", "alice");
    s.db
      .prepare("UPDATE users SET name=? WHERE id=?")
      .run("Alex · demo learner", "bob");
    const a = s.login("alice", passwords.alice);
    const b = s.login("bob", passwords.bob);
    assert.equal(s.session(a).name, "Alexis · demo learner");
    assert.equal(s.session(b).name, "Alex · demo learner");
    const q = s.command(a, {
      actor: "alice",
      key: "question-0002",
      kind: "question",
      text: "Custom names?",
      anchor: passage.anchor,
    });
    s.command(b, {
      actor: "bob",
      key: "reply-000002",
      kind: "reply",
      thread: q.thread,
      version: 1,
      text: "Kept.",
    });
    const [t] = s.list(a);
    assert.equal(t.name, "Alexis · demo learner");
    assert.equal(t.replies[0].name, "Alex · demo learner");
  } finally {
    s.close();
  }
});
