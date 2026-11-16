# Architecture

## Component boundaries

`server.ts` opens the persistent database and optional pinned catalog, then binds the HTTP service to loopback. `http.ts` enforces exact browser Origin, session cookies, membership, input validation and rate limits. `Store` owns course questions/replies, sessions, optimistic thread versions and immutable command receipts. `HighlightStore` owns actor-private highlights and builds authorized search/export views. No instructor bypass grants access to another person's private notes.

The Reader mounts its panel outside textbook `main`. It verifies page metadata and canonical text before accepting a selection. Personal marks and course conversations use separate actions and data; discussing a highlight never publishes its private note. DOM transformations such as translation/Listen can make a passage unsupported; refusal is preferable to attaching a comment to altered text.

## Source identity

A catalog identifies each book/page, source-file digest, parsed-main revision and eligible paragraph. The paragraph index counts all `main` paragraphs before eligibility exclusions. Canonical text collapses ECMAScript whitespace, treats `br` as one space, excludes script/style/navigation/footer/button text and performs no Unicode normalization. Range offsets are UTF-16 code units into that canonical paragraph, with exclusive end and surrogate-boundary checks.

The publisher stamps schema `social-reading-page-v1` with normalization `js-whitespace-v1` outside `main`. It preserves original main-content bytes and recomputes the final published-file digests. The service verifies the final catalog's digest at startup; anchors remain tied to the original revision and quote. Historical records become read-only orphans when no exact current target exists.

## Commands and recovery

Commands bind actor, exact context, key, version and payload. The database transaction checks identity/membership, replay compatibility and current source before writing. An acknowledged receipt can be read again without duplicating a contribution. A transport error does not prove a write failed: the client retains the original immutable command and reconciles it under the same account. Cross-account recovery cannot transfer ownership.

Unsent drafts and unresolved client-side command state live in page memory. They are not durable offline storage. Same-account expiry recovery can restore that memory; explicit logout or a different account clears private drafts. A page reload can lose unsent/recovery state. Session warning/extension uses server-relative timing; the Reader supplies accessible actions and status announcements.

## Persistence and operational limits

One SQLite database holds users, sessions, threads, replies, thread metadata, events, receipts and private highlights. Startup creates additive tables without reseeding accounts. Existing-install upgrades must preserve the current database, credentials and catalog; rolling code back must not overwrite newly acknowledged work with an older backup.

The current course boundary is the configured private audience, not a general tenant/course catalog. Authentication is local password-based. Production identity/enrollment integration and multi-course authorization require explicit engineering work before real-course adoption. Public textbook/catalog metadata does not authorize private discussion access.

Search/export cap the context window at 1,000 private records and 1,000 course questions, refusing oversized results instead of truncating silently. Course hydration currently repeats work by context; scalability has not been established by these functional checks. JSON export uses W3C vocabulary plus documented LibreTexts metadata, not a promise of universal third-party round-trip compatibility.
