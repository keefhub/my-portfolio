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
const PROJECTS_API = "/api/admin/projects/";
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
  await expect.poll(async () => /<h2[^>]*>Projects<\/h2>/.test(await visitorText(base)), { timeout: 60000 }).toBe(false);
}

// Publish marks every kept page stale; a page renews on its own first request. Wait until two consecutive visitor responses agree.
async function settle(base: string): Promise<void> {
  await expect.poll(async () => (await visitorText(base)) === (await visitorText(base)), { timeout: 60000 }).toBe(true);
}

// With no project the landing page keeps a visible main only if another published section is there, so these tests
// save one certification (an empty main is hidden) and wait for it to be shown.
async function seedCertification(base: string): Promise<void> {
  await withOwner(base, async (request) => {
    const cert = await request.post("/api/admin/certifications/", {
      headers: { cookie: await cookieOf(OWNER()), "content-type": "application/json" },
      data: JSON.stringify({ position: 0, content: { name: "Professional Scrum Developer", icon: "/certs/scrum.png", url: "https://www.credly.com/badges/example/public_url" } }),
      maxRedirects: 0,
    });
    expect(cert.status()).toBe(200);
  });
}

type Content = { title: string; shortDesc: string; description: string[]; tech: string[]; github: string; demo: string };

async function addProject(base: string, content: Content, position: number): Promise<string> {
  return withOwner(base, async (request) => {
    const response = await request.post(PROJECTS_API, {
      headers: { cookie: await cookieOf(OWNER()), "content-type": "application/json" },
      data: JSON.stringify({ position, content }),
      maxRedirects: 0,
    });
    expect(response.status()).toBe(200);
    const body = (await response.json()) as { id: string };
    return body.id;
  });
}

async function editProject(base: string, id: string, content: Content): Promise<void> {
  await withOwner(base, async (request) => {
    const response = await request.put(PROJECTS_API + "?id=" + id, {
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

async function openProjects(page: Page): Promise<void> {
  await page.goto(PANEL);
  const choose = page.getByRole("navigation", { name: "Admin sections" }).getByRole("button", { name: "Projects", exact: true });
  const heading = page.getByRole("heading", { level: 2, name: "Projects", exact: true });
  await expect(async () => {
    await choose.click({ timeout: 5000 });
    await expect(heading).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 15000 });
}

const panelItem = (page: Page, text: string) =>
  page.getByRole("list", { name: "Projects list" }).getByRole("listitem").filter({ hasText: text });
const CARDS = 'section#projects [role="button"][aria-expanded]';
const frontTitles = async (page: Page): Promise<string[]> =>
  (await page.locator("section#projects .card-front h3").allInnerTexts()).map((t) => t.trim());
const cardOf = (page: Page, label: string) => page.getByRole("button", { name: label });
const projectsHeading = (page: Page) => page.getByRole("heading", { level: 2, name: "Projects", exact: true });
const mainMenuProjects = (page: Page) =>
  page.locator('nav[aria-label="Main navigation"]').getByRole("link", { name: "Projects", exact: true });

const QUANTUM: Content = {
  title: "Quantum Notes",
  shortDesc: "A notes app",
  description: ["Built for fast capture."],
  tech: ["React", "Supabase"],
  github: "https://github.com/example/quantum-notes",
  demo: "https://notes.example.com",
};
const ALPHA: Content = {
  title: "Alpha",
  shortDesc: "Alpha summary",
  description: ["Alpha paragraph."],
  tech: ["TypeScript"],
  github: "https://github.com/example/alpha",
  demo: "",
};
const BETA: Content = { title: "Beta", shortDesc: "Beta summary", description: ["Beta paragraph."], tech: ["Go"], github: "", demo: "" };
const GAMMA: Content = {
  title: "Gamma",
  shortDesc: "Gamma summary",
  description: ["Gamma one.", "Gamma two."],
  tech: ["Rust", "SQL"],
  github: "",
  demo: "https://gamma.example.com",
};

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

test("E2E-01: an edit made in the panel reaches visitors after Publish, with the removed demo link gone", async ({ baseURL, browser }) => {
  const base = String(baseURL);
  await blank(base);
  await addProject(base, QUANTUM, 0);
  await publish(base);
  await waitFor(base, "Quantum Notes");

  const before = await browser.newContext({ baseURL: base });
  const beforePage = await before.newPage();
  try {
    await beforePage.goto("/");
    await expect(beforePage.locator('section#projects a[href="https://notes.example.com"]')).toHaveCount(1);
  } finally {
    await before.close();
  }

  const { context, page } = await openPanel(browser, base);
  try {
    await openProjects(page);
    await panelItem(page, "Quantum Notes").getByRole("button", { name: "Edit" }).click();
    await page.getByLabel("Title", { exact: true }).fill("Quantum Notes 2");
    await page.getByLabel("Demo link", { exact: true }).fill("");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Entry saved" })).toBeVisible();
    await publishButton(page).click();
    await expect(page.getByRole("status").filter({ hasText: "Published." })).toBeVisible();
    await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toHaveCount(0);
  } finally {
    await context.close();
  }
  await waitFor(base, "Quantum Notes 2");

  const after = await browser.newContext({ baseURL: base });
  const afterPage = await after.newPage();
  try {
    await afterPage.goto("/");
    expect(await frontTitles(afterPage)).toEqual(["Quantum Notes 2"]);
    await expect(afterPage.locator('section#projects a[href="https://notes.example.com"]')).toHaveCount(0);
    const github = afterPage.locator('section#projects a[href="https://github.com/example/quantum-notes"]');
    await expect(github).toHaveCount(1);
    await expect(github).toHaveText("GitHub ↗");
    const content = (await afterPage.locator("section#projects").textContent()) ?? "";
    expect(content).not.toContain("Live Demo");
  } finally {
    await after.close();
  }
});

test("E2E-02: a saved edit stays hidden from visitors until Publish", async ({ baseURL, browser }) => {
  const base = String(baseURL);
  await blank(base);
  const id = await addProject(base, QUANTUM, 0);
  await publish(base);
  await waitFor(base, "Quantum Notes");
  await editProject(base, id, { ...QUANTUM, title: "Quantum Notes 2" });

  for (let i = 0; i < 2; i++) {
    const text = await visitorText(base);
    expect(text).toContain("Quantum Notes");
    expect(text).not.toContain("Quantum Notes 2");
  }
  const first = await browser.newContext({ baseURL: base });
  const firstPage = await first.newPage();
  try {
    await firstPage.goto("/");
    expect(await frontTitles(firstPage)).toEqual(["Quantum Notes"]);
  } finally {
    await first.close();
  }

  await publish(base);
  await waitFor(base, "Quantum Notes 2");

  const second = await browser.newContext({ baseURL: base });
  const secondPage = await second.newPage();
  try {
    await secondPage.goto("/");
    expect(await frontTitles(secondPage)).toEqual(["Quantum Notes 2"]);
    const content = (await secondPage.locator("section#projects").textContent()) ?? "";
    expect(content).not.toMatch(/Quantum Notes(?! 2)/);
  } finally {
    await second.close();
  }
});

test("E2E-03: a new order stays hidden until Publish, then visitors see it", async ({ baseURL, browser }) => {
  const base = String(baseURL);
  await blank(base);
  await addProject(base, ALPHA, 0);
  await addProject(base, BETA, 1);
  await addProject(base, GAMMA, 2);
  await publish(base);
  await waitFor(base, "Gamma summary");

  const visitor = await browser.newContext({ baseURL: base });
  const firstPage = await visitor.newPage();
  try {
    await firstPage.goto("/");
    await expect(projectsHeading(firstPage)).toBeVisible();
    await expect(mainMenuProjects(firstPage)).toHaveCount(1);
    expect(await frontTitles(firstPage)).toEqual(["Alpha", "Beta", "Gamma"]);
  } finally {
    await visitor.close();
  }

  const { context, page } = await openPanel(browser, base);
  try {
    await openProjects(page);
    await panelItem(page, "Gamma").getByRole("button", { name: "Move up" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Order saved" })).toBeVisible();

    for (let i = 0; i < 2; i++) {
      const text = await visitorText(base);
      const alpha = text.indexOf("Alpha summary");
      const beta = text.indexOf("Beta summary");
      const gamma = text.indexOf("Gamma summary");
      expect(alpha).toBeGreaterThanOrEqual(0);
      expect(alpha).toBeLessThan(beta);
      expect(beta).toBeLessThan(gamma);
    }
    await publishButton(page).click();
    await expect
      .poll(
        async () => {
          const text = await visitorText(base);
          const gamma = text.indexOf("Gamma summary");
          return gamma >= 0 && gamma < text.indexOf("Beta summary");
        },
        { timeout: 60000 },
      )
      .toBe(true);
  } finally {
    await context.close();
  }

  const fresh = await browser.newContext({ baseURL: base });
  const freshPage = await fresh.newPage();
  try {
    await freshPage.goto("/");
    expect(await frontTitles(freshPage)).toEqual(["Alpha", "Gamma", "Beta"]);
    const fronts = freshPage.locator("section#projects .card-front");
    const expected: string[][] = [
      ["Alpha summary", "TypeScript"],
      ["Gamma summary", "Rust", "SQL"],
      ["Beta summary", "Go"],
    ];
    for (let i = 0; i < expected.length; i++) {
      const front = fronts.nth(i);
      for (const part of expected[i]) await expect(front).toContainText(part);
    }
  } finally {
    await fresh.close();
  }
});

test("E2E-04: deleting every project and publishing removes the section and the menu link", async ({ baseURL, browser }) => {
  const base = String(baseURL);
  await blank(base);
  await addProject(base, ALPHA, 0);
  await addProject(base, BETA, 1);
  await seedCertification(base);
  await publish(base);
  await waitFor(base, "Beta summary");
  await waitFor(base, "Professional Scrum Developer");
  await settle(base);

  const { context, page } = await openPanel(browser, base);
  try {
    await openProjects(page);
    for (const label of ["Alpha", "Beta"]) {
      await panelItem(page, label).getByRole("button", { name: "Delete" }).click();
      await page.getByRole("group", { name: "Confirm delete" }).getByRole("button", { name: "Confirm" }).click();
      await expect(page.getByRole("status").filter({ hasText: "Entry deleted" })).toBeVisible();
    }
    for (let i = 0; i < 2; i++) {
      const text = await visitorText(base);
      expect(text).toContain("Alpha summary");
      expect(text).toContain("Beta summary");
    }
    await publishButton(page).click();
    await expect.poll(async () => /<h2[^>]*>Projects<\/h2>/.test(await visitorText(base)), { timeout: 60000 }).toBe(false);
    await settle(base);
  } finally {
    await context.close();
  }

  const visitor = await browser.newContext({ baseURL: base });
  const landing = await visitor.newPage();
  const errors: string[] = [];
  landing.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  landing.on("pageerror", (error) => errors.push(String(error)));
  try {
    await landing.goto("/");
    await expect(landing.getByRole("contentinfo")).toBeVisible();
    await expect(landing.locator("main#main-content")).toBeVisible();
    await expect(landing.locator("section#projects")).toHaveCount(0);
    await expect(projectsHeading(landing)).toHaveCount(0);
    await expect(mainMenuProjects(landing)).toHaveCount(0);
    const text = await visitorText(base);
    expect(text).not.toContain("Alpha summary");
    expect(text).not.toContain("Beta summary");
    expect(errors).toEqual([]);
  } finally {
    await visitor.close();
  }
});

test("E2E-05: with no saved project the section is gone, nothing replaces it and the rest of the page works", async ({ baseURL, browser }) => {
  const base = String(baseURL);
  await blank(base);
  await seedCertification(base);
  await publish(base);
  await waitFor(base, "Professional Scrum Developer");
  await settle(base);

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
    await expect(page.locator("main#main-content")).toBeVisible();
    await expect(page.locator("section#projects")).toHaveCount(0);
    await expect(projectsHeading(page)).toHaveCount(0);
    await expect(mainMenuProjects(page)).toHaveCount(0);
    expect(await visitorText(base)).not.toMatch(/<h2[^>]*>Projects<\/h2>/);
    const body = await page.evaluate(() => document.body.innerText);
    expect(body).not.toMatch(/Kaafei|Prime Unity|Recipe Database|CloudHacks|Travel Planning|Web Application Design|Portfolio Website/);
    expect(body).not.toMatch(/no projects|coming soon|nothing to show/i);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

test("E2E-06: the mobile menu lists Projects only while a project is published", async ({ baseURL, browser }) => {
  const base = String(baseURL);
  await blank(base);
  await addProject(base, ALPHA, 0);
  await publish(base);
  await waitFor(base, "Alpha summary");

  const first = await browser.newContext({ baseURL: base, viewport: { width: 375, height: 800 } });
  const firstPage = await first.newPage();
  try {
    await firstPage.goto("/");
    await firstPage.getByRole("button", { name: "Open navigation menu" }).click();
    await expect(firstPage.locator("#mobile-menu a").filter({ hasText: /^Projects$/ })).toHaveCount(1);
  } finally {
    await first.close();
  }

  await blank(base);

  const second = await browser.newContext({ baseURL: base, viewport: { width: 375, height: 800 } });
  const secondPage = await second.newPage();
  try {
    await secondPage.goto("/");
    await secondPage.getByRole("button", { name: "Open navigation menu" }).click();
    await expect(secondPage.locator("#mobile-menu a").filter({ hasText: /^Blog$/ })).toHaveCount(1);
    await expect(secondPage.locator("#mobile-menu a").filter({ hasText: /^Projects$/ })).toHaveCount(0);
  } finally {
    await second.close();
  }
});

test("E2E-07: no source file holds the old written-in projects", async () => {
  const sources = filesUnder(path.join(process.cwd(), "src"));
  const banned = [
    "Kaafei",
    "Prime Unity",
    "Recipe Database",
    "Mobile App for Travel Planning",
    "Web Application Design",
    "CloudHacks",
    "Portfolio Website",
    "keefhub",
  ];
  for (const file of sources) {
    const text = fs.readFileSync(file, "utf8");
    for (const phrase of banned) expect(text, file + " must not contain " + phrase).not.toContain(phrase);
  }
  const component = readText("src/app/components/project.tsx");
  for (const phrase of ["interface Project {", "github.com/keefhub", "kaafei.org"]) {
    expect(component, "project.tsx must not contain " + phrase).not.toContain(phrase);
  }
});

test("E2E-08: a failed publish keeps the old projects, shows the notice and leaks nothing", async ({ baseURL, browser }) => {
  const base = String(baseURL);
  await blank(base);
  const id = await addProject(base, QUANTUM, 0);
  await publish(base);
  await waitFor(base, "Quantum Notes");
  await editProject(base, id, { ...QUANTUM, title: "Quantum Notes 2" });

  const { context, page } = await openPanel(browser, base);
  try {
    await openProjects(page);
    dbBreak();
    try {
      const result = await withOwner(base, async (request) => {
        const response = await ownerPost(request);
        return { status: response.status(), body: (await response.json()) as unknown };
      });
      expect(result.status).toBe(503);
      expect(result.body).toEqual({ error: "unavailable" });

      await publishButton(page).click();
      const failure = "The site could not be published because the database could not be reached. Try again later.";
      const alert = page.getByRole("alert").filter({ hasText: failure });
      await expect(alert).toBeVisible();
      await expect(alert).toHaveText(failure);
    } finally {
      dbFix();
    }
  } finally {
    await context.close();
  }
  for (let i = 0; i < 2; i++) {
    const text = await visitorText(base);
    expect(text).toContain("Quantum Notes");
    expect(text).not.toContain("Quantum Notes 2");
  }
});

test("E2E-09: Publish refuses a visitor and a signed-in stranger and changes nothing", async ({ baseURL }) => {
  const base = String(baseURL);
  await blank(base);
  const id = await addProject(base, QUANTUM, 0);
  await publish(base);
  await waitFor(base, "Quantum Notes");
  await editProject(base, id, { ...QUANTUM, title: "Quantum Notes 2" });

  const answers = await withOwner(base, async (request) => {
    const anonymous = await request.post(PUBLISH, { maxRedirects: 0 });
    const anonymousAnswer = { status: anonymous.status(), body: (await anonymous.json()) as unknown };
    const stranger = await request.post(PUBLISH, {
      headers: {
        cookie: await cookieOf({ sub: "other-1", email: "someone.else@example.com", name: "Someone Else", emailVerified: true }),
      },
      maxRedirects: 0,
    });
    return { anonymous: anonymousAnswer, stranger: { status: stranger.status(), body: (await stranger.json()) as unknown } };
  });
  expect(answers.anonymous.status).toBe(401);
  expect(answers.anonymous.body).toEqual({ error: "not-signed-in" });
  expect(answers.stranger.status).toBe(403);
  expect(answers.stranger.body).toEqual({ error: "not-allowed" });

  for (let i = 0; i < 2; i++) {
    const text = await visitorText(base);
    expect(text).toContain("Quantum Notes");
    expect(text).not.toContain("Quantum Notes 2");
  }
});

test("E2E-10: links appear only when valid, text stays literal and empty parts are left out", async ({ baseURL, browser }) => {
  const base = String(baseURL);
  await blank(base);
  const onlyCode: Content = {
    title: "Only Code",
    shortDesc: "Code link only",
    description: ["Only code paragraph."],
    tech: ["Go"],
    github: "https://github.com/example/only-code",
    demo: "",
  };
  await addProject(base, onlyCode, 0);
  await addProject(
    base,
    {
      title: "Only Demo",
      shortDesc: "Demo link only",
      description: ["Only demo paragraph."],
      tech: ["Rust"],
      github: "",
      demo: "https://only-demo.example.com",
    },
    1,
  );
  await addProject(
    base,
    {
      title: "No Links <b>Bold</b> & Co",
      shortDesc: "Owns <i>everything</i>.",
      description: ["Para with <u>markup</u>."],
      tech: ["C#"],
      github: "",
      demo: "",
    },
    2,
  );
  await addProject(base, onlyCode, 3);
  await addProject(base, { title: "Bare Minimum", shortDesc: "", description: [], tech: [], github: "", demo: "" }, 4);
  await publish(base);
  await waitFor(base, "Bare Minimum");

  const context = await browser.newContext({ baseURL: base });
  const page = await context.newPage();
  try {
    await page.goto("/");
    expect(await frontTitles(page)).toEqual(["Only Code", "Only Demo", "No Links <b>Bold</b> & Co", "Only Code", "Bare Minimum"]);
    const card = (i: number) => page.locator(CARDS).nth(i);
    for (let i = 0; i < 5; i++) await card(i).click();

    const zero = card(0);
    await expect(zero.locator("a")).toHaveCount(1);
    await expect(zero.locator("a")).toHaveText("GitHub ↗");
    await expect(zero.locator("a")).toHaveAttribute("href", "https://github.com/example/only-code");
    await expect(zero.locator("a")).toHaveAttribute("target", "_blank");
    await expect(zero.locator("a")).toHaveAttribute("rel", /noopener/);

    const one = card(1);
    await expect(one.locator("a")).toHaveCount(1);
    await expect(one.locator("a")).toHaveText("Live Demo ↗");
    await expect(one.locator("a")).toHaveAttribute("href", "https://only-demo.example.com");

    const two = card(2);
    await expect(two.locator("a")).toHaveCount(0);
    await expect(two.locator(".card-back .border-t")).toHaveCount(0);
    expect((await two.locator("h3").innerText()).trim()).toBe("No Links <b>Bold</b> & Co");
    await expect(two.locator("b")).toHaveCount(0);
    await expect(two.locator("i")).toHaveCount(0);
    await expect(two.locator("u")).toHaveCount(0);
    expect((await two.locator(".card-front p").first().innerText()).trim()).toBe("Owns <i>everything</i>.");
    await expect(two.locator(".card-back li")).toHaveCount(1);
    expect((await two.locator(".card-back li").innerText()).trim()).toBe("Para with <u>markup</u>.");

    const three = card(3);
    await expect(three.locator("a")).toHaveCount(1);
    await expect(three.locator("a")).toHaveText("GitHub ↗");
    await expect(three.locator("a")).toHaveAttribute("href", "https://github.com/example/only-code");

    const four = card(4);
    await expect(four.locator(".card-front p")).toHaveCount(1);
    expect((await four.locator(".card-front p").innerText()).trim()).toBe("Click to see details →");
    await expect(four.locator(".card-front span")).toHaveCount(0);
    expect((await four.locator(".card-back h4").innerText()).trim()).toBe("Bare Minimum");
    await expect(four.locator(".card-back ul")).toHaveCount(0);
    await expect(four.locator(".card-back a")).toHaveCount(0);
    await expect(four.locator(".card-back .border-t")).toHaveCount(0);
    await expect(four.locator(".card-back p")).toHaveCount(1);
    expect((await four.locator(".card-back p").innerText()).trim()).toBe("← Click to go back");
  } finally {
    await context.close();
  }
});

test("E2E-11: odd stored records are skipped or tolerated and only http(s) links become links", async ({ baseURL, browser }) => {
  const base = String(baseURL);
  await blank(base);
  fs.writeFileSync(
    DB_FILE,
    JSON.stringify({
      projects: [
        { id: "11111111-1111-4111-8111-111111111111", position: 0, data: {} },
        {
          id: "22222222-2222-4222-8222-222222222222",
          position: 1,
          data: {
            title: "Analyst Tool",
            shortDesc: null,
            description: ["ok", 7, "  "],
            tech: ["Zig", null, ""],
            github: "javascript:alert(1)",
            demo: " https://ok.example.com/ ",
          },
        },
        {
          id: "33333333-3333-4333-8333-333333333333",
          position: 2,
          data: {
            title: "Real One",
            shortDesc: "Real summary",
            description: ["Real paragraph."],
            tech: ["TS"],
            github: "HTTP://UPPER.example.com/x",
            demo: "",
          },
        },
        { id: "44444444-4444-4444-8444-444444444444", position: 3, data: { title: "   ", shortDesc: "Ghost", description: [], tech: [], github: "", demo: "" } },
      ],
    }),
  );
  await publish(base);
  await waitFor(base, "Analyst Tool");

  const context = await browser.newContext({ baseURL: base });
  const page = await context.newPage();
  try {
    await page.goto("/");
    expect(await frontTitles(page)).toEqual(["Analyst Tool", "Real One"]);
    expect((await page.locator("section#projects").textContent()) ?? "").not.toContain("Ghost");

    const analyst = page.locator(CARDS).nth(0);
    const real = page.locator(CARDS).nth(1);
    await analyst.click();
    await real.click();

    await expect(analyst.locator(".card-front p")).toHaveCount(1);
    expect((await analyst.locator(".card-front p").innerText()).trim()).toBe("Click to see details →");
    await expect(analyst.locator(".card-front span")).toHaveCount(1);
    await expect(analyst.locator(".card-front span")).toHaveText("Zig");
    await expect(analyst.locator(".card-back li")).toHaveCount(1);
    await expect(analyst.locator(".card-back li")).toHaveText("ok");
    await expect(analyst.locator(".card-back a")).toHaveCount(1);
    await expect(analyst.locator(".card-back a")).toHaveText("Live Demo ↗");
    await expect(analyst.locator(".card-back a")).toHaveAttribute("href", "https://ok.example.com/");
    await expect(page.locator('a[href^="javascript"]')).toHaveCount(0);

    await expect(real.locator(".card-back a")).toHaveCount(1);
    await expect(real.locator(".card-back a")).toHaveText("GitHub ↗");
    expect(await real.locator(".card-back a").getAttribute("href")).toBe("HTTP://UPPER.example.com/x");
  } finally {
    await context.close();
  }
});

test("E2E-12: long unbroken words stay inside the card on a 375 pixel screen", async ({ baseURL, browser }) => {
  const base = String(baseURL);
  await blank(base);
  await addProject(
    base,
    {
      title: "Pneumonoultramicroscopicsilicovolcanoconiosis".repeat(2),
      shortDesc: "Antidisestablishmentarianism".repeat(3),
      description: ["Floccinaucinihilipilification".repeat(3)],
      tech: ["Supercalifragilisticexpialidocious".repeat(2)],
      github: "https://github.com/example/long",
      demo: "",
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
    const frontOverflow = await card.locator(".card-front").evaluate((front) =>
      Array.from(front.querySelectorAll("h3, p, span"))
        .filter((el) => el.scrollWidth > el.clientWidth)
        .map((el) => el.tagName + ":" + (el.textContent ?? "").slice(0, 20)),
    );
    expect(frontOverflow).toEqual([]);
    expect(await card.locator(".card-front h3").count()).toBeGreaterThan(0);

    await card.click();
    const backOverflows = await card.locator(".card-back").evaluate((back) => back.scrollWidth > back.clientWidth);
    expect(backOverflows).toBe(false);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  } finally {
    await context.close();
  }
});

test("E2E-13: a card opens and closes from the keyboard", async ({ baseURL, browser }) => {
  const base = String(baseURL);
  await blank(base);
  await addProject(base, QUANTUM, 0);
  await publish(base);
  await waitFor(base, "Quantum Notes");

  const context = await browser.newContext({ baseURL: base });
  const page = await context.newPage();
  try {
    await page.goto("/");
    const card = cardOf(page, "Quantum Notes");
    await card.focus();
    await page.keyboard.press("Enter");
    await expect(card).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Space");
    await expect(card).toHaveAttribute("aria-expanded", "false");
  } finally {
    await context.close();
  }
});

test("E2E-15: the new files keep the server and browser boundaries", async () => {
  const view = readText("src/lib/publicProjects.ts");
  for (const phrase of ["server-only", "@/lib/admin", "@/lib/server", "lib/server", "@/lib/auth", "cookies(", "headers("]) {
    expect(view, "publicProjects view must not contain " + phrase).not.toContain(phrase);
  }
  const read = readText("src/lib/server/publicProjects.ts");
  const firstLine = read.split("\n").find((line) => line.trim() !== "");
  expect(firstLine?.trim()).toBe('import "server-only";');
  for (const phrase of ["@/lib/auth", "@/lib/admin", "cookies(", "headers(", "console."]) {
    expect(read, "server read must not contain " + phrase).not.toContain(phrase);
  }
  const page = readText("src/app/page.tsx");
  expect(page).toContain("export const revalidate = false");
  expect(page.split("revalidate").length - 1).toBe(1);
  expect(page).toContain("publicProjects");
  for (const phrase of ["@/lib/auth", "cookies(", "headers("]) expect(page, "page.tsx must not contain " + phrase).not.toContain(phrase);
  const component = readText("src/app/components/project.tsx");
  for (const phrase of ["@/lib/server", "@/lib/admin", "fetch(", "process.env", "dangerouslySetInnerHTML"]) {
    expect(component, "project.tsx must not contain " + phrase).not.toContain(phrase);
  }
  const header = readText("src/app/components/header.tsx");
  expect(header).toContain("showProjects");
  for (const phrase of ["@/lib/server", "@/lib/admin"]) expect(header, "header.tsx must not contain " + phrase).not.toContain(phrase);
});

test("E2E-16: the earlier checks no longer expect the written-in projects", async () => {
  const retire = readText("e2e/retire-firebase.spec.ts");
  const hosting = readText("e2e/hosting-and-backend-migration-acceptance.spec.ts");
  const profile = readText("e2e/owner-publishes-profile.spec.ts");
  const experience = readText("e2e/owner-publishes-experience.spec.ts");
  expect(retire).not.toContain("src/app/components/project.tsx");
  expect(hosting).not.toContain("src/app/components/project.tsx");
  expect(retire).not.toContain('"section#projects"');
  expect(hosting).not.toMatch(/for \(const id of \[[^\]]*"projects"/);
  expect(profile).not.toMatch(/for \(const id of \[[^\]]*"projects"/);
  expect(experience).not.toContain('name: "Projects"');
});

test("E2E-17: the standing documents describe the projects as read from the database", async () => {
  const reference = readText("Reference.md");
  const claude = readText("CLAUDE.md");
  expect(reference).toContain("publicProjects");
  expect(reference).not.toContain("projects[]");
  expect(claude).toContain("src/lib/server/publicProjects.ts");
  expect(claude).toContain("the experience entries and the projects");
  expect(claude).toContain("last good copy");
  expect(claude).toContain("revalidatePath");
});
