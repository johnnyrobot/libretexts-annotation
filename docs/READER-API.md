# Reader integration contract

This is the service/browser contract. Deploy the service and matching Reader annotation sources together; release verification is distinct from the protocol below.

Use this release's headless client/anchor pair under `reader/social-reading/` together with `reader/annotations/client.mjs`. Backend `public/client.mjs` and `public/anchor.mjs` document the related core contract; do not overwrite the widget's frozen copies with arbitrary latest backend files. Both are browser ESM without DOM access. `createClient({baseURL:'/social-reading/api'})` exposes session(), login(username,password), logout(), books(), pages(book), page(book,page), passage(context), threads(context), command(command), receipt(key,context). Context is `{book,page,block}`. Command arguments retain existing API shape. Preserve a frozen original command until acknowledged or reconciled; the adapter never changes actor/key/context/version or retries. Network or malformed-response errors mean outcome unknown. ApiError retains status/code/body; deny/revoke private UI on 401/403, handle 409 as conflict. Session response supplies the server-authorized actor. Do not infer membership from static reader markup.

`GET /social-reading/api/manifest?book=…&page=…` returns public metadata:

```json
{
  "schema": "social-reading-page-v1",
  "normalization": "js-whitespace-v1",
  "book": "alpha",
  "page": "index.html",
  "revision": "<64 lowercase hex>",
  "blocks": [
    {
      "block": "p-0",
      "quote": "Canonical whole paragraph",
      "quoteSha256": "<64 lowercase hex>"
    }
  ]
}
```

Publisher can call LibraryCatalog.manifest(book,page) directly. Stamp this JSON outside main#main-content, using safe JSON serialization (escape `<` when embedding in script). No global catalog hash or sourceSha256 appears in the stamp. `revision` remains SHA256 UTF-8 parse5 serialization of main's inner content before runtime transformation. p-N is zero-based among ALL main paragraphs before exclusions. quoteSha256 is SHA256 UTF-8 of exact canonical quote. Page API provides complete authoritative anchor. Never derive revision from live DOM.

Canonical text concatenates text nodes through inline wrappers; br contributes one ASCII space. Collapse ECMAScript whitespace with /\s+/g to ASCII space and trim, with no Unicode normalization. Script/style/nav/footer/button descendants contribute no text. Eligibility exclusions remain those in catalog.ts; normalizing text does not establish eligibility. `fixtures/normalization.json` contains HTML/expected quotation parity cases for publisher and browser. Runtime must verify the eligible block against its exact canonical quote before enabling posting; altered translations and unsupported multi-block selections are unavailable.

Keep full anchor.quote. Optional anchor.selector is `{start,end,quote}` using UTF-16 offsets into that canonical quote, end exclusive. `validSelector` rejects empty ranges, invalid/out-of-bounds offsets, split surrogate pairs, mismatched quotations and extra fields. Absent selector means legacy whole block. `matchesAnchor` verifies all whole-block fields and optional selector. Records remain JSON anchors in existing SQLite tables; no schema rewrite or data reset.

A local composed origin can be http://127.0.0.1:8788. The current catalog source origin is https://library.libretexts.dev. Integrated mode uses READER_ENTRY and a dedicated host-only session cookie. Production and local composition settings are in [Deployment](DEPLOYMENT.md). See [Deployment](DEPLOYMENT.md) for staging, configuration and production acceptance.

## Session timing and accessible recovery

GET session preserves actor fields and adds `timing:{serverNow,expiresAt,warningSeconds:300,extensionSeconds:28800,canExtend:true}`. Times are server-generated epoch milliseconds. `createClient().extendSession(actor)` POSTs `{actor}` to `/session/extend` under existing exact-Origin checks. The current unexpired token and current course membership are required; actor mismatch is409 IDENTITY_CHANGED. An accepted deliberate extension sets the current token deadline to eight hours from server now and renews the host-only cookie. Unlimited deliberate extensions are permitted; expired/revoked sessions cannot be revived. No schema migration or change to existing session deadlines occurs at deployment.

Question/reply text validation returns400 with `code:"VALIDATION_FAILED"`, form-level `error`, and `fieldErrors:{text:"Enter between 1 and 4000 characters."}`. No submitted text/password is echoed. Other existing errors remain compatible. ApiError retains the full body; loading/status announcements and field associations belong to the reader. Adapter requests explicitly use `mode:"same-origin"` and reject ASCII control characters in baseURL.

Reader must implement the accessible five-minute warning and deliberate Stay signed in action, server-clock-relative timing, safe reauthentication/recovery, and tests for background/suspended tabs, failed extension and expiry during submission. The server implementation alone does not satisfy the timing or status-message criteria. Automated checks do not establish whole-site accessibility or assistive-technology conformance. Institution-specific acceptance remains necessary.

## Personal annotations, tags, search and JSON export (LT-556/557/558)

These routes use the same `/social-reading/api` prefix, session, membership and exact source authority. Explicit cross-origin GET requests and cross-site browser requests are refused for the new annotation routes; POST continues to require the configured exact Origin and JSON content type. All responses are no-store. A valid instructor session grants no access to another person's personal marks.

`GET /highlights?book=…&page=…&block=…&q=…&tag=…&author=…` returns an array of the current viewer's undeleted marks. Book, page and block are independent optional exact filters; omit block for every block on a page and omit all context for owned marks across the catalog. Marks are `{id,actor,context,anchor,text,tags,version,created,updated,orphan}`. `anchor` retains the original whole block quote plus optional range. Empty text is valid; tags are strings. No private mark is automatically published.

`POST /highlights` accepts `{actor,key,kind,context,anchor?,highlight?,version?,text?,tags?}`. Exact `{book,page,block}` context is required. `kind:'create'` takes the full current anchor (optional selector) and optional note/tags. `kind:'update'|'delete'` takes highlight ID and current integer version; anchor replacement is refused. Notes are at most 4000 characters, tags at most 10 nonempty strings of at most 40 characters after trimming. Unknown fields are refused. Result is `{highlight:<id>,version,key,deleted}`. Changed payload replay is409; replay of the original succeeds after rechecking session/membership. Receipt identity is original actor + exact context + key; property ordering is immaterial. Deleted marks disappear from lists while receipts remain recoverable. Orphan marks remain readable but all mutations are409.

`GET /highlight-receipts/:key?book=…&page=…&block=…` returns that viewer's exact-context receipt or null. Keep the original immutable command and use this endpoint for an unknown outcome. Other identities never receive its receipt. Reauthentication must preserve the original actor; the server does not transfer ownership.

Course question creation accepts optional `tags`. Existing question/reply/resolve/reopen/hide commands remain compatible. `{actor,key,kind:'tags',context,thread,version,tags}` changes a question's topic tags using the existing version and command receipt behavior. Only its author or an instructor may do so; stale/orphan questions remain read-only. `threads()` now includes `tags:[]` for untagged questions.

`GET /annotation-search` returns `{highlights,threads}`. Filters are flat optional `book,page,block,q,tag,author,scope`. `scope` is `mine|course|all`, default all. Mine includes only owned personal marks and questions authored by the viewer or containing a visible reply by the viewer. Course includes admitted course questions with visible replies; all combines both. Search matches the selected quote (whole block when no range), note/question text, tags, actor/name and visible reply text/author. `q` is a case-insensitive substring, at most 200 characters; tag is a case-insensitive exact match, at most 40; author is an exact actor ID or displayed name on the question/visible replies. Each context filter matches exactly; omitted block includes all page blocks and historical orphans. No hidden reply bodies, other viewers' personal bodies, private counts or suggestions are exposed.

Both search and export consider at most 1000 personal records and 1000 course questions within the requested context window. A larger window returns413 asking for narrower book/page/block filters, rather than silently truncating. Unknown/repeated query fields and invalid scopes fail400. All scalar query values are bounded to 2000 characters.

`GET /annotation-export` takes the same filters and returns a W3C-oriented `AnnotationPage` with an `items` array. Each Annotation has a UUID URN, plain `TextualBody` content, creator/time, explicit `sr:audience` (`private-owner` or `course`), `sr:version`, `sr:orphan` and exact `SpecificResource` target. The target retains the saved source URL, full `sr:anchor` (revision, canonical block quote and original optional UTF-16 selector), and `sr:context`. For catalog `p-N` anchors, a standard `XPathSelector` selects `(//main[@id='main-content']//p)[N+1]`, counting every descendant paragraph in document order, then `refinedBy` applies a `TextQuoteSelector` containing the selected exact quote and its full canonical block prefix/suffix. Parenthesizing the paragraph node set makes the ordinal global across nested containers. No standard `TextPositionSelector` is emitted: stored offsets are not page-relative positions. Original start/end UTF-16 code-unit offsets remain unmodified in `sr:anchor.selector`, with their block-relative basis stated in `sr:rangeBasis`. Legacy/sample anchors without a known catalog DOM locator export only the quote selector and custom exact context/range metadata; consumers must not infer unique page attachment from a repeated quote. The source revision remains authoritative: XPath/quote matching does not authorize reattachment to a changed page. New course questions persist their source URL additively; older records fall back to authoritative page metadata or `urn:libretexts:source-unavailable` if unavailable. Replies carry their parent `sr:thread` and exact target. Hidden replies are absent. Content is JSON/plain text only; export never imports or executes it. This is portable annotation data, not a claim of automatic reattachment or universal importer support.

Updated browser ESM methods: `highlights(context?,filters?)`, `highlightCommand(payload)`, `highlightReceipt(key,context)`, `annotationSearch(filters?)`, `exportAnnotations(filters?)`. Requests remain same-origin, preserve caller payloads and never retry. JSON only; CSV and imports are deferred. See [Architecture](ARCHITECTURE.md) for source identity and operational limits.

Selector rationale follows the W3C Web Annotation Data Model [XPath Selector](https://www.w3.org/TR/annotation-model/#xpath-selector), [Text Quote Selector](https://www.w3.org/TR/annotation-model/#text-quote-selector) and [Refinement of Selection](https://www.w3.org/TR/annotation-model/#refinement-of-selection). The standard selector chain scopes the quote to its paragraph; custom metadata retains the exact original range independently.

Export interoperability limit: the paragraph XPath is evaluated against the original HTML DOM; quote refinement uses the documented js-whitespace-v1 canonical text. Consumers that compare raw textContent without this normalization, or include excluded navigation/control text, may fail to locate a quote. The exact revision, canonical block quote and UTF-16 range remain available as custom metadata. No fuzzy relocation or universal importer compatibility is promised.

Known bounded-query limitation: search/export currently hydrate authorized course views once per matching block context, up to the documented 1000-question window. This duplicates work for multi-block queries. The responsiveness impact is unmeasured; any batching change must preserve hidden-reply and orphan semantics. No measured latency or scalability claim is made.
