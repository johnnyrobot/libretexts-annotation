import { importLibrary, serializeLibrary } from "../src/catalog.ts";
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createHash } from "node:crypto";
const [root, out] = process.argv.slice(2);
if (!root || !out)
  throw Error(
    "Usage: node scripts/import-library.ts <read-only-mirror-root> <new-catalog.json>",
  );
const data = await importLibrary(root),
  raw = serializeLibrary(data),
  digest = createHash("sha256").update(raw).digest("hex");
await mkdir(dirname(resolve(out)), { recursive: true, mode: 0o700 });
await writeFile(out, raw, { flag: "wx", mode: 0o600 });
await writeFile(out + ".sha256", digest + "\n", { flag: "wx", mode: 0o600 });
console.log(
  JSON.stringify({
    catalog: out,
    sha256: digest,
    books: data.books.length,
    pages: data.books.reduce((n, b) => n + b.pages.length, 0),
    passages: data.books.reduce(
      (n, b) => n + b.pages.reduce((m, p) => m + p.passages.length, 0),
      0,
    ),
  }),
);
