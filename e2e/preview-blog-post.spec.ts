import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const FIRESTORE = "http://127.0.0.1:8080";
const PROJECT = "thegoldenpothos-5b3a1";
const DOCS = `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents`;
const PANEL = "/bright-warm-greenhouse/";
const PLACEHOLDER = "REPLACE_WITH_OWNER_UID";
const ADMIN = { Authorization: "Bearer owner", "Content-Type": "application/json" };
const repoText = (name: string) => readFileSync(join(process.cwd(), name), "utf8");
const str = (v: string) => ({ stringValue: v });

type Post = {
  id: string;
  title: string;
  excerpt: string;
  date: string;
  tags: string[];
  draft: boolean;
  featured: boolean;
  coverImage: string;
  coverAlt: string;
  body: string;
  createdAt: number;
  updatedAt: number;
};
const W: Post = { id: "why-static-export", title: "Why I moved to static export", excerpt: "Notes on the trade-offs", date: "2026-05-15", tags: ["nextjs", "firebase"], draft: false, featured: false, coverImage: "/images/blog/static.png", coverAlt: "A diagram of the build", body: "First draft", createdAt: 1, updatedAt: 1 };
const FORM = { title: "Why I moved to static export", excerpt: "Notes on the trade-offs", date: "2026-05-15", slug: "why-static-export" };
const BODY1 = "## Preview heading\n\n- First item\n- Second item\n\n| Name | Value |\n| ---- | ----- |\n| alpha | 1 |\n\n[Example link](https://example.com/docs)\n\n```js\nconst answer = 42;\n```\n";

async function RF(uid: string): Promise<void> {
  const t = repoText("firestore.rules");
  const content = t.replace(PLACEHOLDER, uid);
  const res = await fetch(`${FIRESTORE}/emulator/v1/projects/${PROJECT}:securityRules`, {
    method: "PUT",
    body: JSON.stringify({ rules: { files: [{ name: "firestore.rules", content }] } }),
  });
  expect(res.status).toBe(200);
}
async function seedPost(p: Post): Promise<void> {
  const fields = {
    title: str(p.title),
    excerpt: str(p.excerpt),
    date: str(p.date),
    coverImage: str(p.coverImage),
    coverAlt: str(p.coverAlt),
    body: str(p.body),
    tags: { arrayValue: { values: p.tags.map((t) => str(t)) } },
    draft: { booleanValue: p.draft },
    featured: { booleanValue: p.featured },
    createdAt: { integerValue: String(p.createdAt) },
    updatedAt: { integerValue: String(p.updatedAt) },
  };
  const res = await fetch(`${DOCS}/blogPosts/${p.id}`, { method: "PATCH", headers: ADMIN, body: JSON.stringify({ fields }) });
  expect(res.status).toBe(200);
}
async function readPosts(): Promise<Post[]> {
  const res = await fetch(`${DOCS}/blogPosts?pageSize=300`, { headers: ADMIN });
  const body = (await res.json()) as { documents?: { name: string; fields: any }[] };
  const list = (body.documents ?? []).map((d) => {
    const f = d.fields ?? {};
    return {
      id: d.name.split("/").pop() as string,
      title: f.title?.stringValue ?? "",
      excerpt: f.excerpt?.stringValue ?? "",
      date: f.date?.stringValue ?? "",
      tags: ((f.tags?.arrayValue?.values ?? []) as { stringValue: string }[]).map((v) => v.stringValue),
      draft: f.draft?.booleanValue,
      featured: f.featured?.booleanValue,
      coverImage: f.coverImage?.stringValue ?? "",
      coverAlt: f.coverAlt?.stringValue ?? "",
      body: f.body?.stringValue ?? "",
      createdAt: Number(f.createdAt?.integerValue),
      updatedAt: Number(f.updatedAt?.integerValue),
    } as Post;
  });
  return list.sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
}
async function clearAll(): Promise<void> {
  for (const col of ["blogPosts", "images"]) {
    const res = await fetch(`${DOCS}/${col}?pageSize=300`, { headers: ADMIN });
    const body = (await res.json()) as { documents?: { name: string }[] };
    for (const d of body.documents ?? []) await fetch(`${FIRESTORE}/v1/${d.name}`, { method: "DELETE", headers: ADMIN });
  }
}

async function P(page: Page): Promise<void> {
  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Sign in with Google" }).click();
  const popup = await popupPromise;
  await popup.waitForLoadState("load");
  await popup.locator("#add-account-button").click();
  await popup.locator("#autogen-button").click();
  await popup.locator("#sign-in").click();
}
const nav = (page: Page) => page.getByRole("navigation", { name: "Admin sections" });
async function ownerSession(page: Page): Promise<string> {
  await clearAll();
  await page.goto(PANEL);
  await P(page);
  const idLine = page.getByText(/^Your user ID: [A-Za-z0-9]{20,}$/);
  await expect(idLine).toBeVisible();
  const X = (await idLine.locator("code").innerText()).trim();
  await page.evaluate((v) => window.localStorage.setItem("admin.ownerUid", v), X);
  await page.reload();
  await expect(nav(page)).toBeVisible();
  await expect(page.getByText(/^Your user ID:/)).toHaveCount(0);
  await RF(X);
  return X;
}
async function openPosts(page: Page): Promise<void> {
  await nav(page).getByRole("button", { name: "Blog posts", exact: true }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Blog posts" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add post", exact: true })).toBeVisible();
}
async function reopen(page: Page): Promise<void> {
  await page.reload();
  await expect(nav(page)).toBeVisible();
  await openPosts(page);
}
const ENTRIES = (page: Page) => page.getByRole("list", { name: "Blog posts list" }).getByRole("listitem");
const rowFor = (page: Page, label: string) => ENTRIES(page).filter({ has: page.getByText(label, { exact: true }) });
const field = (page: Page, label: string) => page.getByLabel(label, { exact: true });
const EDITOR = (page: Page) => page.locator('section[aria-label="Blog posts editor"]');
const PREVIEW = (page: Page) => page.locator('section[aria-label="Post preview"]');
const btn = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
const text = (page: Page, t: string) => page.getByText(t, { exact: true });
async function fillForm(page: Page, v: typeof FORM): Promise<void> {
  await field(page, "Title").fill(v.title);
  await field(page, "Excerpt").fill(v.excerpt);
  await field(page, "Date").fill(v.date);
  await field(page, "Slug").fill(v.slug);
}

test.describe("preview-blog-post", () => {
  test.describe.configure({ mode: "serial", timeout: 60000 });

  test("E2E-01: the preview shows the converted body and nothing else, and writes nothing", async ({ page }) => {
    await ownerSession(page);
    await openPosts(page);
    await btn(page, "Add post").click();
    await fillForm(page, FORM);
    await field(page, "Body").fill(BODY1);
    await btn(page, "Preview").click();

    const pv = PREVIEW(page);
    await expect(pv).toBeVisible();
    await expect(pv.getByRole("heading", { level: 2, name: /^Preview heading/ })).toBeVisible();
    const list = pv.getByRole("list");
    await expect(list.getByRole("listitem")).toHaveCount(2);
    await expect(list.getByRole("listitem").nth(0)).toHaveText("First item");
    await expect(list.getByRole("listitem").nth(1)).toHaveText("Second item");
    const table = pv.getByRole("table");
    await expect(table.getByRole("columnheader", { name: "Name" })).toBeVisible();
    await expect(table.getByRole("columnheader", { name: "Value" })).toBeVisible();
    await expect(table.getByRole("cell", { name: "alpha" })).toBeVisible();
    await expect(table.getByRole("cell", { name: "1", exact: true })).toBeVisible();
    await expect(pv.getByRole("link", { name: "Example link" })).toHaveAttribute("href", "https://example.com/docs");
    await expect(pv.locator("pre code")).toContainText("const answer = 42;");
    await expect(pv.getByText("Why I moved to static export")).toHaveCount(0);
    await expect(pv.getByText("Notes on the trade-offs")).toHaveCount(0);
    await expect(pv.getByText("15 May 2026")).toHaveCount(0);
    await expect(pv.getByRole("heading", { level: 1 })).toHaveCount(0);
    await expect(field(page, "Title")).toHaveCount(0);
    expect(await readPosts()).toEqual([]);
    await expect(text(page, "Entry saved")).toHaveCount(0);
  });

  test("E2E-02: the preview uses the blog's converter, wrapper and highlight colours", async ({ page }) => {
    await ownerSession(page);
    await openPosts(page);
    await btn(page, "Add post").click();
    await field(page, "Body").fill(
      "## Second heading\n\n~~old~~ and <mark>raw html</mark>\n\n```javascript\nconst answer = 42;\n```\n",
    );
    await btn(page, "Preview").click();

    const pv = PREVIEW(page);
    const h2 = pv.locator("h2", { hasText: "Second heading" });
    const anchor = h2.locator("a.heading-anchor");
    await expect(anchor).toHaveAttribute("href", "#second-heading");
    await expect(anchor).toHaveAttribute("aria-label", "Link to this section");
    await expect(anchor).toHaveText("#");
    await expect(pv.locator("del")).toHaveText("old");
    await expect(pv.locator("mark")).toHaveText("raw html");
    await expect(
      pv.locator('[class="prose prose-lg max-w-none prose-a:no-underline hover:prose-a:underline"]'),
    ).toHaveCount(1);
    const code = pv.locator("pre code");
    await expect(code).toHaveClass(/\bhljs\b/);
    await expect(code).toHaveClass(/\blanguage-javascript\b/);
    const kw = pv.locator("span.hljs-keyword").first();
    const num = pv.locator("span.hljs-number").first();
    await expect(kw).toHaveText("const");
    await expect(num).toHaveText("42");

    const other = await page.context().newPage();
    await other.goto("http://127.0.0.1:3100/blog/building-portfolio-nextjs/");
    const blogKeyword = other.locator("pre code span.hljs-keyword").first();
    await expect(blogKeyword).toBeVisible();
    const blogColor = await blogKeyword.evaluate((el) => getComputedStyle(el).color);
    await other.close();

    const color = (l: ReturnType<typeof pv.locator>) => l.evaluate((el) => getComputedStyle(el).color);
    const kwColor = await color(kw);
    expect(kwColor).toBe(blogColor);
    expect(kwColor).not.toBe(await color(num));
    expect(kwColor).not.toBe(await color(pv.locator("p").first()));
  });

  test("E2E-03: going back restores the draft exactly and Cancel still writes nothing", async ({ page }) => {
    await ownerSession(page);
    await openPosts(page);
    await btn(page, "Add post").click();
    await fillForm(page, FORM);
    await field(page, "Tags").fill("nextjs, firebase");
    await field(page, "Cover image path").fill("/images/blog/static.png");
    await field(page, "Cover alt text").fill("A diagram of the build");
    const BODY = "## Round trip\n\n  indented line\n\ttab line\n";
    await field(page, "Body").fill(BODY);
    await field(page, "Featured").check();
    await field(page, "Status").selectOption("Published");
    await btn(page, "Preview").click();

    await expect(PREVIEW(page)).toBeVisible();
    await expect(btn(page, "Save")).toHaveCount(0);
    await expect(btn(page, "Cancel")).toHaveCount(0);
    await expect(btn(page, "Back to form")).toBeVisible();
    await expect(field(page, "Title")).toHaveCount(0);

    await btn(page, "Back to form").click();
    await expect(field(page, "Title")).toHaveValue(FORM.title);
    await expect(field(page, "Excerpt")).toHaveValue(FORM.excerpt);
    await expect(field(page, "Date")).toHaveValue(FORM.date);
    await expect(field(page, "Slug")).toHaveValue(FORM.slug);
    await expect(field(page, "Tags")).toHaveValue("nextjs, firebase");
    await expect(field(page, "Cover image path")).toHaveValue("/images/blog/static.png");
    await expect(field(page, "Cover alt text")).toHaveValue("A diagram of the build");
    await expect(field(page, "Body")).toHaveValue(BODY);
    await expect(field(page, "Featured")).toBeChecked();
    await expect(field(page, "Status")).toHaveValue("Published");
    await expect(btn(page, "Save")).toBeVisible();
    await expect(btn(page, "Cancel")).toBeVisible();
    await expect(btn(page, "Preview")).toBeVisible();

    await field(page, "Body").fill("Changed **bold**");
    await btn(page, "Preview").click();
    await expect(PREVIEW(page).locator("strong")).toHaveText("bold");
    await expect(PREVIEW(page).getByRole("heading", { level: 2, name: /Round trip/ })).toHaveCount(0);
    await btn(page, "Back to form").click();
    await btn(page, "Cancel").click();

    await expect(text(page, "No posts yet.")).toBeVisible();
    expect(await readPosts()).toEqual([]);
    await expect(text(page, "Entry saved")).toHaveCount(0);
  });

  test("E2E-04: previewing an edit shows the typed body and leaves the saved post untouched", async ({ page }) => {
    await ownerSession(page);
    await seedPost(W);
    await openPosts(page);
    await expect(btn(page, "Preview")).toHaveCount(0);
    const row = rowFor(page, "Why I moved to static export");
    await row.getByRole("button", { name: "Edit", exact: true }).click();
    await field(page, "Body").fill("Second draft");
    await btn(page, "Preview").click();

    await expect(PREVIEW(page).locator("p", { hasText: /^Second draft$/ })).toBeVisible();
    await expect(page.getByText("First draft")).toHaveCount(0);
    await btn(page, "Back to form").click();
    await btn(page, "Cancel").click();

    await expect(rowFor(page, "Why I moved to static export")).toBeVisible();
    await expect(text(page, "Entry saved")).toHaveCount(0);
    expect(await readPosts()).toEqual([W]);

    await reopen(page);
    await rowFor(page, "Why I moved to static export").getByRole("button", { name: "Edit", exact: true }).click();
    await expect(field(page, "Body")).toHaveValue("First draft");
  });

  test("E2E-05: a blank body shows the empty message and checks nothing else", async ({ page }) => {
    await ownerSession(page);
    await openPosts(page);
    await btn(page, "Add post").click();
    const refusals = ["Enter a title", "Enter an excerpt", "Enter the post body"];
    const expectBlank = async () => {
      await expect(text(page, "Nothing to preview yet")).toBeVisible();
      await expect(PREVIEW(page).locator(".prose")).toHaveCount(0);
      for (const r of refusals) await expect(page.getByText(r)).toHaveCount(0);
      await expect(EDITOR(page).getByRole("alert")).toHaveCount(0);
      await expect(btn(page, "Back to form")).toBeVisible();
    };

    await btn(page, "Preview").click();
    await expectBlank();
    await btn(page, "Back to form").click();
    await expect(field(page, "Title")).toBeVisible();
    await expect(field(page, "Body")).toHaveValue("");
    for (const r of refusals) await expect(page.getByText(r)).toHaveCount(0);

    const WS = "   \n\n\t  ";
    await field(page, "Body").fill(WS);
    await btn(page, "Preview").click();
    await expectBlank();
    await btn(page, "Back to form").click();
    await expect(field(page, "Body")).toHaveValue(WS);

    await field(page, "Body").fill("x");
    await btn(page, "Preview").click();
    await expect(PREVIEW(page).locator("p", { hasText: /^x$/ })).toBeVisible();
    await expect(text(page, "Nothing to preview yet")).toHaveCount(0);
  });

  test("E2E-06: on a 375 pixel screen wide content scrolls inside the preview", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await ownerSession(page);
    await openPosts(page);
    await btn(page, "Add post").click();
    const before = await btn(page, "Preview").boundingBox();
    expect(before).not.toBeNull();
    expect(before!.x).toBeGreaterThanOrEqual(0);
    expect(before!.x + before!.width).toBeLessThanOrEqual(375);
    expect(before!.height).toBeGreaterThanOrEqual(43.99);

    await field(page, "Body").fill(
      "## Wide\n\n| Column one | Column two | Column three |\n| ---- | ---- | ---- |\n| " +
        "a".repeat(40) + " | " + "b".repeat(40) + " | " + "c".repeat(40) +
        " |\n\n```\n" + "x".repeat(200) + "\n```\n",
    );
    await btn(page, "Preview").click();
    await expect(PREVIEW(page).getByRole("table")).toBeVisible();

    const docWidth = () => page.evaluate(() => document.documentElement.scrollWidth);
    expect(await docWidth()).toBeLessThanOrEqual(375);

    const info = await page.evaluate(() => {
      const table = document.querySelector('section[aria-label="Post preview"] table') as HTMLElement;
      let s: HTMLElement | null = table.parentElement;
      while (s) {
        const ox = getComputedStyle(s).overflowX;
        if (ox === "auto" || ox === "scroll") break;
        s = s.parentElement;
      }
      if (!s) return null;
      const box = s.getBoundingClientRect();
      const th = table.querySelector("th") as HTMLElement;
      const left0 = th.getBoundingClientRect().left;
      const wide = s.scrollWidth > s.clientWidth;
      s.scrollLeft = s.scrollWidth;
      const tds = table.querySelectorAll("td");
      const lastRight = tds[tds.length - 1].getBoundingClientRect().right;
      const pre = document.querySelector('section[aria-label="Post preview"] pre') as HTMLElement;
      const preWide = pre.scrollWidth > pre.clientWidth;
      pre.scrollLeft = pre.scrollWidth;
      return {
        wide,
        boxLeft: box.left,
        boxRight: box.right,
        left0,
        lastRight,
        preWide,
        preEnd: pre.scrollLeft + pre.clientWidth >= pre.scrollWidth - 1,
      };
    });
    expect(info).not.toBeNull();
    expect(info!.wide).toBe(true);
    expect(info!.boxLeft).toBeGreaterThanOrEqual(0);
    expect(info!.boxRight).toBeLessThanOrEqual(375);
    expect(info!.left0).toBeGreaterThanOrEqual(0);
    expect(info!.lastRight).toBeLessThanOrEqual(375);
    expect(info!.lastRight).toBeGreaterThanOrEqual(0);
    expect(info!.preWide).toBe(true);
    expect(info!.preEnd).toBe(true);

    const back = await btn(page, "Back to form").boundingBox();
    expect(back).not.toBeNull();
    expect(back!.x).toBeGreaterThanOrEqual(0);
    expect(back!.x + back!.width).toBeLessThanOrEqual(375);
    expect(back!.height).toBeGreaterThanOrEqual(43.99);
    expect(await docWidth()).toBeLessThanOrEqual(375);
  });

  test("E2E-07: preview text follows the theme tokens in light and dark", async ({ page }) => {
    await ownerSession(page);
    await openPosts(page);
    await btn(page, "Add post").click();
    await field(page, "Body").fill("A plain paragraph");
    await btn(page, "Preview").click();
    const p = PREVIEW(page).locator("p", { hasText: /^A plain paragraph$/ });
    await expect(p).toBeVisible();

    const read = async () => {
      const c = await p.evaluate((el) => getComputedStyle(el).color);
      const t = await page.evaluate(() => {
        const s = document.createElement("span");
        s.style.color = "var(--foreground-soft)";
        s.textContent = "probe";
        document.body.appendChild(s);
        const v = getComputedStyle(s).color;
        s.remove();
        return v;
      });
      return { c, t };
    };
    const light = await read();
    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
    const dark = await read();
    expect(light.c).toBe(light.t);
    expect(dark.c).toBe(dark.t);
    expect(light.c).not.toBe(dark.c);
  });

  test("E2E-08: sources keep the rules (no colours, one raw-html use, blog converter only)", async () => {
    const files = [
      "src/app/components/blog/PostBody.tsx",
      "src/app/components/blog/BlogArticle.tsx",
      "src/app/components/admin/PostPreview.tsx",
      "src/app/components/admin/ListEditor.tsx",
      "src/app/components/admin/BlogPostsEditor.tsx",
    ];
    const src: Record<string, string> = {};
    for (const f of files) src[f] = repoText(f);
    const DSH = "dangerously" + "SetInnerHTML";
    const banned: RegExp[] = [
      /#[0-9a-fA-F]{3,8}\b/,
      /\brgba?\(/,
      /\bhsla?\(/,
      /dark:/,
      /console\./,
      /<img/,
      /process\.env/,
      /email/i,
      new RegExp("eslint" + "-disable"),
      new RegExp("@ts" + "-ignore"),
      new RegExp("@ts" + "-nocheck"),
    ];
    for (const f of files) for (const re of banned) expect(src[f], `${f} ${re}`).not.toMatch(re);

    const pp = src["src/app/components/admin/PostPreview.tsx"];
    expect(pp).toContain("@/lib/markdown");
    expect(pp).toContain('"use client"');
    expect(pp).not.toMatch(/@\/lib\/blog/);
    for (const w of ["server-only", "firebase", DSH]) expect(pp).not.toContain(w);

    const bpe = src["src/app/components/admin/BlogPostsEditor.tsx"];
    const le = src["src/app/components/admin/ListEditor.tsx"];
    for (const t of [bpe, le]) {
      expect(t).not.toMatch(/@\/lib\/blog/);
      expect(t).not.toContain(DSH);
    }
    expect(bpe).toContain("PostPreview");
    expect(bpe).toContain("hideFormActions");
    expect(le).toContain("hideFormActions");

    const pb = src["src/app/components/blog/PostBody.tsx"];
    expect(pb).not.toContain('"use client"');
    expect(pb.split(DSH).length - 1).toBe(1);
    const ba = src["src/app/components/blog/BlogArticle.tsx"];
    expect(ba).toContain("PostBody");
    expect(ba).not.toContain(DSH);

    const shared = repoText("src/lib/markdown.ts");
    expect(shared).toContain("export async function markdownToHtml");
    for (const w of ["server-only", "node:", "@/lib/blog"]) expect(shared).not.toContain(w);
    const reexport = repoText("src/lib/blog/markdown.ts");
    expect(reexport).toContain("@/lib/markdown");
    expect(reexport).not.toContain("unified");

    const grep = spawnSync("git", ["grep", "-l", DSH, "--", "src"], { cwd: process.cwd(), encoding: "utf8" });
    const lines = grep.stdout.split("\n").filter((l) => l !== "");
    expect(lines).toEqual(["src/app/components/blog/PostBody.tsx", "src/app/layout.tsx"]);
  });

  test("E2E-09: the public blog article keeps its prose container and content", async ({ page }) => {
    await page.goto("/blog/building-portfolio-nextjs/");

    const article = page.locator("article");
    const body = article.locator("> div");
    await expect(body).toHaveCount(1);
    await expect(body).toHaveAttribute(
      "class",
      "prose prose-lg max-w-none prose-a:no-underline hover:prose-a:underline",
    );

    const title = page.getByRole("heading", {
      level: 1,
      name: "Building a Portfolio with Next.js and Tailwind CSS",
    });
    await expect(title).toBeVisible();
    await expect(body.getByRole("heading", { level: 1 })).toHaveCount(0);

    const stack = body.locator("h3", { hasText: /^The Stack/ });
    await expect(stack.locator("a.heading-anchor")).toHaveAttribute("href", "#the-stack");

    const code = body.locator("pre code.hljs.language-javascript");
    await expect(code).toHaveCount(1);
    await expect(code.locator("span.hljs-keyword", { hasText: /^const$/ }).first()).toBeVisible();

    await expect(page.getByRole("link", { name: "All posts", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to all posts" })).toBeVisible();
  });
  test("E2E-10: the preview is absent from every public page and present in the panel", async ({ browser }) => {
    async function collect(path: string): Promise<string> {
      const context = await browser.newContext({ baseURL: "http://127.0.0.1:3100" });
      try {
        const page = await context.newPage();
        const pending: Promise<void>[] = [];
        const texts: string[] = [];
        page.on("response", (res) => {
          const type = res.request().resourceType();
          const ct = res.headers()["content-type"] ?? "";
          if (type === "script" || ct.includes("javascript")) {
            pending.push(
              res.text().then(
                (t) => {
                  texts.push(t);
                },
                () => {},
              ),
            );
          }
        });
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        await Promise.all(pending);
        return texts.join("\n") + (await page.content());
      } finally {
        await context.close();
      }
    }
    for (const path of ["/", "/blog/", "/blog/hello-world/"]) {
      const all = await collect(path);
      for (const t of ["Nothing to preview yet", "Back to form", "firestore.googleapis.com", "thegoldenpothos-5b3a1"]) {
        expect(all, `${path} ${t}`).not.toContain(t);
      }
    }
    expect(await collect(PANEL)).toContain("Nothing to preview yet");
  });
});
