import { readFile, realpath, lstat } from "node:fs/promises";
import { resolve, join, sep } from "node:path";
import { createHash } from "node:crypto";
import { loadLibrary, type LibraryData } from "../src/catalog.ts";
const [rootArg, catalogPath, pin] = process.argv.slice(2);
if (!rootArg || !catalogPath || !pin)
  throw Error("Usage: verify-library.ts <mirror-root> <catalog> <sha256>");
loadLibrary(catalogPath, pin);
const data = JSON.parse(await readFile(catalogPath, "utf8")) as LibraryData;
const root = await realpath(resolve(rootArg));
const mismatch: string[] = [];
let verified = 0;
for (const b of data.books)
  for (const p of b.pages) {
    const key = b.key + "/" + p.id;
    try {
      const path = join(root, b.key, p.id),
        actual = await realpath(path);
      if (
        !actual.startsWith(root + sep) ||
        (await lstat(path)).isSymbolicLink()
      )
        throw Error("Unsafe source");
      const raw = await readFile(path);
      if (createHash("sha256").update(raw).digest("hex") !== p.sourceSha256)
        throw Error("Changed");
      verified++;
    } catch {
      mismatch.push(key);
    }
  }
console.log(
  JSON.stringify({ verified, mismatched: mismatch.length, paths: mismatch }),
);
if (mismatch.length) process.exitCode = 1;
