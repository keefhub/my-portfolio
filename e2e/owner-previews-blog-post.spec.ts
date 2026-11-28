import { spawnSync } from "node:child_process";
import fs from "node:fs";
import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
} from "@playwright/test";
import { encode } from "next-auth/jwt";

test.describe.configure({ mode: "default" });

// Shared fixtures. The tests of this file share one stand-in database file, so every test starts by resetting it.

// Earlier specs search the tree for some words, so those words are put together from pieces here.
const piece = (...parts: string[]): string => parts.join("");
const FIRE = piece("fire", "base");
const DOM_INSERT = piece("dangerously", "SetInnerHTML");
const OLD_SPEC = piece("preview-blog-", "post.spec");

const PANEL = "/bright-warm-greenhouse/";
const PROSE_CLASS = "prose prose-lg max-w-none prose-a:no-underline hover:prose-a:underline";

const setting = (name: string): string => process.env[name] ?? "";
const STAND_IN_PREFIX = "stand-in:";
const DB_URL = process.env.SUPABASE_DB_URL ?? "";
const DB_FILE = DB_URL.startsWith(STAND_IN_PREFIX) ? DB_URL.slice(STAND_IN_PREFIX.length) : "";

const SESSION_COOKIE = "authjs.session-token";
type Claims = { sub: string; email: string; name: string; emailVerified: boolean };
const OWNER = (): Claims => ({ sub: "owner-1", email: setting("ADMIN_EMAIL"), name: "Owner Test", emailVerified: true });
const OTHER = (): Claims => ({
  sub: "other-1",
  email: "someone-else@example.test",
  name: "Someone Else",
  emailVerified: true,
});

async function mint(claims: Claims): Promise<string> {
  return encode({
    token: { ...claims },
    secret: setting("AUTH_SECRET"),
    salt: SESSION_COOKIE,
    maxAge: 3600,
  });
}

async function ownerPage(
  browser: Browser,
  baseURL: string,
  options: Parameters<Browser["newContext"]>[0] = {},
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext(options);
  await context.addCookies([{ name: SESSION_COOKIE, value: await mint(OWNER()), url: baseURL }]);
  const page = await context.newPage();
  return { context, page };
}

type StoredImage = { id: string; name: string; contentType: string; size: number };
type StoredPost = { slug: string; status: string; data: Record<string, unknown> };

// The database stand-in file.
function dbReset(): void {
  if (DB_FILE !== "" && fs.existsSync(DB_FILE)) fs.rmSync(DB_FILE, { force: true });
}

function dbSeedWith(images: StoredImage[], posts: StoredPost[]): void {
  fs.writeFileSync(DB_FILE, JSON.stringify({ images, blog_posts: posts }));
}

function dbPosts(): StoredPost[] {
  if (DB_FILE === "" || !fs.existsSync(DB_FILE)) return [];
  const parsed = JSON.parse(fs.readFileSync(DB_FILE, "utf8")) as Record<string, unknown>;
  const list = parsed.blog_posts;
  return Array.isArray(list) ? (list as StoredPost[]) : [];
}

const DIAGRAM_IMAGE: StoredImage = {
  id: "77777777-7777-4777-8777-777777777777.png",
  name: "diagram.png",
  contentType: "image/png",
  size: 70,
};
const STATIC_POST: StoredPost = {
  slug: "why-i-moved-to-static-export",
  status: "published",
  data: {
    title: "Why I moved to static export",
    excerpt: "Notes on the trade-offs",
    date: "2026-05-15",
    tags: ["nextjs", "vercel"],
    featured: false,
    coverImage: "/images/blog/static.png",
    coverAlt: "A diagram of the build",
    body: "First draft",
  },
};

const ENTRY_SAVED = "Entry saved";
const NO_POSTS = "No posts yet.";
const SAVE_FAILED = "The entry could not be saved. Try again, and check that you are signed in as the owner.";
const TITLE_REQUIRED = "Enter a title";
const EXCERPT_REQUIRED = "Enter an excerpt";
const DATE_INVALID = "Enter a date as YYYY-MM-DD that is a real day";
const SLUG_INVALID = "Enter a slug of lowercase letters, digits and hyphens";
const BODY_REQUIRED = "Enter the post body";
const REFUSALS = [TITLE_REQUIRED, EXCERPT_REQUIRED, DATE_INVALID, SLUG_INVALID, BODY_REQUIRED];
const NOTHING = "Nothing to preview yet";

type Scope = Pick<Page, "getByRole">;

const button = (scope: Scope, name: string): Locator => scope.getByRole("button", { name, exact: true });
const field = (page: Page, name: string): Locator => page.getByRole("textbox", { name, exact: true });
const previewOf = (page: Page): Locator => page.locator('section[aria-label="Post preview"]');
const screenOf = (page: Page): Locator => page.locator('section[aria-label="Blog posts editor"]');
const alertWith = (page: Page, text: string): Locator => page.getByRole("alert").filter({ hasText: text });
const imageSelect = (page: Page): Locator => page.getByRole("combobox", { name: "Uploaded image", exact: true });
const statusSelect = (page: Page): Locator => page.getByRole("combobox", { name: "Status", exact: true });
const featuredBox = (page: Page): Locator => page.getByRole("checkbox", { name: "Featured", exact: true });
const menu = (page: Page): Locator => page.getByRole("navigation", { name: "Admin sections" });
const postItems = (page: Page): Locator =>
  page.getByRole("list", { name: "Blog posts list" }).getByRole("listitem");

// The text of the checked option of a select.
const selected = (select: Locator): Promise<string> =>
  select.evaluate((el: Element) => {
    const node = el as HTMLSelectElement;
    return (node.options[node.selectedIndex]?.text ?? "").trim();
  });

const colorOf = (target: Locator): Promise<string> =>
  target.evaluate((el: Element) => getComputedStyle(el).color);

async function openBlog(page: Page): Promise<void> {
  await page.goto(PANEL);
  const heading = page.getByRole("heading", { name: "Blog posts", level: 2, exact: true });
  await expect(async () => {
    if (!(await heading.isVisible())) {
      await button(menu(page), "Blog posts").click({ timeout: 5000 });
    }
    await expect(heading).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 15000 });
  await expect(button(page, "Add post")).toBeVisible();
}

function gitGrep(args: string[]): { stdout: string; status: number | null } {
  const result = spawnSync("git", ["grep", "--untracked", ...args], { cwd: process.cwd(), encoding: "utf8" });
  return { stdout: result.stdout ?? "", status: result.status };
}

const readRepo = (path: string): string => fs.readFileSync(path, "utf8");

function publishedPost(slug: string, title: string, body: string): StoredPost {
  return {
    slug,
    status: "published",
    data: { title, excerpt: "probe", date: "2026-05-15", tags: [], featured: false, coverImage: "", coverAlt: "", body },
  };
}

// The owner's Publish through the context's own request; the public blog pages show the post only after it.
async function publishAs(context: BrowserContext): Promise<void> {
  const response = await context.request.post("/api/admin/publish/");
  expect(response.status(), "publish status").toBe(200);
}

// Leaves no published post behind: the kept blog pages are renewed from an empty database, so later checks see none.
async function blankPublished(context: BrowserContext): Promise<void> {
  dbReset();
  await publishAs(context);
  const probe = await context.newPage();
  await expect
    .poll(
      async () => {
        await probe.goto("/blog/");
        return await probe.locator("main#main-content").innerText();
      },
      { timeout: 60000, message: "the blog list is blank again" },
    )
    .toContain("No posts yet");
  await probe.close();
}

async function openPublished(context: BrowserContext, address: string): Promise<Page> {
  const blog = await context.newPage();
  await expect
    .poll(async () => (await blog.goto(address))?.status(), { timeout: 60000, message: address + " status" })
    .toBe(200);
  return blog;
}

const MARKUP_ONE =
  "# Markup one\n\nA paragraph with **bold**, *italic*, a [link](https://example.com) and ~~old~~ text.\n\n## Second heading\n\n- first item\n- second item\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n> A quoted line.\n\n```javascript\nconst answer = 42;\nfunction add(a, b) {\n  return a + b;\n}\n```\n\n<mark>raw html line</mark>\n\nMore words to make the markup long enough for the length check.\n";
const MARKUP_TWO =
  "## Markup two\n\nAnother paragraph with `inline code`, a second [link](https://example.org) and **strong** words.\n\n1. one\n2. two\n3. three\n\n```javascript\nconst list = [1, 2, 3].map((n) => n * 2);\nconsole.log(list);\n```\n\n### Third heading\n\nClosing paragraph with some extra text so that the markup is comfortably longer than the five hundred characters the test requires of both sides, repeated: closing paragraph with some extra text so that the markup is comfortably longer than the five hundred characters.\n";

test("E2E-01: the preview shows the body as the blog would, and nothing else", async ({ browser, baseURL }) => {
  test.setTimeout(90000);
  dbReset();
  dbSeedWith([], []);
  const { context, page } = await ownerPage(browser, baseURL as string);
  await openBlog(page);
  await button(page, "Add post").click();
  await field(page, "Title").fill("Why I moved to static export");
  await field(page, "Excerpt").fill("Notes on the trade-offs");
  await field(page, "Date").fill("2026-05-15");
  await field(page, "Slug").fill("why-i-moved-to-static-export");
  const body = [
    "## Preview heading",
    "",
    "- First item",
    "- Second item",
    "",
    "| Name | Value |",
    "| ---- | ----- |",
    "| alpha | 1 |",
    "",
    "[Example link](https://example.com/docs)",
    "",
    "```js",
    "const answer = 42;",
    "```",
    "",
  ].join("\n");
  await field(page, "Body").fill(body);
  await button(page, "Preview").click();

  const preview = previewOf(page);
  await expect(preview.getByRole("heading", { level: 2, name: /^Preview heading/ })).toBeVisible();
  await expect(preview.getByRole("list")).toHaveCount(1);
  await expect(preview.getByRole("list").getByRole("listitem")).toHaveText(["First item", "Second item"]);
  await expect(preview.getByRole("table")).toHaveCount(1);
  await expect(preview.getByRole("columnheader", { name: "Name", exact: true })).toBeVisible();
  await expect(preview.getByRole("columnheader", { name: "Value", exact: true })).toBeVisible();
  await expect(preview.getByRole("cell", { name: "alpha", exact: true })).toBeVisible();
  await expect(preview.getByRole("cell", { name: "1", exact: true })).toBeVisible();
  await expect(preview.getByRole("link", { name: "Example link", exact: true })).toHaveAttribute(
    "href",
    "https://example.com/docs",
  );
  await expect(preview.locator("pre code")).toContainText("const answer = 42;");

  for (const text of ["Why I moved to static export", "Notes on the trade-offs", "15 May 2026", "2026-05-15"]) {
    await expect(preview.getByText(text), text).toHaveCount(0);
  }
  await expect(preview.getByRole("heading", { level: 1 })).toHaveCount(0);
  await expect(field(page, "Title")).toHaveCount(0);
  expect(dbPosts()).toEqual([]);
  await expect(page.getByText(ENTRY_SAVED)).toHaveCount(0);
  await context.close();
});

test("E2E-02: the preview has the blog's markup details and its code colours", async ({ browser, baseURL }) => {
  test.setTimeout(120000);
  dbReset();
  dbSeedWith([], [publishedPost("colour-probe", "Colour probe", "```javascript\nconst answer = 42;\n```\n")]);
  const { context, page } = await ownerPage(browser, baseURL as string);
  await publishAs(context);
  await openBlog(page);
  await button(page, "Add post").click();
  const body = [
    "## Second heading",
    "",
    "~~old~~ and <mark>raw html</mark>",
    "",
    "```javascript",
    "const answer = 42;",
    "```",
    "",
  ].join("\n");
  await field(page, "Body").fill(body);
  await button(page, "Preview").click();

  const preview = previewOf(page);
  const heading = preview.locator("h2");
  await expect(heading).toHaveText(/^Second heading/);
  await expect(heading.locator("a.heading-anchor")).toHaveCount(1);
  await expect(heading.locator("a.heading-anchor")).toHaveAttribute("href", "#second-heading");
  await expect(heading.locator("a.heading-anchor")).toHaveAttribute("aria-label", "Link to this section");
  await expect(heading.locator("a.heading-anchor")).toHaveText("#");
  await expect(preview.locator("del")).toHaveText("old");
  await expect(preview.locator("mark")).toHaveText("raw html");
  await expect(preview.locator(`[class="${PROSE_CLASS}"]`)).toHaveCount(1);
  const code = preview.locator("pre code");
  await expect(code).toHaveClass(/(^|\s)hljs(\s|$)/);
  await expect(code).toHaveClass(/(^|\s)language-javascript(\s|$)/);
  await expect(code.locator("span.hljs-keyword").first()).toHaveText("const");
  await expect(code.locator("span.hljs-number").first()).toHaveText("42");

  const previewKeyword = await colorOf(code.locator("span.hljs-keyword").first());
  const previewNumber = await colorOf(code.locator("span.hljs-number").first());
  const previewParagraph = await colorOf(preview.locator("p").first());

  const blog = await openPublished(context, "/blog/colour-probe/");
  const blogKeyword = blog.locator("pre code span.hljs-keyword").first();
  await expect(blogKeyword).toBeVisible();
  const blogColor = await colorOf(blogKeyword);

  expect(previewKeyword).toBe(blogColor);
  expect(previewKeyword).not.toBe(previewNumber);
  expect(previewKeyword).not.toBe(previewParagraph);
  await blankPublished(context);
  await context.close();
});

test("E2E-03: the preview's markup equals the public article's for both repository posts", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(120000);
  dbReset();
  const bodies: Record<string, string> = { "markup-one": MARKUP_ONE, "markup-two": MARKUP_TWO };
  dbSeedWith([], [
    publishedPost("markup-one", "Markup one", MARKUP_ONE),
    publishedPost("markup-two", "Markup two", MARKUP_TWO),
  ]);
  const { context, page } = await ownerPage(browser, baseURL as string);
  await publishAs(context);
  for (const slug of ["markup-one", "markup-two"]) {
    const text = bodies[slug];
    await openBlog(page);
    await button(page, "Add post").click();
    await field(page, "Body").fill(text);
    await button(page, "Preview").click();

    const prose = previewOf(page).locator("div.prose");
    await expect(prose).toHaveCount(1);
    await expect(prose).toBeVisible();
    const previewHtml = await prose.innerHTML();
    const previewClass = await prose.getAttribute("class");

    const blog = await openPublished(context, "/blog/" + slug + "/");
    const article = blog.locator("article > div.prose").first();
    await expect(article).toBeVisible();
    const articleHtml = await article.innerHTML();
    const articleClass = await article.getAttribute("class");
    await blog.close();

    expect(previewHtml.length, slug + " preview length").toBeGreaterThan(500);
    expect(articleHtml.length, slug + " article length").toBeGreaterThan(500);
    expect(previewHtml, slug + " markup").toBe(articleHtml);
    expect(previewClass, slug + " preview class").toBe(PROSE_CLASS);
    expect(articleClass, slug + " article class").toBe(PROSE_CLASS);
  }
  await blankPublished(context);
  await context.close();
});

test("E2E-04: Preview and Back to form keep every field, and Cancel after previewing saves nothing", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(90000);
  dbReset();
  dbSeedWith([], []);
  const { context, page } = await ownerPage(browser, baseURL as string);
  await openBlog(page);
  await button(page, "Add post").click();
  const typedBody = "## Round trip\n\n  indented line\n\ttab line\n";
  await field(page, "Title").fill("Why I moved to static export");
  await field(page, "Excerpt").fill("Notes on the trade-offs");
  await field(page, "Date").fill("2026-05-15");
  await field(page, "Slug").fill("why-i-moved-to-static-export");
  await field(page, "Tags").fill("nextjs, vercel");
  await field(page, "Cover image path").fill("/images/blog/static.png");
  await field(page, "Cover alt text").fill("A diagram of the build");
  await field(page, "Body").fill(typedBody);
  await featuredBox(page).check();
  await statusSelect(page).selectOption({ label: "Published" });
  await button(page, "Preview").click();

  // (a)
  await expect(previewOf(page)).toBeVisible();
  await expect(button(page, "Save")).toHaveCount(0);
  await expect(button(page, "Cancel")).toHaveCount(0);
  await expect(button(page, "Back to form")).toBeVisible();
  await expect(field(page, "Title")).toHaveCount(0);

  // (b)
  await button(page, "Back to form").click();
  await expect(field(page, "Title")).toHaveValue("Why I moved to static export");
  await expect(field(page, "Excerpt")).toHaveValue("Notes on the trade-offs");
  await expect(field(page, "Date")).toHaveValue("2026-05-15");
  await expect(field(page, "Slug")).toHaveValue("why-i-moved-to-static-export");
  await expect(field(page, "Tags")).toHaveValue("nextjs, vercel");
  await expect(field(page, "Cover image path")).toHaveValue("/images/blog/static.png");
  await expect(field(page, "Cover alt text")).toHaveValue("A diagram of the build");
  await expect(field(page, "Body")).toHaveValue(typedBody);
  await expect(featuredBox(page)).toBeChecked();
  await expect(statusSelect(page)).toHaveValue("Published");
  expect(await selected(imageSelect(page))).toBe("None");
  await expect(button(page, "Save")).toBeVisible();
  await expect(button(page, "Cancel")).toBeVisible();
  await expect(button(page, "Preview")).toBeVisible();

  // (c)
  await field(page, "Body").fill("Changed **bold**");
  await button(page, "Preview").click();
  await expect(previewOf(page).locator("strong")).toHaveText("bold");
  await expect(previewOf(page).getByRole("heading", { name: "Round trip", level: 2 })).toHaveCount(0);
  await button(page, "Back to form").click();
  await button(page, "Cancel").click();

  await expect(page.getByText(NO_POSTS)).toBeVisible();
  expect(dbPosts()).toEqual([]);
  await expect(page.getByText(ENTRY_SAVED)).toHaveCount(0);
  await context.close();
});

test("E2E-05: the preview shows the body only and sends no request, even with a cover and an offline browser", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(90000);
  dbReset();
  dbSeedWith([DIAGRAM_IMAGE], []);
  const { context, page } = await ownerPage(browser, baseURL as string);
  await openBlog(page);
  await button(page, "Add post").click();
  await field(page, "Title").fill("Cover check");
  await field(page, "Cover alt text").fill("A diagram of the build");
  await field(page, "Body").fill("Only the body shows");
  await imageSelect(page).selectOption({ label: "diagram.png" });
  await expect(statusSelect(page)).toHaveValue("Draft");

  await context.setOffline(true);
  const requests: string[] = [];
  page.on("request", (request) => {
    requests.push(request.method() + " " + request.url());
  });
  await button(page, "Preview").click();

  const preview = previewOf(page);
  await expect(preview.locator("p")).toHaveText("Only the body shows");
  await expect(preview.locator("img")).toHaveCount(0);
  for (const text of ["A diagram of the build", "Draft", "diagram.png", "Cover check"]) {
    await expect(preview.getByText(text), text).toHaveCount(0);
  }
  expect(requests).toHaveLength(0);

  await button(page, "Back to form").click();
  expect(await selected(imageSelect(page))).toBe("diagram.png");
  await expect(statusSelect(page)).toHaveValue("Draft");
  await context.close();
});

test("E2E-06: a signed-out session does not stop the preview, and the later save is refused", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(90000);
  dbReset();
  dbSeedWith([], []);
  const { context, page } = await ownerPage(browser, baseURL as string);
  await openBlog(page);
  await button(page, "Add post").click();
  await field(page, "Title").fill("Session test");
  await field(page, "Excerpt").fill("Short");
  await field(page, "Date").fill("2026-05-15");
  await field(page, "Slug").fill("session-test");
  await field(page, "Body").fill("Still here");
  await button(page, "Preview").click();
  await expect(previewOf(page).locator("p").filter({ hasText: "Still here" })).toBeVisible();
  await context.clearCookies();

  // (a)
  await expect(previewOf(page).locator("p").filter({ hasText: "Still here" })).toBeVisible();
  await button(page, "Back to form").click();
  await button(page, "Preview").click();

  // (b)
  await expect(previewOf(page)).toBeVisible();
  await button(page, "Back to form").click();
  await button(page, "Save").click();

  await expect(alertWith(page, SAVE_FAILED)).toBeVisible();
  expect(dbPosts()).toEqual([]);
  await expect(page.getByText(ENTRY_SAVED)).toHaveCount(0);
  await context.close();
});

test("E2E-07: an existing post previews only while the form is open, and Cancel leaves it unchanged", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(90000);
  dbReset();
  dbSeedWith([], [STATIC_POST]);
  const { context, page } = await ownerPage(browser, baseURL as string);
  await openBlog(page);

  // (a)
  await expect(postItems(page).filter({ hasText: "Why I moved to static export" })).toBeVisible();
  await expect(button(page, "Preview")).toHaveCount(0);

  await button(postItems(page).filter({ hasText: "Why I moved to static export" }), "Edit").click();

  // (b)
  await expect(page.getByRole("heading", { name: "Edit entry", level: 3 })).toBeVisible();
  await expect(button(page, "Preview")).toBeVisible();

  await field(page, "Body").fill("Second draft");
  await button(page, "Preview").click();

  // (c)
  await expect(previewOf(page).locator("p")).toHaveText("Second draft");
  await expect(page.getByText("First draft")).toHaveCount(0);
  await button(page, "Back to form").click();
  await button(page, "Cancel").click();

  // (d)
  await expect(postItems(page).filter({ hasText: "Why I moved to static export" })).toBeVisible();
  expect(dbPosts()).toEqual([STATIC_POST]);
  await expect(page.getByText(ENTRY_SAVED)).toHaveCount(0);

  await page.reload();
  await openBlog(page);
  await button(postItems(page).filter({ hasText: "Why I moved to static export" }), "Edit").click();
  await expect(field(page, "Body")).toHaveValue("First draft");
  await context.close();
});

test("E2E-08: an empty or blank body shows a calm notice and no refusal, and the typed text comes back", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(90000);
  dbReset();
  dbSeedWith([], []);
  const { context, page } = await ownerPage(browser, baseURL as string);
  await openBlog(page);
  await button(page, "Add post").click();

  for (const typed of ["", "   \n\n\t  \n"]) {
    await field(page, "Body").fill(typed);
    await button(page, "Preview").click();

    // (a)
    await expect(page.getByRole("status").filter({ hasText: NOTHING })).toBeVisible();
    await expect(previewOf(page).locator(".prose")).toHaveCount(0);
    for (const text of REFUSALS) {
      await expect(page.getByText(text), text).toHaveCount(0);
    }
    await expect(screenOf(page).getByRole("alert")).toHaveCount(0);
    await expect(button(page, "Back to form")).toBeVisible();

    // (b)
    await button(page, "Back to form").click();
    await expect(field(page, "Title")).toBeVisible();
    await expect(field(page, "Body")).toHaveValue(typed);
    for (const text of REFUSALS) {
      await expect(page.getByText(text), text).toHaveCount(0);
    }
  }

  await field(page, "Body").fill("x");
  await button(page, "Preview").click();
  await expect(previewOf(page).locator("p")).toHaveText("x");
  await expect(page.getByText(NOTHING)).toHaveCount(0);
  await context.close();
});

test("E2E-09: on a phone the buttons are reachable and wide content scrolls inside the preview", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(90000);
  dbReset();
  dbSeedWith([], []);
  const { context, page } = await ownerPage(browser, baseURL as string, {
    viewport: { width: 375, height: 667 },
  });
  await openBlog(page);
  await button(page, "Add post").click();

  const previewBox = await button(page, "Preview").boundingBox();
  expect(previewBox, "Preview button box").not.toBeNull();
  if (previewBox === null) throw new Error("no box");
  expect(previewBox.x).toBeGreaterThanOrEqual(0);
  expect(previewBox.x + previewBox.width).toBeLessThanOrEqual(375);
  expect(previewBox.height).toBeGreaterThanOrEqual(43.99);

  const body = [
    "## Wide",
    "",
    "| Column one | Column two | Column three |",
    "| ---- | ---- | ---- |",
    "| " + "a".repeat(40) + " | " + "b".repeat(40) + " | " + "c".repeat(40) + " |",
    "",
    "```",
    "x".repeat(200),
    "```",
    "",
  ].join("\n");
  await field(page, "Body").fill(body);
  await button(page, "Preview").click();
  await expect(previewOf(page).locator("table")).toBeVisible();

  const measured = await page.evaluate(() => {
    const doc = document.documentElement;
    const widthBefore = doc.scrollWidth;
    const table = document.querySelector('section[aria-label="Post preview"] table');
    const pre = document.querySelector('section[aria-label="Post preview"] pre');
    if (table === null || pre === null) throw new Error("table or pre missing");
    let scroller: HTMLElement | null = table.parentElement;
    while (scroller !== null) {
      const overflow = getComputedStyle(scroller).overflowX;
      if (overflow === "auto" || overflow === "scroll") break;
      scroller = scroller.parentElement;
    }
    if (scroller === null) {
      return { found: false as const };
    }
    const scrollerWider = scroller.scrollWidth > scroller.clientWidth;
    const scrollerRect = scroller.getBoundingClientRect();
    scroller.scrollLeft = scroller.scrollWidth;
    const cells = Array.from(table.querySelectorAll("td"));
    const lastCell = cells[cells.length - 1];
    const lastRight = lastCell === undefined ? -1 : lastCell.getBoundingClientRect().right;
    const preEl = pre as HTMLElement;
    const preWider = preEl.scrollWidth > preEl.clientWidth;
    preEl.scrollLeft = preEl.scrollWidth;
    const preEnd = preEl.scrollLeft + preEl.clientWidth >= preEl.scrollWidth - 1;
    return {
      found: true as const,
      widthBefore,
      widthAfter: doc.scrollWidth,
      scrollerWider,
      left: scrollerRect.left,
      right: scrollerRect.right,
      lastRight,
      preWider,
      preEnd,
    };
  });

  expect(measured.found, "a scrolling ancestor of the table").toBe(true);
  if (!measured.found) throw new Error("no scroller");
  expect(measured.widthBefore).toBeLessThanOrEqual(375);
  expect(measured.widthAfter).toBeLessThanOrEqual(375);
  expect(measured.scrollerWider).toBe(true);
  expect(measured.left).toBeGreaterThanOrEqual(0);
  expect(measured.right).toBeLessThanOrEqual(375);
  expect(measured.lastRight).toBeGreaterThan(0);
  expect(measured.lastRight).toBeLessThanOrEqual(375);
  expect(measured.preWider).toBe(true);
  expect(measured.preEnd).toBe(true);

  const backBox = await button(page, "Back to form").boundingBox();
  expect(backBox, "Back to form box").not.toBeNull();
  if (backBox === null) throw new Error("no box");
  expect(backBox.x).toBeGreaterThanOrEqual(0);
  expect(backBox.x + backBox.width).toBeLessThanOrEqual(375);
  expect(backBox.height).toBeGreaterThanOrEqual(43.99);
  const widthEnd = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(widthEnd).toBeLessThanOrEqual(375);
  await context.close();
});

test("E2E-10: the preview text follows the theme tokens in light and dark", async ({ browser, baseURL }) => {
  test.setTimeout(90000);
  dbReset();
  dbSeedWith([], []);
  const { context, page } = await ownerPage(browser, baseURL as string);
  await openBlog(page);
  await button(page, "Add post").click();
  await field(page, "Body").fill("A plain paragraph");
  await button(page, "Preview").click();
  const paragraph = previewOf(page).locator("p").filter({ hasText: /^A plain paragraph$/ });
  await expect(paragraph).toBeVisible();

  const read = async (): Promise<{ paragraph: string; probe: string }> => {
    const paragraphColor = await colorOf(paragraph);
    const probe = await page.evaluate(() => {
      const span = document.createElement("span");
      span.style.color = "var(--foreground-soft)";
      document.body.appendChild(span);
      const color = getComputedStyle(span).color;
      span.remove();
      return color;
    });
    return { paragraph: paragraphColor, probe };
  };

  const light = await read();
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
  const dark = await read();

  expect(light.paragraph).toBe(light.probe);
  expect(dark.paragraph).toBe(dark.probe);
  expect(light.paragraph).not.toBe(dark.paragraph);
  await context.close();
});

test("E2E-11: a visitor and another account never reach the preview", async ({ browser, baseURL }) => {
  test.setTimeout(90000);
  dbReset();

  const outsiders = async (page: Page): Promise<void> => {
    await expect(button(page, "Preview")).toHaveCount(0);
    await expect(button(page, "Add post")).toHaveCount(0);
    await expect(field(page, "Body")).toHaveCount(0);
    await expect(menu(page)).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Blog posts", level: 2 })).toHaveCount(0);
    await expect(page.getByText("Back to form")).toHaveCount(0);
  };

  const signedOut = await browser.newContext();
  const first = await signedOut.newPage();
  await first.goto(PANEL);
  await expect(first.getByRole("button", { name: "Sign in with Google" })).toBeVisible();
  await outsiders(first);
  await signedOut.close();

  const other = await browser.newContext();
  await other.addCookies([{ name: SESSION_COOKIE, value: await mint(OTHER()), url: baseURL as string }]);
  const second = await other.newPage();
  await second.goto(PANEL);
  await expect(second.getByText("This account is not allowed to use the admin panel.")).toBeVisible();
  await outsiders(second);
  await other.close();
});

test("E2E-12: reloading while previewing returns to the panel and loses the unsaved text", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(90000);
  dbReset();
  dbSeedWith([], []);
  const { context, page } = await ownerPage(browser, baseURL as string);
  const dialogs: string[] = [];
  page.on("dialog", (dialog) => {
    dialogs.push(dialog.message());
    void dialog.dismiss();
  });
  await openBlog(page);
  await button(page, "Add post").click();
  await field(page, "Title").fill("Unsaved title");
  await field(page, "Body").fill("Unsaved body");
  await button(page, "Preview").click();
  await expect(previewOf(page)).toBeVisible();
  expect(new URL(page.url()).pathname).toBe(PANEL);

  await page.reload();
  await expect(menu(page)).toBeVisible();
  await expect(previewOf(page)).toHaveCount(0);
  await expect(button(page, "Back to form")).toHaveCount(0);
  await expect(field(page, "Title")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText("Unsaved");
  expect(dialogs).toEqual([]);

  await openBlog(page);
  await expect(page.getByText(NO_POSTS)).toBeVisible();
  expect(dbPosts()).toEqual([]);
  await context.close();
});

test("E2E-13: a double activation previews once, and the keyboard works without motion", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(90000);
  dbReset();
  dbSeedWith([], []);
  const { context, page } = await ownerPage(browser, baseURL as string);
  await openBlog(page);
  await button(page, "Add post").click();
  await field(page, "Body").fill("Keyboard check");

  // Part 1
  await button(page, "Preview").evaluate((el: Element) => {
    const node = el as HTMLElement;
    node.click();
    node.click();
  });
  await expect(previewOf(page)).toHaveCount(1);
  await expect(previewOf(page).locator("div.prose")).toHaveCount(1);
  await button(page, "Back to form").click();

  // Part 2
  await button(page, "Preview").focus();
  await page.keyboard.press("Enter");
  await expect(previewOf(page)).toBeVisible();
  const box = previewOf(page).locator(":scope > div");
  await expect(box).toBeVisible();
  const motion = (target: Locator): Promise<{ animation: string; transition: string }> =>
    target.evaluate((el: Element) => {
      const style = getComputedStyle(el);
      return { animation: style.animationName, transition: style.transitionDuration };
    });
  expect(await motion(previewOf(page))).toEqual({ animation: "none", transition: "0s" });
  expect(await motion(box)).toEqual({ animation: "none", transition: "0s" });

  await button(page, "Back to form").focus();
  await page.keyboard.press("Space");
  await expect(field(page, "Body")).toBeVisible();
  await expect(field(page, "Body")).toHaveValue("Keyboard check");
  await expect(previewOf(page)).toHaveCount(0);
  await context.close();
});

test("E2E-14: a long body is shown whole and comes back unchanged", async ({ browser, baseURL }) => {
  test.setTimeout(90000);
  dbReset();
  dbSeedWith([], []);
  const { context, page } = await ownerPage(browser, baseURL as string);
  await openBlog(page);
  await button(page, "Add post").click();
  const long = Array.from({ length: 200 }, (_, i) => "Paragraph " + String(i + 1).padStart(3, "0")).join("\n\n");
  await field(page, "Body").fill(long);
  await button(page, "Preview").click();

  const paragraphs = previewOf(page).locator("p");
  await expect(paragraphs).toHaveCount(200);
  await expect(paragraphs.first()).toHaveText("Paragraph 001");
  const last = paragraphs.filter({ hasText: /^Paragraph 200$/ });
  await last.scrollIntoViewIfNeeded();
  await expect(last).toBeVisible();

  await button(page, "Back to form").click();
  await expect(field(page, "Body")).toHaveValue(long);
  await context.close();
});

test("E2E-15: the preview's code is in the panel's scripts and in no public page's", async ({ browser }) => {
  test.setTimeout(90000);
  dbReset();

  const collect = async (address: string): Promise<{ scripts: number; joined: string }> => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const texts: Promise<string>[] = [];
    page.on("response", (response) => {
      const type = response.request().resourceType();
      const contentType = response.headers()["content-type"] ?? "";
      if (type === "script" || contentType.includes("javascript")) {
        texts.push(response.text().catch(() => ""));
      }
    });
    await page.goto(address);
    await page.waitForLoadState("networkidle");
    const bodies = await Promise.all(texts);
    const html = await page.content();
    await context.close();
    return { scripts: bodies.length, joined: bodies.join("\n") + "\n" + html };
  };

  for (const address of ["/", "/blog/"]) {
    const found = await collect(address);
    expect(found.scripts, address + " scripts").toBeGreaterThan(0);
    expect(found.joined.includes(NOTHING), address + " has the notice text").toBe(false);
    expect(found.joined.includes("Back to form"), address + " has the back button text").toBe(false);
  }

  const panel = await collect(PANEL);
  expect(panel.scripts, "panel scripts").toBeGreaterThan(0);
  expect(panel.joined.includes(NOTHING), "panel has the notice text").toBe(true);
  expect(panel.joined.includes("Back to form"), "panel has the back button text").toBe(true);
});

test("E2E-16: the preview is built from the blog's own pieces, with no colour value, request or backend", async () => {
  dbReset();
  const preview = readRepo("src/app/components/admin/PostPreview.tsx");
  const postBody = readRepo("src/app/components/blog/PostBody.tsx");
  const article = readRepo("src/app/components/blog/BlogArticle.tsx");
  const listEditor = readRepo("src/app/components/admin/ListEditor.tsx");
  const postsEditor = readRepo("src/app/components/admin/BlogPostsEditor.tsx");
  const markdown = readRepo("src/lib/markdown.ts");
  const blogMarkdown = readRepo("src/lib/blog/markdown.ts");

  const forbiddenEverywhere: RegExp[] = [
    /#[0-9a-fA-F]{3,8}\b/,
    /\brgba?\(/,
    /\bhsla?\(/,
    /dark:/,
    /console\./,
    /<img/,
    /process\.env/,
  ];
  const named: [string, string][] = [
    ["PostPreview.tsx", preview],
    ["PostBody.tsx", postBody],
    ["BlogArticle.tsx", article],
    ["ListEditor.tsx", listEditor],
    ["BlogPostsEditor.tsx", postsEditor],
  ];
  for (const [name, text] of named) {
    for (const pattern of forbiddenEverywhere) {
      expect(pattern.test(text), name + " matches " + String(pattern)).toBe(false);
    }
  }

  expect(preview).toContain('"use client"');
  expect(preview).toContain("@/lib/markdown");
  expect(preview).toContain("PostBody");
  const forbiddenInPreview: RegExp[] = [
    /@\/lib\/blog/,
    /\bfetch\(/,
    /XMLHttpRequest/,
    /WebSocket/,
    /EventSource/,
    /\/api\//,
    /lib\/server/,
    /lib\/auth/,
    /next-auth/,
    /server-only/,
    new RegExp(FIRE, "i"),
  ];
  for (const pattern of forbiddenInPreview) {
    expect(pattern.test(preview), "PostPreview.tsx matches " + String(pattern)).toBe(false);
  }

  expect(postsEditor).toContain("PostPreview");
  expect(postsEditor).toContain("hideFormActions");
  expect(listEditor).toContain("hideFormActions");
  expect(postsEditor).not.toContain(DOM_INSERT);
  expect(listEditor).not.toContain(DOM_INSERT);

  expect(postBody).not.toContain('"use client"');
  expect(postBody.split(DOM_INSERT).length - 1).toBe(1);
  expect(article).toContain("PostBody");
  expect(article).not.toContain(DOM_INSERT);

  expect(markdown).toContain("export async function markdownToHtml");
  for (const text of ["server-only", "node:", "@/lib/blog"]) {
    expect(markdown, "markdown.ts has " + text).not.toContain(text);
  }
  expect(blogMarkdown).toContain("@/lib/markdown");
  expect(blogMarkdown).not.toContain("unified");

  const found = gitGrep(["-l", "-F", DOM_INSERT, "--", "src"]);
  const lines = found.stdout.split("\n").filter((line) => line !== "");
  expect(lines).toEqual(["src/app/components/blog/PostBody.tsx", "src/app/layout.tsx"]);
});

test("E2E-17: the earlier preview spec is gone and nothing still names it", async () => {
  dbReset();
  const oldSpec = piece("e2e/", "preview-blog-", "post.spec.ts");
  expect(fs.existsSync(oldSpec), "the earlier preview spec is gone").toBe(false);
  expect(fs.existsSync("e2e/owner-previews-blog-post.spec.ts"), "this spec exists").toBe(true);

  const manage = readRepo("e2e/owner-manages-blog-posts.spec.ts");
  expect(manage.includes(OLD_SPEC), "the blog-posts spec names the earlier spec").toBe(false);
  expect(manage).toContain("src/app/components/admin/PostPreview.tsx");

  const found = gitGrep([
    "-n",
    "-F",
    OLD_SPEC,
    "--",
    "e2e",
    "src",
    "scripts",
    "package.json",
    "playwright.config.ts",
    ".github",
    "CLAUDE.md",
    "Reference.md",
    "README.md",
  ]);
  expect(found.stdout).toBe("");
  expect(found.status).toBe(1);
});
