import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { expect, request as playwrightRequest, test, type APIRequestContext, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { encode } from "next-auth/jwt";

// Intent acceptance for "the public site shows the content managed in the admin panel".
// All specs share one stand-in database, so this file runs serially and leaves it repaired, empty and published.
test.describe.configure({ mode: "serial" });
test.setTimeout(240000);

const STAND_IN_PREFIX = "stand-in:";
const DB_URL = process.env.SUPABASE_DB_URL ?? "";
const DB_FILE = DB_URL.startsWith(STAND_IN_PREFIX) ? DB_URL.slice(STAND_IN_PREFIX.length) : "";

const PUBLISH = "/api/admin/publish/";
const PANEL = "/bright-warm-greenhouse/";
const SESSION_COOKIE = "authjs.session-token";
const EMPTY_BLOG = "No posts yet — check back soon!";
const PUBLISHED_MESSAGE = "Published. Visitors will see the changes within a minute.";
const FAILED_PUBLISH = "The site could not be published because the database could not be reached. Try again later.";
const ERROR_WORDS = ["Internal Server Error", "Application error", "could not be loaded", "unreachable"];
const ORIGIN = "https://thegoldenpothos.xyz";
const BASELINE = "89e2b170134a99d4533a8c0ab654fe55f763c9ab";

type Claims = { sub: string; email: string; name: string; emailVerified: boolean };
const setting = (name: string): string => process.env[name] ?? "";
const OWNER = (): Claims => ({ sub: "owner-1", email: setting("ADMIN_EMAIL"), name: "Owner Test", emailVerified: true });
const OTHER = (): Claims => ({ sub: "other-1", email: "mallory@example.test", name: "Mallory Intruder", emailVerified: true });

async function cookieOf(claims: Claims): Promise<string> {
  const value = await encode({ token: { ...claims }, secret: setting("AUTH_SECRET"), salt: SESSION_COOKIE, maxAge: 3600 });
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
    const body = await response.text();
    expect(response.status(), body).toBe(200);
    expect(JSON.parse(body)).toEqual({ published: true });
  });
}

type Got = { status: number; text: string; cache: string; type: string };

async function getText(base: string, url: string): Promise<Got> {
  return withRequest(base, async (request) => {
    const response = await request.get(url, { maxRedirects: 0 });
    const text = await response.text();
    return { status: response.status(), text, cache: response.headers()["x-nextjs-cache"] ?? "", type: response.headers()["content-type"] ?? "" };
  });
}

async function pollText(base: string, url: string, ok: (text: string) => boolean): Promise<void> {
  await expect.poll(async () => ok((await getText(base, url)).text), { timeout: 60000, message: "waiting on " + url }).toBe(true);
}

// A page marked stale by Publish still answers with the old copy and renews on its own first visit,
// so wait until each page has renewed (it no longer reports STALE) before saving anything further.
async function settle(base: string, urls: string[]): Promise<void> {
  for (const url of urls) {
    await getText(base, url);
    await expect
      .poll(async () => {
        const cache = (await getText(base, url)).cache;
        return cache !== "STALE" && cache !== "MISS";
      }, { timeout: 60000, message: "waiting for " + url + " to renew" })
      .toBe(true);
  }
}

async function blank(base: string): Promise<void> {
  dbDelete();
  await ownerPublish(base);
  await pollText(base, "/", (text) => !text.includes('id="hero"') && !text.includes('id="projects"') && !text.includes('id="certifications"'));
  await pollText(base, "/blog/", (text) => text.includes(EMPTY_BLOG));
  await pollText(base, "/rss.xml", (text) => !text.includes("<item>"));
  await pollText(base, "/sitemap.xml", (text) => !/\/blog\/[a-z0-9-]+\//.test(text));
  await settle(base, ["/", "/blog/", "/rss.xml", "/sitemap.xml"]);
}

async function ownerSend(base: string, method: "post" | "put" | "delete", url: string, body?: unknown): Promise<{ id?: string }> {
  return withRequest(base, async (request) => {
    const headers: Record<string, string> = { cookie: await cookieOf(OWNER()) };
    const options: { headers: Record<string, string>; maxRedirects: number; data?: string } = { headers, maxRedirects: 0 };
    if (body !== undefined) {
      headers["content-type"] = "application/json";
      options.data = JSON.stringify(body);
    }
    const response = await request[method](url, options);
    const text = await response.text();
    expect(response.status(), url + " " + text).toBe(200);
    try {
      return JSON.parse(text) as { id?: string };
    } catch {
      return {};
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

const PROFILE = (name: string) => ({
  name,
  headline: "Platform Engineer",
  about: ["Builds calm systems."],
  photo: "",
  email: "avery@example.com",
  resumeLink: "",
  socialLinks: [{ label: "GitHub", url: "https://github.com/avery-q" }],
});

type Fixture = { projectId: string; certIds: string[]; experienceId: string; techId: string };

async function seedContent(base: string): Promise<Fixture> {
  await ownerSend(base, "put", "/api/admin/profile/", PROFILE("Avery Quinn"));
  const exp = await ownerSend(base, "post", "/api/admin/experience/", {
    position: 0,
    content: { year: "2026", title: "Staff Engineer", company: "Northwind Ltd", duration: "Jan 2026 - Present", description: "Leads the platform team.", details: [] },
  });
  const tech = await ownerSend(base, "post", "/api/admin/tech-stack/", {
    position: 0,
    content: { category: "Languages", tools: [{ name: "TypeScript", icon: "/icons/ts.png" }] },
  });
  const project = await ownerSend(base, "post", "/api/admin/projects/", { position: 0, ...PROJECT("Lantern Notes") });
  const certIds: string[] = [];
  for (const [i, name] of ["Certified Cloud Practitioner", "Certified Data Analyst"].entries()) {
    const cert = await ownerSend(base, "post", "/api/admin/certifications/", {
      position: i,
      content: { name, icon: "/certs/cloud.png", url: "https://example.com/cert/" + i },
    });
    certIds.push(String(cert.id ?? ""));
  }
  return { projectId: String(project.id ?? ""), certIds, experienceId: String(exp.id ?? ""), techId: String(tech.id ?? "") };
}

async function fullSite(base: string): Promise<Fixture> {
  await blank(base);
  const fixture = await seedContent(base);
  expect(fixture.projectId).not.toBe("");
  expect(fixture.certIds.every((id) => id !== "")).toBe(true);
  await ownerPublish(base);
  await pollText(base, "/", (t) => t.includes("Lantern Notes") && t.includes("Certified Cloud Practitioner") && t.includes("Staff Engineer"));
  await settle(base, ["/", "/blog/", "/rss.xml", "/sitemap.xml"]);
  return fixture;
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

const bodyText = (page: Page): Promise<string> => page.locator("body").textContent().then((t) => t ?? "");
const mainText = (page: Page): Promise<string> => page.locator("main#main-content").textContent().then((t) => t ?? "");

async function projectTitles(base: string, browser: Browser): Promise<string[]> {
  const v = await visit(browser, base, "/");
  try {
    return (await v.page.locator("section#projects").getByRole("heading", { level: 3 }).allTextContents()).map((t) => t.trim());
  } finally {
    await v.context.close();
  }
}

async function menuLinks(base: string, browser: Browser): Promise<string[]> {
  const v = await visit(browser, base, "/");
  try {
    const names = ["About", "Experience", "Projects", "Certifications"];
    const found: string[] = [];
    for (const name of names) {
      const count = await v.page.locator('nav[aria-label="Main navigation"]').getByRole("link", { name, exact: true }).count();
      if (count > 0) found.push(name);
    }
    return found;
  } finally {
    await v.context.close();
  }
}

async function pressPublish(browser: Browser, base: string, expectOutcome: "ok" | "failed"): Promise<void> {
  const panel = await visit(browser, base, PANEL, await cookieOf(OWNER()));
  try {
    const button = panel.page.getByRole("button", { name: "Publish", exact: true });
    await expect(button).toBeVisible();
    await button.click();
    if (expectOutcome === "ok") {
      await expect(panel.page.getByRole("status").filter({ hasText: PUBLISHED_MESSAGE })).toBeVisible({ timeout: 30000 });
    } else {
      await expect(panel.page.getByRole("alert").filter({ hasText: FAILED_PUBLISH })).toBeVisible({ timeout: 30000 });
      await expect(panel.page.getByRole("status").filter({ hasText: "Published." })).toHaveCount(0);
    }
  } finally {
    await panel.context.close();
  }
}

async function whileBroken(base: string, run: () => Promise<void>): Promise<void> {
  try {
    dbBreak();
    await run();
  } finally {
    dbFix();
    await blank(base);
  }
}

test.afterAll(async () => {
  dbFix();
  await blank(baseUrlOf());
});

const read = (file: string): string => fs.readFileSync(path.join(process.cwd(), file), "utf8");
function git(args: string[]): { status: number | null; out: string } {
  const r = spawnSync("git", args, { cwd: process.cwd(), encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return { status: r.status, out: r.stdout ?? "" };
}

// ---------------------------------------------------------------- §6 definition of done

test("E2E-ACC-01: a project changed in the panel and published shows on the public page within a minute (§6.1)", async ({ browser }) => {
  const base = baseUrlOf();
  const fixture = await fullSite(base);
  try {
    await ownerSend(base, "put", "/api/admin/projects/?id=" + fixture.projectId, PROJECT("Beacon Notes"));
    await pressPublish(browser, base, "ok");
    await expect.poll(() => projectTitles(base, browser), { timeout: 60000 }).toEqual(["Beacon Notes"]);
    expect((await getText(base, "/")).text).not.toContain("Lantern Notes");
  } finally {
    await blank(base);
  }
});

test("E2E-ACC-02: before Publish a saved change is not visible on any public page (§6.2)", async ({ browser }) => {
  const base = baseUrlOf();
  const fixture = await fullSite(base);
  try {
    await ownerSend(base, "put", "/api/admin/projects/?id=" + fixture.projectId, PROJECT("Beacon Notes"));
    await ownerSend(base, "post", "/api/admin/blog-posts/", POST("Unpublished Idea", "Not out yet", "2026-07-01", "unpublished-idea", "Quiet words.\n"));
    for (let round = 0; round < 3; round++) {
      expect(await projectTitles(base, browser), "round " + round).toEqual(["Lantern Notes"]);
      expect((await getText(base, "/blog/")).text, "round " + round).not.toContain("Unpublished Idea");
      expect((await getText(base, "/rss.xml")).text).not.toContain("unpublished-idea");
      expect((await getText(base, "/sitemap.xml")).text).not.toContain("unpublished-idea");
    }
  } finally {
    await blank(base);
  }
});

test("E2E-ACC-03: a post published in the panel is listed, readable at its own address, and in RSS and the sitemap (§6.3)", async ({ browser }) => {
  const base = baseUrlOf();
  await blank(base);
  try {
    await ownerSend(base, "post", "/api/admin/blog-posts/", POST("Growing Pothos", "How to keep a pothos happy", "2026-05-15", "growing-pothos", "Water it weekly.\n"));
    await pressPublish(browser, base, "ok");
    await pollText(base, "/blog/", (t) => t.includes("Growing Pothos"));
    await pollText(base, "/blog/growing-pothos/", (t) => t.includes("Water it weekly."));
    await pollText(base, "/rss.xml", (t) => t.includes("<title><![CDATA[Growing Pothos]]></title>") && t.includes("<link>" + ORIGIN + "/blog/growing-pothos/</link>"));
    await pollText(base, "/sitemap.xml", (t) => t.includes("<loc>" + ORIGIN + "/blog/growing-pothos/</loc>"));

    const list = await visit(browser, base, "/blog/");
    try {
      expect(await mainText(list.page)).toContain("Growing Pothos");
    } finally {
      await list.context.close();
    }
    const post = await visit(browser, base, "/blog/growing-pothos/");
    try {
      expect(post.status).toBe(200);
      await expect(post.page.getByRole("heading", { level: 1, name: "Growing Pothos", exact: true })).toBeVisible();
      expect(await mainText(post.page)).toContain("Water it weekly.");
    } finally {
      await post.context.close();
    }
    expect((await getText(base, "/rss.xml")).type).toContain("application/rss+xml");
  } finally {
    await blank(base);
  }
});

async function expectDraftAbsent(browser: Browser, base: string): Promise<void> {
  await pollText(base, "/blog/", (t) => t.includes("Public Post") && !t.includes("Hidden Draft"));
  const list = await visit(browser, base, "/blog/");
  try {
    const text = await mainText(list.page);
    expect(text).toContain("Public Post");
    expect(text).not.toContain("Hidden Draft");
  } finally {
    await list.context.close();
  }
  await expect
    .poll(
      async () => {
        const v = await visit(browser, base, "/blog/hidden-draft/");
        try {
          const text = await bodyText(v.page);
          return v.status === 404 && !text.includes("Hidden Draft") && !text.includes("Secret draft words.");
        } finally {
          await v.context.close();
        }
      },
      { timeout: 60000 },
    )
    .toBe(true);
  const draftPage = await visit(browser, base, "/blog/hidden-draft/");
  try {
    expect(draftPage.status).toBe(404);
    await expect(draftPage.page.getByRole("heading", { level: 2, name: "This page could not be found.", exact: true })).toBeVisible();
  } finally {
    await draftPage.context.close();
  }
  await pollText(base, "/rss.xml", (t) => t.includes("Public Post") && !t.includes("hidden-draft"));
  const rss = (await getText(base, "/rss.xml")).text;
  expect(rss).not.toContain("Hidden Draft");
  expect(rss).not.toContain("hidden-draft");
  expect(rss).not.toContain("Secret draft words.");
  await pollText(base, "/sitemap.xml", (t) => t.includes("public-post") && !t.includes("hidden-draft"));
  const sitemap = (await getText(base, "/sitemap.xml")).text;
  expect(sitemap).not.toContain("hidden-draft");
}

test("E2E-ACC-04: a draft post saved in the panel is absent from the list, not found at its address, and absent from RSS and the sitemap (§6.4)", async ({ browser }) => {
  const base = baseUrlOf();
  await blank(base);
  try {
    await ownerSend(base, "post", "/api/admin/blog-posts/", POST("Public Post", "Out in the world", "2026-05-15", "public-post", "Public words.\n"));
    await ownerSend(base, "post", "/api/admin/blog-posts/", POST("Hidden Draft", "Draft excerpt", "2026-04-01", "hidden-draft", "Secret draft words.\n", true));
    await pressPublish(browser, base, "ok");
    await expectDraftAbsent(browser, base);
  } finally {
    await blank(base);
  }
});

test("E2E-ACC-05: with every certification deleted and Publish pressed, the section and its menu link are gone and the rest of the page renders (§6.5)", async ({ browser }) => {
  const base = baseUrlOf();
  const fixture = await fullSite(base);
  try {
    expect(await menuLinks(base, browser)).toContain("Certifications");
    for (const id of fixture.certIds) await ownerSend(base, "delete", "/api/admin/certifications/?id=" + id);
    await pressPublish(browser, base, "ok");
    await pollText(base, "/", (t) => !t.includes('id="certifications"') && !t.includes("Certified Cloud Practitioner"));
    const v = await visit(browser, base, "/");
    try {
      expect(v.status).toBe(200);
      await expect(v.page.locator("section#certifications")).toHaveCount(0);
      const nav = v.page.locator('nav[aria-label="Main navigation"]');
      await expect(nav.getByRole("link", { name: "Certifications", exact: true })).toHaveCount(0);
      for (const name of ["About", "Experience", "Projects"]) await expect(nav.getByRole("link", { name, exact: true })).toBeVisible();
      const text = await bodyText(v.page);
      for (const word of ["Avery Quinn", "Staff Engineer", "Lantern Notes"]) expect(text, word).toContain(word);
      for (const word of ERROR_WORDS) expect(text, word).not.toContain(word);
    } finally {
      await v.context.close();
    }
  } finally {
    await blank(base);
  }
});

test("E2E-ACC-06: with the database unreachable, every public page still shows its last published content and Publish says it failed (§6.6)", async ({ browser }) => {
  const base = baseUrlOf();
  await fullSite(base);
  await ownerSend(base, "post", "/api/admin/blog-posts/", POST("Hello World", "A first post", "2026-05-15", "hello-world", "Hello body words here.\n"));
  await ownerPublish(base);
  await pollText(base, "/blog/hello-world/", (t) => t.includes("Hello body words here."));
  await pollText(base, "/rss.xml", (t) => t.includes("Hello World"));
  await pollText(base, "/sitemap.xml", (t) => t.includes("hello-world"));
  await settle(base, ["/", "/blog/", "/blog/hello-world/", "/rss.xml", "/sitemap.xml"]);
  await whileBroken(base, async () => {
    for (let n = 0; n < 2; n++) {
      const home = await visit(browser, base, "/");
      try {
        expect(home.status, "landing " + n).toBe(200);
        const text = await bodyText(home.page);
        for (const word of ["Avery Quinn", "Lantern Notes", "Certified Cloud Practitioner", "Staff Engineer"]) expect(text, word).toContain(word);
        for (const word of ERROR_WORDS) expect(text, word).not.toContain(word);
      } finally {
        await home.context.close();
      }
    }
    for (const [url, needle] of [
      ["/blog/", "Hello World"],
      ["/blog/hello-world/", "Hello body words here."],
      ["/rss.xml", "Hello World"],
      ["/sitemap.xml", "hello-world"],
    ] as const) {
      const got = await getText(base, url);
      expect(got.status, url).toBe(200);
      expect(got.text, url).toContain(needle);
      for (const word of ["Internal Server Error", "Application error"]) expect(got.text, url).not.toContain(word);
    }
    await pressPublish(browser, base, "failed");
  });
});

test("E2E-ACC-07: a publish attempt signed out, as another Google account, or from outside the panel is refused and changes nothing (§6.7)", async ({ browser }) => {
  const base = baseUrlOf();
  const fixture = await fullSite(base);
  try {
    await ownerSend(base, "put", "/api/admin/projects/?id=" + fixture.projectId, PROJECT("Beacon Notes"));
    const cases = [
      { name: "signed out, from the panel", other: false, panel: true },
      { name: "signed out, direct", other: false, panel: false },
      { name: "other account, from the panel", other: true, panel: true },
      { name: "other account, direct", other: true, panel: false },
    ];
    for (const c of cases) {
      const headers: Record<string, string> = {};
      if (c.other) headers.cookie = await cookieOf(OTHER());
      if (c.panel) {
        headers.Origin = base;
        headers.Referer = base + PANEL;
      }
      const { status, text } = await withRequest(base, async (request) => {
        const r = await request.post(PUBLISH, { headers, maxRedirects: 0 });
        return { status: r.status(), text: await r.text() };
      });
      expect(status, c.name).toBe(c.other ? 403 : 401);
      expect(JSON.parse(text), c.name).toEqual({ error: c.other ? "not-allowed" : "not-signed-in" });
      expect(text, c.name).not.toContain("Beacon Notes");
      expect(text, c.name).not.toContain("Lantern Notes");
    }
    for (let n = 0; n < 2; n++) expect(await projectTitles(base, browser), "after refusals " + n).toEqual(["Lantern Notes"]);
    // Control: the owner's own publish does take effect.
    await ownerPublish(base);
    await expect.poll(() => projectTitles(base, browser), { timeout: 60000 }).toEqual(["Beacon Notes"]);
  } finally {
    await blank(base);
  }
});

test("E2E-ACC-08: the publish route makes no call to another site, so a publish refreshes only the deployment that received it (§6.8)", async () => {
  const route = read("src/app/api/admin/publish/route.ts");
  const kept = read("src/lib/server/keptRead.ts");
  for (const [name, text] of [["publish route", route], ["keptRead", kept]] as const) {
    for (const word of ["fetch(", "http://", "https://", "SITE_URL", "absoluteUrl", "VERCEL_URL", "axios", "XMLHttpRequest"]) {
      expect(text.includes(word), name + " contains " + word).toBe(false);
    }
  }
  expect(route).toContain("refreshPublishedSite");
  expect(kept).toContain("revalidateTag");
  const dbSetting = git(["grep", "-n", "-E", "SUPABASE_DB_URL", "--", "src"]).out;
  const files = [...new Set(dbSetting.split("\n").filter(Boolean).map((l) => l.split(":")[0]))];
  expect(files.every((f) => f.startsWith("src/lib/server/") || f === "src/lib/auth.ts" || f.startsWith("src/app/api/")), files.join(", ")).toBe(true);
});

test("E2E-ACC-09: the repo holds no hard-coded profile, experience, tech stack, projects or certifications content and no posts in content/blog (§6.9)", async () => {
  expect(fs.existsSync(path.join(process.cwd(), "content")), "content directory").toBe(false);
  expect(fs.existsSync(path.join(process.cwd(), "src/lib/blog/posts.ts"))).toBe(false);
  const tracked = git(["ls-files", "--cached", "--others", "--exclude-standard"]).out.split("\n").filter(Boolean);
  const stray = tracked.filter((f) => /\.mdx?$/.test(f) && !["docs/", "requirement/", "spec/", ".claude/", ".github/"].some((p) => f.startsWith(p)) && !["README.md", "CLAUDE.md", "Reference.md"].includes(f));
  expect(stray, "markdown content files").toEqual([]);
  for (const phrase of ["Resorts World Sentosa", "ST Engineering Defence Aerospace", "Dimerco Express Group", "Nanyang Technological University", "Professional Scrum Developer", "Certified Blockchain Developer", "Google IT Automation with Python", "Hello, World — Welcome to My Blog", "Building a Portfolio with Next.js and Tailwind CSS"]) {
    const hits = git(["grep", "-n", "-F", "-e", phrase, "--", "src", "public", "content"]).out.split("\n").filter(Boolean);
    expect(hits, phrase).toEqual([]);
  }
  for (const file of ["hero", "aboutme", "experienceTimeLine", "techstack", "project", "certifications", "footer"]) {
    const text = read("src/app/components/" + file + ".tsx");
    expect(/https?:\/\/|mailto:|\/icons\/|\/certs\/|\/profile\//.test(text), file + " holds a literal address").toBe(false);
  }
});

// ---------------------------------------------------------------- §5 hard constraints

test("E2E-ACC-10: a published post turned into a draft and published again vanishes from the list, its address, RSS and the sitemap (§5.1)", async ({ browser }) => {
  const base = baseUrlOf();
  await blank(base);
  try {
    await ownerSend(base, "post", "/api/admin/blog-posts/", POST("Public Post", "Out in the world", "2026-05-15", "public-post", "Public words.\n"));
    await ownerSend(base, "post", "/api/admin/blog-posts/", POST("Hidden Draft", "Draft excerpt", "2026-04-01", "hidden-draft", "Secret draft words.\n"));
    await ownerPublish(base);
    await pollText(base, "/blog/hidden-draft/", (t) => t.includes("Secret draft words."));
    await pollText(base, "/rss.xml", (t) => t.includes("hidden-draft"));
    await pollText(base, "/sitemap.xml", (t) => t.includes("hidden-draft"));
    await ownerSend(base, "put", "/api/admin/blog-posts/?id=hidden-draft", POST("Hidden Draft", "Draft excerpt", "2026-04-01", "hidden-draft", "Secret draft words.\n", true));
    await ownerPublish(base);
    await expectDraftAbsent(browser, base);
    const direct = await withRequest(base, async (request) => (await request.get("/api/admin/blog-posts/published/")).text());
    expect(direct).not.toContain("Hidden Draft");
  } finally {
    await blank(base);
  }
});

test("E2E-ACC-11: with the database unreachable, no public page becomes an error page or loses a section that had content, including a post nobody opened (§5.2)", async ({ browser }) => {
  const base = baseUrlOf();
  await fullSite(base);
  await ownerSend(base, "post", "/api/admin/blog-posts/", POST("Never Opened", "Nobody visited yet", "2026-06-01", "never-opened", "Unvisited body words.\n"));
  await ownerPublish(base);
  await pollText(base, "/blog/", (t) => t.includes("Never Opened"));
  await settle(base, ["/", "/blog/", "/rss.xml", "/sitemap.xml"]);
  await whileBroken(base, async () => {
    const post = await visit(browser, base, "/blog/never-opened/");
    try {
      expect(post.status).toBe(200);
      expect(await mainText(post.page)).toContain("Unvisited body words.");
    } finally {
      await post.context.close();
    }
    const home = await visit(browser, base, "/");
    try {
      expect(home.status).toBe(200);
      for (const id of ["hero", "about", "experience", "projects", "certifications"]) {
        const section = home.page.locator("#" + id);
        await expect(section, id).toHaveCount(1);
        expect(((await section.textContent()) ?? "").trim().length, id + " is empty").toBeGreaterThan(10);
      }
      expect(await bodyText(home.page)).not.toContain("could not be loaded");
    } finally {
      await home.context.close();
    }
    const missing = await visit(browser, base, "/blog/never-was-a-post-" + Date.now() + "/");
    try {
      expect(missing.status).toBe(404);
      await expect(missing.page.getByRole("link", { name: "Back to the blog", exact: true })).toBeVisible();
    } finally {
      await missing.context.close();
    }
  });
});

test("E2E-ACC-12: saving in the panel changes nothing visitors see until Publish, across every section and the feeds (§5.4)", async ({ browser }) => {
  const base = baseUrlOf();
  const fixture = await fullSite(base);
  try {
    await ownerSend(base, "put", "/api/admin/profile/", PROFILE("Avery Renamed"));
    await ownerSend(base, "put", "/api/admin/experience/?id=" + fixture.experienceId, {
      content: { year: "2026", title: "Principal Engineer", company: "Contoso Ltd", duration: "Feb 2026 - Present", description: "Leads more.", details: [] },
    });
    await ownerSend(base, "post", "/api/admin/certifications/", { position: 5, content: { name: "Brand New Credential", icon: "/certs/cloud.png", url: "https://example.com/cert/new" } });
    await ownerSend(base, "delete", "/api/admin/projects/?id=" + fixture.projectId);
    await ownerSend(base, "post", "/api/admin/blog-posts/", POST("Saved Only", "Saved not published", "2026-07-02", "saved-only", "Saved only words.\n"));
    for (let n = 0; n < 3; n++) {
      const text = (await getText(base, "/")).text;
      for (const word of ["Avery Renamed", "Principal Engineer", "Contoso Ltd", "Brand New Credential"]) expect(text, word).not.toContain(word);
      for (const word of ["Avery Quinn", "Staff Engineer", "Lantern Notes"]) expect(text, word).toContain(word);
      expect((await getText(base, "/blog/")).text).not.toContain("Saved Only");
      expect((await getText(base, "/blog/saved-only/")).status).toBe(404);
      expect((await getText(base, "/rss.xml")).text).not.toContain("saved-only");
      expect((await getText(base, "/sitemap.xml")).text).not.toContain("saved-only");
    }
    await ownerPublish(base);
    await pollText(base, "/", (t) => t.includes("Avery Renamed") && !t.includes("Lantern Notes"));
  } finally {
    await blank(base);
  }
});

test("E2E-ACC-13: a section with no saved content, and its menu link, is not shown while the rest of the page is unaffected (§5.5)", async ({ browser }) => {
  const base = baseUrlOf();
  const fixture = await fullSite(base);
  try {
    await ownerSend(base, "delete", "/api/admin/projects/?id=" + fixture.projectId);
    await ownerSend(base, "delete", "/api/admin/experience/?id=" + fixture.experienceId);
    await ownerSend(base, "delete", "/api/admin/tech-stack/?id=" + fixture.techId);
    await ownerPublish(base);
    await pollText(base, "/", (t) => !t.includes('id="projects"') && !t.includes('id="experience"'));
    const v = await visit(browser, base, "/");
    try {
      expect(v.status).toBe(200);
      const nav = v.page.locator('nav[aria-label="Main navigation"]');
      for (const name of ["Experience", "Projects"]) await expect(nav.getByRole("link", { name, exact: true }), name).toHaveCount(0);
      for (const name of ["About", "Certifications"]) await expect(nav.getByRole("link", { name, exact: true }), name).toBeVisible();
      await expect(v.page.locator("section#projects")).toHaveCount(0);
      await expect(v.page.locator("section#experience")).toHaveCount(0);
      expect(await bodyText(v.page)).toContain("Certified Cloud Practitioner");
    } finally {
      await v.context.close();
    }
    // An empty profile hides the hero and About with their menu link too.
    dbDelete();
    await ownerPublish(base);
    await pollText(base, "/", (t) => !t.includes('id="hero"') && !t.includes('id="about"') && !t.includes('id="certifications"'));
    const empty = await visit(browser, base, "/");
    try {
      expect(empty.status).toBe(200);
      expect(await menuLinks(base, browser)).toEqual([]);
    } finally {
      await empty.context.close();
    }
  } finally {
    await blank(base);
  }
});

test("E2E-ACC-14: a publish that cannot reach the database fails, says so in the panel, and leaves the public pages unchanged (§5.6)", async ({ browser }) => {
  const base = baseUrlOf();
  const fixture = await fullSite(base);
  try {
    await ownerSend(base, "put", "/api/admin/projects/?id=" + fixture.projectId, PROJECT("Beacon Notes"));
    await whileBroken(base, async () => {
      await pressPublish(browser, base, "failed");
      const direct = await withRequest(base, async (request) => {
        const r = await request.post(PUBLISH, { headers: { cookie: await cookieOf(OWNER()) }, maxRedirects: 0 });
        return { status: r.status(), json: await r.json() };
      });
      expect(direct.status).toBe(503);
      expect(direct.json).toEqual({ error: "unavailable" });
      expect(await projectTitles(base, browser)).toEqual(["Lantern Notes"]);
      dbFix();
      expect(await projectTitles(base, browser)).toEqual(["Lantern Notes"]);
      expect((await getText(base, "/")).text).not.toContain("Beacon Notes");
    });
  } finally {
    await blank(base);
  }
});

test("E2E-ACC-15: no setting value, database address or owner email reaches the browser, and a refused publish leaks none (§5.7)", async ({ browser }) => {
  const base = baseUrlOf();
  const fixture = await fullSite(base);
  void fixture;
  try {
    await ownerSend(base, "post", "/api/admin/blog-posts/", POST("Leak Check", "Excerpt", "2026-05-15", "leak-check", "Body.\n"));
    await ownerPublish(base);
    await pollText(base, "/blog/leak-check/", (t) => t.includes("Body."));
    const secrets = ["ADMIN_EMAIL", "SUPABASE_DB_URL", "SUPABASE_URL", "AUTH_SECRET", "AUTH_GOOGLE_SECRET", "AUTH_GOOGLE_ID"].map((n) => ({ n, v: setting(n) }));
    for (const s of secrets) expect(s.v.length, s.n + " is set in the test run").toBeGreaterThan(0);
    const targets = ["/", "/blog/", "/blog/leak-check/", "/rss.xml", "/sitemap.xml", "/robots.txt"];
    const seen: string[] = [];
    for (const url of targets) seen.push((await getText(base, url)).text);
    const panelHtml = await withRequest(base, async (request) => (await request.get(PANEL, { headers: { cookie: await cookieOf(OWNER()) } })).text());
    seen.push(panelHtml);
    const refused = await withRequest(base, async (request) => {
      const a = await request.post(PUBLISH, { maxRedirects: 0 });
      const b = await request.post(PUBLISH, { headers: { cookie: await cookieOf(OTHER()) }, maxRedirects: 0 });
      return (await a.text()) + (await b.text());
    });
    seen.push(refused);
    // Everything a browser downloads for the public pages and the panel.
    for (const [url, cookie] of [["/", undefined], ["/blog/leak-check/", undefined], [PANEL, await cookieOf(OWNER())]] as const) {
      const v = await visit(browser, base, url, cookie);
      try {
        await v.page.waitForLoadState("networkidle");
        seen.push(await v.page.content());
      } finally {
        await v.context.close();
      }
    }
    const scriptSources = [...new Set(seen.join("\n").match(/\/_next\/static\/[^"')\s\\]+\.js/g) ?? [])];
    expect(scriptSources.length).toBeGreaterThan(0);
    for (const src of scriptSources) seen.push(await withRequest(base, async (request) => (await request.get(src)).text()));
    for (const s of secrets) {
      seen.forEach((text, i) => expect(text.includes(s.v), s.n + " found in downloaded item " + i).toBe(false));
    }
    for (const word of ["SUPABASE_SERVICE_ROLE_KEY", "postgres://", "postgresql://"]) {
      seen.forEach((text, i) => expect(text.includes(word), word + " in item " + i).toBe(false));
    }
  } finally {
    await blank(base);
  }
});

test("E2E-ACC-16: the scripts a visitor's browser loads contain no database or storage code (§5.8)", async ({ browser }) => {
  const base = baseUrlOf();
  await fullSite(base);
  await ownerSend(base, "post", "/api/admin/blog-posts/", POST("Script Check", "Excerpt", "2026-05-15", "script-check", "Body.\n"));
  await ownerPublish(base);
  await pollText(base, "/blog/script-check/", (t) => t.includes("Body."));
  try {
    const bundles = new Map<string, string>();
    for (const url of ["/", "/blog/", "/blog/script-check/"]) {
      const context = await browser.newContext({ baseURL: base });
      const page = await context.newPage();
      const pending: Promise<void>[] = [];
      page.on("response", (response) => {
        if (response.request().resourceType() === "script") {
          pending.push(response.text().then((text) => void bundles.set(response.url(), text)).catch(() => undefined));
        }
      });
      await page.goto(url);
      await page.waitForLoadState("networkidle");
      await Promise.all(pending);
      await context.close();
    }
    expect(bundles.size).toBeGreaterThan(0);
    const forbidden = ["SUPABASE_DB_URL", "SUPABASE_SERVICE_ROLE_KEY", "create table if not exists", "stand-in:", "from pg_", "/storage/v1/", "ADMIN_EMAIL", "next-auth/jwt"];
    for (const [url, text] of bundles) {
      for (const word of forbidden) expect(text.includes(word), word + " in " + url).toBe(false);
    }
    // Source rule behind it: no public page, layout or component imports the server modules or the sign-in module.
    for (const file of ["src/app/layout.tsx", "src/app/page.tsx", "src/app/blog/page.tsx"]) {
      expect(read(file), file).not.toContain("@/lib/auth");
    }
  } finally {
    await blank(base);
  }
});

test("E2E-ACC-17: with the database empty the public site serves no section content and no posts from the repo (§5.9)", async ({ browser }) => {
  const base = baseUrlOf();
  await blank(base);
  const v = await visit(browser, base, "/");
  try {
    expect(v.status).toBe(200);
    for (const id of ["hero", "about", "experience", "projects", "certifications"]) await expect(v.page.locator("#" + id), id).toHaveCount(0);
    const nav = v.page.locator('nav[aria-label="Main navigation"]');
    for (const name of ["About", "Experience", "Projects", "Certifications"]) await expect(nav.getByRole("link", { name, exact: true }), name).toHaveCount(0);
    expect(await bodyText(v.page)).not.toContain("Resorts World Sentosa");
  } finally {
    await v.context.close();
  }
  const list = await visit(browser, base, "/blog/");
  try {
    expect(await mainText(list.page)).toContain(EMPTY_BLOG);
  } finally {
    await list.context.close();
  }
  // An address rendered earlier in this run renews on its first visit after Publish, so poll until it is gone.
  for (const slug of ["hello-world", "building-a-portfolio"]) {
    await expect.poll(async () => (await getText(base, "/blog/" + slug + "/")).status, { timeout: 60000, message: slug }).toBe(404);
  }
  expect((await getText(base, "/rss.xml")).text).not.toContain("<item>");
  expect(fs.existsSync(path.join(process.cwd(), "content/blog"))).toBe(false);
});

test("E2E-ACC-18: publishing never names another environment, and the code reads no setting that points at one (§5.10)", async () => {
  const names = git(["grep", "-o", "-h", "-E", "process\\.env\\.[A-Z_]+", "--", "src"]).out.split("\n").filter(Boolean).map((l) => l.replace("process.env.", ""));
  const allowed = ["AUTH_SECRET", "AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET", "ADMIN_EMAIL", "SUPABASE_DB_URL", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "NODE_ENV", "NEXT_PHASE"];
  expect([...new Set(names)].filter((n) => !allowed.includes(n))).toEqual([]);
  const hosts = git(["grep", "-n", "-i", "-E", "sit\\.thegoldenpothos|vercel\\.app", "--", "src", "next.config.ts", "vercel.json"]).out;
  expect(hosts, "an environment host is named in the code").toBe("");
  const route = read("src/app/api/admin/publish/route.ts");
  expect(route.includes("fetch(")).toBe(false);
});

test("E2E-ACC-19: no dependency, setting, workflow or service was added since the baseline (§5.11)", async () => {
  type Manifest = { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  const base = JSON.parse(git(["show", BASELINE + ":package.json"]).out) as Manifest;
  const current = JSON.parse(read("package.json")) as Manifest;
  const changed: string[] = [];
  for (const group of ["dependencies", "devDependencies"] as const) {
    for (const [name, version] of Object.entries(current[group] ?? {})) {
      if ((base[group] ?? {})[name] !== version) changed.push(name);
    }
  }
  expect(changed, "dependencies added or changed").toEqual([]);
  const baseLock = JSON.parse(git(["show", BASELINE + ":package-lock.json"]).out) as { packages?: Record<string, unknown> };
  const curLock = JSON.parse(read("package-lock.json")) as { packages?: Record<string, unknown> };
  const known = new Set(Object.keys(baseLock.packages ?? {}));
  expect(Object.keys(curLock.packages ?? {}).filter((k) => !known.has(k)), "lock packages added").toEqual([]);
  const diff = git(["diff", "--quiet", BASELINE, "--", "vercel.json", "next.config.ts", ".github/workflows"]);
  expect(diff.status, "build or workflow files changed").toBe(0);
  const settings = git(["grep", "-o", "-h", "-E", "process\\.env\\.[A-Z_]+", "--", "src"]).out.split("\n").filter(Boolean);
  expect(settings.some((s) => /DEPLOY_HOOK|REVALIDATE|CRON|TOKEN/.test(s)), "a deploy-hook or token setting").toBe(false);
});

test("E2E-ACC-20: the standing rules still hold: slashed addresses, UTC dates, one origin, unoptimised images, tokens, owner-only panel (§5.12)", async ({ browser }) => {
  const base = baseUrlOf();
  await blank(base);
  try {
    // trailingSlash: the three places agree and an unslashed address redirects to the slashed one.
    expect(read("next.config.ts")).toContain("trailingSlash: true");
    expect(JSON.parse(read("vercel.json")).trailingSlash).toBe(true);
    expect(read("src/lib/site.ts")).toContain("needsSlash");
    const redirect = await withRequest(base, async (request) => request.get("/blog", { maxRedirects: 0 }));
    expect([301, 307, 308]).toContain(redirect.status());
    expect(redirect.headers()["location"] ?? "").toMatch(/\/blog\/$/);
    // One origin constant and unoptimised images.
    expect(read("next.config.ts")).toContain("unoptimized: true");
    expect(git(["grep", "-n", "-F", ORIGIN, "--", "src"]).out.split("\n").filter(Boolean).map((l) => l.split(":")[0])).toEqual(["src/lib/site.ts"]);
    // Theme tokens only: no dark: variants in the app.
    expect(git(["grep", "-n", "-E", "\\bdark:", "--", "src"]).out).toBe("");
    // UTC dates: a post dated 2026-05-15 shows that day for visitors on either side of UTC.
    await ownerSend(base, "post", "/api/admin/blog-posts/", POST("Date Check", "Excerpt", "2026-05-15", "date-check", "Body.\n"));
    await ownerPublish(base);
    await pollText(base, "/blog/date-check/", (t) => t.includes("Body."));
    await pollText(base, "/blog/", (t) => t.includes("Date Check"));
    await settle(base, ["/blog/", "/blog/date-check/"]);
    for (const timezoneId of ["Pacific/Kiritimati", "Pacific/Pago_Pago"]) {
      const context = await browser.newContext({ baseURL: base, timezoneId });
      try {
        const page = await context.newPage();
        await page.goto("/blog/");
        expect(await page.locator("main#main-content").textContent(), timezoneId).toContain("15 May 2026");
        await page.goto("/blog/date-check/");
        expect(await page.locator("main#main-content").textContent(), timezoneId).toContain("15 May 2026");
      } finally {
        await context.close();
      }
    }
    // The panel stays owner-only.
    const signedOut = await withRequest(base, async (request) => request.get("/api/admin/projects/", { maxRedirects: 0 }));
    expect(signedOut.status()).toBe(401);
    const other = await withRequest(base, async (request) => request.get("/api/admin/projects/", { headers: { cookie: await cookieOf(OTHER()) }, maxRedirects: 0 }));
    expect(other.status()).toBe(403);
    const stranger = await visit(browser, base, PANEL, await cookieOf(OTHER()));
    try {
      expect(await bodyText(stranger.page)).toContain("This account is not allowed to use the admin panel.");
      await expect(stranger.page.getByRole("button", { name: "Publish", exact: true })).toHaveCount(0);
    } finally {
      await stranger.context.close();
    }
  } finally {
    await blank(base);
  }
});
