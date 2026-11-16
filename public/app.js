const $ = (id) => document.getElementById(id);
const drafts = new Map();
const questionDrafts = new Map();
let availableBooks = [];
let authVersion = 0,
  authBusy = false;
const legacyContext = (c) =>
  c?.book === "__sample__" &&
  c.page === "scientific-method" &&
  c.block === "scientific-method-p1";
let context = null,
  navBusy = false;
const scope = (path, c = context) =>
  !c || legacyContext(c) ? path : `${path}?${new URLSearchParams(c)}`;
const selectionKey = () =>
  JSON.stringify(
    context ?? {
      book: "__sample__",
      page: "scientific-method",
      block: "scientific-method-p1",
    },
  );
let actionFocus = null;
let refreshSerial = 0;
let sessionGeneration = 0;
let actor = null,
  anchor = null,
  threads = [],
  pending = null,
  busy = false;
const say = (text) => {
  $("status").textContent = text;
};
async function api(path, body) {
  const response = await fetch(`/social-reading/api/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result.error);
    error.status = response.status;
    error.code = result.code;
    throw error;
  }
  return result;
}
function clearPrivate() {
  authVersion++;
  authBusy = false;
  sessionGeneration++;
  $("recover").disabled = false;
  refreshSerial++;
  busy = false;
  drafts.clear();
  questionDrafts.clear();
  actionFocus = null;
  actor = null;
  threads = [];
  pending = null;
  $("member").hidden = true;
  $("login").hidden = false;
  $("threads").replaceChildren();
  $("question-text").value = "";
  $("identity").textContent = "";
  $("recover").hidden = true;
  lock(false);
  $("login").querySelector("button").disabled = !(anchor || context);
}
function lock(value) {
  busy = value;
  document
    .querySelectorAll("#book-navigation select")
    .forEach((e) => (e.disabled = value || navBusy || authBusy));
  document
    .querySelectorAll("#member textarea")
    .forEach((e) => (e.disabled = navBusy));
  document
    .querySelectorAll("#member form button,.thread button")
    .forEach((b) => (b.disabled = value || navBusy || authBusy));
  $("post-question").disabled = value || navBusy || authBusy || !anchor;
}
function element(tag, text, cls) {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (cls) e.className = cls;
  return e;
}
function render() {
  const focus = document.activeElement;
  const fid = actionFocus?.id ?? focus?.id;
  const threadFocus = actionFocus?.thread ?? focus?.closest?.(".thread")?.id;
  const selection =
    focus instanceof HTMLTextAreaElement
      ? [focus.selectionStart, focus.selectionEnd]
      : null;
  for (const e of document.querySelectorAll(".reply-text"))
    drafts.set(e.id, e.value);
  $("threads").replaceChildren();
  const shown = threads.filter((t) => !$("unanswered").checked || t.unanswered);
  if (!shown.length)
    $("threads").append(
      element(
        "p",
        "No questions in this view yet. Start with the passage.",
        "hint",
      ),
    );
  for (const t of shown) {
    const row = element("section", undefined, "thread");
    row.id = `thread-${t.id}`;
    row.tabIndex = -1;
    row.append(element("h3", t.name), element("p", t.text, "body"));
    row.append(
      element(
        "p",
        `${t.resolved ? "Resolved" : "Open"} · ${t.unanswered ? "No reply from another participant" : "Has a visible reply"} · version ${t.version}`,
        "meta",
      ),
    );
    for (const event of t.history ?? [])
      row.append(
        element(
          "p",
          `${event.name}: ${event.kind} · ${new Date(event.created).toLocaleString()}`,
          "meta",
        ),
      );
    const context = element("a", "Return to passage");
    context.href = "#passage";
    context.id = `context-${t.id}`;
    row.append(context);
    if (t.orphan)
      row.append(element("blockquote", t.anchor.quote, "original-quote"));
    if (t.orphan)
      row.append(
        element(
          "p",
          "Original anchor unavailable. Posting is disabled; no automatic reattachment.",
        ),
      );
    for (const r of t.replies) {
      const reply = element("div", undefined, "reply");
      reply.append(element("strong", r.name), element("p", r.text, "body"));
      if (actor.role === "instructor" && !t.orphan) {
        const hide = element("button", "Hide reply");
        hide.type = "button";
        hide.id = `hide-${r.id}`;
        hide.addEventListener("click", () =>
          submit(
            { kind: "hide", thread: t.id, version: t.version, reply: r.id },
            null,
          ),
        );
        reply.append(hide);
      }
      row.append(reply);
    }
    if (!t.orphan) {
      const form = element("form");
      const label = element("label", "Reply to this question");
      const input = element("textarea");
      input.id = `reply-${t.id}`;
      input.className = "reply-text";
      input.maxLength = 4000;
      input.required = true;
      input.rows = 2;
      input.value = drafts.get(input.id) ?? "";
      label.htmlFor = input.id;
      const send = element("button", "Post reply");
      send.id = `send-${t.id}`;
      form.append(label, input, send);
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        submit(
          {
            kind: "reply",
            thread: t.id,
            version: t.version,
            text: input.value,
          },
          input.id,
        );
      });
      row.append(form);
      if (t.canResolve) {
        const resolve = element(
          "button",
          t.resolved ? "Reopen question" : "Resolve question",
        );
        resolve.id = `resolve-${t.id}`;
        resolve.type = "button";
        resolve.addEventListener("click", () =>
          submit(
            {
              kind: t.resolved ? "reopen" : "resolve",
              thread: t.id,
              version: t.version,
            },
            null,
          ),
        );
        row.append(resolve);
      }
    }
    $("threads").append(row);
  }
  lock(busy || !!pending);
  if (fid && $(fid)) {
    $(fid).focus({ preventScroll: true });
    if (selection && $(fid) instanceof HTMLTextAreaElement)
      $(fid).setSelectionRange(...selection);
  } else if (threadFocus && $(threadFocus))
    $(threadFocus).focus({ preventScroll: true });
  if (actionFocus && document.activeElement === document.body)
    $("refresh").focus({ preventScroll: true });
  actionFocus = null;
}
async function refresh() {
  const serial = ++refreshSerial;
  try {
    const loaded = await api(scope("threads"));
    if (serial !== refreshSerial || !actor) return;
    threads = loaded;
    render();
  } catch (e) {
    if (serial !== refreshSerial) return;
    if (e.status === 401 || e.status === 403) clearPrivate();
    throw e;
  }
}
async function signedIn(credentials) {
  const version = ++authVersion;
  authBusy = true;
  lock(!!pending);
  $("login").querySelector("button").disabled = true;
  try {
    if (credentials) {
      await api("login", credentials);
      if (version !== authVersion) return false;
      $("password").value = "";
    }
    const signedActor = await api("session");
    if (version !== authVersion) return false;
    actor = signedActor;
    $("login").hidden = true;
    $("member").hidden = false;
    $("identity").textContent = `Signed in as ${actor.name}`;
    $("filter-label").hidden = actor.role !== "instructor";
    $("unanswered").checked = false;
    await refresh();
    return version === authVersion;
  } catch (e) {
    if (version !== authVersion) return false;
    throw e;
  } finally {
    if (version === authVersion) {
      authBusy = false;
      lock(!!pending);
      $("login").querySelector("button").disabled = !(anchor || context);
    }
  }
}
async function accepted(result, request, generation) {
  const input = request.input;
  if (input) {
    const current = $(input)?.value ?? drafts.get(input);
    if (current === request.command.text) {
      drafts.delete(input);
      if ($(input)) $(input).value = "";
    }
  }
  pending = null;
  busy = false;
  $("recover").hidden = true;
  try {
    await refresh();
    if (generation !== sessionGeneration) return;
    say(`Saved and acknowledged. Thread version ${result.version}.`);
  } catch (e) {
    if (generation !== sessionGeneration) return;
    say(`Saved and acknowledged. Refresh failed: ${e.message}`);
  }
}
async function submit(command, input) {
  if (busy || pending || navBusy || authBusy) return;
  actionFocus = {
    id: document.activeElement?.id,
    thread: document.activeElement?.closest?.(".thread")?.id,
  };
  pending = {
    command: {
      ...command,
      ...(context && !legacyContext(context)
        ? { context: { ...context } }
        : {}),
      actor: actor.id,
      key: crypto.randomUUID(),
    },
    input,
  };
  const request = pending,
    generation = sessionGeneration;
  const current = () => generation === sessionGeneration && pending === request;
  lock(true);
  try {
    const result = await api("commands", request.command);
    if (!current()) return;
    await accepted(result, request, generation);
  } catch (e) {
    if (!current()) return;
    if (e.status && e.status < 500 && e.code !== "IDENTITY_CHANGED") {
      pending = null;
      if (e.status === 401 || e.status === 403) clearPrivate();
      say(e.message);
    } else {
      say(
        "Submission outcome unknown. Keep this page open and reconcile before trying again.",
      );
      $("recover").hidden = false;
    }
  } finally {
    if (
      generation === sessionGeneration &&
      (pending === request || pending === null)
    )
      lock(!!pending);
  }
}
$("recover").addEventListener("click", async () => {
  if (!pending) return;
  const request = pending,
    generation = sessionGeneration;
  const current = () => generation === sessionGeneration && pending === request;
  $("recover").disabled = true;
  try {
    const receipt = await api(
      scope(`receipts/${request.command.key}`, request.command.context),
    );
    if (!current()) return;
    const result = receipt ?? (await api("commands", request.command));
    if (!current()) return;
    await accepted(result, request, generation);
  } catch (e) {
    if (!current()) return;
    if (e.status && e.status < 500 && e.code !== "IDENTITY_CHANGED") {
      pending = null;
      $("recover").hidden = true;
      if (e.status === 401 || e.status === 403) clearPrivate();
    }
    say(e.message);
  } finally {
    if (
      generation === sessionGeneration &&
      (pending === request || pending === null)
    ) {
      $("recover").disabled = false;
      lock(!!pending);
    }
  }
});
$("login").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    if (
      await signedIn({
        username: $("username").value,
        password: $("password").value,
      })
    )
      say("Private discussion loaded. All participants here are invented.");
  } catch (e) {
    clearPrivate();
    say(e.message);
  }
});
$("logout").addEventListener("click", async () => {
  try {
    await api("logout", {});
    clearPrivate();
    say("Signed out. Public reading remains available.");
  } catch (e) {
    say(e.message);
  }
});
$("refresh").addEventListener("click", async () => {
  try {
    await refresh();
    say("Discussion refreshed. Your unsent text stays on this page.");
  } catch (e) {
    say(e.message);
  }
});
$("unanswered").addEventListener("change", render);
$("question").addEventListener("submit", (event) => {
  event.preventDefault();
  if (!anchor) {
    say("The pinned passage is unavailable. Reload before posting.");
    return;
  }
  submit(
    { kind: "question", text: $("question-text").value, anchor },
    "question-text",
  );
});
$("select-passage").addEventListener("click", () => {
  (actor ? $("question-text") : $("username")).focus();
  say(
    actor
      ? "Your question will stay attached to this exact passage."
      : "Sign in with a provisioned demo account to discuss this passage.",
  );
});
window.addEventListener("pagehide", clearPrivate);
window.addEventListener("pageshow", (event) => {
  if (event.persisted) initialize();
});
function options(select, values, chosen) {
  select.replaceChildren(
    ...values.map(
      (v) => new Option(v.label, v.value, false, v.value === chosen),
    ),
  );
}
const displayTitle = (value) => value.replace(/ - Dev LibreTexts$/, "");
function showSource(content) {
  document.title = `${displayTitle(content.title)} · Social Reading`;
  $("page-title").textContent = displayTitle(content.title);
  $("book-title").textContent = displayTitle(content.book);
  $("passage").textContent = content.text;
  const source = element(
    "a",
    "Open the full textbook page, attribution and licensing",
  );
  source.href = content.source;
  $("attribution").replaceChildren(
    document.createTextNode(
      `${content.authors ?? "Existing LibreTexts mirror"}. ${displayTitle(content.book)}. `,
    ),
    source,
  );
  if (content.license) {
    const license = element("a", content.license);
    license.href = content.licenseUrl;
    $("attribution").append(
      document.createTextNode(" Excerpt licensed "),
      license,
      document.createTextNode("; this excerpt view uses that license."),
    );
  }
  $("content-limit").textContent = content.skipped
    ? `${content.skipped} other blocks are not offered as plain-text passages here. Use the full textbook for mathematical, media, table and other context.`
    : "";
}
async function navigate(choice, initial = false) {
  if (pending || busy || authBusy) {
    say("Reconcile the current submission before changing passages.");
    return;
  }
  const focus = document.activeElement?.id;
  if (actor) questionDrafts.set(selectionKey(), $("question-text").value);
  const generation = ++sessionGeneration;
  refreshSerial++;
  navBusy = true;
  lock(false);
  try {
    const pages = await api(
      `pages?${new URLSearchParams({ book: choice.book })}`,
    );
    const pageId =
      choice.page ??
      availableBooks.find((b) => b.key === choice.book)?.defaultPage ??
      pages.find((p) => p.passageCount > 0)?.id ??
      pages[0]?.id;
    if (!pageId || !pages.some((p) => p.id === pageId))
      throw new Error(
        "This textbook page is unavailable in the pinned catalog.",
      );
    const page = await api(
      `page?${new URLSearchParams({ book: choice.book, page: pageId })}`,
    );
    const block = choice.block || page.passages[0]?.block || "";
    if (block && !page.passages.some((p) => p.block === block))
      throw new Error("This passage is unavailable in the pinned catalog.");
    const nextContext = { book: choice.book, page: pageId, block };
    const chosen = page.passages.find((p) => p.block === block);
    const content = chosen?.anchor
      ? await api(scope("passage", nextContext))
      : {
          title: page.title,
          book: page.bookTitle,
          source: page.source,
          text: "No supported plain-text passage is available. Open the original textbook page for its full content.",
          skipped: page.skipped,
        };
    if (chosen?.anchor && content.anchor.revision !== page.revision)
      throw new Error(
        "The textbook revision changed during selection. Choose the page again.",
      );
    context = nextContext;
    anchor = content.anchor ?? null;
    $("book-choice").value = choice.book;
    options(
      $("page-choice"),
      pages.map((p) => ({
        value: p.id,
        label: displayTitle(p.title) + (p.passageCount ? "" : " (source only)"),
      })),
      pageId,
    );
    options(
      $("passage-choice"),
      page.passages.length
        ? page.passages.map((p, i) => ({
            value: p.block,
            label: `Passage ${i + 1}: ${p.quote.slice(0, 100)}${p.quote.length > 100 ? "…" : ""}`,
          }))
        : [{ value: "", label: "No supported plain-text passages" }],
      block,
    );
    showSource(content);
    threads = [];
    render();
    if (generation === sessionGeneration)
      $("question-text").value = questionDrafts.get(selectionKey()) ?? "";
    if (!initial)
      history.replaceState(
        null,
        "",
        `${location.pathname}?${new URLSearchParams(context)}`,
      );
    if (actor) await refresh();
    if (!initial)
      say(
        anchor
          ? "Passage selected. Discussion is scoped to this exact textbook context."
          : "This page is available in the source textbook; new annotation is unavailable here.",
      );
  } catch (e) {
    if (context) {
      $("book-choice").value = context.book;
      $("page-choice").value = context.page;
      $("passage-choice").value = context.block;
    }
    say(e.message);
    throw e;
  } finally {
    navBusy = false;
    lock(!!pending);
    if (focus && $(focus)) $(focus).focus({ preventScroll: true });
  }
}
$("book-choice").addEventListener("change", () =>
  navigate({ book: $("book-choice").value }).catch(() => {}),
);
$("page-choice").addEventListener("change", () =>
  navigate({
    book: $("book-choice").value,
    page: $("page-choice").value,
  }).catch(() => {}),
);
$("passage-choice").addEventListener("change", () =>
  navigate({
    book: $("book-choice").value,
    page: $("page-choice").value,
    block: $("passage-choice").value,
  }).catch(() => {}),
);
async function initialize() {
  const params = new URLSearchParams(location.search);
  let selectionReady = false;
  $("login").querySelector("button").disabled = true;
  try {
    const books = await api("books"),
      book = params.get("book") ?? books[0].key;
    availableBooks = books;
    if (!books.some((b) => b.key === book))
      throw new Error("This textbook is unavailable in the pinned catalog.");
    options(
      $("book-choice"),
      books.map((b) => ({ value: b.key, label: displayTitle(b.title) })),
      book,
    );
    $("book-navigation").hidden = false;
    await navigate(
      {
        book,
        ...(params.has("page") ? { page: params.get("page") } : {}),
        ...(params.has("block") ? { block: params.get("block") } : {}),
      },
      true,
    );
    selectionReady = true;
    if (await signedIn())
      say(
        "Private discussion loaded. Unsent drafts from earlier pages are not retained.",
      );
  } catch (e) {
    clearPrivate();
    const book = params.get("book"),
      page = params.get("page"),
      block = params.get("block") ?? "";
    if (
      !selectionReady &&
      book &&
      page &&
      book.length <= 2000 &&
      page.length <= 2000 &&
      block.length <= 2000
    ) {
      context = { book, page, block };
      anchor = null;
      options(
        $("book-choice"),
        [
          ...availableBooks.map((b) => ({
            value: b.key,
            label: displayTitle(b.title),
          })),
          ...(!availableBooks.some((b) => b.key === book)
            ? [{ value: book, label: "Unavailable textbook" }]
            : []),
        ],
        book,
      );
      options(
        $("page-choice"),
        [{ value: page, label: "Unavailable historical page" }],
        page,
      );
      options(
        $("passage-choice"),
        [{ value: block, label: "Original passage unavailable" }],
        block,
      );
      $("book-navigation").hidden = false;
      showSource({
        title: "Original passage unavailable",
        book: "Archived textbook context",
        source: "https://library.libretexts.dev/",
        text: "This address is not available in the current pinned catalog. Authorized readers can still inspect its original discussion; new posting is disabled.",
      });
      try {
        if (await signedIn())
          say(
            "Original discussion is read-only until its exact source context is available.",
          );
      } catch (error) {
        clearPrivate();
        say(
          error.status === 401
            ? "Sign in to inspect the original private discussion. New posting is disabled."
            : error.message,
        );
      }
      lock(false);
      return;
    }
    if (e.status !== 401) say(e.message);
  }
}
initialize();
