import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { patchCaddy, caddyHandler } from "../src/deployment-patch.ts";
test("minimal patch preserves every byte outside the owned root handler", () => {
  const source =
    "(secheaders) {\n header X-Test yes\n}\nlibretexts.dev {\n\timport secheaders\n\troot * /opt/libretexts/landing\n\tfile_server\n}\nlibrary.libretexts.dev {\n header Cross-Origin-Embedder-Policy require-corp\n root * /opt/libretexts/mirror/site\n file_server\n}\n";
  const pin = createHash("sha256").update(source).digest("hex");
  const result = patchCaddy(source, pin);
  assert.equal(result.replace(caddyHandler, ""), source);
  assert.match(result, /header_up X-Social-Reading-Client-IP \{remote_host\}/);
  assert.throws(() => patchCaddy(source + "\n", pin), /digest changed/);
  assert.throws(
    () => patchCaddy(result, createHash("sha256").update(result).digest("hex")),
    /Existing Social Reading/,
  );
});

test("composed patch keeps library policies intact and redirects every retained root entry", async () => {
  const { patchReaderCaddy, libraryApiHandler, integratedRootHandler } =
    await import("../src/deployment-patch.ts");
  const source =
    'libretexts.dev {\n\timport secheaders\n\tfile_server\n}\nlibrary.libretexts.dev {\n header Cross-Origin-Embedder-Policy require-corp\n header Content-Security-Policy "connect-src self"\n root * /opt/libretexts/mirror/site\n file_server\n}\n';
  const pin = (s: string) => createHash("sha256").update(s).digest("hex");
  const result = patchReaderCaddy(source, pin(source));
  assert.equal(
    result.replace(libraryApiHandler, "").replace(integratedRootHandler, ""),
    source,
  );
  assert.match(result, /handle \/social-reading\/api\/\*/);
  assert.match(
    result,
    /redir @socialReadingEntry https:\/\/library.libretexts.dev\/chem_4b\/ 302/,
  );
  const legacy = patchCaddy(source, pin(source));
  assert.equal(patchReaderCaddy(legacy, pin(legacy)), result);
  assert.throws(() => patchReaderCaddy(result, pin(result)), /Existing/);
  assert.throws(
    () => patchReaderCaddy(source + " ", pin(source)),
    /digest changed/,
  );
});
