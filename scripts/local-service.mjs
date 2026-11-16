import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
if (process.platform !== "darwin")
  throw Error(
    "This local lifecycle uses macOS launchd. See deployment docs for Linux.",
  );
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const variant = process.argv[3] ?? "demo";
if (!["demo", "books", "reader"].includes(variant))
  throw Error("Unknown local service variant.");
const port = variant === "reader" ? 4204 : variant === "books" ? 4202 : 4199;
const origin =
  variant === "reader" ? "http://127.0.0.1:8788" : `http://127.0.0.1:${port}`;
const label = `ai.johnnyrobot.social-reading-${variant}`;
const domain = `gui/${process.getuid()}`;
const plist = resolve(homedir(), "Library/LaunchAgents", `${label}.plist`);
const xml = (v) =>
  v
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
const action = process.argv[2] ?? "status";
if (action === "start") {
  mkdirSync(dirname(plist), { recursive: true });
  mkdirSync(resolve(root, ".data"), { recursive: true, mode: 0o700 });
  const catalogPath = resolve(
    root,
    variant === "reader"
      ? ".data/reader-catalog.json"
      : ".data/library-catalog-v1.json",
  );
  const catalogSha =
    variant !== "demo"
      ? readFileSync(catalogPath + ".sha256", "utf8").trim()
      : "";
  if (variant !== "demo" && !/^[a-f0-9]{64}$/.test(catalogSha))
    throw Error("Exact catalog digest required.");
  const catalogEnvironment =
    variant !== "demo"
      ? `<key>SESSION_COOKIE_NAME</key><string>${variant === "reader" ? "sr_reader_session" : "sr_books_session"}</string><key>CATALOG_PATH</key><string>${xml(catalogPath)}</string><key>CATALOG_SHA256</key><string>${catalogSha}</string>`
      : "";
  const readerEnvironment =
    variant === "reader"
      ? `<key>READER_ENTRY</key><string>${origin}/social_psychology/13%3A_Competition_and_Cooperation_in_Our_Social_Worlds/13.01%3A_Conflict_Cooperation_Morality_and_Fairness/</string>`
      : "";
  const text = `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>Label</key><string>${label}</string><key>ProgramArguments</key><array><string>${xml(process.execPath)}</string><string>--experimental-strip-types</string><string>${xml(resolve(root, "src/server.ts"))}</string></array><key>WorkingDirectory</key><string>${xml(root)}</string><key>EnvironmentVariables</key><dict><key>DATABASE</key><string>${xml(resolve(root, variant === "reader" ? ".data/reader.sqlite" : variant === "books" ? ".data/books.sqlite" : ".data/social-reading.sqlite"))}</string><key>PORT</key><string>${port}</string><key>ORIGIN</key><string>${origin}</string>${catalogEnvironment}${readerEnvironment}</dict><key>RunAtLoad</key><true/><key>KeepAlive</key><true/><key>ThrottleInterval</key><integer>10</integer><key>StandardOutPath</key><string>${xml(resolve(root, variant === "reader" ? ".data/reader.stdout.log" : ".data/service.stdout.log"))}</string><key>StandardErrorPath</key><string>${xml(resolve(root, variant === "reader" ? ".data/reader.stderr.log" : ".data/service.stderr.log"))}</string></dict></plist>`;
  if (
    existsSync(plist) &&
    !readFileSync(plist, "utf8").includes(xml(resolve(root, "src/server.ts")))
  )
    throw Error("Another checkout owns this service; refusing to replace it.");
  let registered = false;
  try {
    execFileSync("launchctl", ["print", `${domain}/${label}`], {
      stdio: "ignore",
    });
    registered = true;
  } catch {}
  if (registered) {
    if (!existsSync(plist) || readFileSync(plist, "utf8") !== text)
      throw Error(
        "Registered service configuration differs. Stop this owned service explicitly before installing changed configuration.",
      );
    execFileSync("launchctl", ["kickstart", "-k", `${domain}/${label}`], {
      stdio: "inherit",
    });
  } else {
    writeFileSync(plist, text, { mode: 0o600 });
    execFileSync("plutil", ["-lint", plist], { stdio: "inherit" });
    execFileSync("launchctl", ["bootstrap", domain, plist], {
      stdio: "inherit",
    });
  }
  console.log(
    `Local demo registered with launchd. Check npm run ${variant === "demo" ? "local:status" : `local:${variant}:status`}. Existing database and credentials preserved.`,
  );
} else if (action === "stop") {
  if (
    !existsSync(plist) ||
    !readFileSync(plist, "utf8").includes(xml(resolve(root, "src/server.ts")))
  )
    throw Error(
      "This checkout does not own the registered service; refusing to stop it.",
    );
  execFileSync("launchctl", ["bootout", `${domain}/${label}`], {
    stdio: "inherit",
  });
  console.log("Stopped this demo only; database and credentials preserved.");
} else if (action === "status") {
  if (
    !existsSync(plist) ||
    !readFileSync(plist, "utf8").includes(xml(resolve(root, "src/server.ts")))
  )
    throw Error("This checkout does not own the requested service.");
  const output = execFileSync("launchctl", ["print", `${domain}/${label}`], {
    encoding: "utf8",
  });
  console.log(
    output
      .split("\n")
      .filter((line) => /^\s*(state|pid|last exit code) =/.test(line))
      .join("\n"),
  );
  const response = await fetch(
    `http://127.0.0.1:${port}/social-reading/api/health`,
  );
  if (!response.ok) throw Error(`Health failed: ${response.status}`);
  console.log(`Health 200: http://127.0.0.1:${port}/social-reading/`);
} else throw Error("Use start, stop or status.");
