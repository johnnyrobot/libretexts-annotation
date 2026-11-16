import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { isIP } from "node:net";
import { HighlightStore, type AnnotationFilters } from "./highlights.ts";
import { Store, Problem } from "./store.ts";
import type { Selection } from "./catalog.ts";
const root = new URL("../public/", import.meta.url);
const escape = (v: string) =>
  v.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function createApp(
  store: Store,
  origin: string,
  options: {
    trustedLoopbackProxy?: boolean;
    sessionCookieName?: string;
    readerEntry?: string;
  } = {},
) {
  const canonical = new URL(origin);
  if (canonical.origin !== origin)
    throw new Error("ORIGIN must be an origin without a path.");
  const readerEntry = options.readerEntry;
  if (readerEntry) {
    const entry = new URL(readerEntry);
    if (
      entry.origin !== origin ||
      entry.username ||
      entry.password ||
      entry.pathname === "/" ||
      entry.pathname.startsWith("/social-reading")
    )
      throw Error(
        "Reader entry must be on the configured origin outside Social Reading routes.",
      );
  }
  const cookieName = options.sessionCookieName ?? "sr_session";
  if (!/^sr_[a-z0-9_]{1,40}$/.test(cookieName))
    throw Error("Invalid session cookie name.");
  const cookiePattern = new RegExp(
    String.raw`(?:^|;\s*)${cookieName}=([a-f0-9]{64})(?:;|$)`,
  );
  const highlights = new HighlightStore(store);
  const attempts = new Map<string, { count: number; until: number }>();
  return createServer(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    );
    const json = (status: number, value: unknown) => {
      res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
      });
      res.end(JSON.stringify(value));
    };
    try {
      const url = new URL(req.url ?? "/", origin),
        path = url.pathname;
      const selected = (): Selection | undefined => {
        if (!["book", "page", "block"].some((k) => url.searchParams.has(k)))
          return undefined;
        return store.selection({
          book: url.searchParams.get("book") ?? "",
          page: url.searchParams.get("page") ?? "",
          block: url.searchParams.get("block") ?? "",
        });
      };
      const token = cookiePattern.exec(req.headers.cookie ?? "")?.[1] ?? "";
      const annotationRoute =
        [
          "/social-reading/api/highlights",
          "/social-reading/api/annotation-search",
          "/social-reading/api/annotation-export",
        ].includes(path) ||
        path.startsWith("/social-reading/api/highlight-receipts/");
      if (
        annotationRoute &&
        ((req.headers.origin && req.headers.origin !== origin) ||
          req.headers["sec-fetch-site"] === "cross-site")
      )
        throw new Problem(403, "Request origin refused.");
      const annotationFilters = (): AnnotationFilters => {
        const pairs = [...url.searchParams.entries()];
        if (new Set(pairs.map(([key]) => key)).size !== pairs.length)
          throw new Problem(400, "Repeated annotation filter.");
        return Object.fromEntries(pairs);
      };
      if (req.method === "GET") {
        if (path === "/social-reading/api/highlights") {
          json(200, highlights.list(token, annotationFilters()));
          return;
        }
        if (path === "/social-reading/api/annotation-search") {
          json(200, highlights.search(token, annotationFilters()));
          return;
        }
        if (path === "/social-reading/api/annotation-export") {
          json(200, highlights.export(token, annotationFilters()));
          return;
        }
        if (path.startsWith("/social-reading/api/highlight-receipts/")) {
          const context = selected();
          if (
            !context ||
            Object.keys(annotationFilters()).some(
              (k) => !["book", "page", "block"].includes(k),
            )
          )
            throw new Problem(400, "An exact passage context is required.");
          json(
            200,
            highlights.receipt(
              token,
              path.slice("/social-reading/api/highlight-receipts/".length),
              context,
            ),
          );
          return;
        }
        if (
          readerEntry &&
          ["/", "/social-reading", "/social-reading/"].includes(path)
        ) {
          res.writeHead(302, { Location: readerEntry });
          res.end();
          return;
        }

        if (path === "/favicon.ico") {
          res.writeHead(204);
          res.end();
          return;
        }
        if (path === "/" || path === "/social-reading") {
          res.writeHead(308, { Location: "/social-reading/" + url.search });
          res.end();
          return;
        }
        if (path === "/social-reading/") {
          let selection: Selection | undefined;
          if (url.searchParams.has("book")) {
            const book = url.searchParams.get("book")!;
            const pages = store.pages(book),
              page =
                url.searchParams.get("page") ??
                pages.find((p) => p.passageCount > 0)?.id ??
                pages[0]?.id;
            if (!page) throw new Problem(404, "Textbook unavailable.");
            selection = store.selection({
              book,
              page,
              block: url.searchParams.get("block") ?? "",
            });
          } else if (
            !url.searchParams.has("page") &&
            !url.searchParams.has("block")
          ) {
            const first = store.books()[0];
            selection = {
              book: first.key,
              page: first.defaultPage ?? "",
              block: "",
            };
          } else selection = selected();
          if (selection && !selection.block) {
            const p = store.page(selection.book, selection.page);
            selection = { ...selection, block: p?.passages[0]?.block ?? "" };
          }
          const content = store.content(selection);
          const attribution = content
            ? `${escape(content.authors)}. <cite>${escape(content.book)}</cite>. <a href="${escape(content.source)}">Read the original textbook page for attribution and licensing</a>.${content.license ? ` Excerpt licensed <a href="${escape(content.licenseUrl)}">${escape(content.license)}</a>; this excerpt view uses that license.` : ""}`
            : "This passage is unavailable. Choose a current textbook page or open the original library.";
          const values: Record<string, string> = {
            PASSAGE: escape(
              content?.text ??
                "No supported text passage is available at this address.",
            ),
            PAGE: escape(content?.title ?? "Passage unavailable"),
            BOOK: escape(content?.book ?? "Existing textbooks"),
            ATTRIBUTION: attribution,
          };
          const rendered = readFileSync(
            new URL("index.html", root),
            "utf8",
          ).replace(
            /%%(PASSAGE|PAGE|BOOK|ATTRIBUTION)%%/g,
            (_, key) => values[key],
          );
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(rendered);
          return;
        }
        const asset =
          path === "/social-reading/app.js"
            ? "app.js"
            : path === "/social-reading/style.css"
              ? "style.css"
              : null;
        if (asset && !readerEntry) {
          res.writeHead(200, {
            "Content-Type": asset.endsWith(".js")
              ? "text/javascript; charset=utf-8"
              : "text/css; charset=utf-8",
          });
          res.end(readFileSync(new URL(asset, root)));
          return;
        }
        if (path === "/social-reading/api/books") {
          json(200, store.books());
          return;
        }
        if (path === "/social-reading/api/pages") {
          json(200, store.pages(url.searchParams.get("book") ?? ""));
          return;
        }
        if (path === "/social-reading/api/manifest") {
          const manifest = store.library?.manifest(
            url.searchParams.get("book") ?? "",
            url.searchParams.get("page") ?? "",
          );
          if (!manifest) throw new Problem(404, "Textbook page unavailable.");
          json(200, manifest);
          return;
        }
        if (path === "/social-reading/api/page") {
          const book = url.searchParams.get("book") ?? "",
            id = url.searchParams.get("page") ?? "",
            page = store.page(book, id);
          if (!page) throw new Problem(404, "Textbook page unavailable.");
          json(200, {
            ...page,
            book,
            bookTitle: store.books().find((b) => b.key === book)?.title,
            passages: page.passages.map((q) => ({
              ...q,
              anchor: store.content({ book, page: id, block: q.block })?.anchor,
            })),
          });
          return;
        }
        if (path === "/social-reading/api/passage") {
          const content = store.content(selected());
          if (!content) throw new Problem(404, "Textbook passage unavailable.");
          json(200, content);
          return;
        }
        if (path === "/social-reading/api/health") {
          json(200, { status: "ready" });
          return;
        }
        if (path === "/social-reading/api/session") {
          json(200, store.session(token));
          return;
        }
        if (path === "/social-reading/api/threads") {
          json(200, store.list(token, selected()));
          return;
        }
        if (path.startsWith("/social-reading/api/receipts/")) {
          json(
            200,
            store.receipt(
              token,
              path.slice("/social-reading/api/receipts/".length),
              selected(),
            ),
          );
          return;
        }
      }
      if (req.method === "POST" && path.startsWith("/social-reading/api/")) {
        if (req.headers.origin !== origin)
          throw new Problem(403, "Request origin refused.");
        if (req.headers["content-type"] !== "application/json")
          throw new Problem(415, "JSON is required.");
        const chunks: Buffer[] = [];
        let bytes = 0;
        for await (const chunk of req) {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          bytes += buffer.length;
          if (bytes > 65536) throw new Problem(413, "Request too large.");
          chunks.push(buffer);
        }
        const raw = Buffer.concat(chunks).toString("utf8");
        let body;
        try {
          body = JSON.parse(raw);
        } catch {
          throw new Problem(400, "Invalid JSON.");
        }
        if (!body || typeof body !== "object" || Array.isArray(body))
          throw new Problem(400, "An object is required.");
        if (path === "/social-reading/api/login") {
          const peer = req.socket.remoteAddress ?? "unknown";
          const loopback = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
            peer,
          );
          // Only the explicitly configured loopback Caddy may supply this header.
          // Caddy overwrites it with its actual peer; generic forwarded headers are ignored.
          const forwarded = req.headers["x-social-reading-client-ip"];
          const ip =
            options.trustedLoopbackProxy &&
            loopback &&
            typeof forwarded === "string" &&
            isIP(forwarded)
              ? forwarded
              : peer;
          const account =
            typeof body.username === "string" && body.username.length <= 64
              ? body.username.trim().toLowerCase()
              : "<invalid>";
          const now = Date.now();
          for (const [key, value] of attempts)
            if (value.until <= now) attempts.delete(key);
          if (attempts.size > 10000)
            throw new Problem(
              429,
              "Sign-in is temporarily limited. Try again shortly.",
            );
          for (const [key, limit] of [
            [`peer:${ip}`, 120],
            [`account:${account}`, 15],
          ] as const) {
            const rate = attempts.get(key) ?? { count: 0, until: now + 60000 };
            rate.count++;
            attempts.set(key, rate);
            if (rate.count > limit)
              throw new Problem(
                429,
                "Too many sign-in attempts. Wait one minute.",
              );
          }
          const session = store.login(body.username, body.password);
          res.setHeader(
            "Set-Cookie",
            `${cookieName}=${session}; Path=/social-reading/; HttpOnly; SameSite=Strict; Max-Age=28800${canonical.protocol === "https:" ? "; Secure" : ""}`,
          );
          json(200, { signedIn: true });
          return;
        }
        if (path === "/social-reading/api/session/extend") {
          if (Object.keys(body).some((key) => key !== "actor"))
            throw new Problem(400, "Unknown session extension field.");
          const session = store.extendSession(token, body.actor);
          res.setHeader(
            "Set-Cookie",
            `${cookieName}=${token}; Path=/social-reading/; HttpOnly; SameSite=Strict; Max-Age=28800${canonical.protocol === "https:" ? "; Secure" : ""}`,
          );
          json(200, session);
          return;
        }
        if (path === "/social-reading/api/logout") {
          store.logout(token);
          res.setHeader(
            "Set-Cookie",
            `${cookieName}=; Path=/social-reading/; HttpOnly; SameSite=Strict; Max-Age=0`,
          );
          json(200, { signedIn: false });
          return;
        }
        if (path === "/social-reading/api/highlights") {
          json(200, highlights.command(token, body));
          return;
        }
        if (path === "/social-reading/api/commands") {
          json(200, store.command(token, body));
          return;
        }
      }
      json(404, { error: "Route unavailable." });
    } catch (e) {
      json(e instanceof Problem ? e.status : 500, {
        code: e instanceof Problem ? e.code : "UNKNOWN",
        ...(e instanceof Problem && e.fieldErrors
          ? { fieldErrors: e.fieldErrors }
          : {}),
        error:
          e instanceof Problem
            ? e.message
            : "The request could not be completed. Reconcile before retrying.",
      });
    }
  });
}
