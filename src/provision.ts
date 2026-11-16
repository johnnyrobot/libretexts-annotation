import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { Store } from "./store.ts";
process.umask(0o077);
const file = resolve(process.env.DATABASE ?? ".data/social-reading.sqlite");
const secret = resolve(
  process.env.FIXTURE_SECRETS ?? ".secrets/demo-credentials.json",
);
mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
mkdirSync(dirname(secret), { recursive: true, mode: 0o700 });
if (!existsSync(secret))
  writeFileSync(
    secret,
    JSON.stringify(
      Object.fromEntries(
        ["alice", "bob", "instructor", "outsider"].map((id) => [
          id,
          randomBytes(24).toString("base64url"),
        ]),
      ),
      null,
      2,
    ) + "\n",
    { mode: 0o600, flag: "wx" },
  );
const store = new Store(file);
try {
  store.provision(JSON.parse(readFileSync(secret, "utf8")));
} finally {
  store.close();
}
console.log(
  "Fixture provisioning completed. Credentials remain in the designated local secrets file; existing accounts and records were preserved.",
);
