import fs from "node:fs";
import path from "node:path";
import { expect, request as playwrightRequest, test, type APIRequestContext, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { encode } from "next-auth/jwt";

test.describe.configure({ mode: "default" });
test.setTimeout(150000);

// The tests of this file share one stand-in database file and one kept copy, so every test starts with blank().

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
const CERTS_API = "/api/admin/certifications/";
const EXPERIENCE_API = "/api/admin/experience/";
const PANEL = "/bright-warm-greenhouse/";
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

async function ownerPost(request: APIRequestContext) {
  return request.post(PUBLISH, { headers: { cookie: await cookieOf(OWNER()) }, maxRedirects: 0 });
}

const baseUrlOf = (): string => String(test.info().project.use.baseURL ?? "http://localhost:3100");

async function withOwner<T>(base: string, run: (request: APIRequestContext) => Promise<T>): Promise<T> {
  const request = await playwrightRequest.newContext({ baseURL: base });
  try {
    return await run(request);
  } finally {
    await request.dispose();
  }
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

const CERT_HEADING = /<h2[^>]*>Certifications<\/h2>/;

async function blank(base: string): Promise<void> {
  dbReset();
  await publish(base);
  await expect.poll(async () => CERT_HEADING.test(await visitorText(base)), { timeout: 60000 }).toBe(false);
}

type CertContent = { name: string; icon: string; url: string };
type ExperienceContent = { year: string; title: string; company: string; duration: string; description: string; details: string[] };

async function addCert(base: string, content: CertContent, position: number): Promise<string> {
  return withOwner(base, async (request) => {
    const response = await request.post(CERTS_API, {
      headers: { cookie: await cookieOf(OWNER()), "content-type": "application/json" },
      data: JSON.stringify({ position, content }),
      maxRedirects: 0,
    });
    expect(response.status()).toBe(200);
    const body = (await response.json()) as { id: string };
    return body.id;
  });
}

async function editCert(base: string, id: string, content: CertContent): Promise<void> {
  await withOwner(base, async (request) => {
    const response = await request.put(CERTS_API + "?id=" + id, {
      headers: { cookie: await cookieOf(OWNER()), "content-type": "application/json" },
      data: JSON.stringify({ content }),
      maxRedirects: 0,
    });
    expect(response.status()).toBe(200);
  });
}

async function addExperience(base: string, content: ExperienceContent, position: number): Promise<void> {
  await withOwner(base, async (request) => {
    const response = await request.post(EXPERIENCE_API, {
      headers: { cookie: await cookieOf(OWNER()), "content-type": "application/json" },
      data: JSON.stringify({ position, content }),
      maxRedirects: 0,
    });
    expect(response.status()).toBe(200);
  });
}

async function openPanel(browser: Browser, base: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ baseURL: base });
  const [name, ...rest] = (await cookieOf(OWNER())).split("=");
  await context.addCookies([{ name, value: rest.join("="), url: base }]);
  const page = await context.newPage();
  await page.goto(PANEL);
  return { context, page };
}

const publishButton = (page: Page) => page.getByRole("button", { name: "Publish", exact: true });

async function openCertifications(page: Page): Promise<void> {
  await page.goto(PANEL);
  const choose = page.getByRole("navigation", { name: "Admin sections" }).getByRole("button", { name: "Certifications", exact: true });
  const heading = page.getByRole("heading", { level: 2, name: "Certifications", exact: true });
  await expect(async () => {
    await choose.click({ timeout: 5000 });
    await expect(heading).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 15000 });
}

const panelItem = (page: Page, text: string) =>
  page.getByRole("list", { name: "Certifications list" }).getByRole("listitem").filter({ hasText: text });

const nameHtml = (name: string): string => ">" + name + "</p>";

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const SCRUM: CertContent = {
  name: "Professional Scrum Developer",
  icon: "/certs/scrum.png",
  url: "https://www.credly.com/badges/7d656748-f230-421f-992b-2af88ce8c022/public_url",
};
const GOOGLE: CertContent = {
  name: "Google IT Automation with Python",
  icon: "/certs/google-python.png",
  url: "https://www.coursera.org/account/accomplishments/specialization/certificate/DGLR364HW5KZ",
};
const CHAIN: CertContent = {
  name: "Certified Blockchain Developer",
  icon: "/certs/blockchain.png",
  url: "https://www.credential.net/04477db6-317c-456a-8894-ca7793d41df1#acc.pvAY1jq4",
};
const UPLOADED = "https://stand-in.invalid/storage/v1/object/public/images/55555555-5555-4555-8555-555555555555.png";
const ENGINEER: ExperienceContent = { year: "2026", title: "Engineer", company: "Acme Pte Ltd", duration: "Sep 2025 - Present", description: "Ships features.", details: [] };

const SECTION = "section#certifications";
const CARDS = SECTION + " .grid > *";
const NAMES = SECTION + " .grid > * p";

const certHeading = (page: Page) => page.getByRole("heading", { level: 2, name: "Certifications", exact: true });
const mainMenu = (page: Page) => page.locator('nav[aria-label="Main navigation"]');

async function cardNames(page: Page): Promise<string[]> {
  return (await page.locator(NAMES).allTextContents()).map((text) => text.trim());
}

const readText = (file: string): string => fs.readFileSync(path.join(process.cwd(), file), "utf8");

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...filesUnder(full));
    else out.push(full);
  }
  return out;
}

test.afterAll(async () => {
  await blank(baseUrlOf());
});

test("E2E-01: a saved certification stays hidden until Publish, then the landing page shows it", async ({ baseURL, browser }) => {
  const base = String(baseURL);
  await blank(base);
  await addCert(base, SCRUM, 0);
  await addCert(base, CHAIN, 1);
  expect(await visitorText(base)).not.toContain("Professional Scrum Developer");

  const { context, page } = await openPanel(browser, base);
  try {
    await publishButton(page).click();
    await expect(page.getByRole("status").filter({ hasText: /Published\./ })).toBeVisible();
    await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toHaveCount(0);
  } finally {
    await context.close();
  }
  await waitFor(base, "Professional Scrum Developer");

  const visitor = await browser.newContext({ baseURL: base });
  const landing = await visitor.newPage();
  try {
    await landing.goto("/");
    await expect(certHeading(landing)).toBeVisible();
    expect(await cardNames(landing)).toEqual(["Professional Scrum Developer", "Certified Blockchain Developer"]);

    const links = landing.locator(SECTION + " a[href]");
    await expect(links).toHaveCount(2);
    await expect(links.nth(0)).toHaveAttribute("href", SCRUM.url);
    await expect(links.nth(1)).toHaveAttribute("href", CHAIN.url);
    for (let i = 0; i < 2; i++) {
      await expect(links.nth(i)).toHaveAttribute("target", "_blank");
      await expect(links.nth(i)).toHaveAttribute("rel", /noopener/);
    }

    const cards = landing.locator(CARDS);
    const badges = [
      { src: "/certs/scrum.png", alt: "Professional Scrum Developer certification badge" },
      { src: "/certs/blockchain.png", alt: "Certified Blockchain Developer certification badge" },
    ];
    for (let i = 0; i < 2; i++) {
      const card = cards.nth(i);
      await card.scrollIntoViewIfNeeded();
      const img = card.locator("img");
      await expect(img).toHaveCount(1);
      expect((await img.getAttribute("src")) ?? "").toMatch(new RegExp(badges[i].src.replace(/\./g, "\\.") + "$"));
      await expect(img).toHaveAttribute("alt", badges[i].alt);
      await expect.poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth), { timeout: 15000 }).toBeGreaterThan(0);
      expect((await card.textContent()) ?? "").toContain("View Credential");
    }

    await expect(mainMenu(landing).getByRole("link", { name: "Certifications" })).toHaveCount(1);
  } finally {
    await visitor.close();
  }
});

test("E2E-02: an uploaded badge shows on the landing page from its stored address", async ({ baseURL, browser }) => {
  const base = String(baseURL);
  await blank(base);
  await addCert(base, { ...GOOGLE, icon: UPLOADED }, 0);
  await publish(base);
  await waitFor(base, "Google IT Automation with Python");

  const context = await browser.newContext({ baseURL: base });
  const page = await context.newPage();
  try {
    await page.route("https://stand-in.invalid/**", (route) => route.fulfill({ status: 200, contentType: "image/png", body: PNG_1X1 }));
    await page.goto("/");
    const card = page.locator(CARDS);
    await expect(card).toHaveCount(1);
    await card.scrollIntoViewIfNeeded();
    const img = card.locator("img");
    await expect(img).toHaveCount(1);
    await expect(img).toHaveAttribute("src", UPLOADED);
    await expect(img).toHaveAttribute("alt", "Google IT Automation with Python certification badge");
    await expect.poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth), { timeout: 15000 }).toBe(1);
  } finally {
    await context.close();
  }
});

test("E2E-03: an edited certification changes for visitors only after Publish", async ({ baseURL, browser }) => {
  const base = String(baseURL);
  await blank(base);
  const id = await addCert(base, SCRUM, 0);
  await publish(base);
  await waitFor(base, "Professional Scrum Developer");
  await editCert(base, id, { ...SCRUM, name: "Professional Scrum Developer II" });

  for (let i = 0; i < 2; i++) {
    const text = await visitorText(base);
    expect(text).toContain(nameHtml("Professional Scrum Developer"));
    expect(text).not.toContain("Professional Scrum Developer II");
  }
  const first = await browser.newContext({ baseURL: base });
  const firstPage = await first.newPage();
  try {
    await firstPage.goto("/");
    expect(await cardNames(firstPage)).toEqual(["Professional Scrum Developer"]);
  } finally {
    await first.close();
  }

  await publish(base);
  await expect
    .poll(async () => (await visitorText(base)).includes(nameHtml("Professional Scrum Developer II")), { timeout: 60000 })
    .toBe(true);
  const after = await visitorText(base);
  expect(after).toContain(nameHtml("Professional Scrum Developer II"));
  expect(after).not.toContain(nameHtml("Professional Scrum Developer"));

  const second = await browser.newContext({ baseURL: base });
  const secondPage = await second.newPage();
  try {
    await secondPage.goto("/");
    expect(await cardNames(secondPage)).toEqual(["Professional Scrum Developer II"]);
  } finally {
    await second.close();
  }
});

test("E2E-04: a new order stays hidden until Publish, then visitors see it", async ({ baseURL, browser }) => {
  const base = String(baseURL);
  await blank(base);
  await addCert(base, SCRUM, 0);
  const idB = await addCert(base, CHAIN, 1);
  await publish(base);
  await waitFor(base, "Certified Blockchain Developer");
  await editCert(base, idB, { ...CHAIN, name: "Certified Blockchain Developer 2" });

  const { context, page } = await openPanel(browser, base);
  try {
    await openCertifications(page);
    await panelItem(page, "Certified Blockchain Developer 2").getByRole("button", { name: "Move up" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Order saved" })).toBeVisible();

    for (let i = 0; i < 2; i++) {
      const text = await visitorText(base);
      const scrum = text.indexOf(nameHtml("Professional Scrum Developer"));
      expect(scrum).toBeGreaterThanOrEqual(0);
      expect(scrum).toBeLessThan(text.indexOf(nameHtml("Certified Blockchain Developer")));
      expect(text).not.toContain("Certified Blockchain Developer 2");
    }
    await publishButton(page).click();
    await expect
      .poll(async () => (await visitorText(base)).includes(nameHtml("Certified Blockchain Developer 2")), { timeout: 60000 })
      .toBe(true);
  } finally {
    await context.close();
  }

  const visitor = await browser.newContext({ baseURL: base });
  const landing = await visitor.newPage();
  try {
    await landing.goto("/");
    expect(await cardNames(landing)).toEqual(["Certified Blockchain Developer 2", "Professional Scrum Developer"]);
    expect(await visitorText(base)).not.toContain(nameHtml("Certified Blockchain Developer"));
  } finally {
    await visitor.close();
  }
});

test("E2E-05: deleting every certification and publishing removes the section and its menu link but keeps the page", async ({ baseURL, browser }) => {
  const base = String(baseURL);
  await blank(base);
  await addExperience(base, ENGINEER, 0);
  await addCert(base, SCRUM, 0);
  await addCert(base, CHAIN, 1);
  await publish(base);
  await waitFor(base, "Certified Blockchain Developer");

  const { context, page } = await openPanel(browser, base);
  try {
    await openCertifications(page);
    for (const name of ["Professional Scrum Developer", "Certified Blockchain Developer"]) {
      await panelItem(page, name).getByRole("button", { name: "Delete" }).click();
      await page.getByRole("group", { name: "Confirm delete" }).getByRole("button", { name: "Confirm" }).click();
      await expect(page.getByRole("status").filter({ hasText: "Entry deleted" })).toBeVisible();
    }
    for (let i = 0; i < 2; i++) {
      const text = await visitorText(base);
      expect(text).toContain("Professional Scrum Developer");
      expect(text).toContain("Certified Blockchain Developer");
    }
    await publishButton(page).click();
    await expect.poll(async () => CERT_HEADING.test(await visitorText(base)), { timeout: 60000 }).toBe(false);
  } finally {
    await context.close();
  }

  const visitor = await browser.newContext({ baseURL: base });
  const landing = await visitor.newPage();
  try {
    await landing.goto("/");
    await expect(certHeading(landing)).toHaveCount(0);
    await expect(landing.locator(SECTION)).toHaveCount(0);
    await expect(mainMenu(landing).getByRole("link", { name: "Certifications" })).toHaveCount(0);
    await expect(mainMenu(landing).getByRole("link", { name: "Experience" })).toHaveCount(1);
    await expect(landing.locator("section#experience").getByRole("button", { name: "Engineer at Acme Pte Ltd" })).toHaveCount(1);
    await expect(landing.getByRole("contentinfo")).toBeVisible();
    const body = await landing.evaluate(() => document.body.innerText);
    expect(body).not.toContain("Professional Scrum Developer");
    expect(body).not.toContain("Certified Blockchain Developer");
  } finally {
    await visitor.close();
  }
});

test("E2E-06: with no certifications the page has no section, no menu link, no placeholder and no error", async ({ baseURL, browser }) => {
  const base = String(baseURL);
  await blank(base);
  const context = await browser.newContext({ baseURL: base });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.goto("/");
    await expect(certHeading(page)).toHaveCount(0);
    await expect(page.locator(SECTION)).toHaveCount(0);
    expect(await page.evaluate(() => document.querySelectorAll('[id="certifications"]').length)).toBe(0);
    const body = await page.evaluate(() => document.body.innerText);
    expect(body).not.toMatch(/Professional Scrum Developer|Google IT Automation with Python|Certified Blockchain Developer|View Credential/);
    expect(body).not.toMatch(/no certifications|coming soon|nothing to show/i);
    expect(CERT_HEADING.test(await visitorText(base))).toBe(false);
    await expect(mainMenu(page).getByRole("link", { name: "Certifications" })).toHaveCount(0);
    await expect(page.getByRole("contentinfo")).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

test("E2E-07: the phone menu offers Certifications only once one is published", async ({ baseURL, browser }) => {
  const base = String(baseURL);
  await blank(base);
  await addExperience(base, ENGINEER, 0);
  await publish(base);
  await waitFor(base, "Engineer");
  const context = await browser.newContext({ baseURL: base, viewport: { width: 375, height: 800 } });
  try {
    const first = await context.newPage();
    await first.goto("/");
    await first.getByRole("button", { name: "Open navigation menu" }).click();
    const menu = first.locator("#mobile-menu");
    await expect(menu.getByRole("link", { name: "Experience" })).toHaveCount(1);
    expect(await menu.getByRole("link", { name: "Certifications" }).count()).toBe(0);

    await addCert(base, SCRUM, 0);
    await publish(base);
    await waitFor(base, "Professional Scrum Developer");

    const second = await context.newPage();
    await second.goto("/");
    await second.getByRole("button", { name: "Open navigation menu" }).click();
    expect(await second.locator("#mobile-menu").getByRole("link", { name: "Certifications" }).count()).toBe(1);
  } finally {
    await context.close();
  }
});

test("E2E-08: names show as plain text and duplicates stay as they were saved", async ({ baseURL, browser }) => {
  const base = String(baseURL);
  await blank(base);
  await addCert(base, { name: "AWS <b>Cloud</b> & Co", icon: "/certs/scrum.png", url: SCRUM.url }, 0);
  await addCert(base, { name: "Duplicate Cert", icon: "/certs/google-python.png", url: GOOGLE.url }, 1);
  await addCert(base, { name: "Duplicate Cert", icon: "/certs/blockchain.png", url: CHAIN.url }, 2);
  await publish(base);
  await waitFor(base, "Duplicate Cert");

  const context = await browser.newContext({ baseURL: base });
  const page = await context.newPage();
  try {
    await page.goto("/");
    const cards = page.locator(CARDS);
    await expect(cards).toHaveCount(3);
    await expect(cards.first().locator("p")).toHaveText("AWS <b>Cloud</b> & Co");
    await expect(cards.first().locator("b")).toHaveCount(0);
    expect(await cardNames(page)).toEqual(["AWS <b>Cloud</b> & Co", "Duplicate Cert", "Duplicate Cert"]);
  } finally {
    await context.close();
  }
});

test("E2E-09: a very long unbroken name stays inside its card on a phone screen", async ({ baseURL, browser }) => {
  const base = String(baseURL);
  await blank(base);
  await addCert(base, { name: "Pneumonoultramicroscopicsilicovolcanoconiosis".repeat(2), icon: "/certs/scrum.png", url: SCRUM.url }, 0);
  await publish(base);
  await waitFor(base, "Pneumonoultramicroscopicsilicovolcanoconiosis");

  const context = await browser.newContext({ baseURL: base, viewport: { width: 375, height: 800 } });
  const page = await context.newPage();
  try {
    await page.goto("/");
    const card = page.locator(CARDS).first();
    await expect(card).toBeVisible();
    const fits = (el: Element) => el.scrollWidth <= el.clientWidth;
    expect(await card.evaluate(fits)).toBe(true);
    expect(await card.locator("p").first().evaluate(fits)).toBe(true);
    expect(await card.evaluate((el) => el.getBoundingClientRect().width)).toBeLessThanOrEqual(375);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  } finally {
    await context.close();
  }
});

test("E2E-10: unusable stored records are skipped and unsafe addresses never become links or images", async ({ baseURL, browser }) => {
  const base = String(baseURL);
  await blank(base);
  fs.writeFileSync(
    DB_FILE,
    JSON.stringify({
      certifications: [
        { id: "11111111-1111-4111-8111-111111111111", position: 0, data: {} },
        { id: "22222222-2222-4222-8222-222222222222", position: 1, data: { name: 7, icon: "/certs/scrum.png", url: SCRUM.url } },
        { id: "33333333-3333-4333-8333-333333333333", position: 2, data: { name: "No Link", icon: "badge.png", url: "http://insecure.example/x" } },
        { id: "44444444-4444-4444-8444-444444444444", position: 3, data: { name: "Script", icon: "//evil.example/x.png", url: "javascript:alert(1)" } },
        { id: "55555555-5555-4555-8555-555555555555", position: 4, data: { name: "Real Cert", icon: "/certs/scrum.png", url: SCRUM.url } },
      ],
    }),
  );
  await publish(base);
  await waitFor(base, "Real Cert");

  const context = await browser.newContext({ baseURL: base });
  const page = await context.newPage();
  try {
    await page.goto("/");
    const cards = page.locator(CARDS);
    await expect(cards).toHaveCount(3);
    expect(await cardNames(page)).toEqual(["No Link", "Script", "Real Cert"]);
    const links = page.locator(SECTION + " a[href]");
    await expect(links).toHaveCount(1);
    await expect(links.first()).toContainText("Real Cert");
    for (const index of [0, 1]) {
      await expect(cards.nth(index).locator("img")).toHaveCount(0);
      expect((await cards.nth(index).textContent()) ?? "").not.toContain("View Credential");
    }
    await expect(cards.nth(2).locator("img")).toHaveCount(1);
    expect(await visitorText(base)).not.toContain("javascript:");
  } finally {
    await context.close();
  }
});

test("E2E-11: a failed Publish changes nothing for visitors", async ({ baseURL }) => {
  const base = String(baseURL);
  await blank(base);
  const id = await addCert(base, SCRUM, 0);
  await publish(base);
  await waitFor(base, "Professional Scrum Developer");
  await editCert(base, id, { ...SCRUM, name: "Professional Scrum Developer II" });

  dbBreak();
  try {
    await withOwner(base, async (request) => {
      const response = await ownerPost(request);
      expect(response.status()).toBe(503);
      expect(await response.json()).toEqual({ error: "unavailable" });
    });
  } finally {
    dbFix();
  }
  for (let i = 0; i < 2; i++) {
    const text = await visitorText(base);
    expect(text).toContain(nameHtml("Professional Scrum Developer"));
    expect(text).not.toContain("Professional Scrum Developer II");
  }
});

test("E2E-13: no former certification text, badge path or address is left in the source", async () => {
  const forbidden = [
    "Professional Scrum Developer",
    "Google IT Automation with Python",
    "Certified Blockchain Developer",
    "credly.com",
    "coursera.org",
    "credential.net",
  ];
  for (const file of filesUnder(path.join(process.cwd(), "src"))) {
    const text = fs.readFileSync(file, "utf8");
    for (const needle of forbidden) {
      expect(text.includes(needle), file + " contains " + needle).toBe(false);
    }
  }
  const component = readText("src/app/components/certifications.tsx");
  for (const needle of ["const certifications", 'icon: "/certs', "Scrum"]) {
    expect(component.includes(needle), "certifications.tsx contains " + needle).toBe(false);
  }
});

test("E2E-16: the new modules keep the public/server boundary", async () => {
  const view = readText("src/lib/publicCertifications.ts");
  for (const needle of ["server-only", "@/lib/admin", "@/lib/server", "lib/server", "@/lib/auth", "cookies(", "headers("]) {
    expect(view.includes(needle), "view module contains " + needle).toBe(false);
  }

  const server = readText("src/lib/server/publicCertifications.ts");
  const firstLine = server.split("\n").find((line) => line.trim() !== "") ?? "";
  expect(firstLine.trim()).toBe('import "server-only";');
  for (const needle of ["@/lib/auth", "@/lib/admin", "cookies(", "headers(", "console."]) {
    expect(server.includes(needle), "server read contains " + needle).toBe(false);
  }

  const page = readText("src/app/page.tsx");
  expect(page).toContain("export const revalidate = false");
  expect(page.split("revalidate").length - 1).toBe(1);
  expect(page).toContain("publicCertifications");
  for (const needle of ["@/lib/auth", "cookies(", "headers("]) {
    expect(page.includes(needle), "page.tsx contains " + needle).toBe(false);
  }

  const component = readText("src/app/components/certifications.tsx");
  for (const needle of ["@/lib/server", "@/lib/admin", "fetch(", "process.env"]) {
    expect(component.includes(needle), "certifications.tsx contains " + needle).toBe(false);
  }
});
