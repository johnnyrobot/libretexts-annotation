# LibreTexts Social Annotation

Passage-linked discussions and personal highlights for web-based textbooks. The Node.js service stores annotations in SQLite, and a small browser widget attaches them to exact versions of the source text.

This repository contains the service, browser widget, textbook publisher, tests and deployment guides. It can integrate with an existing textbook site without the separate LibreTexts Reader, audio models or translation dependencies.

## Features

- Save private highlights with optional notes and tags.
- Start course-visible questions and threaded replies through an explicit Discuss action.
- Show or hide marks, select overlapping annotations and jump to saved passages.
- Search permitted annotations by quote, note, topic or author.
- Export permitted results as JSON using W3C Web Annotation concepts and LibreTexts metadata.
- Retain exact revision, paragraph, quotation and UTF-16 range references. Changed source is shown as stale history rather than relocated approximately.

## Development setup

Use Node.js **22.23.x** and npm. The scripts enable Node's built-in SQLite module and TypeScript stripping.

```sh
git clone https://github.com/johnnyrobot/libretexts-annotation.git
cd libretexts-annotation
npm ci
npm run provision
npm start
```

Open `http://127.0.0.1:4199/social-reading/`. The development preview includes a sample passage and synthetic course accounts. Their random passwords are written to `.secrets/demo-credentials.json`; they are not printed or committed.

Use a new development database for provisioning. Existing-install upgrades must preserve their database and credentials and must not run the demo provisioner.

### Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE` | `.data/social-reading.sqlite` | Persistent SQLite database |
| `PORT` | `4199` | Loopback HTTP port |
| `ORIGIN` | `http://127.0.0.1:4199` | Exact allowed browser origin |
| `FIXTURE_SECRETS` | `.secrets/demo-credentials.json` | Demo provisioner's credential file |

Integrated deployments also configure a verified final catalog and `READER_ENTRY`. See [Deployment](docs/DEPLOYMENT.md) for the complete environment and reverse-proxy configuration. The API namespace is `/social-reading/api`.

## Textbook integration

1. Prepare a fresh staging copy of the textbook HTML.
2. Import its source catalog with `scripts/import-library.ts`.
3. Run `scripts/stage-annotations.mjs` to publish the widget and page-context stamps outside `main#main-content`.
4. Verify the published pages and admit the resulting final catalog to the service using its exact digest.

The publisher preserves main-content bytes and emits seven browser assets plus their license notice. Use the final catalog produced after publication; its page hashes differ from the input catalog.

[Widget integration](docs/WIDGET-INTEGRATION.md) describes the page contract and asset layout. [Deployment](docs/DEPLOYMENT.md) provides the full command sequence, Linux service example, release manifest, upgrade steps and rollback procedure. An existing LibreTexts Reader can call the publisher through its compatibility adapter by setting `LIBRETEXTS_SOCIAL_ANNOTATION_ROOT` to this checkout.

The current importer admits source URLs on `https://library.libretexts.dev`. Supporting another source host requires an importer/catalog adaptation as well as the appropriate HTTP origin configuration. Stage and verify changes before publishing them to a live site.

## Tests

```sh
npm run typecheck
npm test
npm run test:reader
npx playwright install chromium
npm run test:reader:browser
CI=1 npm run test:browser
CI=1 npm run test:books
```

The widget browser suite uses a synthetic loopback fixture without a Reader checkout or API proxy. Service browser tests create isolated synthetic databases and credentials. Authenticated integration tests require an explicitly prepared textbook stage and protected fixture inputs; a skipped test does not establish coverage.

`CI=1` selects installed Chromium for the service browser suites; their local default uses Google Chrome. The [integration guide](docs/WIDGET-INTEGRATION.md) explains targeted Firefox/WebKit runs and reading/Listen coexistence checks.

## Project structure

| Path | Contents |
| --- | --- |
| `src/` | HTTP service, authentication, persistence, catalogs and annotation export |
| `public/` | Development preview and shared client/anchor helpers |
| `reader/` | Browser widget, styles, exact-range renderer and session helpers |
| `scripts/` | Catalog import, publication, verification and local development tools |
| `test/` | Unit, API, publisher and browser tests with synthetic fixtures |
| `docs/`, `deploy/` | Integration contracts, deployment instructions and configuration examples |

The sample passage and its digest are runtime inputs, including in integrated mode. Keep `fixtures/passage.json` and `fixtures/passage.sha256` in service releases. Databases, credentials, dependencies and generated test output belong outside source control.

## Production scope

The current implementation uses local password accounts, one configured private course audience and a single Node process. Institutional deployment requires identity/enrollment integration, a course model, operational backups, moderation/retention procedures and security/accessibility acceptance. Anonymous textbook reading remains available without an annotation account.

Course-post deletion, annotation import, unread/live notifications and ADAPT assessed artifacts are outside the current implementation. Functional tests do not establish learning gains or whole-site accessibility conformance.

## Documentation

- [User guide](docs/USER-GUIDE.md)
- [Architecture](docs/ARCHITECTURE.md)
- [API contract](docs/READER-API.md)
- [Widget integration](docs/WIDGET-INTEGRATION.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Design and sources](docs/DESIGN-AND-SOURCES.md)

## Licensing

Original project code is released under the [MIT License](LICENSE). The browser widget retains its existing [MIT notice](reader/LICENSE). Dependencies and textbook content retain their own licenses and attribution requirements; see [Notices](NOTICE.md).
