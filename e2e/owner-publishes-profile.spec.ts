import fs from "node:fs";
import path from "node:path";
import { expect, request as playwrightRequest, test, type APIRequestContext, type Page } from "@playwright/test";
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

    for (const id of ["experience", "projects", "certifications"]) {
      expect(await page.locator("section#" + id).count()).toBeGreaterThanOrEqual(1);
    }
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
