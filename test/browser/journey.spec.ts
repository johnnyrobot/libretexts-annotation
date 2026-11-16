import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
function credentials() {
  return JSON.parse(readFileSync(".secrets/e2e.json", "utf8"));
}
async function login(page: Page, id: string) {
  await page.goto("/social-reading/");
  await page.getByLabel("Demo username").fill(id);
  await page.getByLabel("Password", { exact: true }).fill(credentials()[id]);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("#member")).toBeVisible();
}
test("keyboard passage question, second learner reply, reload and instructor resolution", async ({
  browser,
}) => {
  const c1 = await browser.newContext();
  const c2 = await browser.newContext();
  const c3 = await browser.newContext();
  const a = await c1.newPage(),
    b = await c2.newPage(),
    i = await c3.newPage();
  const question = `What makes an observation careful? ${Date.now()}`;
  await login(a, "alice");
  await a.getByRole("button", { name: "Discuss this passage" }).focus();
  await a.keyboard.press("Enter");
  await expect(a.getByLabel("Your passage question")).toBeFocused();
  await a.getByLabel("Your passage question").fill(question);
  await a.getByRole("button", { name: "Post question", exact: true }).click();
  await expect(a.getByRole("status")).toContainText("Saved and acknowledged");
  await login(b, "bob");
  const thread = b.locator(".thread").filter({ hasText: question });
  await thread
    .getByLabel("Reply to this question")
    .fill("We can record the method so another observer can repeat it.");
  await thread.getByRole("button", { name: "Post reply" }).click();
  await expect(b.getByRole("status")).toContainText("Saved and acknowledged");
  await a.reload();
  const original = a.locator(".thread").filter({ hasText: question });
  await expect(original).toContainText("another observer");
  await expect(original).toContainText("Has a visible reply");
  await login(i, "instructor");
  const reviewed = i.locator(".thread").filter({ hasText: question });
  await reviewed.getByRole("button", { name: "Resolve question" }).click();
  await expect(reviewed).toContainText("Resolved");
  await reviewed.getByRole("button", { name: "Reopen question" }).click();
  await expect(reviewed).toContainText("Open");
  await c1.close();
  await c2.close();
  await c3.close();
});
test("outsider is denied and public reading reflows without private discussion", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/social-reading/");
  await expect(page.locator("#passage")).toBeVisible();
  await expect(page.locator("#member")).toBeHidden();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByLabel("Demo username").fill("outsider");
  await page
    .getByLabel("Password", { exact: true })
    .fill(credentials().outsider);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("cannot access");
  await expect(page.locator("#threads")).toBeEmpty();
});
test("manual refresh preserves draft and focus; uncertain submission reconciles once", async ({
  page,
}) => {
  await login(page, "alice");
  const q = `Retry question ${Date.now()}`;
  await page.getByLabel("Your passage question").fill(q);
  let once = true;
  await page.route("**/api/commands", async (route) => {
    if (once) {
      once = false;
      await route.fetch();
      await route.abort();
    } else await route.continue();
  });
  await page
    .getByRole("button", { name: "Post question", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("outcome unknown");
  await page
    .getByRole("button", { name: "Reconcile uncertain submission" })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Saved and acknowledged",
  );
  await expect(page.locator(".thread").filter({ hasText: q })).toHaveCount(1);
  await page.getByLabel("Your passage question").fill("Unsent note");
  await page.getByRole("button", { name: "Refresh discussion" }).click();
  await expect(
    page.getByRole("button", { name: "Refresh discussion" }),
  ).toBeFocused();
  await expect(page.getByLabel("Your passage question")).toHaveValue(
    "Unsent note",
  );
  await page.reload();
  await expect(page.getByLabel("Your passage question")).toHaveValue("");
});

test("keyboard post retains focus and filtering retains hidden reply drafts", async ({
  page,
  browser,
}) => {
  await login(page, "instructor");
  const q = `Focus ${Date.now()}`;
  await page.getByLabel("Your passage question").fill(q);
  await page
    .getByRole("button", { name: "Post question", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Saved and acknowledged",
  );
  const thread = page.locator(".thread").filter({ hasText: q });
  const send = thread.getByRole("button", { name: "Post reply", exact: true });
  await thread
    .getByLabel("Reply to this question")
    .fill("Instructor self reply");
  await send.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status")).toContainText(
    "Saved and acknowledged",
  );
  await expect(send).toBeFocused();
  const otherContext = await browser.newContext();
  const other = await otherContext.newPage();
  await login(other, "bob");
  const otherThread = other.locator(".thread").filter({ hasText: q });
  await otherThread
    .getByLabel("Reply to this question")
    .fill("Another participant");
  await otherThread.getByRole("button", { name: "Post reply" }).click();
  await expect(other.getByRole("status")).toContainText(
    "Saved and acknowledged",
  );
  await otherContext.close();
  await page.getByRole("button", { name: "Refresh discussion" }).click();
  await expect(thread).toContainText("Has a visible reply");
  await thread.getByLabel("Reply to this question").fill("Preserve this draft");
  await page.getByLabel("Show questions without another visible reply").check();
  await page
    .getByLabel("Show questions without another visible reply")
    .uncheck();
  await expect(thread.getByLabel("Reply to this question")).toHaveValue(
    "Preserve this draft",
  );
  await thread.getByRole("button", { name: "Hide reply" }).first().focus();
  await page.keyboard.press("Enter");
  await expect(thread).toBeFocused();
});

test("account change retains the uncertain request until its original actor returns", async ({
  page,
}) => {
  await login(page, "alice");
  const q = `Identity recovery ${Date.now()}`;
  await page.getByLabel("Your passage question").fill(q);
  let once = true;
  await page.route("**/api/commands", async (route) => {
    if (once) {
      once = false;
      await route.fetch();
      await route.abort();
    } else await route.continue();
  });
  await page
    .getByRole("button", { name: "Post question", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("outcome unknown");
  const change = async (id: string) => {
    const r = await page.request.post("/social-reading/api/login", {
      headers: {
        origin: "http://127.0.0.1:4200",
        "content-type": "application/json",
      },
      data: { username: id, password: credentials()[id] },
    });
    expect(r.status()).toBe(200);
  };
  await change("bob");
  await page
    .getByRole("button", { name: "Reconcile uncertain submission" })
    .click();
  await expect(page.getByRole("status")).toContainText("identity changed");
  await expect(
    page.getByRole("button", { name: "Reconcile uncertain submission" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Post question", exact: true }),
  ).toBeDisabled();
  await change("alice");
  await page
    .getByRole("button", { name: "Reconcile uncertain submission" })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Saved and acknowledged",
  );
  await expect(page.locator(".thread").filter({ hasText: q })).toHaveCount(1);
});

test("question submission retains focus and filtered-away reply returns focus to discussion controls", async ({
  page,
  browser,
}) => {
  await login(page, "alice");
  const q = `Stable focus ${Date.now()}`;
  await page.getByLabel("Your passage question").fill(q);
  const post = page.getByRole("button", { name: "Post question", exact: true });
  await post.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".thread").filter({ hasText: q })).toHaveCount(1);
  await expect(post).toBeFocused();
  const context = await browser.newContext();
  const instructor = await context.newPage();
  await login(instructor, "instructor");
  await instructor
    .getByLabel("Show questions without another visible reply")
    .check();
  const thread = instructor.locator(".thread").filter({ hasText: q });
  await thread
    .getByLabel("Reply to this question")
    .fill("A reply removes this question from unanswered.");
  await thread.getByRole("button", { name: "Post reply", exact: true }).focus();
  await instructor.keyboard.press("Enter");
  await expect(thread).toHaveCount(0);
  await expect(
    instructor.getByRole("button", { name: "Refresh discussion" }),
  ).toBeFocused();
  await context.close();
});

test("an older delayed refresh cannot hide a newly acknowledged question", async ({
  page,
}) => {
  await login(page, "alice");
  let release: any;
  let capturedResolve: () => void;
  const captured = new Promise<void>((r) => (capturedResolve = r));
  let first = true;
  await page.route("**/api/threads", async (route) => {
    if (first) {
      first = false;
      const response = await route.fetch();
      release = () => route.fulfill({ response });
      capturedResolve();
    } else await route.continue();
  });
  await page.getByRole("button", { name: "Refresh discussion" }).click();
  await captured;
  const q = `Newest acknowledgement ${Date.now()}`;
  await page.getByLabel("Your passage question").fill(q);
  await page
    .getByRole("button", { name: "Post question", exact: true })
    .click();
  await expect(page.locator(".thread").filter({ hasText: q })).toHaveCount(1);
  await release();
  await expect(page.getByRole("status")).toContainText("Discussion refreshed");
  await expect(page.locator(".thread").filter({ hasText: q })).toHaveCount(1);
});

for (const phase of ["submission", "recovery"] as const)
  test(`a delayed previous-account ${phase} cannot consume the new account retry state`, async ({
    page,
  }) => {
    await login(page, "alice");
    let releaseAlice: () => Promise<void>;
    let capturedResolve: () => void;
    const captured = new Promise<void>((r) => (capturedResolve = r));
    const question = `Old account ${Date.now()}`;
    await page.route("**/api/commands", async (route) => {
      const body = route.request().postDataJSON();
      if (body.actor === "alice" && phase === "submission") {
        const response = await route.fetch();
        releaseAlice = () => route.fulfill({ response });
        capturedResolve();
      } else {
        await route.fetch();
        await route.abort();
      }
    });
    if (phase === "recovery")
      await page.route("**/api/receipts/*", async (route) => {
        const response = await route.fetch();
        releaseAlice = () => route.fulfill({ response });
        capturedResolve();
      });
    await page.getByLabel("Your passage question").fill(question);
    await page
      .getByRole("button", { name: "Post question", exact: true })
      .click();
    if (phase === "recovery") {
      await expect(page.getByRole("status")).toContainText("outcome unknown");
      await page
        .getByRole("button", { name: "Reconcile uncertain submission" })
        .click();
    }
    await captured;
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page.locator("#login")).toBeVisible();
    await page.getByLabel("Demo username").fill("bob");
    await page.getByLabel("Password", { exact: true }).fill(credentials().bob);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.locator("#member")).toBeVisible();
    await page
      .getByLabel("Your passage question")
      .fill("Bob pending " + Date.now());
    await page
      .getByRole("button", { name: "Post question", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("outcome unknown");
    const delivered = page.waitForResponse((r) =>
      phase === "recovery"
        ? r.url().includes("/api/receipts/")
        : r.url().endsWith("/api/commands") &&
          r.request().postDataJSON().actor === "alice",
    );
    await releaseAlice!();
    await (await delivered).finished();
    await page.evaluate(
      () =>
        new Promise<void>((r) =>
          requestAnimationFrame(() => requestAnimationFrame(() => r())),
        ),
    );
    await expect(
      page.getByRole("button", { name: "Reconcile uncertain submission" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Post question", exact: true }),
    ).toBeDisabled();
    await expect(page.getByLabel("Your passage question")).toHaveValue(
      /^Bob pending /,
    );
  });
