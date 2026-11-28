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

async function blank(base: string): Promise<void> {
  dbReset();
  await publish(base);
  await expect.poll(async () => /<h2[^>]*>Experience<\/h2>/.test(await visitorText(base)), { timeout: 60000 }).toBe(false);
}

type Content = { year: string; title: string; company: string; duration: string; description: string; details: string[] };

async function addEntry(base: string, content: Content, position: number): Promise<string> {
  return withOwner(base, async (request) => {
    const response = await request.post(EXPERIENCE_API, {
      headers: { cookie: await cookieOf(OWNER()), "content-type": "application/json" },
      data: JSON.stringify({ position, content }),
      maxRedirects: 0,
    });
    expect(response.status()).toBe(200);
    const body = (await response.json()) as { id: string };
    return body.id;
  });
}

async function editEntry(base: string, id: string, content: Content): Promise<void> {
  await withOwner(base, async (request) => {
    const response = await request.put(EXPERIENCE_API + "?id=" + id, {
      headers: { cookie: await cookieOf(OWNER()), "content-type": "application/json" },
      data: JSON.stringify({ content }),
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

async function openExperience(page: Page): Promise<void> {
  await page.goto(PANEL);
  const choose = page.getByRole("navigation", { name: "Admin sections" }).getByRole("button", { name: "Experience", exact: true });
  const heading = page.getByRole("heading", { level: 2, name: "Experience", exact: true });
  await expect(async () => {
    await choose.click({ timeout: 5000 });
    await expect(heading).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 15000 });
}

const panelItem = (page: Page, text: string) =>
  page.getByRole("list", { name: "Experience entries" }).getByRole("listitem").filter({ hasText: text });
const cardOf = (page: Page, label: string) => page.getByRole("button", { name: label });
const CARDS = 'section#experience [role="button"][aria-expanded]';
const timelineHeading = (page: Page) => page.getByRole("heading", { level: 2, name: "Experience", exact: true });

const SENIOR: Content = { year: "2027", title: "Senior Engineer", company: "Acme Pte Ltd", duration: "Jan 2027 - Present", description: "Leads the platform team.", details: [] };
const SOFT: Content = { year: "2026", title: "Software Engineer", company: "Acme Pte Ltd", duration: "Jan 2026 - Present", description: "Builds the billing service.", details: [] };
const INTERN: Content = { year: "2025", title: "Intern", company: "Acme Pte Ltd", duration: "Jun 2025 - Aug 2025", description: "Supported the team.", details: [] };
const ENGINEER: Content = { year: "2026", title: "Engineer", company: "Acme Pte Ltd", duration: "Sep 2025 - Present", description: "Ships features.", details: [] };

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

test("E2E-01: a saved entry stays hidden until Publish, then the landing page shows it", async ({ baseURL, browser }) => {
  const base = String(baseURL);
  await blank(base);
  await addEntry(base, SENIOR, 0);
  expect(await visitorText(base)).not.toContain("Senior Engineer");

  const { context, page } = await openPanel(browser, base);
  try {
    await publishButton(page).click();
    await expect(page.getByRole("status").filter({ hasText: /Published\./ })).toBeVisible();
    await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toHaveCount(0);
  } finally {
    await context.close();
  }
  await waitFor(base, "Senior Engineer");

  const visitor = await browser.newContext({ baseURL: base });
  const landing = await visitor.newPage();
  try {
    await landing.goto("/");
    const section = landing.locator("section#experience");
    await expect(section.getByRole("heading", { level: 2, name: "Experience", exact: true })).toBeVisible();
    await expect(section.getByRole("button", { name: /^Senior Engineer at Acme Pte Ltd/ })).toHaveCount(1);
    await expect(section).toContainText("Jan 2027 - Present");
    await expect(section).toContainText("Leads the platform team.");
    await expect(section).toContainText("2027");
  } finally {
    await visitor.close();
  }
});

test("E2E-02: an edited entry changes for visitors only after Publish", async ({ baseURL, browser }) => {
  const base = String(baseURL);
  await blank(base);
  const id = await addEntry(base, SOFT, 0);
  await publish(base);
  await waitFor(base, "Software Engineer");
  await editEntry(base, id, { ...SOFT, title: "Staff Engineer" });

  for (let i = 0; i < 2; i++) {
    const text = await visitorText(base);
    expect(text).toContain("Software Engineer at Acme Pte Ltd");
    expect(text).not.toContain("Staff Engineer");
  }
  const first = await browser.newContext({ baseURL: base });
  const firstPage = await first.newPage();
  try {
    await firstPage.goto("/");
    await expect(cardOf(firstPage, "Software Engineer at Acme Pte Ltd")).toHaveCount(1);
    await expect(cardOf(firstPage, "Staff Engineer")).toHaveCount(0);
  } finally {
    await first.close();
  }

  await publish(base);
  await waitFor(base, "Staff Engineer");
  const after = await visitorText(base);
  expect(after).toContain("Staff Engineer at Acme Pte Ltd");
  expect(after).not.toContain("Software Engineer at Acme Pte Ltd");

  const second = await browser.newContext({ baseURL: base });
  const secondPage = await second.newPage();
  try {
    await secondPage.goto("/");
    await expect(cardOf(secondPage, "Staff Engineer at Acme Pte Ltd")).toHaveCount(1);
  } finally {
    await second.close();
  }
});

test("E2E-03: a new order stays hidden until Publish, then visitors see it", async ({ baseURL, browser }) => {
  const base = String(baseURL);
  await blank(base);
  await addEntry(base, INTERN, 0);
  await addEntry(base, ENGINEER, 1);
  await publish(base);
  await waitFor(base, "Engineer at Acme Pte Ltd");

  const { context, page } = await openPanel(browser, base);
  try {
    await openExperience(page);
    await panelItem(page, "Intern at Acme Pte Ltd").getByRole("button", { name: "Move down" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Order saved" })).toBeVisible();

    for (let i = 0; i < 2; i++) {
      const text = await visitorText(base);
      expect(text.indexOf("Intern at Acme Pte Ltd")).toBeGreaterThanOrEqual(0);
      expect(text.indexOf("Intern at Acme Pte Ltd")).toBeLessThan(text.indexOf("Engineer at Acme Pte Ltd"));
    }
    await publishButton(page).click();
    await expect
      .poll(
        async () => {
          const text = await visitorText(base);
          const engineer = text.indexOf("Engineer at Acme Pte Ltd");
          return engineer >= 0 && engineer < text.indexOf("Intern at Acme Pte Ltd");
        },
        { timeout: 60000 },
      )
      .toBe(true);
  } finally {
    await context.close();
  }

  const visitor = await browser.newContext({ baseURL: base });
  const landing = await visitor.newPage();
  try {
    await landing.goto("/");
    const labels = await landing.locator(CARDS).evaluateAll((els) => els.map((el) => el.getAttribute("aria-label") ?? ""));
    expect(labels).toHaveLength(2);
    expect(labels[0].startsWith("Engineer at Acme Pte Ltd")).toBe(true);
    expect(labels[1].startsWith("Intern at Acme Pte Ltd")).toBe(true);
  } finally {
    await visitor.close();
  }
});

test("E2E-04: an entry with no detail lines shows its duration and description on the back", async ({ baseURL, browser }) => {
  const base = String(baseURL);
  await blank(base);
  await addEntry(
    base,
    { year: "2025", title: "Engineer", company: "Acme Pte Ltd", duration: "Jan 2025 - Dec 2025", description: "Maintained the billing service.", details: [] },
    0,
  );
  await publish(base);
  await waitFor(base, "Engineer at Acme Pte Ltd");

  const context = await browser.newContext({ baseURL: base });
  const page = await context.newPage();
  try {
    await page.goto("/");
    const card = cardOf(page, "Engineer at Acme Pte Ltd");
    await expect(card).toHaveAttribute("aria-expanded", "false");
    await card.click();
    await expect(card).toHaveAttribute("aria-expanded", "true");
    await expect(card.locator(".card-back")).toContainText("Jan 2025 - Dec 2025");
    await expect(card.locator(".card-back")).toContainText("Maintained the billing service.");
    await expect(card.locator("ul")).toHaveCount(0);
    await expect(card.locator("li")).toHaveCount(0);
    await expect(card.locator(".card-back").getByText("What I Did")).toHaveCount(0);
    await card.click();
    await expect(card).toHaveAttribute("aria-expanded", "false");
  } finally {
    await context.close();
  }
});

test("E2E-05: an entry with detail lines shows them under What I Did", async ({ baseURL, browser }) => {
  const base = String(baseURL);
  await blank(base);
  await addEntry(
    base,
    {
      year: "2025",
      title: "Engineer",
      company: "Acme Pte Ltd",
      duration: "Jan 2025 - Dec 2025",
      description: "Maintained the billing service.",
      details: ["Cut invoice errors by 40%", "Led a team of 4"],
    },
    0,
  );
  await publish(base);
  await waitFor(base, "Engineer at Acme Pte Ltd");

  const context = await browser.newContext({ baseURL: base });
  const page = await context.newPage();
  try {
    await page.goto("/");
    const card = cardOf(page, "Engineer at Acme Pte Ltd");
    await card.click();
    await expect(card.locator(".card-back h4")).toHaveText("What I Did");
    await expect(card.locator(".card-back li")).toHaveCount(2);
    await expect(card.locator(".card-back li")).toHaveText(["Cut invoice errors by 40%", "Led a team of 4"]);
  } finally {
    await context.close();
  }
});

test("E2E-06: with no entries the timeline is gone, nothing replaces it and the rest of the page works", async ({ baseURL, browser }) => {
  const base = String(baseURL);
  await blank(base);

  const context = await browser.newContext({ baseURL: base });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(String(error)));
  try {
    await page.goto("/");
    await expect(page.getByRole("contentinfo")).toBeVisible();
    await expect(timelineHeading(page)).toHaveCount(0);
    await expect(page.locator("section#experience [aria-expanded]")).toHaveCount(0);
    await expect(page.locator("section#experience")).toHaveCount(0);
    const body = await page.evaluate(() => document.body.innerText);
    expect(body).not.toMatch(/Resorts World Sentosa|\bNCS\b|ST Engineering|Dimerco|Nanyang/);
    expect(body).not.toMatch(/no experience|coming soon|nothing to show/i);
    expect(await visitorText(base)).not.toContain(">Experience</h2>");
    await expect(page.locator('nav[aria-label="Main navigation"]').getByRole("link", { name: "Experience" })).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 2, name: "Certifications" })).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

test("E2E-07: no source file holds the old written-in entries", async () => {
  const sources = filesUnder(path.join(process.cwd(), "src"));
  const banned = ["Resorts World Sentosa", "ST Engineering Defence Aerospace", "Dimerco Express Group", "Nanyang Technological University"];
  for (const file of sources) {
    const text = fs.readFileSync(file, "utf8");
    for (const phrase of banned) expect(text, file + " must not contain " + phrase).not.toContain(phrase);
    expect(/\bNCS\b/.test(text), file + " must not contain NCS").toBe(false);
  }
  const timeline = readText("src/app/components/experienceTimeLine.tsx");
  for (const phrase of ["experienceData", "const experience", "Software Engineer"]) {
    expect(timeline, "experienceTimeLine.tsx must not contain " + phrase).not.toContain(phrase);
  }
});

test("E2E-08: deleting every entry and publishing removes the timeline but keeps the page", async ({ baseURL, browser }) => {
  const base = String(baseURL);
  await blank(base);
  await addEntry(base, ENGINEER, 0);
  await addEntry(base, INTERN, 1);
  await publish(base);
  await waitFor(base, "Intern at Acme Pte Ltd");

  const { context, page } = await openPanel(browser, base);
  try {
    await openExperience(page);
    for (const label of ["Engineer at Acme Pte Ltd", "Intern at Acme Pte Ltd"]) {
      await panelItem(page, label).getByRole("button", { name: "Delete" }).click();
      await page.getByRole("group", { name: "Confirm delete" }).getByRole("button", { name: "Confirm" }).click();
      await expect(page.getByRole("status").filter({ hasText: "Entry deleted" })).toBeVisible();
    }
    for (let i = 0; i < 2; i++) {
      const text = await visitorText(base);
      expect(text).toContain("Engineer at Acme Pte Ltd");
      expect(text).toContain("Intern at Acme Pte Ltd");
    }
    await publishButton(page).click();
    await expect.poll(async () => /<h2[^>]*>Experience<\/h2>/.test(await visitorText(base)), { timeout: 60000 }).toBe(false);
  } finally {
    await context.close();
  }

  const visitor = await browser.newContext({ baseURL: base });
  const landing = await visitor.newPage();
  try {
    await landing.goto("/");
    await expect(timelineHeading(landing)).toHaveCount(0);
    await expect(landing.locator("section#experience [aria-expanded]")).toHaveCount(0);
    await expect(landing.getByRole("heading", { level: 2, name: "Tech Stack" })).toHaveCount(0);
    await expect(landing.locator("section#experience")).toHaveCount(0);
    await expect(landing.getByRole("heading", { level: 2, name: "Certifications" })).toBeVisible();
    await expect(landing.getByRole("contentinfo")).toBeVisible();
    await expect(landing.locator('nav[aria-label="Main navigation"]').getByRole("link", { name: "Experience" })).toHaveCount(0);
    const text = await visitorText(base);
    expect(text).not.toContain("Engineer at Acme Pte Ltd");
    expect(text).not.toContain("Intern at Acme Pte Ltd");
  } finally {
    await visitor.close();
  }
});

test("E2E-09: entry text is shown literally and the saved order is kept", async ({ baseURL, browser }) => {
  const base = String(baseURL);
  await blank(base);
  await addEntry(
    base,
    { year: "FY27", title: "Lead <b>Engineer</b> & Co", company: "Acme Pte Ltd", duration: "Q1 – Q2 2027 (approx.)", description: "Owns <i>everything</i>.", details: ["Saved 50% & more"] },
    0,
  );
  await addEntry(base, { year: "2024", title: "Developer", company: "Acme Pte Ltd", duration: "2024", description: "First stint.", details: [] }, 1);
  await addEntry(base, { year: "2023", title: "Developer", company: "Acme Pte Ltd", duration: "2023", description: "Second stint.", details: [] }, 2);
  await publish(base);
  await waitFor(base, "First stint.");

  const context = await browser.newContext({ baseURL: base });
  const page = await context.newPage();
  try {
    await page.goto("/");
    await expect(page.locator(CARDS)).toHaveCount(3);
    const lead = cardOf(page, "Lead <b>Engineer</b> & Co at Acme Pte Ltd");
    await lead.click();
    await expect(lead.locator("h3")).toHaveText("Lead <b>Engineer</b> & Co", { useInnerText: true });
    expect((await lead.locator("h3").innerText()).trim()).toBe("Lead <b>Engineer</b> & Co");
    await expect(lead.locator("b")).toHaveCount(0);
    await expect(lead.locator("i")).toHaveCount(0);
    await expect(lead).toContainText("FY27");
    await expect(lead).toContainText("Q1 – Q2 2027 (approx.)");
    await expect(lead).toContainText("Owns <i>everything</i>.");
    await expect(lead.locator(".card-back li")).toHaveText(["Saved 50% & more"]);
    await expect(page.getByRole("button", { name: "Developer at Acme Pte Ltd" })).toHaveCount(2);
  } finally {
    await context.close();
  }
});

test("E2E-10: long unbroken words stay inside the card on a 375 pixel screen", async ({ baseURL, browser }) => {
  const base = String(baseURL);
  await blank(base);
  await addEntry(
    base,
    {
      year: "2027",
      title: "Pneumonoultramicroscopicsilicovolcanoconiosis".repeat(2),
      company: "Supercalifragilisticexpialidocious".repeat(2),
      duration: "Jan2027ToPresentWithoutAnySpacesAtAllInThisDurationText",
      description: "Antidisestablishmentarianism".repeat(3),
      details: [],
    },
    0,
  );
  await publish(base);
  await waitFor(base, "Pneumonoultramicroscopicsilicovolcanoconiosis");

  const context = await browser.newContext({ baseURL: base, viewport: { width: 375, height: 800 } });
  const page = await context.newPage();
  try {
    await page.goto("/");
    const card = page.locator(CARDS).first();
    await expect(card).toBeVisible();
    const overflowing = await card.locator(".card-front").evaluate((front) =>
      Array.from(front.querySelectorAll("h3, p"))
        .filter((el) => el.scrollWidth > el.clientWidth)
        .map((el) => el.tagName + ":" + (el.textContent ?? "").slice(0, 20)),
    );
    expect(overflowing).toEqual([]);
    expect(await card.locator(".card-front h3").count()).toBeGreaterThan(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  } finally {
    await context.close();
  }
});

test("E2E-11: a failed publish keeps the old entries and leaks nothing", async ({ baseURL }) => {
  const base = String(baseURL);
  await blank(base);
  const id = await addEntry(base, SOFT, 0);
  await publish(base);
  await waitFor(base, "Software Engineer");
  await editEntry(base, id, { ...SOFT, title: "Staff Engineer" });

  dbBreak();
  try {
    const result = await withOwner(base, async (request) => {
      const response = await ownerPost(request);
      return { status: response.status(), body: (await response.json()) as unknown };
    });
    expect(result.status).toBe(503);
    expect(result.body).toEqual({ error: "unavailable" });
  } finally {
    dbFix();
  }
  for (let i = 0; i < 2; i++) {
    const text = await visitorText(base);
    expect(text).toContain("Software Engineer at Acme Pte Ltd");
    expect(text).not.toContain("Staff Engineer");
  }
});

test("E2E-13: odd stored records are skipped or tolerated", async ({ baseURL, browser }) => {
  const base = String(baseURL);
  await blank(base);
  fs.writeFileSync(
    DB_FILE,
    JSON.stringify({
      experience: [
        { id: "11111111-1111-4111-8111-111111111111", position: 0, data: {} },
        {
          id: "22222222-2222-4222-8222-222222222222",
          position: 1,
          data: { year: 5, title: "Analyst", company: "Beta", duration: null, description: "Reports.", details: ["ok", 7, "  "] },
        },
        {
          id: "33333333-3333-4333-8333-333333333333",
          position: 2,
          data: { year: "2027", title: "Engineer", company: "Acme Pte Ltd", duration: "2027", description: "Real entry.", details: [] },
        },
      ],
    }),
  );
  await publish(base);
  await waitFor(base, "Analyst at Beta");

  const context = await browser.newContext({ baseURL: base });
  const page = await context.newPage();
  try {
    await page.goto("/");
    const labels = await page.locator(CARDS).evaluateAll((els) => els.map((el) => el.getAttribute("aria-label") ?? ""));
    expect(labels).toHaveLength(2);
    expect(labels[0].startsWith("Analyst at Beta")).toBe(true);
    expect(labels[1].startsWith("Engineer at Acme Pte Ltd")).toBe(true);
    const analyst = cardOf(page, "Analyst at Beta");
    await analyst.click();
    await expect(analyst.locator(".card-back li")).toHaveCount(1);
    await expect(analyst.locator(".card-back li")).toHaveText("ok");
  } finally {
    await context.close();
  }
});

test("E2E-17: the new files keep the server and browser boundaries", async () => {
  const view = readText("src/lib/publicExperience.ts");
  for (const phrase of ["server-only", "@/lib/admin", "@/lib/server", "lib/server", "@/lib/auth", "cookies(", "headers("]) {
    expect(view, "publicExperience view must not contain " + phrase).not.toContain(phrase);
  }
  const read = readText("src/lib/server/publicExperience.ts");
  const firstLine = read.split("\n").find((line) => line.trim() !== "");
  expect(firstLine?.trim()).toBe('import "server-only";');
  for (const phrase of ["@/lib/auth", "@/lib/admin", "cookies(", "headers(", "console."]) {
    expect(read, "server read must not contain " + phrase).not.toContain(phrase);
  }
  const page = readText("src/app/page.tsx");
  expect(page).toContain("export const revalidate = false");
  expect(page.split("revalidate").length - 1).toBe(1);
  expect(page).toContain("publicExperience");
  for (const phrase of ["@/lib/auth", "cookies(", "headers("]) expect(page, "page.tsx must not contain " + phrase).not.toContain(phrase);
  const timeline = readText("src/app/components/experienceTimeLine.tsx");
  for (const phrase of ["@/lib/server", "@/lib/admin", "fetch(", "process.env"]) {
    expect(timeline, "experienceTimeLine.tsx must not contain " + phrase).not.toContain(phrase);
  }
});

test("E2E-18: a card opens and closes from the keyboard", async ({ baseURL, browser }) => {
  const base = String(baseURL);
  await blank(base);
  await addEntry(base, SENIOR, 0);
  await publish(base);
  await waitFor(base, "Senior Engineer");

  const context = await browser.newContext({ baseURL: base });
  const page = await context.newPage();
  try {
    await page.goto("/");
    const card = cardOf(page, "Senior Engineer at Acme Pte Ltd");
    await card.focus();
    await page.keyboard.press("Enter");
    await expect(card).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Space");
    await expect(card).toHaveAttribute("aria-expanded", "false");
  } finally {
    await context.close();
  }
});

test("E2E-12: the success message names the changes, not the profile", async ({ baseURL, browser }) => {
  const base = String(baseURL);
  await blank(base);
  await addEntry(base, SENIOR, 0);
  const { context, page } = await openPanel(browser, base);
  try {
    await publishButton(page).click();
    const status = page.getByRole("status").filter({ hasText: /Published/ });
    await expect(status).toBeVisible();
    await expect(status).toHaveText("Published. Visitors will see the changes within a minute.");
    await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test("E2E-15: the earlier checks and the message constant follow the change", async () => {
  const message = "Published. Visitors will see the changes within a minute.";
  const old = "will see the profile within a minute";
  const profileSpec = readText("e2e/owner-publishes-profile.spec.ts");
  expect(profileSpec).toContain(message);
  expect(profileSpec).not.toContain(old);
  const publishSource = readText("src/lib/admin/publish.ts");
  expect(publishSource).toContain(message);
  expect(publishSource).not.toContain(old);
  for (const file of ["e2e/retire-firebase.spec.ts", "e2e/hosting-and-backend-migration-acceptance.spec.ts"]) {
    const text = readText(file);
    expect(text, file + " must not list experienceTimeLine.tsx").not.toContain("src/app/components/experienceTimeLine.tsx");
  }
});

test("E2E-16: the standing documents and the earlier spec describe the entries as read from the database", async () => {
  const reference = readText("Reference.md");
  expect(reference).toContain("publicExperience");
  expect(reference).not.toContain("experienceData[]");
  expect(reference).not.toContain("Edit `experienceData[]`");
  const claude = readText("CLAUDE.md");
  expect(claude).toContain("src/lib/server/publicExperience.ts");
  expect(claude).toContain("publicExperience.ts");
  expect(claude).toContain("the experience entries and the projects");
  expect(claude).toContain("last good copy");
  expect(claude).toContain("revalidatePath");
  const earlier = readText("docs/features/owner-publishes-profile/spec.md");
  expect(earlier).toContain("Published. Visitors will see the changes within a minute.");
  expect(earlier).not.toContain("will see the profile within a minute");
});
