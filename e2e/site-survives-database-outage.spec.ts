import fs from "node:fs";
import path from "node:path";
import { expect, request as playwrightRequest, test, type APIRequestContext, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { encode } from "next-auth/jwt";

test.describe.configure({ mode: "default" });
test.setTimeout(240000);

const STAND_IN_PREFIX = "stand-in:";
const DB_URL = process.env.SUPABASE_DB_URL ?? "";
const DB_FILE = DB_URL.startsWith(STAND_IN_PREFIX) ? DB_URL.slice(STAND_IN_PREFIX.length) : "";

const PUBLISH = "/api/admin/publish/";
const PANEL = "/bright-warm-greenhouse/";
const SESSION_COOKIE = "authjs.session-token";
const EMPTY_BLOG = "No posts yet — check back soon!";
const FAILED_PUBLISH = "The site could not be published because the database could not be reached. Try again later.";
const ERROR_WORDS = ["Internal Server Error", "Application error", "could not be loaded", "unreachable"];

type Claims = { sub: string; email: string; name: string; emailVerified: boolean };
const setting = (name: string): string => process.env[name] ?? "";
const OWNER = (): Claims => ({ sub: "owner-1", email: setting("ADMIN_EMAIL"), name: "Owner Test", emailVerified: true });

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

function dbDelete(): void {
  if (DB_FILE !== "" && fs.existsSync(DB_FILE)) fs.rmSync(DB_FILE, { force: true });
}

async function ownerPublish(base: string): Promise<void> {
  await withRequest(base, async (request) => {
    const response = await request.post(PUBLISH, { headers: { cookie: await cookieOf(OWNER()) }, maxRedirects: 0 });
    const status = response.status();
    const body = await response.text();
    expect(status, body).toBe(200);
    expect(JSON.parse(body)).toEqual({ published: true });
  });
}

async function getText(base: string, url: string): Promise<{ status: number; text: string; cache: string }> {
  return withRequest(base, async (request) => {
    const response = await request.get(url, { maxRedirects: 0 });
    const text = await response.text();
    return { status: response.status(), text, cache: response.headers()["x-nextjs-cache"] ?? "" };
  });
}

async function pollText(base: string, url: string, ok: (text: string) => boolean): Promise<void> {
  await expect.poll(async () => ok((await getText(base, url)).text), { timeout: 60000, message: "waiting on " + url }).toBe(true);
}

async function blank(base: string): Promise<void> {
  dbDelete();
  await ownerPublish(base);
  await pollText(base, "/", (text) => !text.includes('id="hero"'));
  await pollText(base, "/blog/", (text) => text.includes(EMPTY_BLOG));
  await pollText(base, "/rss.xml", (text) => !text.includes("<item>"));
  await pollText(base, "/sitemap.xml", (text) => !text.includes("/blog/hello-world/") && !text.includes("/blog/second-outage-post/"));
}

async function ownerSend(base: string, method: "post" | "put", url: string, body: unknown): Promise<unknown> {
  return withRequest(base, async (request) => {
    const response = await request[method](url, {
      headers: { cookie: await cookieOf(OWNER()), "content-type": "application/json" },
      data: JSON.stringify(body),
      maxRedirects: 0,
    });
    const status = response.status();
    const text = await response.text();
    expect(status, url + " " + text).toBe(200);
    try {
      return JSON.parse(text);
    } catch {
      return undefined;
    }
  });
}

const PROJECT = (title: string) => ({
  content: {
    title,
    shortDesc: "A notes app",
    description: ["Built for fast capture."],
    tech: ["React"],
    github: "https://github.com/example/lantern",
    demo: "",
  },
});

const POST = (title: string, excerpt: string, date: string, slug: string, body: string, draft = false) => ({
  content: { title, excerpt, date, slug, tags: [], draft, featured: false, coverImage: "", coverAlt: "", body },
});

type Fixture = { projectId: string };

async function seedContent(base: string, withDraft: boolean): Promise<Fixture> {
  await ownerSend(base, "put", "/api/admin/profile/", {
    name: "Avery Quinn",
    headline: "Platform Engineer",
    about: ["Builds calm systems."],
    photo: "",
    email: "avery@example.com",
    resumeLink: "",
    socialLinks: [{ label: "GitHub", url: "https://github.com/avery-q" }],
  });
  await ownerSend(base, "post", "/api/admin/experience/", {
    position: 0,
    content: {
      year: "2026",
      title: "Staff Engineer",
      company: "Northwind Ltd",
      duration: "Jan 2026 - Present",
      description: "Leads the platform team.",
      details: [],
    },
  });
  await ownerSend(base, "post", "/api/admin/tech-stack/", {
    position: 0,
    content: { category: "Languages", tools: [{ name: "TypeScript", icon: "/icons/ts.png" }] },
  });
  const project = (await ownerSend(base, "post", "/api/admin/projects/", { position: 0, ...PROJECT("Lantern Notes") })) as { id?: string };
  await ownerSend(base, "post", "/api/admin/certifications/", {
    position: 0,
    content: { name: "Certified Cloud Practitioner", icon: "/certs/cloud.png", url: "https://example.com/cert/cloud" },
  });
  await ownerSend(base, "post", "/api/admin/blog-posts/", POST("Hello World", "A first post", "2026-05-15", "hello-world", "Hello body words here.\n"));
  await ownerSend(
    base,
    "post",
    "/api/admin/blog-posts/",
    POST("Second Outage Post", "A second excerpt", "2026-06-01", "second-outage-post", "Second body words.\n"),
  );
  if (withDraft) {
    await ownerSend(
      base,
      "post",
      "/api/admin/blog-posts/",
      POST("Work In Progress", "Draft excerpt text", "2026-04-01", "work-in-progress", "Secret draft words.\n", true),
    );
  }
  return { projectId: String(project?.id ?? "") };
}

async function full(base: string, withDraft = false): Promise<Fixture> {
  await blank(base);
  const fixture = await seedContent(base, withDraft);
  expect(fixture.projectId).not.toBe("");
  await ownerPublish(base);
  await pollText(base, "/", (t) => t.includes("Lantern Notes") && t.includes("Certified Cloud Practitioner") && t.includes("Staff Engineer"));
  await pollText(base, "/blog/", (t) => t.includes("Hello World") && t.includes("Second Outage Post"));
  await pollText(base, "/rss.xml", (t) => t.includes("<title><![CDATA[Hello World]]></title>"));
  await pollText(base, "/sitemap.xml", (t) => t.includes("<loc>https://thegoldenpothos.xyz/blog/hello-world/</loc>"));
  await expect
    .poll(async () => (await getText(base, "/")).cache, { timeout: 60000, message: "the landing page becomes a kept copy" })
    .toBe("HIT");
  return fixture;
}

async function editProject(base: string, id: string, title: string): Promise<void> {
  await ownerSend(base, "put", "/api/admin/projects/?id=" + id, PROJECT(title));
}

type Visit = { status: number; page: Page; context: BrowserContext };

async function visit(browser: Browser, base: string, url: string, cookie?: string): Promise<Visit> {
  const context = await browser.newContext({ baseURL: base });
  if (cookie !== undefined) {
    const [name, ...rest] = cookie.split("=");
    await context.addCookies([{ name, value: rest.join("="), url: base }]);
  }
  const page = await context.newPage();
  const response = await page.goto(url);
  return { status: response ? response.status() : 0, page, context };
}

const bodyText = (page: Page): Promise<string> => page.locator("body").innerText();
const mainText = (page: Page): Promise<string> => page.locator("main#main-content").innerText();

async function projectTitles(page: Page): Promise<string[]> {
  return (await page.locator("section#projects .card-front h3").allTextContents()).map((t) => t.trim());
}

test.afterAll(async () => {
  dbFix();
  await blank(baseUrlOf());
});

async function whileBroken(base: string, run: () => Promise<void>): Promise<void> {
  try {
    dbBreak();
    await run();
  } finally {
    dbFix();
    await blank(base);
  }
}

test("E2E-01: the landing page keeps its content for every visitor while the database is unreachable", async ({ browser }) => {
  const base = baseUrlOf();
  await full(base);
  await ownerPublish(base);
  await whileBroken(base, async () => {
    for (let visitNo = 0; visitNo < 2; visitNo++) {
      const v = await visit(browser, base, "/");
      try {
        expect(v.status, "visit " + visitNo).toBe(200);
        const page = v.page;
        const experience = await page.locator("section#experience").innerText();
        expect(experience).toContain("Staff Engineer");
        expect(experience).toContain("Northwind Ltd");
        expect(await page.locator("section#tech").textContent()).toContain("Languages");
        const text = await bodyText(page);
        for (const word of ["Avery Quinn", "Platform Engineer", "Builds calm systems.", "Lantern Notes", "Certified Cloud Practitioner"]) {
          expect(text, word).toContain(word);
        }
        const nav = page.locator('nav[aria-label="Main navigation"]');
        for (const name of ["About", "Experience", "Projects", "Certifications"]) {
          await expect(nav.getByRole("link", { name, exact: true })).toBeVisible();
        }
        for (const word of ERROR_WORDS) expect(text, word).not.toContain(word);
      } finally {
        await v.context.close();
      }
    }
  });
});

test("E2E-02: the blog pages, including a post nobody opened, keep their content while the database is unreachable", async ({ browser }) => {
  const base = baseUrlOf();
  await full(base);
  await ownerPublish(base);
  await whileBroken(base, async () => {
    const list = await visit(browser, base, "/blog/");
    try {
      expect(list.status).toBe(200);
      const text = await mainText(list.page);
      expect(text).toContain("Hello World");
      expect(text).toContain("Second Outage Post");
      expect(text).not.toContain("No posts yet");
    } finally {
      await list.context.close();
    }
    const second = await visit(browser, base, "/blog/second-outage-post/");
    try {
      expect(second.status).toBe(200);
      await expect(second.page.getByRole("heading", { level: 1, name: "Second Outage Post", exact: true })).toBeVisible();
      expect(await mainText(second.page)).toContain("Second body words.");
    } finally {
      await second.context.close();
    }
    const first = await visit(browser, base, "/blog/hello-world/");
    try {
      expect(first.status).toBe(200);
      await expect(first.page.getByRole("heading", { level: 1, name: "Hello World", exact: true })).toBeVisible();
      expect(await mainText(first.page)).toContain("Hello body words here.");
    } finally {
      await first.context.close();
    }
  });
});

test("E2E-03: the feed and the sitemap keep their content while the database is unreachable", async () => {
  const base = baseUrlOf();
  await full(base);
  await ownerPublish(base);
  await whileBroken(base, async () => {
    const feed = await getText(base, "/rss.xml");
    const map = await getText(base, "/sitemap.xml");
    const feedType = await withRequest(base, async (request) => (await request.get("/rss.xml")).headers()["content-type"] ?? "");
    expect(feed.status).toBe(200);
    expect(map.status).toBe(200);
    expect(feedType).toContain("application/rss+xml");
    expect(feed.text).toContain("<title><![CDATA[Hello World]]></title>");
    expect(feed.text).toContain("<link>https://thegoldenpothos.xyz/blog/hello-world/</link>");
    expect(map.text).toContain("<loc>https://thegoldenpothos.xyz/blog/hello-world/</loc>");
    expect(map.text).toContain("<loc>https://thegoldenpothos.xyz/blog/second-outage-post/</loc>");
    for (const text of [feed.text, map.text]) {
      expect(text).not.toContain("Internal Server Error");
      expect(text).not.toContain("Application error");
    }
  });
});

test("E2E-04: a draft stays out of every public page while the database is unreachable", async ({ browser }) => {
  const base = baseUrlOf();
  await full(base, true);
  await ownerPublish(base);
  await whileBroken(base, async () => {
    const list = await visit(browser, base, "/blog/");
    try {
      const text = await mainText(list.page);
      expect(text).toContain("Hello World");
      expect(text).not.toContain("Work In Progress");
    } finally {
      await list.context.close();
    }
    const draft = await visit(browser, base, "/blog/work-in-progress/");
    try {
      expect(draft.status).toBe(404);
      await expect(draft.page.getByRole("heading", { level: 1, name: "404", exact: true })).toBeVisible();
      await expect(draft.page.getByRole("heading", { level: 2, name: "This page could not be found.", exact: true })).toBeVisible();
      const text = await bodyText(draft.page);
      expect(text).not.toContain("Work In Progress");
      expect(text).not.toContain("Secret draft words.");
    } finally {
      await draft.context.close();
    }
    const feed = (await getText(base, "/rss.xml")).text;
    expect(feed).toContain("Hello World");
    expect(feed).not.toContain("Work In Progress");
    expect(feed).not.toContain("work-in-progress");
    const map = (await getText(base, "/sitemap.xml")).text;
    expect(map).toContain("hello-world");
    expect(map).not.toContain("work-in-progress");
  });
});

test("E2E-05: a saved but unpublished edit is not shown while the database is unreachable", async ({ browser }) => {
  const base = baseUrlOf();
  const fixture = await full(base);
  await editProject(base, fixture.projectId, "Beacon Notes");
  await whileBroken(base, async () => {
    const v = await visit(browser, base, "/");
    try {
      expect(v.status).toBe(200);
      expect(await projectTitles(v.page)).toEqual(["Lantern Notes"]);
      expect(await bodyText(v.page)).not.toContain("Beacon Notes");
    } finally {
      await v.context.close();
    }
  });
});

test("E2E-06: a failed Publish says so and leaves every public page unchanged", async ({ browser }) => {
  const base = baseUrlOf();
  const fixture = await full(base);
  await editProject(base, fixture.projectId, "Beacon Notes");
  await whileBroken(base, async () => {
    const panel = await visit(browser, base, PANEL, await cookieOf(OWNER()));
    try {
      const button = panel.page.getByRole("button", { name: "Publish", exact: true });
      await expect(button).toBeVisible();
      await button.click();
      await expect(panel.page.getByRole("alert").filter({ hasText: FAILED_PUBLISH })).toBeVisible({ timeout: 20000 });
      await expect(panel.page.getByRole("status").filter({ hasText: "Published." })).toHaveCount(0);
    } finally {
      await panel.context.close();
    }

    const direct = await withRequest(base, async (request) => {
      const response = await request.post(PUBLISH, { headers: { cookie: await cookieOf(OWNER()) }, maxRedirects: 0 });
      return { status: response.status(), json: await response.json() };
    });
    expect(direct.status).toBe(503);
    expect(direct.json).toEqual({ error: "unavailable" });

    const home = await getText(base, "/");
    expect(home.status).toBe(200);
    expect(home.cache).toBe("HIT");

    const v = await visit(browser, base, "/");
    try {
      expect(await projectTitles(v.page)).toEqual(["Lantern Notes"]);
      expect(await bodyText(v.page)).not.toContain("Beacon Notes");
    } finally {
      await v.context.close();
    }
    const list = await visit(browser, base, "/blog/");
    try {
      expect(await mainText(list.page)).toContain("Hello World");
    } finally {
      await list.context.close();
    }
    expect((await getText(base, "/rss.xml")).text).toContain("Hello World");

    dbFix();
    const after = await getText(base, "/");
    expect(after.cache).toBe("HIT");
    expect(after.text).toContain("Lantern Notes");
    expect(after.text).not.toContain("Beacon Notes");
  });
});

test("E2E-08: a renewal while the database is unreachable keeps the previous copy, and the next Publish shows the new one", async ({ browser }) => {
  const base = baseUrlOf();
  const fixture = await full(base);
  await editProject(base, fixture.projectId, "Beacon Notes");
  await ownerPublish(base);
  await whileBroken(base, async () => {
    for (let visitNo = 0; visitNo < 2; visitNo++) {
      const v = await visit(browser, base, "/");
      try {
        expect(v.status, "visit " + visitNo).toBe(200);
        expect(await projectTitles(v.page)).toEqual(["Lantern Notes"]);
        const text = await bodyText(v.page);
        expect(text).not.toContain("Beacon Notes");
        expect(text).not.toContain("Internal Server Error");
      } finally {
        await v.context.close();
      }
      if (visitNo === 0) {
        const list = await visit(browser, base, "/blog/");
        try {
          expect(list.status).toBe(200);
          expect(await mainText(list.page)).toContain("Hello World");
        } finally {
          await list.context.close();
        }
      }
    }
    dbFix();
    await ownerPublish(base);
    await expect
      .poll(
        async () => {
          const v = await visit(browser, base, "/");
          try {
            return await projectTitles(v.page);
          } finally {
            await v.context.close();
          }
        },
        { timeout: 60000 },
      )
      .toEqual(["Beacon Notes"]);
  });
});

test("E2E-09: the kept read, its callers and the Publish route follow the kept-copy rules", async () => {
  const read = (file: string): string => fs.readFileSync(path.join(process.cwd(), file), "utf8");
  const firstLine = (text: string): string | undefined => text.split("\n").find((line) => line.trim() !== "")?.trim();
  const SERVER_ONLY = 'import "server-only";';

  const kept = read("src/lib/server/keptRead.ts");
  expect(firstLine(kept)).toBe(SERVER_ONLY);
  for (const word of ["unstable_cache(", "revalidateTag(", '"max"', "createHash", "SUPABASE_DB_URL"]) expect(kept, word).toContain(word);
  for (const word of ["revalidatePath(", "expire", "@/lib/auth", "@/lib/admin", "cookies(", "headers(", "console.", "fetch("]) {
    expect(kept.includes(word), "keptRead.ts contains " + word).toBe(false);
  }

  for (const name of ["publicProfile", "publicExperience", "publicTechStack", "publicProjects", "publicCertifications", "publicPosts"]) {
    const file = "src/lib/server/" + name + ".ts";
    const text = read(file);
    expect(firstLine(text), file).toBe(SERVER_ONLY);
    expect(text, file).toMatch(/keptRead(<[^\n]*>)?\(/);
    for (const word of ["unstable_cache(", "revalidatePath(", "revalidateTag(", "@/lib/auth", "@/lib/admin", "cookies(", "headers(", "console.", "process.env"]) {
      expect(text.includes(word), file + " contains " + word).toBe(false);
    }
  }

  const route = read("src/app/api/admin/publish/route.ts");
  const at = (word: string): number => route.indexOf(word);
  expect(at("getPanelState(")).toBeGreaterThanOrEqual(0);
  expect(at("getPanelState(")).toBeLessThan(at("loadProfile("));
  expect(at("loadProfile(")).toBeLessThan(at("refreshPublishedSite("));
  for (const word of ["revalidatePath(", "refreshPublishedPosts", "process.env", "fetch("]) {
    expect(route.includes(word), "route contains " + word).toBe(false);
  }
  expect(route).toContain('export const dynamic = "force-dynamic"');

  const page = read("src/app/page.tsx");
  expect(page).toContain("export const revalidate = false");
  expect(page.split("revalidate").length - 1).toBe(1);

  for (const file of ["src/app/blog/page.tsx", "src/app/blog/[slug]/page.tsx", "src/app/rss.xml/route.ts", "src/app/sitemap.ts"]) {
    const text = read(file);
    expect(text, file).toContain("loadPublishedPosts");
    for (const word of ["keptRead", "unstable_cache", "revalidatePath"]) expect(text.includes(word), file + " contains " + word).toBe(false);
  }
});

test("E2E-10: the earlier publish checks follow the new refresh", async () => {
  const read = (file: string): string => fs.readFileSync(path.join(process.cwd(), file), "utf8");
  const files = ["e2e/owner-publishes-profile.spec.ts", "e2e/owner-publishes-blog-posts.spec.ts", "e2e/owner-publishes-posts-to-feeds.spec.ts"];
  const gone = [
    "refreshPublishedPosts",
    "toContain('revalidatePath(\"/\")')",
    'revalidatePath("/blog", "layout")',
    'revalidatePath("/rss.xml", "layout")',
    'revalidatePath("/sitemap.xml", "layout")',
  ];
  for (const file of files) {
    const text = read(file);
    for (const word of gone) expect(text.includes(word), file + " contains " + word).toBe(false);
    expect(text, file).toContain("refreshPublishedSite");
  }
});

test("E2E-07: an address that was never a post shows the not-found page with a way back to the blog while the database is unreachable", async ({ browser }) => {
  const base = baseUrlOf();
  const started = Date.now();
  await full(base);
  await ownerPublish(base);
  await whileBroken(base, async () => {
    const addresses = ["/blog/never-was-a-post-" + started + "/", "/blog/never-was-a-post-b-" + Date.now() + "/"];
    for (const address of addresses) {
      const v = await visit(browser, base, address);
      try {
        expect(v.status, address).toBe(404);
        await expect(v.page.getByRole("heading", { level: 1, name: "404", exact: true })).toBeVisible();
        await expect(v.page.getByRole("heading", { level: 2, name: "This page could not be found.", exact: true })).toBeVisible();
        const blogLink = v.page.getByRole("link", { name: "Back to the blog", exact: true });
        await expect(blogLink).toBeVisible();
        await expect(blogLink).toHaveAttribute("href", "/blog/");
        const siteLink = v.page.getByRole("link", { name: "Back to the site", exact: true });
        await expect(siteLink).toBeVisible();
        await expect(siteLink).toHaveAttribute("href", "/");
        const text = await bodyText(v.page);
        expect(text).not.toContain("Internal Server Error");
        expect(text).not.toContain("Application error");
      } finally {
        await v.context.close();
      }
    }
  });
});

test("E2E-11: the standing documents describe the stale-while-revalidate renewal", async () => {
  const read = (file: string): string => fs.readFileSync(path.join(process.cwd(), file), "utf8");
  const claude = read("CLAUDE.md");
  for (const word of [
    "src/lib/server/keptRead.ts",
    "stale-while-revalidate",
    "previous copy",
    "revalidateTag",
    "revalidatePath",
    "last good copy",
    "src/lib/server/publicPosts.ts",
  ]) {
    expect(claude, "CLAUDE.md contains " + word).toContain(word);
  }
  expect(claude).not.toContain("which calls `revalidatePath`");
  expect(claude).not.toContain("the `/blog` layout renewed with `revalidatePath`");

  const reference = read("Reference.md");
  expect(reference).toContain("keptRead");
  expect(reference).toContain("stale-while-revalidate");
  expect(reference).not.toContain('revalidatePath("/")');
});
