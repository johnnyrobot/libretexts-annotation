import { Store } from "../../src/store.ts";
let raw = "";
for await (const chunk of process.stdin) raw += chunk;
const { file, token, command } = JSON.parse(raw);
const store = new Store(file);
try {
  store.command(token, command);
  console.log("accepted");
} catch (e) {
  console.log(
    e instanceof Error && e.message.includes("changed")
      ? "conflict"
      : "unexpected",
  );
  process.exitCode =
    e instanceof Error && e.message.includes("changed") ? 0 : 1;
} finally {
  store.close();
}
