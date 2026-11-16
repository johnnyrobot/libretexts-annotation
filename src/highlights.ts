import { annotationTags } from "./annotation-tags.ts";
import { randomUUID } from "node:crypto";
import { matchesAnchor } from "../public/anchor.mjs";
import { Store, Problem, digest } from "./store.ts";
import type { Selection } from "./catalog.ts";

type Anchor = {
  revision: string;
  block: string;
  quote: string;
  book?: string;
  page?: string;
  selector?: { start: number; end: number; quote: string };
};
export type HighlightCommand = {
  actor: string;
  key: string;
  kind: "create" | "update" | "delete";
  context: Selection;
  anchor?: unknown;
  highlight?: string;
  version?: number;
  text?: string;
  tags?: string[];
};
export type AnnotationFilters = Partial<Selection> & {
  q?: string;
  tag?: string;
  author?: string;
  scope?: string;
};
type Row = {
  id: string;
  actor: string;
  context: string;
  anchor: string;
  text: string;
  tags: string;
  version: number;
  created: string;
  updated: string;
  deleted: number;
  source: string;
};
const fail = (status: number, message: string): never => {
  throw new Problem(status, message);
};
// Canonical serialization makes replay identity independent of object field ordering.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.keys(value)
        .sort()
        .map(
          (k) =>
            JSON.stringify(k) +
            ":" +
            canonical((value as Record<string, unknown>)[k]),
        )
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
export class HighlightStore {
  store: Store;
  constructor(store: Store) {
    this.store = store;
    store.db
      .exec(`CREATE TABLE IF NOT EXISTS highlights(id TEXT PRIMARY KEY,actor TEXT NOT NULL REFERENCES users(id),context TEXT NOT NULL,anchor TEXT NOT NULL,text TEXT NOT NULL,tags TEXT NOT NULL,version INTEGER NOT NULL,created TEXT NOT NULL,updated TEXT NOT NULL,deleted INTEGER NOT NULL DEFAULT 0,source TEXT NOT NULL);
   CREATE INDEX IF NOT EXISTS highlights_owner ON highlights(actor,deleted);
   CREATE TABLE IF NOT EXISTS highlight_receipts(actor TEXT NOT NULL,context TEXT NOT NULL,key TEXT NOT NULL,payload TEXT NOT NULL,result TEXT NOT NULL,PRIMARY KEY(actor,context,key));`);
  }
  private context(value: Selection) {
    if (value === undefined) fail(400, "An exact passage context is required.");
    return this.store.selection(value);
  }
  private anchorContext(anchor: Anchor): Selection {
    return {
      book: anchor.book ?? "__sample__",
      page: anchor.page ?? "scientific-method",
      block: anchor.block,
    };
  }
  private current(row: Row) {
    const source = this.store.content(JSON.parse(row.context));
    return !!source && matchesAnchor(JSON.parse(row.anchor), source.anchor);
  }
  private mark(row: Row) {
    return {
      id: row.id,
      actor: row.actor,
      context: JSON.parse(row.context) as Selection,
      anchor: JSON.parse(row.anchor) as Anchor,
      text: row.text,
      tags: JSON.parse(row.tags) as string[],
      version: row.version,
      created: row.created,
      updated: row.updated,
      orphan: !this.current(row),
    };
  }
  private filters(value: AnnotationFilters) {
    const allowed = ["book", "page", "block", "q", "tag", "author", "scope"];
    if (
      !value ||
      Object.keys(value).some((k) => !allowed.includes(k)) ||
      Object.values(value).some((v) => typeof v !== "string" || v.length > 2000)
    )
      fail(400, "Invalid annotation filters.");
    if (value.q && value.q.length > 200)
      fail(400, "Search is limited to 200 characters.");
    if (value.tag && value.tag.length > 40)
      fail(400, "Tag is limited to 40 characters.");
    if (value.scope && !["mine", "course", "all"].includes(value.scope))
      fail(400, "Invalid annotation scope.");
    return value;
  }
  private matches(
    mark: {
      actor: string;
      context: Selection;
      anchor: Anchor;
      text: string;
      tags: string[];
      name?: string;
      replies?: { text: string; author: string; name: string }[];
    },
    f: AnnotationFilters,
  ) {
    if (
      ["book", "page", "block"].some(
        (k) =>
          f[k as keyof Selection] !== undefined &&
          f[k as keyof Selection] !== mark.context[k as keyof Selection],
      )
    )
      return false;
    if (
      f.author &&
      mark.actor !== f.author &&
      mark.name !== f.author &&
      !mark.replies?.some((r) => r.author === f.author || r.name === f.author)
    )
      return false;
    if (
      f.tag &&
      !mark.tags.some(
        (t) => t.toLocaleLowerCase() === f.tag!.toLocaleLowerCase(),
      )
    )
      return false;
    const text = [
      mark.anchor.selector?.quote ?? mark.anchor.quote,
      mark.text,
      ...mark.tags,
      mark.actor,
      mark.name ?? "",
      ...(mark.replies ?? []).flatMap((r) => [r.text, r.author, r.name]),
    ]
      .join(" ")
      .toLocaleLowerCase();
    return !f.q || text.includes(f.q.toLocaleLowerCase());
  }
  list(token: string, filters: AnnotationFilters = {}) {
    const actor = this.store.actor(token);
    const f = this.filters(filters);
    if (f.scope === "course") return [];
    const clauses = ["actor=?", "deleted=0"];
    const params = [actor.id];
    for (const key of ["book", "page", "block"] as const)
      if (f[key] !== undefined) {
        clauses.push(`json_extract(context,'$.${key}')=?`);
        params.push(f[key]!);
      }
    const rows = this.store.db
      .prepare(
        "SELECT * FROM highlights WHERE " +
          clauses.join(" AND ") +
          " ORDER BY created,id LIMIT 1001",
      )
      .all(...params) as Row[];
    if (rows.length > 1000)
      fail(
        413,
        "Too many annotations. Narrow the book, page or passage filters.",
      );
    return rows
      .map((r) => this.mark(r))
      .filter((m) => this.matches({ ...m, name: actor.name }, f));
  }
  receipt(token: string, key: string, context: Selection) {
    const actor = this.store.actor(token);
    const c = canonical(this.context(context));
    const row = this.store.db
      .prepare(
        "SELECT result FROM highlight_receipts WHERE actor=? AND context=? AND key=?",
      )
      .get(actor.id, c, key) as { result: string } | undefined;
    return row ? JSON.parse(row.result) : null;
  }
  command(
    token: string,
    c: HighlightCommand,
  ): { highlight: string; version: number; key: string; deleted: boolean } {
    const db = this.store.db;
    db.exec("BEGIN IMMEDIATE");
    try {
      const actor = this.store.actor(token);
      if (c?.actor !== actor.id)
        throw new Problem(
          409,
          "Your signed-in identity changed. Return to the original account before reconciling.",
          "IDENTITY_CHANGED",
        );
      if (typeof c.key !== "string" || !/^[a-zA-Z0-9-]{8,100}$/.test(c.key))
        fail(400, "A valid request key is required.");
      if (
        Object.keys(c).some(
          (k) =>
            ![
              "actor",
              "key",
              "kind",
              "context",
              "anchor",
              "highlight",
              "version",
              "text",
              "tags",
            ].includes(k),
        )
      )
        fail(400, "Unknown highlight field.");
      const context = this.context(c.context),
        binding = canonical(context),
        payload = canonical(c);
      const previous = db
        .prepare(
          "SELECT payload,result FROM highlight_receipts WHERE actor=? AND context=? AND key=?",
        )
        .get(actor.id, binding, c.key) as
        | { payload: string; result: string }
        | undefined;
      if (previous) {
        if (previous.payload !== payload)
          fail(409, "This request key already belongs to different content.");
        db.exec("COMMIT");
        return JSON.parse(previous.result);
      }
      if (
        c.text !== undefined &&
        (typeof c.text !== "string" || c.text.length > 4000)
      )
        fail(400, "Notes are limited to 4000 characters.");
      const tags = c.tags === undefined ? undefined : annotationTags(c.tags);
      const now = new Date().toISOString();
      let id: string, version: number;
      if (c.kind === "create") {
        if (c.highlight !== undefined || c.version !== undefined)
          fail(400, "Create does not accept an existing highlight.");
        const source = this.store.content(context);
        if (!source || !matchesAnchor(c.anchor, source.anchor))
          fail(409, "This passage anchor is orphaned. Nothing was saved.");
        id = randomUUID();
        version = 1;
        db.prepare("INSERT INTO highlights VALUES(?,?,?,?,?,?,?,?,?,0,?)").run(
          id,
          actor.id,
          binding,
          JSON.stringify(c.anchor),
          c.text?.trim() ?? "",
          JSON.stringify(tags ?? []),
          version,
          now,
          now,
          source.source,
        );
      } else if (c.kind === "update" || c.kind === "delete") {
        if (c.anchor !== undefined)
          fail(400, "An existing highlight anchor cannot be changed.");
        if (typeof c.highlight !== "string")
          fail(400, "A highlight is required.");
        const row = db
          .prepare(
            "SELECT * FROM highlights WHERE id=? AND actor=? AND context=? AND deleted=0",
          )
          .get(c.highlight!, actor.id, binding) as Row | undefined;
        if (!row) fail(404, "Highlight unavailable.");
        if (!Number.isSafeInteger(c.version) || c.version !== row!.version)
          fail(409, "This highlight changed. Refresh before trying again.");
        if (!this.current(row!))
          fail(
            409,
            "This anchor is orphaned. Original context is preserved read-only.",
          );
        id = row!.id;
        version = row!.version + 1;
        db.prepare(
          "UPDATE highlights SET text=?,tags=?,version=?,updated=?,deleted=? WHERE id=?",
        ).run(
          c.text?.trim() ?? row!.text,
          JSON.stringify(tags ?? JSON.parse(row!.tags)),
          version,
          now,
          c.kind === "delete" ? 1 : 0,
          id,
        );
      } else return fail(400, "Unsupported highlight command.");
      const result = {
        highlight: id,
        version,
        key: c.key,
        deleted: c.kind === "delete",
      };
      db.prepare("INSERT INTO highlight_receipts VALUES(?,?,?,?,?)").run(
        actor.id,
        binding,
        c.key,
        payload,
        JSON.stringify(result),
      );
      db.exec("COMMIT");
      return result;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
  search(token: string, filters: AnnotationFilters = {}) {
    const actor = this.store.actor(token),
      f = this.filters(filters);
    const highlights = f.scope === "course" ? [] : this.list(token, f);
    const contexts = new Map<string, Selection>();
    const clauses: string[] = [];
    const params: string[] = [];
    for (const key of ["book", "page", "block"] as const)
      if (f[key] !== undefined) {
        clauses.push(`COALESCE(json_extract(anchor,'$.${key}'),?)=?`);
        params.push(
          key === "book"
            ? "__sample__"
            : key === "page"
              ? "scientific-method"
              : "",
          f[key]!,
        );
      }
    const rows = this.store.db
      .prepare(
        "SELECT anchor FROM threads" +
          (clauses.length ? " WHERE " + clauses.join(" AND ") : "") +
          " LIMIT 1001",
      )
      .all(...params) as { anchor: string }[];
    if (rows.length > 1000)
      fail(
        413,
        "Too many discussions. Narrow the book, page or passage filters.",
      );
    for (const row of rows) {
      const a = JSON.parse(row.anchor);
      const c = this.anchorContext(a);
      contexts.set(canonical(c), c);
    }
    const seen = new Set<string>();
    const threads = [...contexts.values()]
      .flatMap((c) => this.store.list(token, c))
      .filter((t) => {
        if (seen.has(t.id)) return false;
        seen.add(t.id);
        const context = this.anchorContext(t.anchor);
        return (
          (f.scope !== "mine" ||
            t.author === actor.id ||
            t.replies.some((r) => r.author === actor.id)) &&
          this.matches({ ...t, actor: t.author, context }, f)
        );
      });
    return { highlights, threads };
  }
  export(token: string, filters: AnnotationFilters = {}) {
    const result = this.search(token, filters);
    const target = (anchor: Anchor, context: Selection, source: string) => {
      const selector = anchor.selector ?? {
        start: 0,
        end: anchor.quote.length,
        quote: anchor.quote,
      };
      const quote = {
        type: "TextQuoteSelector",
        exact: selector.quote,
        prefix: anchor.quote.slice(0, selector.start),
        suffix: anchor.quote.slice(selector.end),
      };
      const ordinal = /^p-(0|[1-9][0-9]*)$/.test(anchor.block)
        ? Number(anchor.block.slice(2))
        : NaN;
      const knownParagraph =
        anchor.book === context.book &&
        anchor.page === context.page &&
        context.book !== "__sample__" &&
        Number.isSafeInteger(ordinal) &&
        Number.isSafeInteger(ordinal + 1) &&
        source !== "urn:libretexts:source-unavailable";
      return {
        type: "SpecificResource",
        source,
        selector: knownParagraph
          ? {
              type: "XPathSelector",
              value: `(//main[@id='main-content']//p)[${ordinal + 1}]`,
              refinedBy: quote,
            }
          : quote,
        "sr:context": context,
        "sr:anchor": anchor,
        "sr:rangeBasis":
          "UTF-16 code units within sr:anchor.quote; end exclusive",
      };
    };
    const items: object[] = [];
    for (const h of result.highlights) {
      const row = this.store.db
        .prepare("SELECT source FROM highlights WHERE id=?")
        .get(h.id) as { source: string };
      items.push({
        id: "urn:uuid:" + h.id,
        type: "Annotation",
        motivation: "highlighting",
        creator: h.actor,
        created: h.created,
        modified: h.updated,
        body: [
          ...(h.text
            ? [
                {
                  type: "TextualBody",
                  value: h.text,
                  format: "text/plain",
                  purpose: "commenting",
                },
              ]
            : []),
          ...h.tags.map((value) => ({
            type: "TextualBody",
            value,
            purpose: "tagging",
          })),
        ],
        target: target(h.anchor, h.context, row.source),
        "sr:audience": "private-owner",
        "sr:version": h.version,
        "sr:orphan": h.orphan,
      });
    }
    for (const t of result.threads) {
      const context = this.anchorContext(t.anchor);
      const saved = this.store.db
        .prepare("SELECT source FROM thread_sources WHERE thread=?")
        .get(t.id) as { source: string } | undefined;
      const source =
        saved?.source ??
        this.store.content(context)?.source ??
        this.store.page(context.book, context.page)?.source;
      // Historic source URLs remain derivable from the page metadata; an unavailable source is explicit.
      const shared = {
        target: target(
          t.anchor,
          context,
          source ?? "urn:libretexts:source-unavailable",
        ),
        "sr:audience": "course",
        "sr:version": t.version,
        "sr:orphan": t.orphan,
      };
      items.push({
        id: "urn:uuid:" + t.id,
        type: "Annotation",
        motivation: "commenting",
        creator: t.author,
        created: t.created,
        body: [
          { type: "TextualBody", value: t.text, format: "text/plain" },
          ...t.tags.map((value) => ({
            type: "TextualBody",
            value,
            purpose: "tagging",
          })),
        ],
        ...shared,
      });
      for (const r of t.replies)
        items.push({
          id: "urn:uuid:" + r.id,
          type: "Annotation",
          motivation: "replying",
          creator: r.author,
          created: r.created,
          body: { type: "TextualBody", value: r.text, format: "text/plain" },
          ...shared,
          "sr:thread": "urn:uuid:" + t.id,
        });
    }
    return {
      "@context": [
        "http://www.w3.org/ns/anno.jsonld",
        { sr: "urn:libretexts:social-reading:" },
      ],
      id:
        "urn:libretexts:annotation-export:" +
        digest(canonical({ actor: this.store.actor(token).id, filters })),
      type: "AnnotationPage",
      items,
    };
  }
}
