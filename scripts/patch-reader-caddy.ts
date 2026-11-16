import { readFileSync, writeFileSync } from "node:fs";
import { patchReaderCaddy } from "../src/deployment-patch.ts";
const [input, pin, output] = process.argv.slice(2);
if (!input || !pin || !output)
  throw Error(
    "Usage: patch-reader-caddy.ts <protected-input> <sha256> <new-output>",
  );
writeFileSync(output, patchReaderCaddy(readFileSync(input, "utf8"), pin), {
  flag: "wx",
  mode: 0o600,
});
console.log("Prepared configuration; no live change.");
