import { normalizeText } from "../public/anchor.mjs";
import { parse, serialize, type DefaultTreeAdapterMap } from "parse5";
import { readdir, readFile, stat, lstat } from "node:fs/promises";
import { readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { createHash } from "node:crypto";
const sha = (text: string) => createHash("sha256").update(text).digest("hex");
export const MAX_CATALOG_BYTES = 100 * 1024 * 1024;
const ORIGIN = "https://library.libretexts.dev";
const sourceURL = (book: string, page: string) =>
  ORIGIN +
  "/" +
  (book + "/" + page)
    .replace(/index\.html$/, "")
    .split("/")
    .map(encodeURIComponent)
    .join("/");
type Node = DefaultTreeAdapterMap["node"];
type Element = DefaultTreeAdapterMap["element"];
const element = (n: Node): n is Element => "tagName" in n;
const attr = (n: Element, name: string) =>
  n.attrs.find((a) => a.name === name)?.value;
function* walk(n: Node): Generator<Node> {
  yield n;
  if ("childNodes" in n) for (const c of n.childNodes) yield* walk(c);
}
function text(n: Node): string {
  if (element(n) && n.tagName === "br") return " ";
  if (n.nodeName === "#text" && "value" in n) return n.value;
  if (
    element(n) &&
    ["script", "style", "nav", "footer", "button"].includes(n.tagName)
  )
    return "";
  return "childNodes" in n ? n.childNodes.map(text).join("") : "";
}
const clean = normalizeText;
export type Selection = { book: string; page: string; block: string };
export type BookAnchor = Selection & { revision: string; quote: string };
export type LibraryPage = {
  id: string;
  title: string;
  source: string;
  revision: string;
  sourceSha256: string;
  skipped: number;
  passages: { block: string; quote: string }[];
};
export type LibraryBook = { key: string; title: string; pages: LibraryPage[] };
export type LibraryData = { schema: 1; origin: string; books: LibraryBook[] };
const safePath = (s: string) =>
  s.length > 0 &&
  s.length < 2000 &&
  !s.startsWith("/") &&
  !s.includes("\\") &&
  !s.split("/").some((p) => p === ".." || p === "." || p === "");
export class LibraryCatalog {
  private data: LibraryData;
  constructor(input: LibraryData) {
    if (
      input.schema !== 1 ||
      input.origin !== ORIGIN ||
      !Array.isArray(input.books) ||
      input.books.length > 1000
    )
      throw Error("Invalid library catalog.");
    const keys = new Set();
    let count = 0;
    for (const b of input.books) {
      if (
        typeof b.key !== "string" ||
        !safePath(b.key) ||
        b.key === "__sample__" ||
        keys.has(b.key) ||
        typeof b.title !== "string" ||
        !b.title ||
        b.title.length > 1000 ||
        !Array.isArray(b.pages)
      )
        throw Error("Invalid library book.");
      keys.add(b.key);
      const pages = new Set();
      for (const p of b.pages) {
        if (
          ++count > 5000 ||
          typeof p.id !== "string" ||
          !safePath(p.id) ||
          pages.has(p.id) ||
          typeof p.title !== "string" ||
          !p.title ||
          p.title.length > 1000 ||
          typeof p.source !== "string" ||
          !p.source.startsWith(ORIGIN + "/") ||
          !/^([a-f0-9]{64})$/.test(p.revision) ||
          !/^([a-f0-9]{64})$/.test(p.sourceSha256) ||
          !Number.isSafeInteger(p.skipped) ||
          p.skipped < 0 ||
          !Array.isArray(p.passages) ||
          p.passages.length > 2000
        )
          throw Error("Invalid library page.");
        pages.add(p.id);
        const blocks = new Set();
        const expected = sourceURL(b.key, p.id);
        if (p.source !== expected) throw Error("Library source path mismatch.");
        for (const q of p.passages) {
          if (
            typeof q.block !== "string" ||
            !/^p-\d+$/.test(q.block) ||
            blocks.has(q.block) ||
            typeof q.quote !== "string" ||
            !q.quote.trim() ||
            q.quote.length > 4000
          )
            throw Error("Invalid library passage.");
          blocks.add(q.block);
        }
      }
    }
    this.data = structuredClone(input);
  }
  books() {
    return this.data.books.map((b) => ({
      key: b.key,
      title: b.title,
      pageCount: b.pages.length,
    }));
  }
  pages(book: string) {
    return (
      this.data.books
        .find((b) => b.key === book)
        ?.pages.map((p) => ({
          id: p.id,
          title: p.title,
          source: p.source,
          revision: p.revision,
          passageCount: p.passages.length,
          skipped: p.skipped,
        })) ?? []
    );
  }
  page(book: string, page: string) {
    return structuredClone(
      this.data.books
        .find((b) => b.key === book)
        ?.pages.find((p) => p.id === page),
    );
  }
  manifest(book: string, page: string) {
    const p = this.page(book, page);
    if (!p) return undefined;
    return {
      schema: "social-reading-page-v1",
      normalization: "js-whitespace-v1",
      book,
      page,
      revision: p.revision,
      blocks: p.passages.map((q) => ({
        block: q.block,
        quote: q.quote,
        quoteSha256: sha(q.quote),
      })),
    };
  }
  content(selection: Selection) {
    const b = this.data.books.find((b) => b.key === selection.book),
      p = b?.pages.find((p) => p.id === selection.page),
      q = p?.passages.find((q) => q.block === selection.block);
    if (!b || !p || !q) return undefined;
    return {
      title: p.title,
      book: b.title,
      source: p.source,
      authors: "Existing LibreTexts mirror",
      publisher: "LibreTexts",
      license: null,
      licenseUrl: null,
      text: q.quote,
      skipped: p.skipped,
      anchor: {
        book: b.key,
        page: p.id,
        revision: p.revision,
        block: q.block,
        quote: q.quote,
      } as BookAnchor,
    };
  }
}
export function loadLibrary(path: string, expected: string) {
  if (
    !/^[a-f0-9]{64}$/.test(expected) ||
    statSync(path).size > MAX_CATALOG_BYTES
  )
    throw Error("Exact catalog digest and bounded file required.");
  const raw = readFileSync(path, "utf8");
  if (sha(raw) !== expected) throw Error("Library catalog digest mismatch.");
  return new LibraryCatalog(JSON.parse(raw));
}
export async function importLibrary(inputRoot: string): Promise<LibraryData> {
  const root = resolve(inputRoot);
  const folders = (await readdir(root, { withFileTypes: true }))
    .filter(
      (d) =>
        d.isDirectory() &&
        !d.name.startsWith(".") &&
        !d.name.startsWith("_") &&
        !d.name.startsWith("@") &&
        d.name !== "Books",
    )
    .map((d) => join(root, d.name));
  try {
    const booksEntry = await lstat(join(root, "Books"));
    if (booksEntry.isSymbolicLink())
      throw Error("Books must not be a symbolic link.");
    if (!booksEntry.isDirectory()) throw Error("Books must be a directory.");
    for (const d of await readdir(join(root, "Books"), { withFileTypes: true }))
      if (
        d.isDirectory() &&
        !d.name.startsWith(".") &&
        !d.name.startsWith("_") &&
        !d.name.startsWith("@")
      )
        folders.push(join(root, "Books", d.name));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  let total = 0,
    bytes = 0;
  async function files(dir: string, depth = 0): Promise<string[]> {
    if (depth > 32) throw Error("Library nesting limit.");
    const result: string[] = [];
    for (const d of await readdir(dir, { withFileTypes: true })) {
      if (
        d.name.startsWith(".") ||
        d.name.startsWith("_") ||
        d.name.startsWith("@")
      )
        continue;
      const p = join(dir, d.name);
      if (d.isDirectory()) result.push(...(await files(p, depth + 1)));
      else if (d.isFile() && d.name === "index.html") {
        if (++total > 5000) throw Error("Library page limit.");
        result.push(p);
      }
    }
    return result.sort();
  }
  const books: LibraryBook[] = [];
  for (const folder of folders.sort()) {
    const key = relative(root, folder).split("\\").join("/");
    const pages: LibraryPage[] = [];
    for (const path of await files(folder)) {
      const size = (await stat(path)).size;
      if (size > 4 * 1024 * 1024 || bytes + size > 512 * 1024 * 1024)
        throw Error("Library byte limit.");
      const buffer = await readFile(path);
      bytes += buffer.length;
      if (buffer.length > 4 * 1024 * 1024 || bytes > 512 * 1024 * 1024)
        throw Error("Library byte limit.");
      const raw = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
      const doc = parse(raw);
      const mains = [...walk(doc)].filter(
        (n): n is Element =>
          element(n) &&
          n.tagName === "main" &&
          attr(n, "id") === "main-content",
      );
      const titleNode = [...walk(doc)].find(
        (n) => element(n) && n.tagName === "title",
      );
      const id = relative(folder, path).split("\\").join("/");
      const title = clean(titleNode ? text(titleNode) : id).slice(0, 1000);
      let skipped = 0;
      const passages: LibraryPage["passages"] = [];
      const main = mains.length === 1 ? mains[0] : undefined;
      const paragraphs = main
        ? [...walk(main)].filter(
            (n): n is Element => element(n) && n.tagName === "p",
          )
        : [];
      for (const [i, p] of paragraphs.entries()) {
        const quote = clean(text(p));
        let ancestor = p.parentNode;
        let excluded = false;
        while (ancestor && ancestor !== main) {
          if (
            element(ancestor) &&
            ["nav", "aside", "footer", "header", "table", "figure"].includes(
              ancestor.tagName,
            )
          )
            excluded = true;
          ancestor = "parentNode" in ancestor ? ancestor.parentNode : null;
        }
        const hidden = (n: Element) =>
          attr(n, "hidden") !== undefined ||
          attr(n, "aria-hidden") === "true" ||
          /display\s*:\s*none|visibility\s*:\s*hidden/i.test(
            attr(n, "style") ?? "",
          );
        let hiddenNode: Node | null = p;
        while (hiddenNode) {
          if (element(hiddenNode) && hidden(hiddenNode)) excluded = true;
          hiddenNode =
            "parentNode" in hiddenNode ? hiddenNode.parentNode : null;
        }
        const complex = [...walk(p)].some(
          (n) =>
            element(n) &&
            (hidden(n) ||
              [
                "math",
                "img",
                "svg",
                "iframe",
                "video",
                "audio",
                "sup",
                "sub",
                "script",
                "style",
              ].includes(n.tagName) ||
              /math|latex/i.test(attr(n, "class") ?? "")),
        );
        if (
          excluded ||
          complex ||
          /\\[([]/.test(quote) ||
          quote.length < 15 ||
          quote.length > 4000
        ) {
          skipped++;
          continue;
        }
        passages.push({ block: `p-${i}`, quote });
      }
      const source = sourceURL(key, id);
      pages.push({
        id,
        title: title || id,
        source,
        revision: sha(main ? serialize(main) : raw),
        sourceSha256: createHash("sha256").update(buffer).digest("hex"),
        skipped,
        passages,
      });
    }
    if (pages.length)
      books.push({
        key,
        title: (pages.find((p) => p.id === "index.html") ?? pages[0]).title,
        pages,
      });
  }
  const data = { schema: 1 as const, origin: ORIGIN, books };
  new LibraryCatalog(data);
  serializeLibrary(data);
  return data;
}

export function serializeLibrary(data: LibraryData): string {
  const raw = JSON.stringify(data) + "\n";
  if (Buffer.byteLength(raw, "utf8") > MAX_CATALOG_BYTES)
    throw Error("Library catalog exceeds loader byte limit.");
  return raw;
}
