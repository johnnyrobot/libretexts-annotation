import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { patchCaddy } from "../src/deployment-patch.ts";
const [input, output, pin] = process.argv.slice(2);
if (!input || !output || !pin)
  throw Error(
    "Usage: patch-live-caddy.ts <protected-current-copy> <new-staged-copy> <expected-sha256>",
  );
const patched = patchCaddy(await readFile(input, "utf8"), pin);
await writeFile(output, patched, { flag: "wx", mode: 0o600 });
console.log(
  JSON.stringify({
    staged: output,
    sha256: createHash("sha256").update(patched).digest("hex"),
  }),
);
