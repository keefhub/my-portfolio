import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BLOG_MESSAGES,
  BLOG_POSTS_COLLECTION,
  blogPostFromData,
  blogPostLabel,
  blogPostLines,
  blogPostToData,
  checkBlogPost,
  emptyBlogPost,
  isRealDate,
  parseTags,
  sortBlogPosts,
  type BlogPostContent,
} from "../src/lib/admin/blogposts";

const DATE_MSG = "Enter a date as YYYY-MM-DD that is a real day";
const SLUG_MSG = "Enter a slug of lowercase letters, digits and hyphens";

const FIRESTORE = "http://127.0.0.1:8080";
const PROJECT = "thegoldenpothos-5b3a1";
const DOCS = `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents`;
const PANEL = "/bright-warm-greenhouse/";
const PLACEHOLDER = "REPLACE_WITH_OWNER_UID";
const BIG = 1000000000000;
const ADMIN = { Authorization: "Bearer owner", "Content-Type": "application/json" };
const repoText = (name: string) => readFileSync(join(process.cwd(), name), "utf8");
const IMGURL = (id: string) => `http://127.0.0.1:9199/v0/b/thegoldenpothos-5b3a1.firebasestorage.app/o/images%2F${id}.png?alt=media&token=t`;
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
const N: Post = { id: "firebase-rules-notes", title: "Notes on Firebase rules", excerpt: "What the rules allow", date: "2026-05-20", tags: ["firebase"], draft: true, featured: false, coverImage: "", coverAlt: "", body: "Rules body", createdAt: 1, updatedAt: 1 };
const O: Post = { id: "a-year-of-nextjs", title: "A year of Next.js", excerpt: "Looking back", date: "2026-01-02", tags: [], draft: false, featured: true, coverImage: "", coverAlt: "", body: "Year body", createdAt: 1, updatedAt: 1 };
const TA: Post = { id: "tie-a", title: "Alpha notes", excerpt: "Tie A", date: "2026-05-15", tags: [], draft: false, featured: false, coverImage: "", coverAlt: "", body: "Tie A body", createdAt: 1, updatedAt: 1 };
const TB: Post = { id: "tie-b", title: "Beta notes", excerpt: "Tie B", date: "2026-05-15", tags: [], draft: false, featured: false, coverImage: "", coverAlt: "", body: "Tie B body", createdAt: 1, updatedAt: 1 };
const core = (p: Post) => {
  const { updatedAt: _u, ...rest } = p;
  return rest;
};
const CORE = { title: "Why I moved to static export", excerpt: "Notes on the trade-offs", date: "2026-05-15", slug: "why-static-export", body: "## Static export\n\nThe site is **exported** at build time." };
type CoreValues = typeof CORE;

async function RF(uid: string | null): Promise<void> {
  const t = repoText("firestore.rules");
  const content = uid === null ? t : t.replace(PLACEHOLDER, uid);
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
async function seedRaw(id: string, fields: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${DOCS}/blogPosts/${id}`, { method: "PATCH", headers: ADMIN, body: JSON.stringify({ fields }) });
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
async function unauth(id: string): Promise<{ status: number; title?: string }> {
  const res = await fetch(`${DOCS}/blogPosts/${id}`);
  if (res.status !== 200) return { status: res.status };
  const j = (await res.json()) as { fields: { title: { stringValue: string } } };
  return { status: 200, title: j.fields.title.stringValue };
}
async function seedImage(id: string, name: string): Promise<void> {
  const fields = {
    name: str(name),
    storagePath: str(`images/${id}.png`),
    url: str(IMGURL(id)),
    contentType: str("image/png"),
    size: { integerValue: "1000" },
    createdAt: { integerValue: "1" },
  };
  const res = await fetch(`${DOCS}/images/${id}`, { method: "PATCH", headers: ADMIN, body: JSON.stringify({ fields }) });
  expect(res.status).toBe(200);
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
const GROUP = (page: Page) => page.getByRole("group", { name: "Confirm delete", exact: true });
const btn = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
const text = (page: Page, t: string) => page.getByText(t, { exact: true });
const inRow = (row: ReturnType<typeof rowFor>, name: string) => row.getByRole("button", { name, exact: true });
async function fillCore(page: Page, v: CoreValues): Promise<void> {
  await field(page, "Title").fill(v.title);
  await field(page, "Excerpt").fill(v.excerpt);
  await field(page, "Date").fill(v.date);
  await field(page, "Slug").fill(v.slug);
  await field(page, "Body").fill(v.body);
}
async function measureLayout(page: Page): Promise<{ scrollWidth: number; bad: string[] }> {
  return page.evaluate(() => {
    const root = document.querySelector('section[aria-label="Blog posts editor"]');
    const bad: string[] = [];
    if (root) {
      for (const el of Array.from(root.querySelectorAll("button, input, textarea, select"))) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        const name = (el.getAttribute("aria-label") ?? el.textContent ?? el.tagName).trim().slice(0, 30) || el.tagName;
        if (r.x < 0 || r.x + r.width > 375) bad.push(`${name} x=${r.x} w=${r.width}`);
        if (el.tagName === "BUTTON" && r.height < 43.99) bad.push(`${name} h=${r.height}`);
      }
    }
    return { scrollWidth: document.documentElement.scrollWidth, bad };
  });
}
const CORE_PATTERNS = [
  /#[0-9a-fA-F]{3,8}\b/,
  /\brgba?\(/,
  /\bhsla?\(/,
  /dark:/,
  /console\./,
  /<img/,
  /@\/lib\/blog(?!\/types)/,
  /blog\/(index|posts|markdown|rss)/,
  /server-only/,
  /dangerouslySetInnerHTML/,
  /process\.env/,
  /email/i,
];

test.describe("manage-blog-posts", () => {
  test.describe.configure({ mode: "serial", timeout: 60000 });

  test("E2E-01: checkBlogPost trims, accepts real dates and keeps the body as typed", async () => {
    const I: BlogPostContent = {
      title: " Why I moved to static export ",
      excerpt: " Notes on the trade-offs ",
      date: " 2026-05-15 ",
      slug: " why-static-export ",
      tags: " nextjs ,firebase,, ",
      coverImage: " /images/blog/static.png ",
      coverAlt: " A diagram of the build ",
      body: "  ## Heading\n\nBody  \n",
      featured: true,
      status: "Published",
    };
    expect(checkBlogPost(I)).toEqual({
      ok: true,
      content: {
        title: "Why I moved to static export",
        excerpt: "Notes on the trade-offs",
        date: "2026-05-15",
        slug: "why-static-export",
        tags: "nextjs, firebase",
        coverImage: "/images/blog/static.png",
        coverAlt: "A diagram of the build",
        body: "  ## Heading\n\nBody  \n",
        featured: true,
        status: "Published",
      },
    });
    expect(I.title).toBe(" Why I moved to static export ");

    const base: BlogPostContent = { title: "T", excerpt: "E", date: "2024-02-29", slug: "a-1", tags: "", coverImage: "", coverAlt: "", body: "B", featured: false, status: "Draft" };
    const address = "http://127.0.0.1:9199/v0/b/x/o/images%2Fa.png?alt=media&token=t";
    const results = [
      checkBlogPost(base),
      checkBlogPost({ ...base, date: "2000-02-29" }),
      checkBlogPost({ ...base, date: "1000-01-01" }),
      checkBlogPost({ ...base, date: "9999-12-31" }),
      checkBlogPost({ ...base, coverImage: address }),
    ];
    for (const r of results) expect(r.ok).toBe(true);
    const first = results[0];
    if (first.ok) {
      expect(first.content.tags).toBe("");
      expect(first.content.coverImage).toBe("");
      expect(first.content.coverAlt).toBe("");
    }
    const last = results[4];
    if (last.ok) expect(last.content.coverImage).toBe(address);

    expect(parseTags(" a ,, b ,")).toEqual(["a", "b"]);
    expect(parseTags("")).toEqual([]);
    expect(parseTags("x, x")).toEqual(["x", "x"]);
    expect(isRealDate("2024-02-29")).toBe(true);
    expect(isRealDate("2026-02-29")).toBe(false);
  });

  test("E2E-02: checkBlogPost refuses each bad field with its own message", async () => {
    const B: BlogPostContent = {
      title: "Why I moved to static export",
      excerpt: "Notes on the trade-offs",
      date: "2026-05-15",
      slug: "why-static-export",
      tags: "nextjs, firebase",
      coverImage: "",
      coverAlt: "",
      body: "Body",
      featured: false,
      status: "Draft",
    };
    expect(checkBlogPost(B).ok).toBe(true);

    const errorsOf = (patch: Partial<BlogPostContent>) => {
      const r = checkBlogPost({ ...B, ...patch });
      if (r.ok) return null;
      return r.errors;
    };
    const cases: [Partial<BlogPostContent>, Record<string, string>][] = [];
    for (const title of ["", "   ", "\t\n"]) cases.push([{ title }, { title: "Enter a title" }]);
    for (const excerpt of ["", "   "]) cases.push([{ excerpt }, { excerpt: "Enter an excerpt" }]);
    const dates = ["", "15 May 2026", "2026-02-30", "2026-02-29", "2100-02-29", "2026-04-31", "2026-13-01", "2026-00-10", "2026-05-00", "2026-5-15", "26-05-15", "0999-12-31", "10000-01-01", "2026/05/15", "2026-05-15T00:00:00Z"];
    expect(dates).toHaveLength(15);
    for (const date of dates) cases.push([{ date }, { date: DATE_MSG }]);
    const slugs = ["", "   ", "Why Static Export", "why static export", "why_static_export", "Why-Static-Export", "why/static", "café"];
    expect(slugs).toHaveLength(8);
    for (const slug of slugs) cases.push([{ slug }, { slug: SLUG_MSG }]);
    for (const body of ["", "   ", "\n\n"]) cases.push([{ body }, { body: "Enter the post body" }]);
    expect(cases).toHaveLength(31);

    for (const [patch, expected] of cases) {
      const errors = errorsOf(patch);
      expect(errors, JSON.stringify(patch)).toEqual(expected);
      expect(Object.keys(errors ?? {})).toHaveLength(1);
    }

    expect(errorsOf({ title: "", excerpt: " ", date: "x", slug: "A B", body: "" })).toEqual({
      title: "Enter a title",
      excerpt: "Enter an excerpt",
      date: DATE_MSG,
      slug: SLUG_MSG,
      body: "Enter the post body",
    });
    expect(BLOG_MESSAGES.slugTaken).toBe("A post with this slug already exists");
  });

  test("E2E-03: row mapping, defaults, stored shape, labels, lines and messages", async () => {
    const a = blogPostFromData(
      {
        title: "Why I moved to static export",
        excerpt: "Notes on the trade-offs",
        date: "2026-05-15",
        tags: ["nextjs", "firebase"],
        draft: false,
        featured: true,
        coverImage: "/images/blog/static.png",
        coverAlt: "A diagram of the build",
        body: "Body",
        createdAt: 1,
        updatedAt: 2,
        slug: "ignored",
      },
      "why-static-export",
    );
    expect(a).toEqual({
      title: "Why I moved to static export",
      excerpt: "Notes on the trade-offs",
      date: "2026-05-15",
      slug: "why-static-export",
      tags: "nextjs, firebase",
      coverImage: "/images/blog/static.png",
      coverAlt: "A diagram of the build",
      body: "Body",
      featured: true,
      status: "Published",
    });
    expect(blogPostFromData({}, "x")).toEqual({ title: "", excerpt: "", date: "", slug: "x", tags: "", coverImage: "", coverAlt: "", body: "", featured: false, status: "Draft" });
    const c = blogPostFromData({ title: 5, tags: "a,b", draft: "false", featured: "true", body: null }, "y");
    expect(c.title).toBe("");
    expect(c.tags).toBe("");
    expect(c.featured).toBe(false);
    expect(c.body).toBe("");
    expect(c.status).toBe("Draft");
    expect(c.slug).toBe("y");
    const d = blogPostFromData({ tags: ["a", 3, "b", ""], draft: true }, "z");
    expect(d.tags).toBe("a, b");
    expect(d.status).toBe("Draft");
    expect(blogPostFromData(null, "n")).toEqual({ ...emptyBlogPost(), slug: "n" });
    expect(blogPostFromData("text", "m")).toEqual({ ...emptyBlogPost(), slug: "m" });
    expect(blogPostFromData({ draft: 0 }, "w").status).toBe("Draft");

    const e1 = emptyBlogPost();
    const e2 = emptyBlogPost();
    expect(e1).toEqual({ title: "", excerpt: "", date: "", slug: "", tags: "", coverImage: "", coverAlt: "", body: "", featured: false, status: "Draft" });
    expect(e1).not.toBe(e2);

    expect(blogPostToData(a)).toEqual({
      title: "Why I moved to static export",
      excerpt: "Notes on the trade-offs",
      date: "2026-05-15",
      tags: ["nextjs", "firebase"],
      draft: false,
      featured: true,
      coverImage: "/images/blog/static.png",
      coverAlt: "A diagram of the build",
      body: "Body",
    });
    expect(blogPostToData({ ...a, status: "Draft" }).draft).toBe(true);
    expect(blogPostToData({ ...a, status: "x" as never }).draft).toBe(true);

    expect(blogPostLabel(a)).toBe("Why I moved to static export");
    expect(blogPostLabel({ ...a, title: "   " })).toBe("why-static-export");
    expect(blogPostLines(a)).toEqual(["Slug: why-static-export", "Date: 15 May 2026", "Status: Published"]);
    expect(blogPostLines({ ...a, date: "", status: "Draft" })).toEqual(["Slug: why-static-export", "Date: No date", "Status: Draft"]);
    expect(blogPostLines({ ...a, date: "2026-02-30" })).toEqual(["Slug: why-static-export", "Date: No date", "Status: Published"]);

    expect(BLOG_POSTS_COLLECTION).toBe("blogPosts");
    expect(BLOG_MESSAGES).toEqual({
      titleRequired: "Enter a title",
      excerptRequired: "Enter an excerpt",
      dateInvalid: DATE_MSG,
      slugInvalid: SLUG_MSG,
      bodyRequired: "Enter the post body",
      slugTaken: "A post with this slug already exists",
      slugFixed: "The slug cannot be changed after the first save.",
      emptyList: "No posts yet.",
      listLabel: "Blog posts list",
      addLabel: "Add post",
      imagesFailed: "The uploaded images could not be loaded.",
    });
  });

  test("E2E-04: sortBlogPosts orders by date desc, title asc, id asc without mutating", async () => {
    const mk = (id: string, title: string, date: string) => ({ id, position: 0, content: blogPostFromData({ title, date }, id) });
    const entries = [
      mk("c", "Zeta", "2026-01-02"),
      mk("b", "Beta", "2026-05-15"),
      mk("a2", "Alpha", "2026-05-15"),
      mk("a1", "Alpha", "2026-05-15"),
      mk("p", "Partial", ""),
      mk("u", "alpha lower", "2026-05-15"),
      mk("n", "Newest", "2026-12-31"),
    ];
    const sorted = sortBlogPosts(entries);
    expect(sorted.map((e) => e.id)).toEqual(["n", "a1", "a2", "b", "u", "c", "p"]);
    expect(entries.map((e) => e.id)).toEqual(["c", "b", "a2", "a1", "p", "u", "n"]);
    expect(sortBlogPosts(sorted).map((e) => e.id)).toEqual(["n", "a1", "a2", "b", "u", "c", "p"]);
    expect(sorted).not.toBe(entries);
  });

  test("E2E-05: adding a post saves it as a draft and the edit form shows it back", async ({ page }) => {
    await ownerSession(page);
    await seedImage("e2e-05", "diagram.png");
    await openPosts(page);
    await expect(text(page, "No posts yet.")).toBeVisible();
    expect(await readPosts()).toEqual([]);
    await btn(page, "Add post").click();
    await expect(page.getByRole("heading", { level: 3, name: "Add entry" })).toBeVisible();
    await expect(field(page, "Status")).toHaveValue("Draft");
    await expect(field(page, "Featured")).not.toBeChecked();
    await expect(field(page, "Uploaded image")).toHaveValue("");
    await fillCore(page, CORE);
    await field(page, "Tags").fill("nextjs, firebase");
    await field(page, "Cover image path").fill("/images/blog/static.png");
    await field(page, "Cover alt text").fill("A diagram of the build");
    await btn(page, "Save").click();
    await expect(text(page, "Entry saved")).toBeVisible();
    await expect(ENTRIES(page)).toHaveCount(1);
    for (const t of ["Why I moved to static export", "Slug: why-static-export", "Date: 15 May 2026", "Status: Draft"]) {
      await expect(ENTRIES(page).first()).toContainText(t);
    }
    const posts = await readPosts();
    expect(posts).toHaveLength(1);
    const p = posts[0];
    expect(p.id).toBe("why-static-export");
    expect(p.title).toBe("Why I moved to static export");
    expect(p.excerpt).toBe("Notes on the trade-offs");
    expect(p.date).toBe("2026-05-15");
    expect(p.tags).toEqual(["nextjs", "firebase"]);
    expect(p.draft).toBe(true);
    expect(p.featured).toBe(false);
    expect(p.coverImage).toBe("/images/blog/static.png");
    expect(p.coverAlt).toBe("A diagram of the build");
    expect(p.body).toBe(CORE.body);
    expect(p.createdAt).toBeGreaterThan(BIG);
    expect(p.createdAt).toBe(p.updatedAt);
    expect((await unauth("why-static-export")).status).toBe(403);

    await reopen(page);
    await inRow(rowFor(page, "Why I moved to static export"), "Edit").click();
    await expect(page.getByRole("heading", { level: 3, name: "Edit entry" })).toBeVisible();
    await expect(field(page, "Title")).toHaveValue(CORE.title);
    await expect(field(page, "Excerpt")).toHaveValue(CORE.excerpt);
    await expect(field(page, "Date")).toHaveValue(CORE.date);
    await expect(field(page, "Slug")).toHaveValue("why-static-export");
    await expect(field(page, "Cover alt text")).toHaveValue("A diagram of the build");
    await expect(field(page, "Body")).toHaveValue(CORE.body);
    await expect(field(page, "Tags")).toHaveValue("nextjs, firebase");
    await expect(field(page, "Cover image path")).toHaveValue("/images/blog/static.png");
    await expect(field(page, "Uploaded image")).toHaveValue("");
    await expect(field(page, "Status")).toHaveValue("Draft");
    await expect(field(page, "Featured")).not.toBeChecked();
    await expect(field(page, "Slug")).not.toBeEditable();
    await expect(text(page, "The slug cannot be changed after the first save.")).toBeVisible();
  });

  test("E2E-06: a published post with an uploaded cover is public and reloads with the cover chosen", async ({ page }) => {
    await ownerSession(page);
    await seedImage("e2e-06", "diagram.png");
    await openPosts(page);
    await btn(page, "Add post").click();
    await fillCore(page, CORE);
    await field(page, "Tags").fill("nextjs, firebase");
    await field(page, "Cover alt text").fill("A diagram of the build");
    await field(page, "Uploaded image").selectOption({ label: "diagram.png" });
    await expect(field(page, "Cover image path")).toHaveValue("");
    await expect(field(page, "Uploaded image")).toHaveValue("e2e-06");
    await field(page, "Status").selectOption("Published");
    await btn(page, "Save").click();
    await expect(text(page, "Entry saved")).toBeVisible();
    await expect(ENTRIES(page).first()).toContainText("Status: Published");
    const posts = await readPosts();
    expect(posts).toHaveLength(1);
    expect(posts[0].draft).toBe(false);
    expect(posts[0].coverImage).toBe(IMGURL("e2e-06"));
    expect(posts[0].tags).toEqual(["nextjs", "firebase"]);
    const pub = await unauth("why-static-export");
    expect(pub.status).toBe(200);
    expect(pub.title).toBe("Why I moved to static export");

    await reopen(page);
    await inRow(ENTRIES(page).first(), "Edit").click();
    await expect(field(page, "Uploaded image")).toHaveValue("e2e-06");
    await expect(field(page, "Cover image path")).toHaveValue("");
    await expect(field(page, "Status")).toHaveValue("Published");
    await expect(field(page, "Title")).toHaveValue("Why I moved to static export");
  });

  test("E2E-07: the list is ordered, shows slug, date and status, and has no move buttons", async ({ browser }) => {
    const context = await browser.newContext({ baseURL: "http://127.0.0.1:3100", timezoneId: "Pacific/Honolulu" });
    try {
      const page = await context.newPage();
      await ownerSession(page);
      for (const p of [W, N, O, TA, TB]) await seedPost(p);
      await seedRaw("e2e-partial", { title: str("Partial post") });
      await openPosts(page);
      await expect(ENTRIES(page)).toHaveCount(6);
      await expect(ENTRIES(page)).toContainText([
        "Notes on Firebase rules",
        "Alpha notes",
        "Beta notes",
        "Why I moved to static export",
        "A year of Next.js",
        "Partial post",
      ]);
      const first = ENTRIES(page).nth(0);
      for (const t of ["Slug: firebase-rules-notes", "Date: 20 May 2026", "Status: Draft"]) await expect(first).toContainText(t);
      const wRow = rowFor(page, "Why I moved to static export");
      for (const t of ["Slug: why-static-export", "Date: 15 May 2026", "Status: Published"]) await expect(wRow).toContainText(t);
      await expect(page.getByText("14 May 2026")).toHaveCount(0);
      const oRow = rowFor(page, "A year of Next.js");
      for (const t of ["Date: 2 January 2026", "Status: Published"]) await expect(oRow).toContainText(t);
      const pRow = rowFor(page, "Partial post");
      for (const t of ["Slug: e2e-partial", "Date: No date", "Status: Draft"]) await expect(pRow).toContainText(t);
      for (let i = 0; i < 6; i++) {
        const row = ENTRIES(page).nth(i);
        await expect(inRow(row, "Move up")).toHaveCount(0);
        await expect(inRow(row, "Move down")).toHaveCount(0);
        await expect(inRow(row, "Edit")).toHaveCount(1);
        await expect(inRow(row, "Delete")).toHaveCount(1);
      }
    } finally {
      await context.close();
    }
  });

  test("E2E-08: an empty collection shows the empty text and the add control", async ({ page }) => {
    await ownerSession(page);
    await openPosts(page);
    await expect(text(page, "No posts yet.")).toBeVisible();
    await expect(page.getByRole("list", { name: "Blog posts list" })).toHaveCount(0);
    await expect(btn(page, "Add post")).toBeVisible();
    await expect(btn(page, "Add entry")).toHaveCount(0);
    await expect(EDITOR(page)).toHaveCount(1);
    expect(await readPosts()).toEqual([]);
  });

  test("E2E-09: a slug already taken is refused, the form keeps its values and the stored post is untouched", async ({ page }) => {
    await ownerSession(page);
    await seedPost(W);
    await openPosts(page);
    await btn(page, "Add post").click();
    await fillCore(page, { title: "A different post", excerpt: "Another excerpt", date: "2026-06-01", slug: "why-static-export", body: "Different body" });
    await btn(page, "Save").click();
    await expect(text(page, "A post with this slug already exists")).toBeVisible();
    await expect(page.getByRole("heading", { level: 3, name: "Add entry" })).toBeVisible();
    await expect(field(page, "Title")).toHaveValue("A different post");
    await expect(field(page, "Excerpt")).toHaveValue("Another excerpt");
    await expect(field(page, "Date")).toHaveValue("2026-06-01");
    await expect(field(page, "Slug")).toHaveValue("why-static-export");
    await expect(field(page, "Body")).toHaveValue("Different body");
    await expect(text(page, "Entry saved")).toHaveCount(0);
    expect(await readPosts()).toEqual([W]);
    await btn(page, "Cancel").click();
    await expect(ENTRIES(page)).toHaveCount(1);
    await expect(ENTRIES(page).first()).toContainText("Why I moved to static export");
    await expect(page.getByText("A different post")).toHaveCount(0);
  });

  test("E2E-10: a second tab cannot overwrite a post created in the first", async ({ page }) => {
    await ownerSession(page);
    const second = await page.context().newPage();
    await second.goto(PANEL);
    await expect(nav(second)).toBeVisible();
    await openPosts(second);
    await openPosts(page);
    await btn(page, "Add post").click();
    await fillCore(page, { title: "First tab post", excerpt: "From the first tab", date: "2026-06-01", slug: "two-tabs", body: "First body" });
    await btn(second, "Add post").click();
    await fillCore(second, { title: "Second tab post", excerpt: "From the second tab", date: "2026-06-02", slug: "two-tabs", body: "Second body" });
    await btn(page, "Save").click();
    await expect(text(page, "Entry saved")).toBeVisible();
    await btn(second, "Save").click();
    await expect(text(second, "A post with this slug already exists")).toBeVisible();
    await expect(second.getByRole("heading", { level: 3, name: "Add entry" })).toBeVisible();
    await expect(field(second, "Title")).toHaveValue("Second tab post");
    await expect(field(second, "Body")).toHaveValue("Second body");
    await expect(text(second, "Entry saved")).toHaveCount(0);
    const posts = await readPosts();
    expect(posts).toHaveLength(1);
    expect(posts[0].id).toBe("two-tabs");
    expect(posts[0].title).toBe("First tab post");
    expect(posts[0].body).toBe("First body");
    expect(posts[0].date).toBe("2026-06-01");
  });

  test("E2E-11: each bad field is refused with its own message and nothing is saved", async ({ page }) => {
    await ownerSession(page);
    await openPosts(page);
    await btn(page, "Add post").click();
    await fillCore(page, CORE);
    const labels: [keyof CoreValues, string][] = [
      ["title", "Title"],
      ["excerpt", "Excerpt"],
      ["date", "Date"],
      ["slug", "Slug"],
      ["body", "Body"],
    ];
    const MSG: Record<keyof CoreValues, string> = {
      title: "Enter a title",
      excerpt: "Enter an excerpt",
      date: DATE_MSG,
      slug: SLUG_MSG,
      body: "Enter the post body",
    };
    const cases: Partial<CoreValues>[] = [
      { title: "" },
      { excerpt: "   " },
      { date: "15 May 2026" },
      { date: "2026-02-30" },
      { slug: "Why Static Export" },
      { slug: "" },
      { body: "   " },
      { title: "", excerpt: "", date: "x", slug: "A B", body: "" },
    ];
    for (let i = 0; i < cases.length; i++) {
      const patch = cases[i];
      await fillCore(page, { ...CORE, ...patch });
      await btn(page, "Save").click();
      for (const [key, label] of labels) {
        const changed = key in patch;
        const expectedMsg = i === 7 || changed ? MSG[key] : "";
        await expect(field(page, label), `case ${i + 1} ${label}`).toHaveAccessibleDescription(expectedMsg);
        await expect(field(page, label)).toHaveValue(patch[key] ?? CORE[key]);
      }
      await expect(page.getByRole("heading", { level: 3, name: "Add entry" })).toBeVisible();
      await expect(text(page, "Entry saved")).toHaveCount(0);
      expect(await readPosts()).toEqual([]);
    }
    await btn(page, "Cancel").click();
    await expect(text(page, "No posts yet.")).toBeVisible();
  });

  test("E2E-12: editing a post rewrites it, keeps the slug and createdAt, and can unpublish it", async ({ page }) => {
    await ownerSession(page);
    await seedPost(W);
    await openPosts(page);
    await inRow(rowFor(page, "Why I moved to static export"), "Edit").click();
    await expect(page.getByRole("heading", { level: 3, name: "Edit entry" })).toBeVisible();
    await expect(field(page, "Title")).toHaveValue(W.title);
    await expect(field(page, "Excerpt")).toHaveValue("Notes on the trade-offs");
    await expect(field(page, "Date")).toHaveValue("2026-05-15");
    await expect(field(page, "Slug")).toHaveValue("why-static-export");
    await expect(field(page, "Tags")).toHaveValue("nextjs, firebase");
    await expect(field(page, "Cover image path")).toHaveValue("/images/blog/static.png");
    await expect(field(page, "Cover alt text")).toHaveValue("A diagram of the build");
    await expect(field(page, "Body")).toHaveValue("First draft");
    await expect(field(page, "Status")).toHaveValue("Published");
    await expect(field(page, "Featured")).not.toBeChecked();
    await expect(field(page, "Slug")).not.toBeEditable();
    await field(page, "Title").fill("Why I moved to static export (updated)");
    await field(page, "Body").fill("Second draft");
    await field(page, "Featured").check();
    await field(page, "Status").selectOption("Draft");
    await btn(page, "Save").click();
    await expect(text(page, "Entry saved")).toBeVisible();
    await expect(ENTRIES(page)).toHaveCount(1);
    await expect(ENTRIES(page).first()).toContainText("Why I moved to static export (updated)");
    await expect(ENTRIES(page).first()).toContainText("Status: Draft");
    await expect(text(page, "Why I moved to static export")).toHaveCount(0);
    const posts = await readPosts();
    expect(posts).toHaveLength(1);
    expect(posts[0].id).toBe("why-static-export");
    expect(core(posts[0])).toEqual({ ...core(W), title: "Why I moved to static export (updated)", body: "Second draft", featured: true, draft: true });
    expect(posts[0].createdAt).toBe(1);
    expect(posts[0].updatedAt).toBeGreaterThan(BIG);
    expect((await unauth("why-static-export")).status).toBe(403);

    await reopen(page);
    await inRow(ENTRIES(page).first(), "Edit").click();
    await expect(field(page, "Featured")).toBeChecked();
    await expect(field(page, "Status")).toHaveValue("Draft");
    await expect(field(page, "Slug")).toHaveValue("why-static-export");
    await expect(field(page, "Slug")).not.toBeEditable();
    await expect(field(page, "Title")).toHaveValue("Why I moved to static export (updated)");
  });

  test("E2E-13: cancelling a delete keeps the post", async ({ page }) => {
    await ownerSession(page);
    await seedPost(W);
    await seedPost(O);
    await openPosts(page);
    const wRow = rowFor(page, "Why I moved to static export");
    await inRow(wRow, "Delete").click();
    await expect(wRow.getByRole("group", { name: "Confirm delete", exact: true })).toContainText('Delete "Why I moved to static export"? This cannot be undone.');
    await expect(ENTRIES(page)).toHaveCount(2);
    expect(await readPosts()).toEqual([O, W]);
    await GROUP(page).getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(GROUP(page)).toHaveCount(0);
    await expect(ENTRIES(page)).toContainText(["Why I moved to static export", "A year of Next.js"]);
    await expect(inRow(wRow, "Delete")).toBeEnabled();
    await expect(text(page, "Entry deleted")).toHaveCount(0);
    expect(await readPosts()).toEqual([O, W]);
    await reopen(page);
    await expect(ENTRIES(page)).toHaveCount(2);
    await expect(ENTRIES(page)).toContainText(["Why I moved to static export", "A year of Next.js"]);
    expect(await readPosts()).toEqual([O, W]);
  });

  test("E2E-14: a confirmed delete is permanent and offers no undo", async ({ page }) => {
    await ownerSession(page);
    await seedPost(W);
    await seedPost(O);
    await openPosts(page);
    await inRow(rowFor(page, "Why I moved to static export"), "Delete").click();
    await GROUP(page).getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(text(page, "Entry deleted")).toBeVisible();
    await expect(GROUP(page)).toHaveCount(0);
    await expect(ENTRIES(page)).toHaveCount(1);
    await expect(ENTRIES(page).first()).toContainText("A year of Next.js");
    await expect(text(page, "Why I moved to static export")).toHaveCount(0);
    expect(await readPosts()).toEqual([O]);
    await expect(EDITOR(page).getByRole("button", { name: /restore|undo|trash/i })).toHaveCount(0);
    await expect(page.getByText(/restore|undo|trash/i)).toHaveCount(0);
    await reopen(page);
    await expect(ENTRIES(page)).toHaveCount(1);
    await expect(ENTRIES(page).first()).toContainText("A year of Next.js");
    await expect(text(page, "Why I moved to static export")).toHaveCount(0);
    expect(await readPosts()).toEqual([O]);
  });

  test("E2E-15: the cover is one source at a time, an uploaded image or a trimmed path", async ({ page }) => {
    await ownerSession(page);
    await seedImage("e2e-15", "diagram.png");
    await openPosts(page);
    await btn(page, "Add post").click();
    await fillCore(page, { title: "Cover test", excerpt: "Cover excerpt", date: "2026-06-03", slug: "cover-test", body: "Cover body" });
    await field(page, "Uploaded image").selectOption({ label: "diagram.png" });
    await expect(field(page, "Cover image path")).toHaveValue("");
    await expect(field(page, "Uploaded image")).toHaveValue("e2e-15");
    await field(page, "Cover image path").fill("/images/blog/other.png");
    await expect(field(page, "Uploaded image")).toHaveValue("");
    await field(page, "Uploaded image").selectOption({ label: "diagram.png" });
    await expect(field(page, "Cover image path")).toHaveValue("");
    await expect(field(page, "Uploaded image")).toHaveValue("e2e-15");
    await field(page, "Cover image path").fill("  /images/blog/x.png  ");
    await expect(field(page, "Uploaded image")).toHaveValue("");
    await btn(page, "Save").click();
    await expect(text(page, "Entry saved")).toBeVisible();
    const posts = await readPosts();
    expect(posts).toHaveLength(1);
    expect(posts[0].coverImage).toBe("/images/blog/x.png");
    expect(posts[0].coverAlt).toBe("");
    await reopen(page);
    await inRow(ENTRIES(page).first(), "Edit").click();
    await expect(field(page, "Cover image path")).toHaveValue("/images/blog/x.png");
    await expect(field(page, "Uploaded image")).toHaveValue("");
    await expect(field(page, "Cover alt text")).toHaveValue("");
  });

  test("E2E-16: a cover whose image is gone is kept as typed text", async ({ page }) => {
    await ownerSession(page);
    await seedPost({ id: "gone-cover", title: "Gone cover", excerpt: "Cover excerpt", date: "2026-06-05", tags: [], draft: false, featured: false, coverImage: "https://example.com/gone.png", coverAlt: "Gone", body: "Gone body", createdAt: 1, updatedAt: 1 });
    await openPosts(page);
    await inRow(ENTRIES(page).first(), "Edit").click();
    await expect(field(page, "Cover image path")).toHaveValue("https://example.com/gone.png");
    await expect(field(page, "Uploaded image")).toHaveValue("");
    await expect(field(page, "Uploaded image").locator("option")).toHaveText(["None"]);
    await expect(text(page, "The uploaded images could not be loaded.")).toHaveCount(0);
    await field(page, "Title").fill("Gone cover 2");
    await btn(page, "Save").click();
    await expect(text(page, "Entry saved")).toBeVisible();
    const posts = await readPosts();
    expect(posts).toHaveLength(1);
    expect(posts[0].coverImage).toBe("https://example.com/gone.png");
    expect(posts[0].title).toBe("Gone cover 2");
    expect(posts[0].coverAlt).toBe("Gone");
    expect(posts[0].createdAt).toBe(1);
  });

  test("E2E-17: an edit that changes the date re-sorts the list and a cancelled edit changes nothing", async ({ page }) => {
    await ownerSession(page);
    await seedPost(W);
    await seedPost(O);
    await openPosts(page);
    await inRow(rowFor(page, "A year of Next.js"), "Edit").click();
    await field(page, "Date").fill("2026-07-01");
    await btn(page, "Save").click();
    await expect(text(page, "Entry saved")).toBeVisible();
    await expect(ENTRIES(page)).toContainText(["A year of Next.js", "Why I moved to static export"]);
    await expect(ENTRIES(page).first()).toContainText("Date: 1 July 2026");
    await reopen(page);
    await expect(ENTRIES(page)).toContainText(["A year of Next.js", "Why I moved to static export"]);
    await inRow(rowFor(page, "Why I moved to static export"), "Edit").click();
    await field(page, "Title").fill("Dropped title");
    await btn(page, "Cancel").click();
    await expect(text(page, "Why I moved to static export")).toBeVisible();
    await expect(page.getByText("Dropped title")).toHaveCount(0);
    const posts = await readPosts();
    const w = posts.find((p) => p.id === "why-static-export");
    expect(w?.title).toBe("Why I moved to static export");
  });

  test("E2E-18: a refused save shows the shared failure, not a slug clash, and works once allowed", async ({ page }) => {
    const X = await ownerSession(page);
    await openPosts(page);
    await btn(page, "Add post").click();
    await fillCore(page, { title: "Refused post", excerpt: "Refused excerpt", date: "2026-06-04", slug: "refused-post", body: "Refused body" });
    await RF(null);
    await btn(page, "Save").click();
    await expect(text(page, "The entry could not be saved. Try again, and check that you are signed in as the owner.")).toBeVisible();
    await expect(text(page, "Entry saved")).toHaveCount(0);
    await expect(text(page, "A post with this slug already exists")).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 3, name: "Add entry" })).toBeVisible();
    await expect(field(page, "Title")).toHaveValue("Refused post");
    await expect(field(page, "Slug")).toHaveValue("refused-post");
    await expect(field(page, "Body")).toHaveValue("Refused body");
    expect(await readPosts()).toEqual([]);
    await RF(X);
    await btn(page, "Save").click();
    await expect(text(page, "Entry saved")).toBeVisible();
    const posts = await readPosts();
    expect(posts).toHaveLength(1);
    expect(posts[0].id).toBe("refused-post");
  });

  test("E2E-19: when the list cannot be read the screen says so and offers no add", async ({ page }) => {
    await ownerSession(page);
    await seedPost(W);
    await RF(null);
    await page.reload();
    await expect(nav(page)).toBeVisible();
    await nav(page).getByRole("button", { name: "Blog posts", exact: true }).click();
    await expect(page.getByRole("heading", { level: 2, name: "Blog posts" })).toBeVisible();
    await expect(text(page, "The entries could not be loaded.")).toBeVisible();
    await expect(btn(page, "Add post")).toHaveCount(0);
    await expect(ENTRIES(page)).toHaveCount(0);
    await expect(page.getByText("Why I moved to static export")).toHaveCount(0);
    expect(await readPosts()).toEqual([W]);
  });

  test("E2E-20: long text stays inside a 375 pixel screen", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await ownerSession(page);
    const base = { excerpt: "x", date: "2026-05-15", tags: [], draft: false, featured: false, coverImage: "", coverAlt: "", body: "b", createdAt: 1, updatedAt: 1 };
    const L1: Post = { ...base, id: "a".repeat(70), title: "A".repeat(80) };
    const L2: Post = { ...base, id: "e2e-l2", title: "B".repeat(80), date: "2026-05-14" };
    const L3: Post = { ...base, id: "e2e-l3", title: "C".repeat(80), date: "2026-05-13" };
    for (const p of [L1, L2, L3]) await seedPost(p);
    const imageName = "I".repeat(80) + ".png";
    await seedImage("e2e-20", imageName);
    await openPosts(page);
    const row1 = rowFor(page, L1.title);
    await expect(inRow(row1, "Edit")).toBeVisible();
    await expect(inRow(row1, "Delete")).toBeVisible();
    await expect(row1).toContainText("Slug: " + L1.id);
    let m = await measureLayout(page);
    expect(m.scrollWidth).toBeLessThanOrEqual(375);
    expect(m.bad).toEqual([]);
    await inRow(row1, "Delete").click();
    m = await measureLayout(page);
    expect(m.scrollWidth).toBeLessThanOrEqual(375);
    expect(m.bad).toEqual([]);
    await GROUP(page).getByRole("button", { name: "Cancel", exact: true }).click();
    await inRow(rowFor(page, L3.title), "Edit").click();
    await expect(page.getByRole("heading", { level: 3, name: "Edit entry" })).toBeVisible();
    await field(page, "Body").fill("w".repeat(300));
    await field(page, "Title").fill("T".repeat(80));
    m = await measureLayout(page);
    expect(m.scrollWidth).toBeLessThanOrEqual(375);
    expect(m.bad).toEqual([]);
    await btn(page, "Cancel").click();
    await btn(page, "Add post").click();
    await expect(page.getByRole("heading", { level: 3, name: "Add entry" })).toBeVisible();
    await field(page, "Slug").fill("z".repeat(80));
    await field(page, "Uploaded image").selectOption({ label: imageName });
    m = await measureLayout(page);
    expect(m.scrollWidth).toBeLessThanOrEqual(375);
    expect(m.bad).toEqual([]);
    await expect(btn(page, "Save")).toBeVisible();
    await expect(btn(page, "Cancel")).toBeVisible();
    await btn(page, "Cancel").click();
  });

  test("E2E-21: the menu shows the Blog posts editor and no placeholder remains", async ({ page }) => {
    await ownerSession(page);
    const MENU = ["Profile", "Experience", "Projects", "Certifications", "Tech stack", "Blog posts", "Images"];
    const order = ["Blog posts", "Profile", "Experience", "Projects", "Certifications", "Tech stack", "Images", "Blog posts"];
    for (let i = 0; i < order.length; i++) {
      const item = order[i];
      await nav(page).getByRole("button", { name: item, exact: true }).click();
      await expect(page.getByRole("heading", { level: 2, name: item, exact: true })).toBeVisible();
      await expect(page.getByText(/editor is not available yet/)).toHaveCount(0);
      await expect(nav(page).getByRole("button")).toHaveText(MENU);
      if (item === "Blog posts") {
        await expect(btn(page, "Add post")).toBeVisible();
        await expect(EDITOR(page)).toHaveCount(1);
        await expect(page.getByRole("heading", { level: 2, name: "Profile", exact: true })).toHaveCount(0);
        await expect(page.getByRole("heading", { level: 2, name: "Images", exact: true })).toHaveCount(0);
      }
      if (item === "Profile") {
        await expect(EDITOR(page)).toHaveCount(0);
        await expect(page.getByRole("heading", { level: 2, name: "Blog posts", exact: true })).toHaveCount(0);
      }
    }
  });

  test("E2E-22: the new and changed files follow the repo rules", async () => {
    const files = [
      "src/app/components/admin/ListEditor.tsx",
      "src/app/components/admin/BlogPostsEditor.tsx",
      "src/app/components/admin/AdminPanel.tsx",
      "src/lib/admin/blogposts.ts",
      "src/lib/firebase/blogposts.ts",
      "src/lib/firebase/list.ts",
    ];
    const suppress = [new RegExp("eslint" + "-disable"), new RegExp("@ts" + "-ignore"), new RegExp("@ts" + "-nocheck")];
    const authWords = ["firebase/auth", "getFirebaseAuth", "currentUser", "displayName", "photoURL", "watchAuth", "signInWithGoogle", "signOutUser", "onAuthStateChanged", "getAuth", "providerData", "getIdToken", "accessToken"];
    const src: Record<string, string> = {};
    for (const f of files) src[f] = repoText(f);
    for (const f of files) {
      for (const re of [...CORE_PATTERNS, ...suppress]) expect(src[f], `${f} ${re}`).not.toMatch(re);
      if (!f.endsWith("AdminPanel.tsx")) for (const w of authWords) expect(src[f], `${f} ${w}`).not.toContain(w);
    }
    for (const w of ["movable", "order", "saveFailure", "Move up", "Move down", "Confirm delete"]) expect(src[files[0]]).toContain(w);
    for (const w of ["listImages", "photoSelection", "savingOn", "movable", "sortBlogPosts", "SlugTakenError"]) expect(src[files[1]]).toContain(w);
    for (const w of ["bottomPosition", "firebase/firestore", "Add entry", "Move up", "Confirm delete", "Delete"]) expect(src[files[1]]).not.toContain(w);
    expect(src[files[2]]).toContain("BlogPostsEditor");
    expect(src[files[2]]).not.toContain("not available yet");
    expect(src[files[3]]).not.toContain("firebase");
    expect(src[files[3]]).toContain("../blog/types");
    for (const w of ["runTransaction", "withTimeout", "SlugTakenError", "getDocsFromServer"]) expect(src[files[4]]).toContain(w);
    for (const w of ["setDoc(", "addDoc", "createListStore"]) expect(src[files[4]]).not.toContain(w);
    expect(src[files[5]]).toContain("export async function withTimeout");
  });

  test("E2E-23: the public pages carry nothing of the editor", async ({ browser }) => {
    const collect = async (path: string): Promise<string> => {
      const context = await browser.newContext({ baseURL: "http://127.0.0.1:3100" });
      try {
        const page = await context.newPage();
        const pending: Promise<string>[] = [];
        page.on("response", (res) => {
          const type = res.headers()["content-type"] ?? "";
          if (res.request().resourceType() === "script" || type.includes("javascript")) pending.push(res.text().catch(() => ""));
        });
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        const html = await page.content();
        return [...(await Promise.all(pending)), html].join("\n");
      } finally {
        await context.close();
      }
    };
    for (const path of ["/", "/blog/hello-world/"]) {
      const t = await collect(path);
      for (const w of ["A post with this slug already exists", "firestore.googleapis.com", "thegoldenpothos-5b3a1"]) expect(t, `${path} ${w}`).not.toContain(w);
    }
    expect(await collect(PANEL)).toContain("A post with this slug already exists");
  });
});
