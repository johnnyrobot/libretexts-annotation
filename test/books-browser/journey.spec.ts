import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
const credentials = () =>
  JSON.parse(readFileSync(".secrets/e2e-books.json", "utf8"));
async function login(page: Page, id: string) {
  await page.goto("/social-reading/?book=alpha&page=index.html&block=p-0");
  await page.getByLabel("Demo username").fill(id);
  await page.getByLabel("Password", { exact: true }).fill(credentials()[id]);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("#member")).toBeVisible();
}
test("book selection, question, second-account reply and reload remain scoped", async ({
  browser,
}) => {
  const aContext = await browser.newContext(),
    bContext = await browser.newContext();
  const a = await aContext.newPage(),
    b = await bContext.newPage();
  await login(a, "alice");
  const q = `Alpha book ${Date.now()}`;
  await a.getByLabel("Your passage question").fill(q);
  await a.getByRole("button", { name: "Post question", exact: true }).click();
  await expect(a.locator(".thread").filter({ hasText: q })).toHaveCount(1);
  await a.getByLabel("Textbook", { exact: true }).selectOption("beta");
  await expect(a.locator("#passage")).toContainText("synthetic mixture");
  await expect(a.locator(".thread").filter({ hasText: q })).toHaveCount(0);
  await login(b, "bob");
  const thread = b.locator(".thread").filter({ hasText: q });
  await thread
    .getByLabel("Reply to this question")
    .fill("A second reader answers in Alpha.");
  await thread.getByRole("button", { name: "Post reply", exact: true }).click();
  await expect(thread).toContainText("A second reader answers");
  await a.getByLabel("Textbook", { exact: true }).selectOption("alpha");
  await expect(a.locator("#passage")).toContainText("synthetic cell");
  await a.reload();
  await expect(a.locator(".thread").filter({ hasText: q })).toContainText(
    "A second reader answers",
  );
  await aContext.close();
  await bContext.close();
});
test("passage navigation preserves page-memory drafts and keyboard focus", async ({
  page,
}) => {
  await login(page, "alice");
  await page.getByLabel("Your passage question").fill("An unsent Alpha draft");
  const book = page.getByLabel("Textbook", { exact: true });
  await book.focus();
  await book.selectOption("beta");
  await expect(page.locator("#passage")).toContainText("synthetic mixture");
  await expect(book).toBeFocused();
  await expect(page.getByLabel("Your passage question")).toHaveValue("");
  await book.selectOption("alpha");
  await expect(page.getByLabel("Your passage question")).toHaveValue(
    "An unsent Alpha draft",
  );
  await page.getByLabel("Passage", { exact: true }).selectOption("p-1");
  await expect(page.locator("#passage")).toContainText("different observation");
  await expect(page.getByLabel("Your passage question")).toHaveValue("");
});
test("anonymous book reading works and outsider sees no private discussion", async ({
  page,
}) => {
  await page.goto("/social-reading/?book=beta&page=index.html&block=");
  await expect(page.locator("#passage")).toContainText("synthetic mixture");
  await expect(page.locator("#member")).toBeHidden();
  await page.getByLabel("Demo username").fill("outsider");
  await page
    .getByLabel("Password", { exact: true })
    .fill(credentials().outsider);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("cannot access");
  await expect(page.locator("#threads")).toBeEmpty();
});

test("missing historical page permits authorized read-only recovery without guessed posting", async ({
  page,
}) => {
  await page.goto("/social-reading/?book=removed-book&page=old-page&block=p-0");
  await expect(page.locator("#passage")).toContainText(
    "new posting is disabled",
  );
  await page.getByLabel("Demo username").fill("alice");
  await page.getByLabel("Password", { exact: true }).fill(credentials().alice);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("#member")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Post question", exact: true }),
  ).toBeDisabled();
  await expect(page.locator("#threads")).toContainText("No questions");
});

test("an invalid sample address never aliases the live sample discussion", async ({
  page,
}) => {
  await page.goto(
    "/social-reading/?book=__sample__&page=scientific-method&block=scientific-method-p1",
  );
  await page.getByLabel("Demo username").fill("alice");
  await page.getByLabel("Password", { exact: true }).fill(credentials().alice);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("#member")).toBeVisible();
  const q = `Legacy isolation ${Date.now()}`;
  await page.getByLabel("Your passage question").fill(q);
  await page
    .getByRole("button", { name: "Post question", exact: true })
    .click();
  await expect(page.locator(".thread").filter({ hasText: q })).toHaveCount(1);
  await page.goto("/social-reading/?book=__sample__&page=missing&block=p-0");
  await expect(page.locator("#member")).toBeVisible();
  await expect(page.locator(".thread").filter({ hasText: q })).toHaveCount(0);
  await expect(page.locator(".thread button")).toHaveCount(0);
});
test("composer waits for initial private load before accepting a submission", async ({
  page,
}) => {
  let release: () => Promise<void>;
  let capturedResolve: () => void;
  const captured = new Promise<void>((r) => (capturedResolve = r));
  let first = true;
  await page.route("**/api/threads?*", async (route) => {
    if (first) {
      first = false;
      const response = await route.fetch();
      release = () => route.fulfill({ response });
      capturedResolve();
    } else await route.continue();
  });
  await login(page, "alice");
  await captured;
  const post = page.getByRole("button", { name: "Post question", exact: true });
  await expect(post).toBeDisabled();
  await release!();
  await expect(post).toBeEnabled();
  await page
    .getByLabel("Your passage question")
    .fill("Initial load ordering " + Date.now());
  await post.click();
  await expect(page.getByRole("status")).toContainText(
    "Saved and acknowledged",
  );
});
test("server-supplied orphan rows expose no instructor mutation controls", async ({
  page,
  browser,
}) => {
  // The store's real revision/orphan behavior is separately exercised in catalog.test.ts.
  await login(page, "alice");
  const q = `Orphan presentation ${Date.now()}`;
  await page.getByLabel("Your passage question").fill(q);
  await page
    .getByRole("button", { name: "Post question", exact: true })
    .click();
  const t = page.locator(".thread").filter({ hasText: q });
  await t.getByLabel("Reply to this question").fill("Historical reply");
  await t.getByRole("button", { name: "Post reply", exact: true }).click();
  await expect(t).toContainText("Historical reply");
  const c = await browser.newContext(),
    i = await c.newPage();
  await i.route("**/api/threads?*", async (route) => {
    const response = await route.fetch();
    const rows = await response.json();
    await route.fulfill({
      response,
      json: rows.map((r: any) => (r.text === q ? { ...r, orphan: true } : r)),
    });
  });
  await login(i, "instructor");
  const orphan = i.locator(".thread").filter({ hasText: q });
  await expect(orphan).toContainText("Original anchor unavailable");
  await expect(orphan.locator("button")).toHaveCount(0);
  await c.close();
});
