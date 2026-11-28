import fs from "node:fs";
import path from "node:path";
import { expect, request as playwrightRequest, test, type APIRequestContext, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { encode } from "next-auth/jwt";

test.describe.configure({ mode: "default" });
test.setTimeout(150000);

// The tests of this file share one stand-in database file, so every test starts by resetting it.

const STAND_IN_PREFIX = "stand-in:";
const DB_URL = process.env.SUPABASE_DB_URL ?? "";
const DB_FILE = DB_URL.startsWith(STAND_IN_PREFIX) ? DB_URL.slice(STAND_IN_PREFIX.length) : "";

function dbReset(): void {
  if (DB_FILE !== "" && fs.existsSync(DB_FILE)) fs.rmSync(DB_FILE, { force: true });
}

const PUBLISH = "/api/admin/publish/";
const SESSION_COOKIE = "authjs.session-token";
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

async function ownerPost(request: APIRequestContext, options: { data?: string; json?: boolean } = {}) {
  const headers: Record<string, string> = { cookie: await cookieOf(OWNER()) };
  if (options.json) headers["content-type"] = "application/json";
  return request.post(PUBLISH, { headers, data: options.data, maxRedirects: 0 });
}

test("E2E-09: the publish route checks the owner first, reads once, and invalidates only the landing page", async () => {
  const source = fs.readFileSync(path.join(process.cwd(), "src/app/api/admin/publish/route.ts"), "utf8");

  expect(source).toContain("export async function POST");
  expect(source.split("revalidatePath(").length - 1).toBe(1);
  expect(source).toContain('revalidatePath("/")');

  const panel = source.indexOf("getPanelState(");
  const load = source.indexOf("loadProfile(");
  const revalidate = source.indexOf("revalidatePath(");
  expect(panel).toBeGreaterThanOrEqual(0);
  expect(panel).toBeLessThan(load);
  expect(load).toBeLessThan(revalidate);

  const forbidden = [
    "fetch(",
    "http",
    "process." + "env",
    "request.",
    "cookies(",
    "headers(",
    "export async function GET",
    "export async function PUT",
  ];
  for (const text of forbidden) expect(source, "must not contain " + text).not.toContain(text);
});

test("E2E-19: the owner can publish and the reply is not cached", async ({ baseURL }) => {
  dbReset();
  const request = await playwrightRequest.newContext({ baseURL });
  try {
    const response = await ownerPost(request);
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ published: true });
    expect(response.headers()["cache-control"]).toContain("no-store");
  } finally {
    await request.dispose();
  }
});

test("E2E-20: publish takes no input and no other method", async ({ baseURL }) => {
  dbReset();
  const request = await playwrightRequest.newContext({ baseURL });
  try {
    const ownerGet = await request.get(PUBLISH, { headers: { cookie: await cookieOf(OWNER()) }, maxRedirects: 0 });
    expect(ownerGet.status()).toBe(405);
    const ownerGetBody = await ownerGet.text();
    expect(ownerGetBody).not.toContain("Keith");
    expect(ownerGetBody).not.toContain("published");

    const withBody = await ownerPost(request, { data: JSON.stringify({ unexpected: true }), json: true });
    expect(withBody.status()).toBe(200);
    expect(await withBody.json()).toEqual({ published: true });

    const withBadBody = await ownerPost(request, { data: "not json {", json: true });
    expect(withBadBody.status()).toBe(200);
    expect(await withBadBody.json()).toEqual({ published: true });

    const anonymousGet = await request.get(PUBLISH, { maxRedirects: 0 });
    expect(anonymousGet.status()).toBe(405);
    const anonymousBody = await anonymousGet.text();
    expect(anonymousBody).not.toContain("Keith");
    expect(anonymousBody).not.toContain("published");
  } finally {
    await request.dispose();
  }
});

// ---- Step 2: the landing page reads the published profile ----

const PROFILE = "/api/admin/profile/";
const S1 = {
  name: "Keith Lim",
  headline: "Software Engineer",
  about: ["First paragraph.", "Second paragraph."],
  photo: "",
  email: "hello@example.com",
  resumeLink: "",
  socialLinks: [{ label: "GitHub", url: "https://github.com/example" }],
};
type Profile = typeof S1;

const baseUrlOf = (): string => String(test.info().project.use.baseURL ?? "http://localhost:3100");
const OTHER = (): Claims => ({ sub: "other-1", email: "mallory@example.test", name: "Mallory Intruder", emailVerified: true });

async function withOwner<T>(base: string, run: (request: APIRequestContext) => Promise<T>): Promise<T> {
  const request = await playwrightRequest.newContext({ baseURL: base });
  try {
    return await run(request);
  } finally {
    await request.dispose();
  }
}

async function save(base: string, body: Profile): Promise<void> {
  await withOwner(base, async (request) => {
    const response = await request.put(PROFILE, {
      headers: { cookie: await cookieOf(OWNER()), "content-type": "application/json" },
      data: JSON.stringify(body),
      maxRedirects: 0,
    });
    expect(response.status()).toBe(200);
  });
}

async function publish(base: string): Promise<void> {
  await withOwner(base, async (request) => {
    const response = await ownerPost(request);
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ published: true });
  });
}

async function visitorText(base: string): Promise<string> {
  return withOwner(base, async (request) => (await request.get("/")).text());
}

async function waitFor(base: string, text: string): Promise<void> {
  await expect.poll(() => visitorText(base), { timeout: 60000 }).toContain(text);
}

async function blank(base: string): Promise<void> {
  dbReset();
  await publish(base);
  await expect.poll(() => visitorText(base), { timeout: 60000 }).not.toContain('id="hero"');
}

test.afterAll(async () => {
  await blank(baseUrlOf());
});

test("E2E-02: a saved and published profile appears on the landing page", async ({ baseURL, browser }) => {
  const base = String(baseURL);
  await blank(base);
  await save(base, S1);
  await publish(base);
  await waitFor(base, "Keith Lim");

  const context = await browser.newContext({ baseURL: base });
  const page = await context.newPage();
  try {
    await page.goto("/");
    const hero = page.locator("section#hero");
    await expect(hero.getByRole("heading", { level: 1, name: "Keith Lim", exact: true })).toBeVisible();
    await expect(hero).toContainText("Software Engineer");
    await expect(page.locator("section#about")).toContainText("First paragraph.");
    await expect(page.locator("section#about")).toContainText("Second paragraph.");
    await expect(hero.getByRole("link", { name: "GitHub" })).toHaveAttribute("href", "https://github.com/example");
    await expect(hero.locator('a[href="mailto:hello@example.com"]')).toHaveCount(1);
    await expect(page.getByRole("contentinfo")).toContainText("Keith Lim");
    await expect(page.locator('nav[aria-label="Main navigation"]').getByRole("link", { name: "About" })).toHaveCount(1);
  } finally {
    await context.close();
  }
});

test("E2E-04: with no published profile the page hides the personal parts and shows no error", async ({ baseURL, browser }) => {
  const base = String(baseURL);
  await blank(base);

  const context = await browser.newContext({ baseURL: base });
  const page: Page = await context.newPage();
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(String(error)));
  try {
    await page.goto("/");
    await expect(page.getByRole("contentinfo")).toBeVisible();
    await expect(page.locator("section#hero")).toHaveCount(0);
    await expect(page.locator("section#about")).toHaveCount(0);
    await expect(page.locator('nav[aria-label="Main navigation"]').getByRole("link", { name: "About" })).toHaveCount(0);

    const emptyHeadings = await page.evaluate(
      () => Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6")).filter((h) => (h as HTMLElement).innerText.trim() === "").length,
    );
    expect(emptyHeadings).toBe(0);
    const bodyText = await page.evaluate(() => document.body.innerText);
    expect(bodyText).not.toMatch(/error|could not|undefined|null/i);
    expect(errors).toEqual([]);

    const footer = page.getByRole("contentinfo");
    await expect(footer).toContainText("thegoldenpothos");
    await expect(footer).not.toContainText("Keith");
    await expect(page.getByRole("link", { name: "Blog", exact: true }).first()).toBeVisible();
  } finally {
    await context.close();
  }
});

test("E2E-05: nobody but the owner can publish, and a refused publish changes nothing", async ({ baseURL }) => {
  const base = String(baseURL);
  const cases = [
    { name: "signed-out + panel address", other: false, panel: true },
    { name: "signed-out + direct", other: false, panel: false },
    { name: "other + panel address", other: true, panel: true },
    { name: "other + direct", other: true, panel: false },
  ];
  for (const c of cases) {
    await blank(base);
    await save(base, { ...S1, name: "Keith Lim" });
    await publish(base);
    await waitFor(base, "Keith Lim");
    await save(base, { ...S1, name: "Keith L. Lim" });

    const headers: Record<string, string> = {};
    if (c.other) headers.cookie = await cookieOf(OTHER());
    if (c.panel) {
      headers.Origin = base;
      headers.Referer = base + "/bright-warm-greenhouse/";
    }
    const { status, text } = await withOwner(base, async (request) => {
      const r = await request.post(PUBLISH, { headers, maxRedirects: 0 });
      return { status: r.status(), text: await r.text() };
    });
    expect(status, c.name).toBe(c.other ? 403 : 401);
    expect(JSON.parse(text), c.name).toEqual({ error: c.other ? "not-allowed" : "not-signed-in" });
    for (const secret of ["Keith", "Software Engineer", "First paragraph.", "hello@example.com"]) {
      expect(text, c.name).not.toContain(secret);
    }

    for (let i = 0; i < 2; i++) {
      const page = await visitorText(base);
      expect(page, c.name).toContain("Keith Lim");
      expect(page, c.name).not.toContain("Keith L. Lim");
    }
    const stored = JSON.parse(fs.readFileSync(DB_FILE, "utf8")) as { profile?: { name?: string } };
    expect(stored.profile?.name, c.name).toBe("Keith L. Lim");
  }
});

test("E2E-10: each contact link gets its icon by exact host name", async ({ baseURL, browser }) => {
  const base = String(baseURL);
  await blank(base);
  await save(base, {
    name: "Keith Lim",
    headline: "Software Engineer",
    about: [],
    photo: "",
    email: "hello@example.com",
    resumeLink: "/resume.pdf",
    socialLinks: [
      { label: "GH", url: "https://github.com/example" },
      { label: "LI", url: "https://linkedin.com/in/example" },
      { label: "LI2", url: "https://www.linkedin.com/in/example" },
      { label: "Site", url: "https://example.org/x" },
      { label: "Fake", url: "https://github.com.example.org/x" },
      { label: "", url: "https://example.net/p" },
    ],
  });
  await publish(base);
  await waitFor(base, "Keith Lim");

  const context = await browser.newContext({ baseURL: base });
  const page = await context.newPage();
  try {
    await page.goto("/");
    const hero = page.locator("section#hero");
    await expect(hero.locator('a[aria-label="GH"] svg.lucide-github')).toHaveCount(1);
    await expect(hero.locator('a[aria-label="LI"] svg.lucide-linkedin')).toHaveCount(1);
    await expect(hero.locator('a[aria-label="LI2"] svg.lucide-linkedin')).toHaveCount(1);
    await expect(hero.locator('a[aria-label="Site"] svg.lucide-link')).toHaveCount(1);
    await expect(hero.locator('a[aria-label="Fake"] svg.lucide-link')).toHaveCount(1);
    await expect(hero.locator('a[aria-label="Fake"] svg.lucide-github')).toHaveCount(0);
    await expect(hero.locator('a[aria-label="example.net"] svg.lucide-link')).toHaveCount(1);
    await expect(hero.locator('a[aria-label="Send email"] svg.lucide-mail')).toHaveCount(1);
    await expect(hero.locator('a[aria-label="Download resume"] svg.lucide-file-text')).toHaveCount(1);
  } finally {
    await context.close();
  }
});

test("E2E-11: a profile with only a name and headline hides every empty part", async ({ baseURL, browser }) => {
  const base = String(baseURL);
  await blank(base);
  await save(base, { name: "Keith Lim", headline: "Software Engineer", about: [], photo: "", email: "", resumeLink: "", socialLinks: [] });
  await publish(base);
  await waitFor(base, "Keith Lim");

  const context = await browser.newContext({ baseURL: base });
  const page = await context.newPage();
  try {
    await page.goto("/");
    await expect(page.locator("section#hero")).toBeVisible();
    await expect(page.locator("section#hero").getByRole("heading", { level: 1, name: "Keith Lim" })).toBeVisible();
    await expect(page.locator("section#about")).toHaveCount(0);
    await expect(page.locator('img[alt^="Portrait"]')).toHaveCount(0);
    await expect(page.locator('a[href^="mailto:"]')).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Download resume" })).toHaveCount(0);
    await expect(page.locator("section#hero a[aria-label]")).toHaveCount(0);
    await expect(page.locator("footer a")).toHaveCount(0);
    await expect(page.locator('a[href="#about"]')).toHaveCount(0);
    await expect(page.locator('button[aria-label="Scroll to About section"]')).toHaveCount(0);
    await expect(page.getByRole("contentinfo")).toContainText("Keith Lim");
  } finally {
    await context.close();
  }
});

test("E2E-12: the photo, paragraph order and contact row follow what was saved", async ({ baseURL, browser }) => {
  const base = String(baseURL);
  await blank(base);
  await save(base, {
    name: "Keith Lim",
    headline: "Software Engineer",
    about: ["Zeta first.", "Alpha second.", "Mid third."],
    photo: "/images/keith.jpg",
    email: "hello@example.com",
    resumeLink: "/resume.pdf",
    socialLinks: [
      { label: "LinkedIn", url: "https://www.linkedin.com/in/example" },
      { label: "GitHub", url: "https://github.com/example" },
    ],
  });
  await publish(base);
  await waitFor(base, "Keith Lim");

  const context = await browser.newContext({ baseURL: base });
  const page = await context.newPage();
  try {
    await page.goto("/");
    await expect(page.locator('section#about img[alt="Portrait of Keith Lim"]')).toHaveAttribute("src", /\/images\/keith\.jpg/);
    expect(await page.locator("section#about p").allTextContents()).toEqual(["Zeta first.", "Alpha second.", "Mid third."]);
    const hero = page.locator("section#hero");
    const labels = await hero.locator("a[aria-label]").evaluateAll((links) => links.map((a) => a.getAttribute("aria-label")));
    expect(labels).toEqual(["LinkedIn", "GitHub", "Send email", "Download resume"]);
    const resume = hero.getByRole("link", { name: "Download resume" });
    await expect(resume).toHaveAttribute("href", "/resume.pdf");
    expect(await resume.getAttribute("target")).toBeNull();
    await expect(hero.getByRole("link", { name: "Send email" })).toHaveAttribute("href", "mailto:hello@example.com");
    const linkedin = hero.getByRole("link", { name: "LinkedIn" });
    await expect(linkedin).toHaveAttribute("target", "_blank");
    await expect(linkedin).toHaveAttribute("rel", /noopener/);
    expect(await page.locator('a[href="#about"]').count()).toBeGreaterThanOrEqual(2);
  } finally {
    await context.close();
  }
});

test("E2E-13: long words wrap and nothing passes a 375 pixel screen", async ({ baseURL, browser }) => {
  const base = String(baseURL);
  await blank(base);
  await save(base, {
    name: "W".repeat(80),
    headline: "H".repeat(120),
    about: ["P".repeat(300)],
    photo: "",
    email: "",
    resumeLink: "",
    socialLinks: [],
  });
  await publish(base);
  await waitFor(base, "WWWWWWWWWW");

  const context = await browser.newContext({ baseURL: base, viewport: { width: 375, height: 800 } });
  const page = await context.newPage();
  try {
    await page.goto("/");
    const targets = [
      page.getByRole("heading", { level: 1 }),
      page.locator("section#hero").getByText("H".repeat(120), { exact: true }),
      page.locator("section#about p", { hasText: "P".repeat(300) }),
    ];
    for (const target of targets) {
      const box = await target.first().boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(375);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  } finally {
    await context.close();
  }
});

test("E2E-14: the page is a kept copy, the same for every visitor, with no secret in it", async ({ baseURL }) => {
  const base = String(baseURL);
  await blank(base);
  await save(base, S1);
  await publish(base);
  await waitFor(base, "Keith Lim");

  await withOwner(base, async (request) => {
    const first = await request.get("/");
    const second = await request.get("/");
    expect(first.headers()["set-cookie"]).toBeUndefined();
    expect(second.headers()["set-cookie"]).toBeUndefined();
    expect(second.headers()["x-nextjs-cache"]).toBe("HIT");
    const anonymous = await second.text();

    const owner = await request.get("/", { headers: { cookie: await cookieOf(OWNER()) } });
    expect(owner.headers()["set-cookie"]).toBeUndefined();
    expect(await owner.text()).toBe(anonymous);

    const texts = [anonymous];
    const sources = Array.from(anonymous.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)).map((m) => m[1]);
    for (const src of sources) {
      if (/^(https?:)?\/\//.test(src) && !src.startsWith(base)) continue;
      texts.push(await (await request.get(src)).text());
    }
    const forbidden = [
      setting("ADMIN_EMAIL"),
      setting("AUTH_SECRET"),
      "SUPABASE",
      "supabase",
      "postgres",
      "stand-in:",
      "/api/admin",
      "bright-warm-greenhouse",
    ];
    for (const text of texts) {
      for (const word of forbidden) {
        if (word !== "") expect(text, "must not contain " + word).not.toContain(word);
      }
    }
  });
});

test("E2E-21: the landing page sources hold no old content and keep the kept-copy rules", async () => {
  const files = ["hero.tsx", "aboutme.tsx", "footer.tsx", "header.tsx"].map((f) => "src/app/components/" + f);
  files.push("src/app/page.tsx");
  const old = [
    "keefhub",
    "limy0313",
    "keith@example.com",
    "yylim-keith",
    "Software engineer by profession",
    "my name is Keith",
    "/profile/placeholder.jpg",
    "Keith Lim",
    "plant lover",
  ];
  for (const file of files) {
    const source = fs.readFileSync(path.join(process.cwd(), file), "utf8");
    for (const text of old) expect(source, file + " must not contain " + text).not.toContain(text);
    for (const text of ["@/lib/auth", "cookies(", "headers("]) expect(source, file + " must not contain " + text).not.toContain(text);
  }
  const page = fs.readFileSync(path.join(process.cwd(), "src/app/page.tsx"), "utf8");
  expect(page).toContain("export const revalidate = false");
  expect(page.split("revalidate").length - 1).toBe(1);
});

// ---- Step 3: the Publish button in the panel ----

const PANEL = "/bright-warm-greenhouse/";
const PUBLISHED_TEXT = "Published. Visitors will see the changes within a minute.";
const FAILED_TEXT = "The site could not be published because the database could not be reached. Try again later.";

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

async function panelContext(browser: Browser, base: string, claims?: Claims): Promise<BrowserContext> {
  const context = await browser.newContext({ baseURL: base });
  if (claims) {
    const [name, ...rest] = (await cookieOf(claims)).split("=");
    await context.addCookies([{ name, value: rest.join("="), url: base }]);
  }
  return context;
}

async function openPanel(browser: Browser, base: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await panelContext(browser, base, OWNER());
  const page = await context.newPage();
  await page.goto(PANEL);
  return { context, page };
}

const publishButton = (page: Page) => page.getByRole("button", { name: "Publish", exact: true });

test("E2E-01: pressing Publish in the panel shows the published message", async ({ baseURL, browser }) => {
  const base = String(baseURL);
  await blank(base);
  await save(base, S1);
  const { context, page } = await openPanel(browser, base);
  try {
    await publishButton(page).click();
    await expect(page.getByRole("status").filter({ hasText: "Published." })).toHaveText(PUBLISHED_TEXT);
    await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test("E2E-03: a saved change stays hidden until Publish, then appears", async ({ baseURL, browser }) => {
  const base = String(baseURL);
  await blank(base);
  await save(base, S1);
  await publish(base);
  await waitFor(base, "Software Engineer");
  await save(base, { ...S1, headline: "Staff Engineer" });

  const visitorContext = await browser.newContext({ baseURL: base });
  const visitorPage = await visitorContext.newPage();
  try {
    await visitorPage.goto("/");
    let text = await visitorPage.evaluate(() => document.documentElement.outerHTML);
    expect(text).toContain("Software Engineer");
    expect(text).not.toContain("Staff Engineer");
    await visitorPage.reload();
    text = await visitorPage.evaluate(() => document.documentElement.outerHTML);
    expect(text).toContain("Software Engineer");
    expect(text).not.toContain("Staff Engineer");
  } finally {
    await visitorContext.close();
  }

  const { context, page } = await openPanel(browser, base);
  try {
    await publishButton(page).click();
    await expect(page.getByRole("status").filter({ hasText: "Published." })).toHaveText(PUBLISHED_TEXT);
  } finally {
    await context.close();
  }
  await waitFor(base, "Staff Engineer");
  const html = await visitorText(base);
  const hero = html.slice(html.indexOf('id="hero"'));
  const heroSection = hero.slice(0, hero.indexOf("</section>"));
  expect(heroSection).not.toContain("Software Engineer");
});

test("E2E-06: a failed publish says so, leaks nothing and changes nothing; a retry works", async ({ baseURL, browser }) => {
  const base = String(baseURL);
  await blank(base);
  await save(base, { ...S1 });
  await publish(base);
  await waitFor(base, "Keith Lim");
  await save(base, { ...S1, name: "Keith L. Lim" });

  const { context, page } = await openPanel(browser, base);
  try {
    dbBreak();
    await publishButton(page).click();
    await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toHaveText(FAILED_TEXT);
    await expect(page.getByText("Published.")).toHaveCount(0);
    const panelText = await page.evaluate(() => document.body.innerText);
    for (const secret of ["ECONNREFUSED", "10.1.2.3", "password-marker-standin", setting("ADMIN_EMAIL"), setting("AUTH_SECRET")]) {
      if (secret !== "") expect(panelText).not.toContain(secret);
    }
    await expect(publishButton(page)).toBeEnabled();

    dbFix();
    const html = await visitorText(base);
    expect(html).toContain("Keith Lim");
    expect(html).not.toContain("Keith L. Lim");

    await publishButton(page).click();
    await expect(page.getByRole("status").filter({ hasText: "Published." })).toHaveText(PUBLISHED_TEXT);
    await waitFor(base, "Keith L. Lim");
  } finally {
    await context.close();
  }
});

test("E2E-07: a double press sends one request and the button is disabled while it runs", async ({ baseURL, browser }) => {
  const base = String(baseURL);
  await blank(base);
  await save(base, S1);
  const { context, page } = await openPanel(browser, base);
  try {
    let posts = 0;
    await page.route("**/api/admin/publish/", async (route) => {
      if (route.request().method() === "POST") {
        posts += 1;
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
      await route.continue();
    });
    await publishButton(page).dblclick();
    await expect(page.getByRole("status").filter({ hasText: "Publishing…" })).toHaveText("Publishing…");
    await expect(publishButton(page)).toBeDisabled();
    await expect(page.getByText(PUBLISHED_TEXT)).toHaveCount(1);
    await expect(page.getByText("Publishing…")).toHaveCount(0);
    await expect(publishButton(page)).toBeEnabled();
    expect(posts).toBe(1);
  } finally {
    await context.close();
  }
});

test("E2E-15: a lost connection shows the failure message and re-enables the button", async ({ baseURL, browser }) => {
  const base = String(baseURL);
  await blank(base);
  await save(base, S1);
  const { context, page } = await openPanel(browser, base);
  try {
    await page.route("**/api/admin/publish/", (route) => route.abort());
    await publishButton(page).click();
    await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toHaveText(FAILED_TEXT);
    await expect(page.getByText("Published.")).toHaveCount(0);
    await expect(publishButton(page)).toBeEnabled();
  } finally {
    await context.close();
  }
});

test("E2E-16: the Publish button works from the keyboard and shows a focus outline", async ({ baseURL, browser }) => {
  const base = String(baseURL);
  await blank(base);
  await save(base, S1);
  const { context, page } = await openPanel(browser, base);
  try {
    await expect(publishButton(page)).toBeVisible();
    let focused = false;
    for (let i = 0; i < 15 && !focused; i++) {
      await page.keyboard.press("Tab");
      focused = await page.evaluate(() => {
        const el = document.activeElement;
        return el !== null && el.tagName === "BUTTON" && (el.textContent ?? "").trim() === "Publish";
      });
    }
    expect(focused).toBe(true);
    await expect(publishButton(page)).toBeFocused();
    const outline = await publishButton(page).evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(outline).not.toBe("none");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("status").filter({ hasText: "Published." })).toHaveText(PUBLISHED_TEXT);
  } finally {
    await context.close();
  }
});

test("E2E-17: the Publish button sources use theme tokens and no raw colour", async () => {
  const button = fs.readFileSync(path.join(process.cwd(), "src/app/components/admin/PublishButton.tsx"), "utf8");
  const lib = fs.readFileSync(path.join(process.cwd(), "src/lib/admin/publish.ts"), "utf8");
  for (const source of [button, lib]) {
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(source).not.toMatch(/\b(rgb|rgba|hsl|hsla|oklch)\(/);
  }
  expect(button.includes("var(--") || /import\s*\{[^}]*buttonStyle[^}]*\}\s*from\s*["']\.\/formParts["']/.test(button)).toBe(true);
});

test("E2E-18: only the signed-in owner sees the Publish button, on every screen", async ({ baseURL, browser }) => {
  const base = String(baseURL);
  await blank(base);
  const { context, page } = await openPanel(browser, base);
  try {
    await expect(publishButton(page)).toHaveCount(1);
    const menu = page.getByRole("navigation", { name: "Admin sections" });
    for (const label of ["Profile", "Images", "Blog posts"]) {
      await menu.getByRole("button", { name: label, exact: true }).click();
      await expect(publishButton(page)).toHaveCount(1);
    }
  } finally {
    await context.close();
  }

  const anonymous = await panelContext(browser, base);
  try {
    const anonymousPage = await anonymous.newPage();
    await anonymousPage.goto(PANEL);
    await expect(anonymousPage.getByText("Sign in with Google").first()).toBeVisible();
    await expect(publishButton(anonymousPage)).toHaveCount(0);
  } finally {
    await anonymous.close();
  }

  const other = await panelContext(browser, base, OTHER());
  try {
    const otherPage = await other.newPage();
    await otherPage.goto(PANEL);
    await expect(otherPage.getByText("This account is not allowed to use the admin panel.")).toBeVisible();
    await expect(publishButton(otherPage)).toHaveCount(0);
  } finally {
    await other.close();
  }
});

// ---- Step 4: earlier specs and standing documents ----

const readText = (file: string): string => fs.readFileSync(path.join(process.cwd(), file), "utf8");

test("E2E-22: the standing documents describe the kept-copy rule", async () => {
  const claude = readText("CLAUDE.md");
  const reference = readText("Reference.md");
  const overview = readText("docs/features/OVERVIEW.md");

  for (const text of [
    "/api/admin/publish/",
    "src/app/api/admin/publish/route.ts",
    "last good copy",
    "revalidatePath",
    "The blog posts are stored in Supabase",
    "the experience entries and the projects",
    "The certifications are stored in Supabase",
    "The tech stack is stored in Supabase",
    "The site reads seven settings by name",
    "/api/auth/callback/google",
    "stand-in:",
    "src/lib/server/",
    "src/app/api/admin/**",
    "createListService",
    "createHttpListStore",
    "/api/admin/images/",
    "/api/admin/images/upload/",
    "/api/admin/profile/",
    ...["experience", "projects", "certifications", "tech-stack", "blog-posts", "blog-posts/published"].flatMap((route) => [
      "/api/admin/" + route + "/",
      "src/app/api/admin/" + route + "/route.ts",
    ]),
    ...[
      "AUTH_SECRET",
      "AUTH_GOOGLE_ID",
      "AUTH_GOOGLE_SECRET",
      "ADMIN_EMAIL",
      "SUPABASE_DB_URL",
      "SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
    ],
  ]) {
    expect(claude, "CLAUDE.md must contain " + text).toContain(text);
  }
  for (const text of [
    "Every public route is prerendered at build time",
    "No middleware, no ISR",
    "public pages prerendered with only sign-in and the panel on a server",
    "Leftover rules",
  ]) {
    expect(claude, "CLAUDE.md must not contain " + text).not.toContain(text);
  }

  expect(reference).toContain("PublishButton");
  expect(reference).toContain("/api/admin/publish/");
  expect(reference).not.toContain("no middleware, no ISR");

  const item1 = overview.split("\n").find((line) => line.startsWith("1. Public pages"));
  expect(item1, "OVERVIEW section 2 item 1 line").toBeDefined();
  expect(item1).toContain("last good copy");
  expect(item1).not.toContain("no other feature may require a server, API route, middleware or request-time rendering");
});

test("E2E-24: the earlier specs no longer depend on the hard-coded landing page", async () => {
  const forbidden = [
    "Software engineer by profession, but a plant lover",
    'getByRole("heading", { level: 1, name: "Keith Lim", exact: true })',
  ];
  for (const file of [
    "e2e/site-smoke.spec.ts",
    "e2e/hosting-and-backend-migration-acceptance.spec.ts",
    "e2e/retire-firebase.spec.ts",
    "e2e/owner-edits-profile.spec.ts",
  ]) {
    const text = readText(file);
    for (const phrase of forbidden) expect(text, file + " must not contain " + phrase).not.toContain(phrase);
  }

  const removed = [
    "src/app/page.tsx",
    "src/app/components/hero.tsx",
    "src/app/components/aboutme.tsx",
    "src/app/components/footer.tsx",
    "src/app/components/header.tsx",
  ];
  const arrayAfter = (text: string, marker: string): string => {
    const start = text.indexOf(marker);
    expect(start, marker + " is present").toBeGreaterThanOrEqual(0);
    return text.slice(start, text.indexOf("];", start));
  };
  const sources = arrayAfter(readText("e2e/hosting-and-backend-migration-acceptance.spec.ts"), "const sources = [");
  const publicSources = arrayAfter(readText("e2e/retire-firebase.spec.ts"), "const PUBLIC_SOURCES = [");
  for (const entry of removed) {
    expect(sources, "sources must not contain " + entry).not.toContain('"' + entry + '"');
    expect(publicSources, "PUBLIC_SOURCES must not contain " + entry).not.toContain('"' + entry + '"');
  }

  for (const file of [
    "e2e/owner-edits-profile.spec.ts",
    "e2e/owner-uploads-images.spec.ts",
    "e2e/owner-manages-experience.spec.ts",
    "e2e/owner-manages-projects.spec.ts",
    "e2e/owner-manages-certifications.spec.ts",
    "e2e/owner-manages-tech-stack.spec.ts",
    "e2e/owner-manages-blog-posts.spec.ts",
    "e2e/hosting-and-backend-migration-acceptance.spec.ts",
  ]) {
    const lines = readText(file).split("\n");
    const rules = lines
      .map((line, index) => ({ line, index }))
      .filter(
        ({ line }) =>
          (line.includes('startsWith("src/app/api/admin/")') || line.includes(':(exclude)src/app/api/admin"')) &&
          (line.includes("lib/server") || line.includes("SERVER_PATH")),
      );
    expect(rules.length, file + " holds a lib/server mention rule").toBeGreaterThan(0);
    for (const { index } of rules) {
      const near = lines.slice(Math.max(0, index - 3), index + 4).join("\n");
      expect(near, file + " line " + (index + 1) + " allows src/app/page.tsx").toContain("src/app/page.tsx");
    }
  }
});
