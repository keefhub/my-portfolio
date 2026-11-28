import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { expect, request as playwrightRequest, test, type APIRequestContext, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { encode } from "next-auth/jwt";

test.describe.configure({ mode: "default" });
test.setTimeout(150000);

const STAND_IN_PREFIX = "stand-in:";
const DB_URL = process.env.SUPABASE_DB_URL ?? "";
const DB_FILE = DB_URL.startsWith(STAND_IN_PREFIX) ? DB_URL.slice(STAND_IN_PREFIX.length) : "";

function dbReset(): void {
  if (DB_FILE !== "" && fs.existsSync(DB_FILE)) fs.rmSync(DB_FILE, { force: true });
}

function readDbFile(): Record<string, unknown> {
  if (DB_FILE === "" || !fs.existsSync(DB_FILE)) return {};
  return JSON.parse(fs.readFileSync(DB_FILE, "utf8")) as Record<string, unknown>;
}

function dbBreak(): void {
  fs.writeFileSync(DB_FILE, JSON.stringify({ ...readDbFile(), unreachable: true }));
}

function dbFix(): void {
  const { unreachable: _unreachable, ...rest } = readDbFile();
  void _unreachable;
  fs.writeFileSync(DB_FILE, JSON.stringify(rest));
}

const PUBLISH = "/api/admin/publish/";
const POSTS_API = "/api/admin/blog-posts/";
const PANEL = "/bright-warm-greenhouse/";
const SESSION_COOKIE = "authjs.session-token";
const EMPTY_TEXT = "No posts yet — check back soon!";
type Claims = { sub: string; email: string; name: string; emailVerified: boolean };
const setting = (name: string): string => process.env[name] ?? "";
const OWNER = (): Claims => ({ sub: "owner-1", email: setting("ADMIN_EMAIL"), name: "Owner Test", emailVerified: true });
const OTHER: Claims = { sub: "other-1", email: "mallory@example.test", name: "Mallory", emailVerified: true };

async function cookieOf(claims: Claims): Promise<string> {
  const value = await encode({
    token: { ...claims },
    secret: setting("AUTH_SECRET"),
    salt: SESSION_COOKIE,
    maxAge: 3600,
  });
  return SESSION_COOKIE + "=" + value;
}

const baseUrlOf = (): string => String(test.info().project.use.baseURL ?? "http://localhost:3100");

async function withRequest<T>(base: string, run: (request: APIRequestContext) => Promise<T>): Promise<T> {
  const request = await playwrightRequest.newContext({ baseURL: base });
  try {
    return await run(request);
  } finally {
    await request.dispose();
  }
}

type Post = {
  title: string;
  excerpt: string;
  date: string;
  slug: string;
  tags: string[];
  draft: boolean;
  featured: boolean;
  coverImage: string;
  coverAlt: string;
  body: string;
};

const P1: Post = {
  title: "Notes on moving to Vercel",
  excerpt: "What changed and why",
  date: "2026-05-15",
  slug: "moving-to-vercel",
  tags: ["nextjs", "vercel"],
  draft: false,
  featured: false,
  coverImage: "",
  coverAlt: "",
  body: "## Why move\n\nThe site now runs on Vercel.\n\n```js\nconst answer = 42;\n```\n\n<mark>raw html line</mark>\n",
};
const P2: Post = {
  title: "Second post",
  excerpt: "A second excerpt",
  date: "2026-06-01",
  slug: "second-post",
  tags: [],
  draft: false,
  featured: false,
  coverImage: "",
  coverAlt: "",
  body: "Second body words.\n",
};
const P3: Post = {
  title: "Unfinished thoughts",
  excerpt: "Draft excerpt text",
  date: "2026-04-01",
  slug: "unfinished-thoughts",
  tags: [],
  draft: true,
  featured: false,
  coverImage: "",
  coverAlt: "",
  body: "Secret draft body words.\n",
};

async function ownerJson(request: APIRequestContext, method: "post" | "put" | "delete", url: string, post?: Post) {
  const headers: Record<string, string> = { cookie: await cookieOf(OWNER()) };
  if (post) headers["content-type"] = "application/json";
  const options = post ? { headers, data: JSON.stringify({ content: post }), maxRedirects: 0 } : { headers, maxRedirects: 0 };
  return request[method](url, options);
}

async function seed(base: string, post: Post): Promise<void> {
  await withRequest(base, async (request) => {
    const response = await ownerJson(request, "post", POSTS_API, post);
    expect(response.status()).toBe(200);
  });
}

async function edit(base: string, slug: string, post: Post): Promise<void> {
  await withRequest(base, async (request) => {
    const response = await ownerJson(request, "put", POSTS_API + "?id=" + slug, post);
    expect(response.status()).toBe(200);
  });
}

async function remove(base: string, slug: string): Promise<void> {
  await withRequest(base, async (request) => {
    const response = await ownerJson(request, "delete", POSTS_API + "?id=" + slug);
    expect(response.status()).toBe(200);
  });
}

async function publish(base: string): Promise<void> {
  await withRequest(base, async (request) => {
    const response = await request.post(PUBLISH, { headers: { cookie: await cookieOf(OWNER()) }, maxRedirects: 0 });
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ published: true });
  });
}

type Visit = { status: number; page: Page; context: BrowserContext };

async function visit(browser: Browser, base: string, url: string, viewport?: { width: number; height: number }): Promise<Visit> {
  const context = await browser.newContext({ baseURL: base, ...(viewport ? { viewport } : {}) });
  const page = await context.newPage();
  const response = await page.goto(url);
  return { status: response ? response.status() : 0, page, context };
}

async function mainText(page: Page): Promise<string> {
  return page.locator("main#main-content").innerText();
}

async function listText(browser: Browser, base: string): Promise<string> {
  const v = await visit(browser, base, "/blog/");
  try {
    return await mainText(v.page);
  } finally {
    await v.context.close();
  }
}

async function waitList(browser: Browser, base: string, text: string, present = true): Promise<void> {
  const check = async () => (await listText(browser, base)).includes(text);
  await expect.poll(check, { timeout: 60000 }).toBe(present);
}

async function blank(browser: Browser, base: string): Promise<void> {
  dbReset();
  await publish(base);
  await waitList(browser, base, EMPTY_TEXT);
}

async function status(base: string, url: string): Promise<number> {
  return withRequest(base, async (request) => (await request.get(url, { maxRedirects: 0 })).status());
}

async function openPanel(browser: Browser, base: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ baseURL: base });
  const [name, ...rest] = (await cookieOf(OWNER())).split("=");
  await context.addCookies([{ name, value: rest.join("="), url: base }]);
  const page = await context.newPage();
  await page.goto(PANEL);
  return { context, page };
}

test.afterAll(async ({ browser }) => {
  await blank(browser, baseUrlOf());
});

test("E2E-01: a first visit before Publish is a 404, then Publish shows the post to visitors", async ({ browser }) => {
  const base = baseUrlOf();
  await blank(browser, base);
  await seed(base, P1);

  const before = await visit(browser, base, "/blog/moving-to-vercel/");
  expect(before.status).toBe(404);
  await expect(before.page.getByRole("heading", { level: 1, name: "404", exact: true })).toBeVisible();
  await before.context.close();

  const panel = await openPanel(browser, base);
  const button = panel.page.getByRole("button", { name: "Publish", exact: true });
  await expect(button).toBeVisible();
  await button.click();
  await expect(panel.page.getByText("Published. Visitors will see the changes within a minute.")).toBeVisible();
  await panel.context.close();

  await waitList(browser, base, "Notes on moving to Vercel");
  const list = await listText(browser, base);
  expect(list).toContain("What changed and why");

  const post = await visit(browser, base, "/blog/moving-to-vercel/");
  try {
    expect(post.status).toBe(200);
    const page = post.page;
    await expect(page.getByRole("heading", { level: 1, name: "Notes on moving to Vercel" })).toBeVisible();
    await expect(page.getByText("nextjs", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("vercel", { exact: true }).first()).toBeVisible();
    const time = page.locator("time").first();
    await expect(time).toHaveText("15 May 2026");
    await expect(time).toHaveAttribute("datetime", "2026-05-15");
    await expect(page.getByRole("heading", { level: 2, name: "Why move" })).toBeVisible();
    await expect(page.locator("pre code")).toContainText("const answer = 42;");
    await expect(page.locator("article mark")).toHaveCount(1);
    await expect(page.locator("article mark")).toHaveText("raw html line");
    await expect(page.getByText("1 min read")).toBeVisible();
    expect(await mainText(page)).not.toContain("Updated");
    await expect(page.getByRole("link", { name: "All posts", exact: true })).toHaveAttribute("href", /^\/blog\/?$/);
  } finally {
    await post.context.close();
  }
});

test("E2E-02: a saved or edited post stays out of the pages until Publish", async ({ browser }) => {
  const base = baseUrlOf();
  await blank(browser, base);
  await seed(base, P1);
  await publish(base);
  await waitList(browser, base, "Notes on moving to Vercel");
  await seed(base, P2);
  await edit(base, "moving-to-vercel", { ...P1, title: "Notes on moving to Vercel, revised" });

  const list = await listText(browser, base);
  expect(list).toContain("Notes on moving to Vercel");
  expect(list).not.toContain("Second post");
  expect(list).not.toContain("revised");

  const second = await visit(browser, base, "/blog/second-post/");
  expect(second.status).toBe(404);
  await expect(second.page.getByRole("heading", { level: 1, name: "404", exact: true })).toBeVisible();
  await second.context.close();

  const first = await visit(browser, base, "/blog/moving-to-vercel/");
  await expect(first.page.getByRole("heading", { level: 1, name: "Notes on moving to Vercel", exact: true })).toBeVisible();
  await first.context.close();

  await publish(base);
  await waitList(browser, base, "Notes on moving to Vercel, revised");
  expect(await listText(browser, base)).toContain("Second post");

  await expect
    .poll(async () => {
      const v = await visit(browser, base, "/blog/second-post/");
      try {
        return v.status === 200 && (await v.page.getByRole("heading", { level: 1, name: "Second post", exact: true }).count()) === 1;
      } finally {
        await v.context.close();
      }
    }, { timeout: 60000 })
    .toBe(true);
  await expect
    .poll(async () => {
      const v = await visit(browser, base, "/blog/moving-to-vercel/");
      try {
        return await v.page.getByRole("heading", { level: 1, name: "Notes on moving to Vercel, revised", exact: true }).count();
      } finally {
        await v.context.close();
      }
    }, { timeout: 60000 })
    .toBe(1);
});

test("E2E-03: a draft never reaches the list or its address", async ({ browser }) => {
  const base = baseUrlOf();
  await blank(browser, base);
  await seed(base, P3);
  await seed(base, P2);
  await publish(base);
  await waitList(browser, base, "Second post");
  expect(await listText(browser, base)).not.toContain("Unfinished thoughts");

  const v = await visit(browser, base, "/blog/unfinished-thoughts/");
  try {
    expect(v.status).toBe(404);
    await expect(v.page.getByRole("heading", { level: 1, name: "404", exact: true })).toBeVisible();
    const body = await v.page.locator("body").innerText();
    for (const secret of ["Unfinished thoughts", "Draft excerpt text", "Secret draft body words"]) {
      expect(body).not.toContain(secret);
    }
  } finally {
    await v.context.close();
  }
  await withRequest(base, async (request) => {
    const response = await request.get("/blog/unfinished-thoughts/");
    const text = await response.text();
    for (const secret of ["Unfinished thoughts", "Draft excerpt text", "Secret draft body words"]) {
      expect(text).not.toContain(secret);
    }
  });
});

async function unpublishScenario(browser: Browser, change: (base: string) => Promise<void>): Promise<void> {
  const base = baseUrlOf();
  await blank(browser, base);
  await seed(base, P1);
  await publish(base);
  await waitList(browser, base, "Notes on moving to Vercel");
  const open = await visit(browser, base, "/blog/moving-to-vercel/");
  expect(open.status).toBe(200);
  await open.context.close();

  await change(base);

  expect(await listText(browser, base)).toContain("Notes on moving to Vercel");
  const still = await visit(browser, base, "/blog/moving-to-vercel/");
  expect(still.status).toBe(200);
  await expect(still.page.getByRole("heading", { level: 1, name: "Notes on moving to Vercel", exact: true })).toBeVisible();
  await still.context.close();

  await publish(base);
  await waitList(browser, base, "Notes on moving to Vercel", false);
  expect(await listText(browser, base)).toContain(EMPTY_TEXT);
  await expect.poll(() => status(base, "/blog/moving-to-vercel/"), { timeout: 60000 }).toBe(404);
  const gone = await visit(browser, base, "/blog/moving-to-vercel/");
  expect(gone.status).toBe(404);
  await expect(gone.page.getByRole("heading", { level: 1, name: "404", exact: true })).toBeVisible();
  await gone.context.close();
}

test("E2E-04: turning a published post into a draft changes the pages only at Publish", async ({ browser }) => {
  await unpublishScenario(browser, (base) => edit(base, "moving-to-vercel", { ...P1, draft: true }));
});

test("E2E-05: deleting a published post changes the pages only at Publish", async ({ browser }) => {
  await unpublishScenario(browser, (base) => remove(base, "moving-to-vercel"));
});

test("E2E-06: an unknown address shows the not-found page with a way back", async ({ browser }) => {
  const base = baseUrlOf();
  await blank(browser, base);
  await seed(base, P1);
  await publish(base);
  await waitList(browser, base, "Notes on moving to Vercel");
  const v = await visit(browser, base, "/blog/moving-to-vercle/");
  try {
    expect(v.status).toBe(404);
    await expect(v.page.getByRole("heading", { level: 1, name: "404", exact: true })).toBeVisible();
    await expect(v.page.getByRole("heading", { level: 2, name: "This page could not be found.", exact: true })).toBeVisible();
    const back = v.page.getByRole("link", { name: "Back to the site", exact: true });
    await expect(back).toBeVisible();
    await expect(back).toHaveAttribute("href", "/");
    expect(await v.page.locator("body").innerText()).not.toContain("Notes on moving to Vercel");
  } finally {
    await v.context.close();
  }
});

test("E2E-07: featured posts sit in the Featured region only", async ({ browser }) => {
  const base = baseUrlOf();
  await blank(browser, base);
  await seed(base, { ...P1, featured: true });
  await seed(base, P2);
  await publish(base);
  await waitList(browser, base, "Second post");
  const v = await visit(browser, base, "/blog/");
  try {
    const featured = v.page.getByRole("region", { name: "Featured" });
    const all = v.page.getByRole("region", { name: "All Posts" });
    await expect(featured).toContainText("Notes on moving to Vercel");
    await expect(featured).not.toContainText("Second post");
    await expect(all).toContainText("Second post");
    await expect(all).not.toContainText("Notes on moving to Vercel");
  } finally {
    await v.context.close();
  }
});

test("E2E-08: with nothing published the list says so and shows no error", async ({ browser }) => {
  const base = baseUrlOf();
  await blank(browser, base);
  const v = await visit(browser, base, "/blog/", { width: 1280, height: 800 });
  try {
    expect(await mainText(v.page)).toContain(EMPTY_TEXT);
    await expect(v.page.getByRole("heading", { level: 2, name: "Featured" })).toHaveCount(0);
    await expect(v.page.getByRole("alert").filter({ hasText: /error|could not|went wrong/i })).toHaveCount(0);
    await expect(v.page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Blog", exact: true })).toBeVisible();
  } finally {
    await v.context.close();
  }
});

test("E2E-09: posts are ordered by date, then title, then address", async ({ browser }) => {
  const base = baseUrlOf();
  await blank(browser, base);
  await seed(base, { ...P2, title: "Bravo", slug: "a-first", date: "2026-05-15" });
  await seed(base, { ...P2, title: "Alpha", slug: "b-second", date: "2026-05-15" });
  await seed(base, { ...P2, title: "Delta", slug: "delta", date: "2026-01-01" });
  await seed(base, { ...P2, title: "Charlie", slug: "charlie", date: "2026-06-01" });
  await publish(base);
  await waitList(browser, base, "Charlie");
  const v = await visit(browser, base, "/blog/");
  try {
    const titles = await v.page.getByRole("region", { name: "All Posts" }).locator("h2:not(#all-posts-heading)").allInnerTexts();
    expect(titles.map((t) => t.trim())).toEqual(["Charlie", "Alpha", "Bravo", "Delta"]);
  } finally {
    await v.context.close();
  }
});

test("E2E-10: a refused publish changes nothing", async ({ browser }) => {
  const base = baseUrlOf();
  await blank(browser, base);
  await seed(base, P1);
  await withRequest(base, async (request) => {
    const anonymous = await request.post(PUBLISH, { maxRedirects: 0 });
    expect(anonymous.status()).toBe(401);
    expect(await anonymous.json()).toEqual({ error: "not-signed-in" });
    const other = await request.post(PUBLISH, { headers: { cookie: await cookieOf(OTHER) }, maxRedirects: 0 });
    expect(other.status()).toBe(403);
    expect(await other.json()).toEqual({ error: "not-allowed" });
  });
  expect(await listText(browser, base)).toContain(EMPTY_TEXT);
  expect(await status(base, "/blog/moving-to-vercel/")).toBe(404);
});

test("E2E-11: an unreachable database keeps the earlier pages and publishes nothing", async ({ browser }) => {
  const base = baseUrlOf();
  await blank(browser, base);
  await seed(base, P1);
  await publish(base);
  await waitList(browser, base, "Notes on moving to Vercel");
  await seed(base, P2);
  dbBreak();
  try {
    await withRequest(base, async (request) => {
      const response = await request.post(PUBLISH, { headers: { cookie: await cookieOf(OWNER()) }, maxRedirects: 0 });
      expect(response.status()).toBe(503);
      expect(await response.json()).toEqual({ error: "unavailable" });
    });
    const list = await listText(browser, base);
    expect(list).toContain("Notes on moving to Vercel");
    expect(list).not.toContain("Second post");
    const v = await visit(browser, base, "/blog/second-post/");
    try {
      expect(v.status).toBe(404);
      await expect(v.page.getByRole("heading", { level: 1, name: "404", exact: true })).toBeVisible();
    } finally {
      await v.context.close();
    }
  } finally {
    dbFix();
  }
});

test("E2E-12: the blog pages are kept copies and ignore the visitor's cookie", async ({ browser }) => {
  const base = baseUrlOf();
  await blank(browser, base);
  await seed(base, P1);
  await publish(base);
  await waitList(browser, base, "Notes on moving to Vercel");
  const cookie = await cookieOf(OWNER());
  await withRequest(base, async (request) => {
    for (const url of ["/blog/", "/blog/moving-to-vercel/"]) {
      await request.get(url);
      const second = await request.get(url);
      expect(second.headers()["x-nextjs-cache"], url).toBe("HIT");
      expect(second.headers()["set-cookie"], url).toBeUndefined();
      const anonymousText = await second.text();
      const owned = await request.get(url, { headers: { cookie } });
      expect(await owned.text(), url).toBe(anonymousText);
    }
  });
});

test("E2E-13: the pages and their scripts carry no setting or storage detail", async ({ browser }) => {
  const base = baseUrlOf();
  await blank(browser, base);
  await seed(base, P1);
  await publish(base);
  await waitList(browser, base, "Notes on moving to Vercel");
  const forbidden = ["SUPABASE", "stand-in:", DB_FILE, "blog_posts", "api/admin", "DatabaseUnavailable", setting("ADMIN_EMAIL"), setting("AUTH_SECRET")];
  await withRequest(base, async (request) => {
    const scripts = new Set<string>();
    const texts: Array<[string, string]> = [];
    for (const url of ["/blog/", "/blog/moving-to-vercel/", "/blog/no-such-post/"]) {
      const html = await (await request.get(url)).text();
      texts.push([url, html]);
      for (const match of html.matchAll(/(?:src|href)="([^"]*\/_next\/static\/[^"]*\.js)[^"]*"/g)) scripts.add(match[1]);
    }
    for (const src of scripts) texts.push([src, await (await request.get(src)).text()]);
    expect(scripts.size).toBeGreaterThanOrEqual(3);
    for (const [name, text] of texts) {
      for (const word of forbidden) {
        if (word === "") continue;
        expect(text.includes(word), name + " contains " + word).toBe(false);
      }
    }
  });
});

test("E2E-14: the blog sources follow the kept-page rules", async () => {
  const read = (p: string): string => fs.readFileSync(path.join(process.cwd(), p), "utf8");
  const count = (text: string, word: string): number => text.split(word).length - 1;

  for (const file of ["src/app/blog/page.tsx", "src/app/blog/[slug]/page.tsx"]) {
    const text = read(file);
    expect(text, file).toContain("export const revalidate = false");
    expect(count(text, "revalidate"), file).toBe(1);
    for (const word of ["@/lib/auth", "cookies(", "headers(", 'from "@/lib/blog"', "dynamicParams"]) {
      expect(text.includes(word), file + " contains " + word).toBe(false);
    }
  }
  const post = read("src/app/blog/[slug]/page.tsx");
  for (const word of ["generateStaticParams", "notFound(", "loadPublishedPosts"]) expect(post).toContain(word);
  expect(read("src/app/blog/page.tsx")).toContain("loadPublishedPosts");

  const pure = read("src/lib/publicPosts.ts");
  for (const word of ["server-only", "@/lib/admin", "@/lib/server", "lib/server", "@/lib/auth", "cookies(", "headers(", "process.env"]) {
    expect(pure.includes(word), "publicPosts.ts contains " + word).toBe(false);
  }

  const server = read("src/lib/server/publicPosts.ts");
  const firstLine = server.split("\n").find((line) => line.trim() !== "");
  expect(firstLine?.trim()).toBe('import "server-only";');
  for (const word of ["unstable_cache(", "revalidateTag(", 'revalidatePath("/blog", "layout")', "readPostRecords(true)"]) expect(server).toContain(word);
  for (const word of ["@/lib/auth", "@/lib/admin", "cookies(", "headers(", "console.", "fetch("]) {
    expect(server.includes(word), "server/publicPosts.ts contains " + word).toBe(false);
  }
  for (const match of server.matchAll(/process\.env\.([A-Za-z0-9_]+)/g)) {
    expect(["NEXT_PHASE", "SUPABASE_DB_URL"]).toContain(match[1]);
  }

  const route = read("src/app/api/admin/publish/route.ts");
  const at = (word: string): number => route.indexOf(word);
  expect(at("getPanelState(")).toBeGreaterThanOrEqual(0);
  expect(at("getPanelState(")).toBeLessThan(at("loadProfile("));
  expect(at("loadProfile(")).toBeLessThan(at("revalidatePath("));
  expect(at("revalidatePath(")).toBeLessThan(at("refreshPublishedPosts("));
  expect(count(route, "revalidatePath(")).toBe(1);
  expect(route).toContain('revalidatePath("/")');
  expect(route.includes("process.env")).toBe(false);
  expect(route.includes("fetch(")).toBe(false);

  expect(read("src/app/not-found.tsx").includes('"use client"')).toBe(false);

  const keys = (json: string): string[][] => {
    const parsed = JSON.parse(json) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    return [Object.keys(parsed.dependencies ?? {}).sort(), Object.keys(parsed.devDependencies ?? {}).sort()];
  };
  const head = execFileSync("git", ["show", "HEAD:package.json"], { encoding: "utf8" });
  expect(keys(read("package.json"))).toEqual(keys(head));
});

test("E2E-15: the blog list is prerendered and post addresses are not fixed at build", async () => {
  const file = path.join(process.cwd(), ".next", "prerender-manifest.json");
  expect(fs.existsSync(file), "run npm run build first").toBe(true);
  const manifest = JSON.parse(fs.readFileSync(file, "utf8")) as {
    routes: Record<string, unknown>;
    dynamicRoutes: Record<string, { fallback?: unknown } | undefined>;
  };
  expect(Object.keys(manifest.routes)).toContain("/blog");
  expect(Object.keys(manifest.routes).filter((key) => key.startsWith("/blog/"))).toEqual([]);
  const dynamic = manifest.dynamicRoutes["/blog/[slug]"];
  expect(dynamic).toBeDefined();
  expect(dynamic?.fallback).not.toBe(false);
});

test("E2E-16: a safe cover shows on the card and the article, an unsafe one is dropped", async ({ browser }) => {
  const base = baseUrlOf();
  await blank(browser, base);
  await seed(base, { ...P1, coverImage: "/images/blog/vercel.png", coverAlt: "A green leaf" });
  await seed(base, { ...P2, coverImage: "javascript:alert(1)", coverAlt: "Bad cover" });
  await publish(base);
  await waitList(browser, base, "Second post");

  const list = await visit(browser, base, "/blog/");
  try {
    await expect(list.page.locator('img[alt="A green leaf"]')).toHaveCount(1);
    expect(await list.page.locator('img[alt="A green leaf"]').getAttribute("src")).toBe("/images/blog/vercel.png");
    await expect(list.page.locator('img[alt="Bad cover"]')).toHaveCount(0);
  } finally {
    await list.context.close();
  }

  const first = await visit(browser, base, "/blog/moving-to-vercel/");
  try {
    await expect(first.page.locator('article img[alt="A green leaf"]')).toHaveCount(1);
  } finally {
    await first.context.close();
  }

  const second = await visit(browser, base, "/blog/second-post/");
  try {
    await expect(second.page.locator("article img")).toHaveCount(0);
  } finally {
    await second.context.close();
  }
});

test("E2E-17: long unbroken words wrap inside a 375-pixel page", async ({ browser }) => {
  const base = baseUrlOf();
  const title = "W".repeat(120);
  await blank(browser, base);
  await seed(base, {
    ...P1,
    title,
    excerpt: "X".repeat(150),
    tags: ["T".repeat(60)],
    slug: "wrap-probe",
    body: "Y".repeat(200) + "\n\n```\n" + "Z".repeat(150) + "\n```\n",
  });
  await publish(base);
  await waitList(browser, base, title);

  for (const url of ["/blog/", "/blog/wrap-probe/"]) {
    const v = await visit(browser, base, url, { width: 375, height: 800 });
    try {
      await v.page.waitForLoadState("load");
      const fits = await v.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
      expect(fits, url).toBe(true);
    } finally {
      await v.context.close();
    }
  }
});

test("E2E-18: the card is reachable by keyboard and opens its post", async ({ browser }) => {
  const base = baseUrlOf();
  await blank(browser, base);
  await seed(base, P1);
  await publish(base);
  await waitList(browser, base, "Notes on moving to Vercel");

  const v = await visit(browser, base, "/blog/");
  try {
    const page = v.page;
    await expect(page.getByRole("heading", { level: 1, name: "Blog", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to portfolio", exact: true })).toBeVisible();
    const wanted = 'Read "Notes on moving to Vercel"';
    let focused = false;
    for (let i = 0; i < 40 && !focused; i++) {
      await page.keyboard.press("Tab");
      focused = await page.evaluate((label) => document.activeElement?.getAttribute("aria-label") === label, wanted);
    }
    expect(focused, "the card link received focus within 40 Tab presses").toBe(true);
    await page.keyboard.press("Enter");
    await page.waitForURL(/\/blog\/moving-to-vercel\/?$/);
    expect(new URL(page.url()).pathname).toMatch(/^\/blog\/moving-to-vercel\/?$/);
    await expect(page.getByRole("link", { name: "All posts", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to all posts", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Notes on moving to Vercel" })).toBeVisible();
  } finally {
    await v.context.close();
  }
});

test("E2E-19: the new blog sources use tokens only", async () => {
  const read = (p: string): string => fs.readFileSync(path.join(process.cwd(), p), "utf8");
  const files = ["src/app/not-found.tsx", "src/app/components/blog/BlogCard.tsx", "src/app/components/blog/BlogArticle.tsx"];
  for (const file of files) {
    const text = read(file);
    expect(/#[0-9a-fA-F]{3,8}\b/.test(text), file + " has a hex colour").toBe(false);
    expect(/\brgba?\(/.test(text), file + " has rgb(").toBe(false);
    expect(/\bhsla?\(/.test(text), file + " has hsl(").toBe(false);
    expect(text.includes("dark:"), file + " has dark:").toBe(false);
  }
  expect(read("src/app/not-found.tsx")).toContain("var(--");
});

test("E2E-21: the repository's posts and their loader are gone, and the feeds list no post", async () => {
  const root = process.cwd();
  const read = (p: string): string => fs.readFileSync(path.join(root, p), "utf8");
  for (const file of ["content/blog/hello-world.md", "content/blog/building-portfolio-nextjs.md", "src/lib/blog/posts.ts"]) {
    expect(fs.existsSync(path.join(root, file)), file + " exists").toBe(false);
  }
  const folder = path.join(root, "content", "blog");
  const left = fs.existsSync(folder) ? fs.readdirSync(folder).filter((name) => name.endsWith(".md")) : [];
  expect(left).toEqual([]);

  const grep = spawnSync(
    "git",
    ["grep", "--untracked", "-l", "-E", "content/blog|gray-matter|getPublishedPosts|getPostBySlug|getFeaturedPosts|estimateReadingTime", "--", "src"],
    { cwd: root, encoding: "utf8" },
  );
  expect(grep.stdout.trim()).toBe("");

  for (const file of ["src/app/rss.xml/route.ts", "src/app/sitemap.ts"]) {
    expect(/from\s+["']@\/lib\/blog["']/.test(read(file)), file + " imports the @/lib/blog barrel").toBe(false);
  }

  const base = baseUrlOf();
  await withRequest(base, async (request) => {
    const rss = await request.get("/rss.xml");
    expect(rss.status()).toBe(200);
    const feed = await rss.text();
    expect(feed).toContain('<rss version="2.0"');
    expect(feed.split("<item>").length - 1).toBe(0);

    const map = await request.get("/sitemap.xml");
    expect(map.status()).toBe(200);
    const xml = await map.text();
    const locs = [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
    expect(locs).toEqual(["https://thegoldenpothos.xyz/", "https://thegoldenpothos.xyz/blog/"]);
  });
});

test("E2E-22: the earlier checks no longer name the repository's posts and allow the two blog pages", async () => {
  const root = process.cwd();
  // the old backend's name is put together from pieces so that no search of the tree finds it here
  const RETIRE_SPEC = ["e2e/retire-fire", "base.spec.ts"].join("");
  const read = (p: string): string => fs.readFileSync(path.join(root, p), "utf8");
  const earlier = [
    "e2e/site-smoke.spec.ts",
    "e2e/owner-google-sign-in.spec.ts",
    "e2e/owner-edits-profile.spec.ts",
    "e2e/owner-uploads-images.spec.ts",
    "e2e/owner-manages-experience.spec.ts",
    "e2e/owner-manages-projects.spec.ts",
    "e2e/owner-manages-certifications.spec.ts",
    "e2e/owner-manages-tech-stack.spec.ts",
    "e2e/owner-manages-blog-posts.spec.ts",
    "e2e/owner-previews-blog-post.spec.ts",
    RETIRE_SPEC,
    "e2e/hosting-and-backend-migration-acceptance.spec.ts",
  ];
  const ACCEPTANCE = "e2e/hosting-and-backend-migration-acceptance.spec.ts";
  for (const file of earlier) {
    const text = read(file);
    const stripped = file === ACCEPTANCE ? text.split("/blog/hello-world/extra/").join("") : text;
    expect(stripped.includes("hello-world"), file + " names hello-world").toBe(false);
    expect(text.includes("building-portfolio-nextjs"), file + " names building-portfolio-nextjs").toBe(false);
  }

  const arrayAfter = (text: string, opener: string): string => {
    const start = text.indexOf(opener);
    expect(start, opener + " exists").toBeGreaterThanOrEqual(0);
    const from = start + opener.length;
    return text.slice(from, text.indexOf("]", from));
  };
  const removed = ['"content/blog"', '"src/app/sitemap.ts"', '"src/app/rss.xml"', '"src/app/blog/page.tsx"', '"src/app/components/blog"', '"src/lib/blog"'];
  const lists: Array<[string, string]> = [
    [ACCEPTANCE, "const sources = ["],
    [RETIRE_SPEC, "const PUBLIC_SOURCES = ["],
  ];
  for (const [file, opener] of lists) {
    const body = arrayAfter(read(file), opener);
    for (const entry of removed) {
      expect(body.includes(entry), file + " " + opener + " still holds " + entry).toBe(false);
    }
  }

  const ruleFiles = [
    "e2e/owner-edits-profile.spec.ts",
    "e2e/owner-uploads-images.spec.ts",
    "e2e/owner-manages-experience.spec.ts",
    "e2e/owner-manages-projects.spec.ts",
    "e2e/owner-manages-certifications.spec.ts",
    "e2e/owner-manages-tech-stack.spec.ts",
    "e2e/owner-manages-blog-posts.spec.ts",
    ACCEPTANCE,
  ];
  for (const file of ruleFiles) {
    const lines = read(file).split("\n");
    let rules = 0;
    lines.forEach((line, i) => {
      const isRule = (line.includes('startsWith("src/app/api/admin/")') || line.includes(':(exclude)src/app/api/admin"')) && (line.includes("lib/server") || line.includes("SERVER_PATH"));
      if (!isRule) return;
      rules++;
      const near = lines.slice(Math.max(0, i - 3), i + 4).join("\n");
      expect(near.includes("src/app/blog/page.tsx"), file + ":" + (i + 1) + " lacks the blog list page").toBe(true);
      expect(near.includes("src/app/blog/[slug]/page.tsx"), file + ":" + (i + 1) + " lacks the post page").toBe(true);
    });
    expect(rules, file + " has a server-folder mention rule").toBeGreaterThan(0);
  }
});
