import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
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
const RSS = "/rss.xml";
const SITEMAP = "/sitemap.xml";
const ORIGIN = "https://thegoldenpothos.xyz";
const SESSION_COOKIE = "authjs.session-token";
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

const mk = (slug: string, title: string, excerpt: string, date: string, draft: boolean): Post => ({
  title,
  excerpt,
  date,
  slug,
  tags: [],
  draft,
  featured: false,
  coverImage: "",
  coverAlt: "",
  body: "Body words.\n",
});

const A = mk("feeds-growing-pothos", "Growing Pothos", "How to keep a pothos happy indoors", "2026-05-15", false);
const B = mk("feeds-repotting-guide", "Repotting Guide", "When and how to repot", "2026-06-01", false);
const D = mk("feeds-half-written", "Half Written", "Not ready yet", "2026-04-01", true);
const O = mk("feeds-older-post", "Older Post", "The older one", "2026-03-01", false);
const X = mk("feeds-cdata-post", "Tags ]]> and more", "Excerpt ]]> end", "2026-02-10", false);

const linkOf = (slug: string): string => `<link>${ORIGIN}/blog/${slug}/</link>`;
const locOf = (slug: string): string => `<loc>${ORIGIN}/blog/${slug}/</loc>`;

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

type Fetched = { status: number; headers: Record<string, string>; text: string };

async function fetchFile(base: string, url: string, cookie?: string): Promise<Fetched> {
  return withRequest(base, async (request) => {
    const response = await request.get(url, { maxRedirects: 0, ...(cookie ? { headers: { cookie } } : {}) });
    const status = response.status();
    const headers = response.headers();
    const text = await response.text();
    return { status, headers, text };
  });
}

const textOf = async (base: string, url: string): Promise<string> => (await fetchFile(base, url)).text;

async function waitFor(base: string, url: string, check: (text: string) => boolean, expected = true): Promise<void> {
  await expect.poll(async () => check(await textOf(base, url)), { timeout: 60000 }).toBe(expected);
}

async function waitHas(base: string, url: string, needle: string, present = true): Promise<void> {
  await waitFor(base, url, (text) => text.includes(needle), present);
}

const countOf = (text: string, needle: string): number => text.split(needle).length - 1;
const locsOf = (text: string): string[] => [...text.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);

function itemOf(text: string, slug: string): string {
  const blocks = text.split("<item>").slice(1).map((b) => b.split("</item>")[0]);
  return blocks.find((b) => b.includes(linkOf(slug))) ?? "";
}

function urlBlockOf(text: string, slug: string): string {
  const blocks = text.split("<url>").slice(1).map((b) => b.split("</url>")[0]);
  return blocks.find((b) => b.includes(locOf(slug))) ?? "";
}

async function blankPublished(base: string): Promise<void> {
  dbReset();
  await publish(base);
  await expect
    .poll(
      async () => {
        const rss = await textOf(base, RSS);
        const sitemap = await textOf(base, SITEMAP);
        return !rss.includes("<item>") && locsOf(sitemap).length === 2;
      },
      { timeout: 60000, intervals: [250] },
    )
    .toBe(true);
}

async function openPanel(browser: Browser, base: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ baseURL: base });
  const [name, ...rest] = (await cookieOf(OWNER())).split("=");
  await context.addCookies([{ name, value: rest.join("="), url: base }]);
  const page = await context.newPage();
  await page.goto(PANEL);
  return { context, page };
}

type ParsedRss = { error: boolean; channelTitle: string; itemCount: number; items: { link: string; title: string; description: string; children: string[] }[] };

async function parseRss(browser: Browser, text: string): Promise<ParsedRss> {
  const page = await browser.newPage();
  try {
    return await page.evaluate((xml: string) => {
      const doc = new DOMParser().parseFromString(xml, "application/xml");
      const error = doc.getElementsByTagName("parsererror").length > 0;
      const channelTitle = doc.querySelector("rss > channel > title")?.textContent ?? "";
      const nodes = Array.from(doc.getElementsByTagName("item"));
      const items = nodes.map((item) => ({
        link: item.querySelector("link")?.textContent ?? "",
        title: item.querySelector("title")?.textContent ?? "",
        description: item.querySelector("description")?.textContent ?? "",
        children: Array.from(item.children).map((c) => c.tagName),
      }));
      return { error, channelTitle, itemCount: nodes.length, items };
    }, text);
  } finally {
    await page.close();
  }
}

async function scenario(run: (base: string) => Promise<void>): Promise<void> {
  const base = baseUrlOf();
  await blankPublished(base);
  try {
    await run(base);
  } finally {
    await blankPublished(base);
  }
}

test.afterAll(async () => {
  await blankPublished(baseUrlOf());
});

test("E2E-01: Publish puts a saved post into the RSS feed", async ({ browser }) => {
  await scenario(async (base) => {
    await seed(base, A);
    const panel = await openPanel(browser, base);
    try {
      const button = panel.page.getByRole("button", { name: "Publish", exact: true });
      await expect(button).toBeVisible();
      await button.click();
      await expect(panel.page.getByText("Published. Visitors will see the changes within a minute.")).toBeVisible();
    } finally {
      await panel.context.close();
    }
    await waitHas(base, RSS, linkOf(A.slug));
    const item = itemOf(await textOf(base, RSS), A.slug);
    expect(item).toContain("<title><![CDATA[Growing Pothos]]></title>");
    expect(item).toContain("<description><![CDATA[How to keep a pothos happy indoors]]></description>");
    expect(item).toContain(`<guid isPermaLink="true">${ORIGIN}/blog/${A.slug}/</guid>`);
  });
});

test("E2E-02: Publish puts a saved post into the sitemap with its date", async () => {
  await scenario(async (base) => {
    await seed(base, A);
    await publish(base);
    await waitHas(base, SITEMAP, locOf(A.slug));
    const text = await textOf(base, SITEMAP);
    expect(urlBlockOf(text, A.slug)).toContain("<lastmod>2026-05-15</lastmod>");
    expect(text).toContain(`<loc>${ORIGIN}/</loc>`);
    expect(text).toContain(`<loc>${ORIGIN}/blog/</loc>`);
  });
});

test("E2E-03: a draft never reaches either feed", async () => {
  await scenario(async (base) => {
    await seed(base, D);
    await seed(base, A);
    await publish(base);
    await waitHas(base, RSS, "Growing Pothos");
    const rss = await textOf(base, RSS);
    const sitemap = await textOf(base, SITEMAP);
    for (const secret of ["Half Written", "Not ready yet", "feeds-half-written"]) {
      expect(rss).not.toContain(secret);
      expect(sitemap).not.toContain(secret);
    }
    expect(rss).toContain("Growing Pothos");
    expect(sitemap).toContain("feeds-growing-pothos");
  });
});

test("E2E-04: a saved or edited post stays out of the feeds until Publish", async () => {
  await scenario(async (base) => {
    await seed(base, A);
    await publish(base);
    await waitHas(base, RSS, "Growing Pothos");
    await seed(base, B);
    await edit(base, A.slug, { ...A, title: "Growing Pothos Revised" });

    const rssBefore = await textOf(base, RSS);
    const sitemapBefore = await textOf(base, SITEMAP);
    expect(rssBefore).toContain("<![CDATA[Growing Pothos]]>");
    expect(rssBefore).not.toContain("Repotting Guide");
    expect(rssBefore).not.toContain("Growing Pothos Revised");
    expect(sitemapBefore).toContain("feeds-growing-pothos");
    expect(sitemapBefore).not.toContain("feeds-repotting-guide");

    await publish(base);
    await waitHas(base, RSS, "Repotting Guide");
    await waitHas(base, SITEMAP, "feeds-repotting-guide");
    const rssAfter = await textOf(base, RSS);
    const sitemapAfter = await textOf(base, SITEMAP);
    expect(rssAfter).toContain("Growing Pothos Revised");
    expect(rssAfter).toContain("Repotting Guide");
    expect(sitemapAfter).toContain("feeds-repotting-guide");
  });
});

test("E2E-05: a post saved back as a draft leaves both feeds after Publish", async () => {
  await scenario(async (base) => {
    await seed(base, A);
    await publish(base);
    await waitHas(base, RSS, "Growing Pothos");
    await waitHas(base, SITEMAP, "feeds-growing-pothos");
    await edit(base, A.slug, { ...A, draft: true });
    await publish(base);
    await waitHas(base, RSS, "Growing Pothos", false);
    await waitHas(base, SITEMAP, "feeds-growing-pothos", false);
    expect(await textOf(base, RSS)).not.toContain("Growing Pothos");
    expect(await textOf(base, SITEMAP)).not.toContain("feeds-growing-pothos");
  });
});

test("E2E-06: a deleted post leaves both feeds after Publish", async () => {
  await scenario(async (base) => {
    await seed(base, A);
    await publish(base);
    await waitHas(base, RSS, "Growing Pothos");
    await waitHas(base, SITEMAP, "feeds-growing-pothos");
    await remove(base, A.slug);
    await publish(base);
    await waitHas(base, RSS, "Growing Pothos", false);
    await waitHas(base, SITEMAP, "feeds-growing-pothos", false);
    expect(await textOf(base, RSS)).not.toContain("Growing Pothos");
    expect(await textOf(base, SITEMAP)).not.toContain("feeds-growing-pothos");
  });
});

test("E2E-07: posts are listed newest first with their dates", async () => {
  await scenario(async (base) => {
    await seed(base, O);
    await seed(base, A);
    await publish(base);
    await waitFor(base, RSS, (t) => t.includes("feeds-older-post") && t.includes("feeds-growing-pothos"));
    await waitFor(base, SITEMAP, (t) => t.includes("feeds-older-post") && t.includes("feeds-growing-pothos"));
    const rss = await textOf(base, RSS);
    expect(rss.indexOf("feeds-growing-pothos")).toBeLessThan(rss.indexOf("feeds-older-post"));
    expect(itemOf(rss, A.slug)).toContain("<pubDate>Fri, 15 May 2026 00:00:00 GMT</pubDate>");
    expect(itemOf(rss, O.slug)).toContain("<pubDate>Sun, 01 Mar 2026 00:00:00 GMT</pubDate>");
    const sitemap = await textOf(base, SITEMAP);
    expect(sitemap.indexOf(locOf(A.slug))).toBeGreaterThan(-1);
    expect(sitemap.indexOf(locOf(A.slug))).toBeLessThan(sitemap.indexOf(locOf(O.slug)));
    expect(urlBlockOf(sitemap, A.slug)).toContain("<lastmod>2026-05-15</lastmod>");
    expect(urlBlockOf(sitemap, O.slug)).toContain("<lastmod>2026-03-01</lastmod>");
  });
});

test("E2E-08: with no published post the feed is valid and empty", async ({ browser }) => {
  const base = baseUrlOf();
  await blankPublished(base);
  const rss = await textOf(base, RSS);
  const sitemap = await textOf(base, SITEMAP);
  const parsed = await parseRss(browser, rss);
  expect(parsed.error).toBe(false);
  expect(parsed.channelTitle).toBe("thegoldenpothos — Blog");
  expect(parsed.itemCount).toBe(0);
  expect(locsOf(sitemap)).toEqual([`${ORIGIN}/`, `${ORIGIN}/blog/`]);
});

test("E2E-09: a failed Publish leaves both feeds as they were", async () => {
  await scenario(async (base) => {
    await seed(base, A);
    await publish(base);
    await waitHas(base, RSS, "Growing Pothos");
    await waitHas(base, SITEMAP, "feeds-growing-pothos");
    await seed(base, B);
    let status = 0;
    let body: unknown = null;
    dbBreak();
    try {
      await withRequest(base, async (request) => {
        const response = await request.post(PUBLISH, { headers: { cookie: await cookieOf(OWNER()) }, maxRedirects: 0 });
        status = response.status();
        body = await response.json();
      });
    } finally {
      dbFix();
    }
    expect(status).toBe(503);
    expect(body).toEqual({ error: "unavailable" });
    const rss = await textOf(base, RSS);
    const sitemap = await textOf(base, SITEMAP);
    expect(rss).toContain("Growing Pothos");
    expect(rss).not.toContain("Repotting Guide");
    expect(sitemap).toContain("feeds-growing-pothos");
    expect(sitemap).not.toContain("feeds-repotting-guide");
  });
});

test("E2E-10: the feeds are public and carry nothing private", async () => {
  await scenario(async (base) => {
    await seed(base, A);
    await publish(base);
    await waitHas(base, RSS, "Growing Pothos");
    await waitHas(base, SITEMAP, "feeds-growing-pothos");
    const mallory = await cookieOf(OTHER);
    const secrets = [setting("ADMIN_EMAIL"), "bright-warm-greenhouse", setting("AUTH_SECRET")];
    for (const file of [RSS, SITEMAP]) {
      const anonymous = await fetchFile(base, file);
      const other = await fetchFile(base, file, mallory);
      for (const r of [anonymous, other]) {
        expect(r.status).toBe(200);
        expect(r.headers["set-cookie"]).toBeUndefined();
        for (const secret of secrets) {
          expect(secret).not.toBe("");
          expect(r.text).not.toContain(secret);
        }
      }
      expect(other.text).toBe(anonymous.text);
    }
  });
});

test("E2E-11: two Publish requests at once list the post once", async () => {
  await scenario(async (base) => {
    await seed(base, A);
    const statuses = await Promise.all(
      [0, 1].map(() =>
        withRequest(base, async (request) => {
          const response = await request.post(PUBLISH, { headers: { cookie: await cookieOf(OWNER()) }, maxRedirects: 0 });
          return response.status();
        }),
      ),
    );
    expect(statuses).toEqual([200, 200]);
    await waitHas(base, RSS, linkOf(A.slug));
    await waitHas(base, SITEMAP, locOf(A.slug));
    expect(countOf(await textOf(base, RSS), linkOf(A.slug))).toBe(1);
    expect(countOf(await textOf(base, SITEMAP), locOf(A.slug))).toBe(1);
  });
});

test("E2E-12: the feed keeps its channel details, type and item shape", async ({ browser }) => {
  await scenario(async (base) => {
    await seed(base, A);
    await publish(base);
    await waitHas(base, RSS, "Growing Pothos");
    const r = await fetchFile(base, RSS);
    expect(r.headers["content-type"]).toBe("application/rss+xml; charset=utf-8");
    expect(r.text).toContain("<title>thegoldenpothos — Blog</title>");
    expect(r.text).toContain("<description>Keith Lim's blog on software, plants, coffee, and photography.</description>");
    expect(r.text).toContain(`<link>${ORIGIN}/blog/</link>`);
    expect(r.text).toContain("<language>en-sg</language>");
    expect(r.text).toContain(`<atom:link href="${ORIGIN}/rss.xml" rel="self" type="application/rss+xml"/>`);
    const parsed = await parseRss(browser, r.text);
    expect(parsed.error).toBe(false);
    const item = parsed.items.find((i) => i.link.endsWith(`${A.slug}/`));
    expect(item).toBeDefined();
    expect(item?.children).toEqual(["title", "description", "link", "guid", "pubDate"]);
  });
});

test("E2E-13: a closing CDATA marker in a title or excerpt keeps the feed valid", async ({ browser }) => {
  await scenario(async (base) => {
    await seed(base, X);
    await publish(base);
    await waitHas(base, RSS, "feeds-cdata-post");
    const parsed = await parseRss(browser, await textOf(base, RSS));
    expect(parsed.error).toBe(false);
    const item = parsed.items.find((i) => i.link.endsWith("feeds-cdata-post/"));
    expect(item).toBeDefined();
    expect(item?.title).toBe("Tags ]]> and more");
    expect(item?.description).toBe("Excerpt ]]> end");
  });
});

test("E2E-14: the feed files stay kept pages that read only the published snapshot", async () => {
  const read = (file: string): string => fs.readFileSync(path.join(process.cwd(), file), "utf8");
  const route = read("src/app/rss.xml/route.ts");
  const sitemap = read("src/app/sitemap.ts");
  const publicPosts = read("src/lib/server/publicPosts.ts");
  const publishRoute = read("src/app/api/admin/publish/route.ts");

  const required = ['export const dynamic = "force-static"', "loadPublishedPosts", "@/lib/server/publicPosts"];
  const forbidden = [
    "@/lib/auth",
    "cookies(",
    "headers(",
    "process.env",
    "console.",
    "fetch(",
    "readPostRecords",
    "postStore",
    "export const revalidate",
    "toLocale",
    "getFullYear(",
    "getMonth(",
    "getDate(",
    "getHours(",
    "try {",
  ];
  for (const text of [route, sitemap]) {
    for (const needle of required) expect(text).toContain(needle);
    for (const needle of forbidden) expect(text).not.toContain(needle);
    expect(text).not.toMatch(/from\s+["']@\/lib\/blog["']/);
  }
  expect(route).toContain("generateRssFeed");
  expect(sitemap).toContain("absoluteUrl(");

  expect(publicPosts).toContain("revalidateTag(");
  const blogCall = publicPosts.indexOf('revalidatePath("/blog", "layout")');
  const rssCall = publicPosts.indexOf('revalidatePath("/rss.xml", "layout")');
  const mapCall = publicPosts.indexOf('revalidatePath("/sitemap.xml", "layout")');
  expect(blogCall).toBeGreaterThan(-1);
  expect(rssCall).toBeGreaterThan(-1);
  expect(mapCall).toBeGreaterThan(-1);
  expect(publicPosts.indexOf("revalidateTag(")).toBeLessThan(blogCall);
  expect(blogCall).toBeLessThan(rssCall);
  expect(rssCall).toBeLessThan(mapCall);

  expect(publishRoute).toContain("refreshPublishedPosts();");
  expect(countOf(publishRoute, "revalidatePath(")).toBe(1);
  expect(publishRoute).not.toContain("/rss.xml");
  expect(publishRoute).not.toContain("/sitemap.xml");

  const keysOf = (json: string): { dependencies: string[]; devDependencies: string[] } => {
    const pkg = JSON.parse(json) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    return { dependencies: Object.keys(pkg.dependencies ?? {}).sort(), devDependencies: Object.keys(pkg.devDependencies ?? {}).sort() };
  };
  const head = execFileSync("git", ["show", "HEAD:package.json"], { cwd: process.cwd(), encoding: "utf8" });
  expect(keysOf(read("package.json"))).toEqual(keysOf(head));
});

test("E2E-15: both feeds are kept copies with no timer", async () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(process.cwd(), ".next", "prerender-manifest.json"), "utf8")) as {
    routes: Record<string, { initialRevalidateSeconds: number | false }>;
    dynamicRoutes: Record<string, unknown>;
  };
  for (const key of [RSS, SITEMAP]) {
    expect(manifest.routes[key]).toBeDefined();
    expect(manifest.routes[key].initialRevalidateSeconds).toBe(false);
    expect(Object.keys(manifest.dynamicRoutes)).not.toContain(key);
  }
});
