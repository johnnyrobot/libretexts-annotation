import { DatabaseSync, backup } from "node:sqlite";
import {
  mkdirSync,
  existsSync,
  copyFileSync,
  constants,
  chmodSync,
} from "node:fs";
import { resolve, join } from "node:path";
process.umask(0o077);
const source = process.argv[2];
if (!source)
  throw Error("Supply the original owned demo worktree; no data is reset.");
const dbPath = resolve(".data/books.sqlite"),
  secret = resolve(".secrets/demo-credentials.json");
if (existsSync(dbPath) || existsSync(secret))
  throw Error(
    "Preview state already exists. Refusing to overwrite database or credentials.",
  );
mkdirSync(".data", { recursive: true, mode: 0o700 });
mkdirSync(".secrets", { recursive: true, mode: 0o700 });
const db = new DatabaseSync(
  join(resolve(source), ".data/social-reading.sqlite"),
  { readOnly: true },
);
try {
  await backup(db, dbPath);
} finally {
  db.close();
}
chmodSync(dbPath, 0o600);
copyFileSync(
  join(resolve(source), ".secrets/demo-credentials.json"),
  secret,
  constants.COPYFILE_EXCL,
);
chmodSync(secret, 0o600);
console.log(
  "Created a consistent preview snapshot and protected account file. Original service and state untouched.",
);
