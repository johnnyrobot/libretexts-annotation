import { mkdirSync, chmodSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Store } from "./store.ts";
import { loadLibrary } from "./catalog.ts";
import { createApp } from "./http.ts";
process.umask(0o077);
const file = resolve(process.env.DATABASE ?? ".data/social-reading.sqlite");
mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
const port = Number(process.env.PORT ?? 4199);
const origin = process.env.ORIGIN ?? `http://127.0.0.1:${port}`;
const readerEntry = process.env.READER_ENTRY;
if (origin.startsWith("https:") && !readerEntry)
  throw Error(
    "HTTPS release requires an integrated READER_ENTRY; standalone shell is development-only.",
  );
const library = process.env.CATALOG_PATH
  ? loadLibrary(process.env.CATALOG_PATH, process.env.CATALOG_SHA256 ?? "")
  : undefined;
const store = new Store(file, library);
chmodSync(file, 0o600);
const server = createApp(store, origin, {
  readerEntry,
  trustedLoopbackProxy: process.env.TRUST_PROXY_LOOPBACK === "true",
  sessionCookieName: process.env.SESSION_COOKIE_NAME ?? "sr_session",
});
server.requestTimeout = 15000;
server.headersTimeout = 10000;
server.listen(port, "127.0.0.1", () =>
  console.log(
    `Social Reading listening on http://127.0.0.1:${port}/social-reading/`,
  ),
);
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.on(signal, () =>
    server.close(() => {
      store.close();
      process.exit(0);
    }),
  );
