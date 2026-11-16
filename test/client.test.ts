import { test } from "node:test";
import assert from "node:assert/strict";
// @ts-ignore Browser ESM is tested directly, without a bundler.
import { createClient, ApiError } from "../public/client.mjs";
test("headless adapter preserves immutable retry payload and scoped receipt recovery", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  let lost = true;
  const client = createClient({
    fetch: async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      if (lost) {
        lost = false;
        throw new Error("connection lost");
      }
      return new Response(
        JSON.stringify({ thread: "saved", version: 1, key: "original-key" }),
      );
    },
  });
  const context = Object.freeze({
    book: "alpha",
    page: "index.html",
    block: "p-0",
  });
  const command = Object.freeze({
    actor: "alice",
    key: "original-key",
    kind: "question",
    context,
    text: "Original draft",
  });
  await assert.rejects(client.command(command), /connection lost/);
  await client.command(command);
  assert.equal(calls[0].init.body, calls[1].init.body);
  assert.equal(calls[0].init.credentials, "same-origin");
  await client.receipt(command.key, context);
  assert.equal(
    calls[2].url,
    "/social-reading/api/receipts/original-key?book=alpha&page=index.html&block=p-0",
  );
  assert.throws(
    () => createClient({ baseURL: "https://elsewhere.test/api" }),
    /same-origin/,
  );
});
test("headless adapter preserves denial and conflict status without automatic retries", async () => {
  let calls = 0;
  const client = createClient({
    fetch: async () => {
      calls++;
      return new Response(
        JSON.stringify({ code: "IDENTITY_CHANGED", error: "Wrong actor" }),
        { status: 409 },
      );
    },
  });
  await assert.rejects(
    client.command({}),
    (e: unknown) =>
      e instanceof ApiError &&
      (e as any).status === 409 &&
      (e as any).code === "IDENTITY_CHANGED",
  );
  assert.equal(calls, 1);
});

test("adapter refuses URL control characters before transport and keeps extension same-origin", async () => {
  let calls = 0;
  const fetch = async (_url: string, init: RequestInit) => {
    calls++;
    assert.equal(init.mode, "same-origin");
    assert.equal(init.body, JSON.stringify({ actor: "alice" }));
    return new Response("{}");
  };
  for (const baseURL of [
    "/\t/attacker.example",
    "/\n/attacker.example",
    "/\r/attacker.example",
    "/api\u0000",
    "/api\u007f",
  ])
    assert.throws(() => createClient({ baseURL, fetch }), /same-origin/);
  assert.equal(calls, 0);
  await createClient({ fetch }).extendSession("alice");
  assert.equal(calls, 1);
});

test("annotation adapter preserves exact commands and supports page filters and private receipt reconciliation", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const client = createClient({
    fetch: async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response("{}");
    },
  });
  const context = Object.freeze({
    book: "alpha",
    page: "index.html",
    block: "p-0",
  });
  const command = Object.freeze({
    actor: "alice",
    key: "personal-command-1",
    kind: "create",
    context,
    anchor: { revision: "exact" },
    text: "Private",
  });
  await client.highlightCommand(command);
  await client.highlightCommand(command);
  assert.equal(calls[0].init.body, JSON.stringify(command));
  assert.equal(calls[0].init.body, calls[1].init.body);
  await client.highlightReceipt(command.key, context);
  assert.equal(
    calls[2].url,
    "/social-reading/api/highlight-receipts/personal-command-1?book=alpha&page=index.html&block=p-0",
  );
  await client.highlights(
    { book: "alpha", page: "index.html" },
    { tag: "evidence" },
  );
  assert.equal(
    calls[3].url,
    "/social-reading/api/highlights?book=alpha&page=index.html&tag=evidence",
  );
  await client.annotationSearch({
    book: "alpha",
    page: "index.html",
    scope: "all",
  });
  assert.equal(
    calls[4].url,
    "/social-reading/api/annotation-search?book=alpha&page=index.html&scope=all",
  );
  await client.exportAnnotations({ scope: "mine" });
  assert.equal(
    calls[5].url,
    "/social-reading/api/annotation-export?scope=mine",
  );
  assert.ok(
    calls.every(
      (c) =>
        c.init.credentials === "same-origin" && c.init.cache === "no-store",
    ),
  );
});

test("omitted optional annotation filters do not become literal undefined query values", async () => {
  const urls: string[] = [];
  const client = createClient({ fetch: async (url: string) => {
    urls.push(url);
    return new Response("{}");
  }});
  await client.highlights({book: "alpha", page: "index.html", block: undefined});
  await client.annotationSearch({scope: undefined, q: ""});
  await client.exportAnnotations({author: undefined, scope: "mine"});
  assert.deepEqual(urls, [
    "/social-reading/api/highlights?book=alpha&page=index.html",
    "/social-reading/api/annotation-search?q=",
    "/social-reading/api/annotation-export?scope=mine",
  ]);
});
