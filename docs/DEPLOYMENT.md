# Engineering integration and deployment

These instructions describe the software contract and an operator deployment sequence. They are not a receipt that a particular host is deployed. Use reviewed source commits from this repository and record their hashes in the institution's release manifest. Operate on a staging environment before a production host.

## Production adoption work

The current service is a single-process, single-private-course implementation with local password authentication. It is suitable for the bounded demo/test audience described in the user guide. Before institutional production use, engineers must integrate the required identity/enrollment lifecycle, course authorization boundary and operator account administration. `Store.actor`, membership checks in `src/store.ts`, and login/session handling in `src/http.ts` are the relevant seams. `src/provision.ts` supplies four synthetic accounts for development; do not use it as a production enrollment system.

The catalog currently requires the source origin `https://library.libretexts.dev` in `src/catalog.ts`, and its importer builds source URLs for that origin. Deployment to a different production source host therefore needs a reviewed catalog-origin/importer adaptation and newly admitted catalog. Changing HTTP `ORIGIN` alone does not change source identity. Preserve saved source URLs and historical exact anchors during that migration.

Decide ownership for monitoring, backups, retention/moderation, identity recovery and accessibility acceptance. The integrated panel currently exposes question/reply creation and personal-highlight management; instructor resolve/reopen/hide backend commands do not imply matching Reader controls. There is no author course-post-delete UI, multi-course tenant administration, SSO adapter, import or ADAPT assessment integration in this handoff.

## Obtain and verify the single source

Use Node22.23.x; CI pins22.23.4. Check out the exact source commit recorded in the completed release manifest.

```sh
set -eu
git clone https://github.com/johnnyrobot/libretexts-annotation.git
cd libretexts-annotation
# git checkout the reviewed commit recorded in the release manifest.
npm ci
npm run typecheck
npm test
npm run test:reader
npx playwright install chromium
npm run test:reader:browser
```

The last command starts a local synthetic widget fixture and verifies layout/focus/draft behavior without a Reader checkout or audio dependencies. Authenticated integration uses a separately prepared full textbook stage/service: set `TTS_BASE_URL` and protected `SR_CREDENTIALS_FILE`, then run the desired spec with `npx playwright test -c playwright.reader.config.ts <spec> --browser=chromium` (or Firefox/WebKit after installing those browsers). Tests can create synthetic posts; do not run them against live course data without an agreed scope.

Runtime service files include `src/`, `public/`, `fixtures/passage.json`, `fixtures/passage.sha256`, `package.json` and `package-lock.json`. The sample passage and digest are read at module initialization even in integrated mode, so excluding them breaks startup. Retain their attribution. Install runtime dependencies using `npm ci --omit=dev --ignore-scripts` in the immutable service release directory. `node_modules`, databases, credentials, source textbook copies, model weights, screenshots and internal project records are not source handoff inputs.

## Compose textbook assets and catalog

Use a **fresh local copy** of the complete textbook HTML stage, preserving existing reading/Listen/translation assets. The publisher modifies staged files, never a live document root. The institution supplies its source HTML and rights/attribution.

Set the following paths before running the sequence:

```sh
set -eu
# Absolute paths to the reviewed checkout and a fresh staging copy:
backend_dir=/absolute/path/libretexts-annotation
stage_dir=/absolute/path/fresh-textbook-stage
build_dir=/absolute/path/new-annotation-build
mkdir "$build_dir"
cd "$backend_dir"
npm run import:library -- "$stage_dir" "$build_dir/catalog-input.json"
input_pin=$(cat "$build_dir/catalog-input.json.sha256")
cd "$backend_dir"
node scripts/stage-annotations.mjs --stage "$stage_dir" \
  --catalog "$build_dir/catalog-input.json" --sha256 "$input_pin" \
  --output "$build_dir/catalog-final.json"
cd "$backend_dir"
final_pin=$(node --input-type=module -e 'import{readFileSync}from"node:fs";import{createHash}from"node:crypto";console.log(createHash("sha256").update(readFileSync(process.argv[1])).digest("hex"))' "$build_dir/catalog-final.json")
node --experimental-strip-types scripts/verify-library.ts \
  "$stage_dir" "$build_dir/catalog-final.json" "$final_pin"
```

Create the inventory file named by the release-manifest template (paths are relative to the published stage):

```sh
node --input-type=module - "$stage_dir" "$build_dir/annotation-assets.sha256" <<'NODE'
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
const paths = [
  '_assets/reader/annotations.mjs',
  '_assets/reader/annotations.css',
  '_assets/reader/annotations/client.mjs',
  '_assets/reader/annotations/marks.mjs',
  '_assets/reader/session-timer.mjs',
  '_assets/reader/social-reading/client.mjs',
  '_assets/reader/social-reading/anchor.mjs',
  '_assets/reader/LICENSE.social-annotation',
];
const lines = paths.map(path => createHash('sha256')
  .update(readFileSync(join(process.argv[2], path))).digest('hex') + '  ' + path);
writeFileSync(process.argv[3], lines.join('\n') + '\n', { flag: 'wx' });
NODE
```

Record `final_pin` and include `annotation-assets.sha256` beside the completed release manifest. The final catalog's `sourceSha256` values describe the **published** HTML after stamping; do not configure the service with the input catalog. Revision/paragraph/quote identities remain tied to original main content. The publisher refuses altered source files and linked asset destinations before stamping pages.

The publisher copies these seven files from `reader/` into the stable browser asset layout:

```text
/_assets/reader/annotations.mjs
/_assets/reader/annotations.css
/_assets/reader/annotations/client.mjs
/_assets/reader/annotations/marks.mjs
/_assets/reader/session-timer.mjs
/_assets/reader/social-reading/client.mjs
/_assets/reader/social-reading/anchor.mjs
```

[Widget integration](WIDGET-INTEGRATION.md) describes embedding into an existing frontend. The seven files are source ES modules/CSS; annotation-only staging does not require rebuilding audio models or deploying every file in the wider Reader repository. Preserve existing textbook content, navigation, Reader assets, content security policy and attribution.

## Configure the service

Create a protected environment file owned/readable by the service operator. Configure actual values for the admitted source host and reviewed textbook entry. The example below uses the currently supported catalog origin; an institutional origin adaptation must already be implemented before substituting another source host.

```dotenv
ORIGIN=https://library.libretexts.dev
READER_ENTRY=https://library.libretexts.dev/social_psychology/
SESSION_COOKIE_NAME=sr_library_session
PORT=4199
DATABASE=/var/lib/libretexts-social-reading/state.sqlite
CATALOG_PATH=/var/lib/libretexts-social-reading/catalog/catalog-final.json
CATALOG_SHA256=REPLACE_WITH_VERIFIED_FINAL_CATALOG_SHA256
TRUST_PROXY_LOOPBACK=true
```

`ORIGIN` is an exact origin with no trailing slash/path. `READER_ENTRY` must be same-origin and outside `/social-reading`; HTTPS startup refuses a missing integrated entry. Cookie names must match `sr_[a-z0-9_]{1,40}`. The service binds127.0.0.1 and sets Secure cookies for HTTPS. Protect the database/parent directory with0600/0700 permissions. A catalog pin mismatch refuses startup. `FIXTURE_SECRETS` is for the demo provisioner, not a runtime production identity setting.

On Linux/systemd, an example unit using the existing service name is:

```ini
[Unit]
Description=LibreTexts Social Annotation
After=network.target

[Service]
Type=simple
User=libretexts-social-reading
Group=libretexts-social-reading
WorkingDirectory=/opt/libretexts/social-reading/current
EnvironmentFile=/etc/libretexts-social-reading/service.env
ExecStart=/opt/libretexts/social-reading/runtime/node-v22.23.4-linux-x64/bin/node --experimental-strip-types src/server.ts
Restart=on-failure
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/libretexts-social-reading

[Install]
WantedBy=multi-user.target
```

The operator must provision the service account, Node executable, immutable release/current link and protected state/config directories before starting this unit. Adjust the executable for the host architecture using an independently verified Node distribution. An existing installation may use an environment drop-in or another supervisor: preserve its actual configuration and merge the required settings instead of overwriting it with this example. Keep database and current working directory outside the read-only source release's mutable files.

## Same-origin reverse proxy

Serve the textbook and annotation API on the same HTTPS origin. Preserve API paths, Origin, request bodies, response status and cookies. With Caddy, merge this into the existing host configuration without replacing unrelated handlers:

```caddyfile
@social_annotation path /social-reading /social-reading/*
handle @social_annotation {
    reverse_proxy 127.0.0.1:4199 {
        header_up X-Social-Reading-Client-IP {remote_host}
    }
}
```

Use this overwritten dedicated header only when `TRUST_PROXY_LOOPBACK=true`. The service accepts it only from a loopback peer and only as a single valid IP; generic forwarded headers do not authorize client-IP trust. Retain account and peer login limits. Do not strip `/social-reading` with `handle_path`, add wildcard CORS, expose4199 publicly, or relax origin checks for tests. Validate the complete proxy configuration before reload. The application's no-store responses must not enter a public/shared API cache.

## First installation versus upgrade

For an institution's first installation, complete identity/course integration and create its initial authorized accounts through the reviewed administrative process. For an isolated demo only, `DATABASE` and `FIXTURE_SECRETS` can point to new protected paths when running `npm run provision`. These are distinct operations.

For an existing installation:

1. Record actual service/widget/catalog pins, asset inventory, service/environment paths and compatible rollback target. Take a consistent online SQLite backup using SQLite's backup facility (or stop writes before copying); a plain copy of a live WAL database is not sufficient. Keep protected credentials paired with their database.
2. Verify the staged source/catalog/asset hashes, exact installed preimages and expected schema compatibility. Prepare a separate immutable backend release with locked runtime dependencies. Never reset/reseed accounts, copy a development database over live data, or generate a catalog from transformed/translated output.
3. Stage the final catalog and updated protected environment. Activate compatible backend support before publishing its dependent Reader assets. Switch the current release link atomically and restart only the annotation service. Publish only reviewed annotation assets/pages; avoid whole-site directory sync with deletion.
4. Verify loopback health/public catalog, then HTTPS anonymous denial for private endpoints, admitted-account save/reload/reply, cross-account personal-note exclusion, exact source targets, export filtering, session expiry/recovery, keyboard/360px reflow and coexistence with the site's reading/Listen functions. Check browser errors, served asset hashes and persistent row retention. Use agreed synthetic data or read-only checks on a live handoff; do not silently add test posts to staff content.
5. Record actual terminal checks and the source commit. Local tests and a successful merge do not substitute for production acceptance.

The deployed demo currently uses `social-reading.service`; the GitHub repository rename does not rename its API or existing service automatically. The institution's operator decides any service/path migration separately.

## Rollback

Restore the previous compatible backend release/config and Reader asset preimages, verify their hashes and restart only the annotation service. Use temp files plus atomic rename per asset; verify both files when publishing a multi-file update. Refuse unexpected drift rather than overwriting a later release. Keep the **current** database containing acknowledged posts/highlights; a backup is recovery material, not a routine code-rollback replacement.

Only roll back to code that understands the current schema, catalog and exact anchors. If a downgrade cannot safely read/write current state, stop writes and roll forward. Data restoration, resetting demo posts and changing institutional retention are separately scoped operator actions, not installation steps.
