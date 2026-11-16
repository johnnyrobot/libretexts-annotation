import { annotationTags } from "./annotation-tags.ts";
import { displayName } from "./display-name.ts";
import { matchesAnchor } from "../public/anchor.mjs";
import { DatabaseSync } from "node:sqlite";
import { LibraryCatalog, type Selection } from "./catalog.ts";
import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
  randomUUID,
} from "node:crypto";
import { readFileSync } from "node:fs";

export const digest = (v: string) =>
  createHash("sha256").update(v).digest("hex");
const sourceBytes = readFileSync(
  new URL("../fixtures/passage.json", import.meta.url),
  "utf8",
);
const sourcePin = readFileSync(
  new URL("../fixtures/passage.sha256", import.meta.url),
  "utf8",
).split(" ")[0];
if (digest(sourceBytes) !== sourcePin)
  throw new Error("Pinned excerpt changed; startup refused.");
const content = JSON.parse(sourceBytes);
export const passage = {
  ...content,
  anchor: {
    revision: digest(content.text),
    block: "scientific-method-p1",
    quote: content.text,
  },
};
export class Problem extends Error {
  status: number;
  code: string;
  fieldErrors?: Record<string, string>;
  constructor(
    status: number,
    message: string,
    code = "REQUEST_FAILED",
    fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}
const fail = (
  status: number,
  message: string,
  code = "REQUEST_FAILED",
  fieldErrors?: Record<string, string>,
): never => {
  throw new Problem(status, message, code, fieldErrors);
};
type User = { id: string; name: string; role: string; member: number };
type Thread = {
  id: string;
  author: string;
  text: string;
  anchor: string;
  version: number;
  resolved: number;
  created: string;
};
export type Command = {
  actor: string;
  key: string;
  kind: "question" | "reply" | "resolve" | "reopen" | "hide" | "tags";
  text?: string;
  anchor?: unknown;
  thread?: string;
  version?: number;
  reply?: string;
  context?: Selection;
  tags?: string[];
};
export class Store {
  db: DatabaseSync;
  library?: LibraryCatalog;
  constructor(file: string, library?: LibraryCatalog) {
    this.library = library;
    this.db = new DatabaseSync(file);
    this.db
      .exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
   CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT NOT NULL,role TEXT NOT NULL,member INTEGER NOT NULL,salt TEXT NOT NULL,password TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,actor TEXT NOT NULL REFERENCES users(id),expires INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS threads(id TEXT PRIMARY KEY,author TEXT NOT NULL REFERENCES users(id),text TEXT NOT NULL,anchor TEXT NOT NULL,version INTEGER NOT NULL,resolved INTEGER NOT NULL,created TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS replies(id TEXT PRIMARY KEY,thread TEXT NOT NULL REFERENCES threads(id),author TEXT NOT NULL REFERENCES users(id),text TEXT NOT NULL,hidden INTEGER NOT NULL DEFAULT 0,created TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS receipts(actor TEXT NOT NULL,key TEXT NOT NULL,payload TEXT NOT NULL,result TEXT NOT NULL,PRIMARY KEY(actor,key));
   CREATE TABLE IF NOT EXISTS thread_sources(thread TEXT PRIMARY KEY REFERENCES threads(id),source TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS thread_tags(thread TEXT PRIMARY KEY REFERENCES threads(id),tags TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY,actor TEXT NOT NULL,kind TEXT NOT NULL,thread TEXT,version INTEGER,created TEXT NOT NULL);
  `);
  }
  close() {
    this.db.close();
  }
  provision(passwords: Record<string, string>) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      for (const [id, name, role, member] of [
        ["alice", "Alex", "learner", 1],
        ["bob", "Sam", "learner", 1],
        ["instructor", "Morgan", "instructor", 1],
        ["outsider", "Outside participant", "learner", 0],
      ] as const) {
        if (this.db.prepare("SELECT id FROM users WHERE id=?").get(id))
          continue;
        const password = passwords[id];
        if (
          typeof password !== "string" ||
          password.length < 16 ||
          password.length > 256
        )
          fail(
            400,
            "Provisioning requires a password of 16 to 256 characters.",
          );
        const salt = randomBytes(16).toString("hex");
        this.db
          .prepare("INSERT INTO users VALUES(?,?,?,?,?,?)")
          .run(
            id,
            name,
            role,
            member,
            salt,
            scryptSync(password, salt, 64).toString("hex"),
          );
      }
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  login(id: string, password: string) {
    if (
      typeof id !== "string" ||
      typeof password !== "string" ||
      password.length > 256
    )
      return fail(401, "Sign-in failed.");
    const row = this.db.prepare("SELECT * FROM users WHERE id=?").get(id) as
      (User & { salt: string; password: string }) | undefined;
    const actual = scryptSync(password, row?.salt ?? "dummy-salt", 64);
    if (!row || !timingSafeEqual(actual, Buffer.from(row.password, "hex")))
      return fail(401, "Sign-in failed.");
    const token = randomBytes(32).toString("hex");
    this.db
      .prepare("INSERT INTO sessions VALUES(?,?,?)")
      .run(digest(token), id, Date.now() + 8 * 60 * 60 * 1000);
    return token;
  }
  logout(token: string) {
    this.db.prepare("DELETE FROM sessions WHERE token=?").run(digest(token));
  }
  actor(token: string): User {
    const row = this.db
      .prepare(
        "SELECT u.id,u.name,u.role,u.member FROM sessions s JOIN users u ON u.id=s.actor WHERE s.token=? AND s.expires>?",
      )
      .get(digest(token), Date.now()) as User | undefined;
    if (!row) return fail(401, "Sign in to view private discussion.");
    if (!row.member)
      return fail(403, "This account cannot access this demo course.");
    return { ...row, name: displayName(row.id, row.name) };
  }
  session(token: string) {
    const actor = this.actor(token);
    const row = this.db
      .prepare("SELECT expires FROM sessions WHERE token=?")
      .get(digest(token)) as { expires: number };
    return {
      ...actor,
      timing: {
        serverNow: Date.now(),
        expiresAt: row.expires,
        warningSeconds: 300,
        extensionSeconds: 28800,
        canExtend: true,
      },
    };
  }
  extendSession(token: string, expectedActor: unknown) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const actor = this.actor(token);
      if (expectedActor !== actor.id)
        fail(
          409,
          "Your signed-in identity changed. Return to the original account before extending.",
          "IDENTITY_CHANGED",
        );
      this.db
        .prepare("UPDATE sessions SET expires=? WHERE token=?")
        .run(Date.now() + 28800000, digest(token));
      const result = this.session(token);
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  selection(value?: Selection): Selection {
    if (value === undefined)
      return {
        book: "__sample__",
        page: "scientific-method",
        block: "scientific-method-p1",
      };
    if (
      !value ||
      typeof value !== "object" ||
      Object.keys(value).some((k) => !["book", "page", "block"].includes(k)) ||
      typeof value.book !== "string" ||
      !value.book ||
      value.book.length > 2000 ||
      typeof value.page !== "string" ||
      !value.page ||
      value.page.length > 2000 ||
      typeof value.block !== "string" ||
      value.block.length > 2000
    )
      fail(400, "Invalid passage context.");
    return value;
  }
  private binding(anchor: Record<string, unknown>): Selection {
    return {
      book: typeof anchor.book === "string" ? anchor.book : "__sample__",
      page: typeof anchor.page === "string" ? anchor.page : "scientific-method",
      block: typeof anchor.block === "string" ? anchor.block : "",
    };
  }
  private sameContext(anchor: Record<string, unknown>, context: Selection) {
    const b = this.binding(anchor);
    return (
      b.book === context.book &&
      b.page === context.page &&
      b.block === context.block
    );
  }
  content(context?: Selection) {
    const c = this.selection(context);
    if (
      c.book === "__sample__" &&
      c.page === "scientific-method" &&
      c.block === "scientific-method-p1"
    )
      return passage;
    return this.library?.content(c);
  }
  private currentAnchor(anchor: Record<string, unknown>) {
    const content = this.content(this.binding(anchor));
    return content !== undefined && matchesAnchor(anchor, content.anchor);
  }
  books() {
    const books = (this.library?.books() ?? []).map((b) => {
      const pages = this.library!.pages(b.key);
      const preferred =
        pages.find(
          (p) =>
            p.passageCount > 0 &&
            p.id !== "index.html" &&
            !p.id.startsWith("00") &&
            !p.id.toLowerCase().includes("front_matter"),
        ) ??
        pages.find((p) => p.passageCount > 0) ??
        pages[0];
      return { ...b, defaultPage: preferred?.id };
    });
    const biology = books.findIndex((b) => b.key === "biology");
    if (biology > 0) books.unshift(books.splice(biology, 1)[0]);
    return [
      ...books,
      {
        key: "__sample__",
        title: "Original sample excerpt",
        pageCount: 1,
        defaultPage: "scientific-method",
      },
    ];
  }
  pages(book: string) {
    if (book === "__sample__")
      return [
        {
          id: "scientific-method",
          title: passage.title,
          source: passage.source,
          revision: passage.anchor.revision,
          passageCount: 1,
          skipped: 0,
        },
      ];
    return this.library?.pages(book) ?? [];
  }
  page(book: string, page: string) {
    if (book === "__sample__" && page === "scientific-method")
      return {
        ...this.pages(book)[0],
        passages: [{ block: passage.anchor.block, quote: passage.text }],
      };
    return this.library?.page(book, page);
  }
  list(token: string, selection?: Selection) {
    const actor = this.actor(token);
    const context = this.selection(selection);
    const rows = this.db
      .prepare("SELECT * FROM threads ORDER BY created,id")
      .all() as Thread[];
    return rows
      .filter((t) => {
        const anchor = JSON.parse(t.anchor);
        const b = this.binding(anchor);
        return (
          b.book === context.book &&
          b.page === context.page &&
          (b.block === context.block || !this.currentAnchor(anchor))
        );
      })
      .map((t) => {
        const replies = this.db
          .prepare(
            "SELECT r.id,r.author,u.name,r.text,r.created FROM replies r JOIN users u ON u.id=r.author WHERE r.thread=? AND r.hidden=0 ORDER BY r.created,r.id",
          )
          .all(t.id) as {
          id: string;
          author: string;
          name: string;
          text: string;
          created: string;
        }[];
        for (const r of replies) r.name = displayName(r.author, r.name);
        const author = this.db
          .prepare("SELECT name FROM users WHERE id=?")
          .get(t.author) as { name: string };
        const history = (
          this.db
            .prepare(
              "SELECT e.kind,e.created,u.name,e.actor FROM events e JOIN users u ON u.id=e.actor WHERE e.thread=? AND e.kind IN ('resolve','reopen') ORDER BY e.id",
            )
            .all(t.id) as {
            kind: string;
            created: string;
            name: string;
            actor: string;
          }[]
        ).map(({ kind, created, name, actor }) => ({
          kind,
          created,
          name: displayName(actor, name),
        }));
        return {
          ...t,
          history,
          tags: JSON.parse(
            (
              this.db
                .prepare("SELECT tags FROM thread_tags WHERE thread=?")
                .get(t.id) as { tags: string } | undefined
            )?.tags ?? "[]",
          ) as string[],
          anchor: JSON.parse(t.anchor),
          name: displayName(t.author, author.name),
          replies,
          unanswered: !replies.some((r) => r.author !== t.author),
          orphan: !this.currentAnchor(JSON.parse(t.anchor)),
          canResolve: actor.id === t.author || actor.role === "instructor",
        };
      });
  }
  receipt(token: string, key: string, selection?: Selection) {
    const actor = this.actor(token);
    const row = this.db
      .prepare("SELECT result FROM receipts WHERE actor=? AND key=?")
      .get(actor.id, key) as { result: string } | undefined;
    if (!row) return null;
    const result = JSON.parse(row.result);
    const thread = this.db
      .prepare("SELECT anchor FROM threads WHERE id=?")
      .get(result.thread) as { anchor: string } | undefined;
    return thread &&
      this.sameContext(JSON.parse(thread.anchor), this.selection(selection))
      ? result
      : null;
  }
  command(
    token: string,
    c: Command,
  ): { thread: string; version: number; key: string } {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const actor = this.actor(token);
      if (c?.actor !== actor.id)
        fail(
          409,
          "Your signed-in identity changed. Return to the original account before reconciling.",
          "IDENTITY_CHANGED",
        );
      if (
        !c ||
        typeof c.key !== "string" ||
        !/^[a-zA-Z0-9-]{8,100}$/.test(c.key)
      )
        fail(400, "A valid request key is required.");
      const allowed = [
        "actor",
        "context",
        "key",
        "kind",
        "text",
        "anchor",
        "thread",
        "version",
        "reply",
        "tags",
      ];
      if (Object.keys(c).some((k) => !allowed.includes(k)))
        fail(400, "Unknown command field.");
      const payload = JSON.stringify(
        Object.fromEntries(
          Object.entries(c).sort(([a], [b]) => a.localeCompare(b)),
        ),
      );
      const previous = this.db
        .prepare("SELECT payload,result FROM receipts WHERE actor=? AND key=?")
        .get(actor.id, c.key) as
        { payload: string; result: string } | undefined;
      if (previous) {
        if (previous.payload !== payload)
          fail(409, "This request key already belongs to different content.");
        this.db.exec("COMMIT");
        return JSON.parse(previous.result);
      }
      const tags = c.tags === undefined ? undefined : annotationTags(c.tags);
      if (tags !== undefined && c.kind !== "question" && c.kind !== "tags")
        fail(400, "Tags require a question or tags command.");
      if (c.kind === "tags" && tags === undefined)
        fail(400, "Tags are required.");
      const context = this.selection(c.context);
      const now = new Date().toISOString();
      let id = c.thread ?? randomUUID();
      let version = 1;
      if (c.kind === "question" || c.kind === "reply") {
        if (
          typeof c.text !== "string" ||
          !c.text.trim() ||
          c.text.length > 4000
        )
          fail(
            400,
            "Write between 1 and 4000 characters.",
            "VALIDATION_FAILED",
            { text: "Enter between 1 and 4000 characters." },
          );
      }
      if (c.kind === "question") {
        const content = this.content(context);
        if (!content || !matchesAnchor(c.anchor, content.anchor))
          fail(
            409,
            "This passage anchor is orphaned. Return to the pinned reading; nothing was posted.",
          );
        id = randomUUID();
        this.db
          .prepare("INSERT INTO threads VALUES(?,?,?,?,1,0,?)")
          .run(id, actor.id, c.text!.trim(), JSON.stringify(c.anchor), now);
        this.db
          .prepare("INSERT INTO thread_sources(thread,source) VALUES(?,?)")
          .run(id, content!.source);
      } else {
        if (typeof c.thread !== "string") fail(400, "A thread is required.");
        const t = this.db
          .prepare("SELECT * FROM threads WHERE id=?")
          .get(id) as Thread | undefined;
        if (!t || !this.sameContext(JSON.parse(t.anchor), context))
          fail(404, "Thread unavailable in this passage.");
        if (!Number.isSafeInteger(c.version) || c.version !== t!.version)
          fail(
            409,
            "This thread changed. Refresh and review before trying again.",
          );
        if (!this.currentAnchor(JSON.parse(t!.anchor)))
          fail(
            409,
            "This anchor is orphaned. Posting is unavailable; original context is preserved.",
          );
        version = t!.version + 1;
        if (c.kind === "reply")
          this.db
            .prepare("INSERT INTO replies VALUES(?,?,?,?,0,?)")
            .run(randomUUID(), id, actor.id, c.text!.trim(), now);
        else if (c.kind === "resolve" || c.kind === "reopen") {
          if (actor.id !== t!.author && actor.role !== "instructor")
            fail(403, "Only the author or instructor can resolve or reopen.");
          this.db
            .prepare("UPDATE threads SET resolved=? WHERE id=?")
            .run(c.kind === "resolve" ? 1 : 0, id);
        } else if (c.kind === "tags") {
          if (actor.id !== t!.author && actor.role !== "instructor")
            fail(403, "Only the author or instructor can change topic tags.");
        } else if (c.kind === "hide") {
          if (actor.role !== "instructor")
            fail(403, "Only the instructor can hide a reply.");
          if (typeof c.reply !== "string") fail(400, "A reply is required.");
          const result = this.db
            .prepare(
              "UPDATE replies SET hidden=1 WHERE id=? AND thread=? AND hidden=0",
            )
            .run(c.reply!, id);
          if (!result.changes) fail(404, "Reply unavailable.");
        } else fail(400, "Unsupported command.");
        this.db
          .prepare("UPDATE threads SET version=? WHERE id=?")
          .run(version, id);
      }
      if (tags !== undefined)
        this.db
          .prepare(
            "INSERT INTO thread_tags(thread,tags) VALUES(?,?) ON CONFLICT(thread) DO UPDATE SET tags=excluded.tags",
          )
          .run(id, JSON.stringify(tags));
      const result = { thread: id, version, key: c.key };
      this.db
        .prepare("INSERT INTO receipts VALUES(?,?,?,?)")
        .run(actor.id, c.key, payload, JSON.stringify(result));
      this.db
        .prepare(
          "INSERT INTO events(actor,kind,thread,version,created) VALUES(?,?,?,?,?)",
        )
        .run(actor.id, c.kind, id, version, now);
      this.db.exec("COMMIT");
      return result;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  /** Operator-only local command; no HTTP authority to alter memberships. */
  setMembership(id: string, member: boolean) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      if (
        !this.db
          .prepare("UPDATE users SET member=? WHERE id=?")
          .run(member ? 1 : 0, id).changes
      )
        fail(404, "Unknown fixture identity.");
      this.db
        .prepare("INSERT INTO events(actor,kind,created) VALUES(?,?,?)")
        .run(
          "local-operator",
          `membership:${id}:${member}`,
          new Date().toISOString(),
        );
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
}
