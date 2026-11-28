import fs from "node:fs";
import path from "node:path";
import { expect, request as playwrightRequest, test, type APIRequestContext, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";
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
const TECH_API = "/api/admin/tech-stack/";
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
  await expect.poll(async () => /<h2[^>]*>(Tech Stack|Experience)<\/h2>/.test(await visitorText(base)), { timeout: 60000 }).toBe(false);
}

type Tool = { name: string; icon: string };
type Category = { category: string; tools: Tool[] };

async function addCategory(base: string, content: Category, position: number): Promise<string> {
  return withOwner(base, async (request) => {
    const response = await request.post(TECH_API, {
      headers: { cookie: await cookieOf(OWNER()), "content-type": "application/json" },
      data: JSON.stringify({ position, content }),
      maxRedirects: 0,
    });
    expect(response.status()).toBe(200);
    const body = (await response.json()) as { id: string };
    return body.id;
  });
}

async function editCategory(base: string, id: string, content: Category): Promise<void> {
  await withOwner(base, async (request) => {
    const response = await request.put(TECH_API + "?id=" + id, {
      headers: { cookie: await cookieOf(OWNER()), "content-type": "application/json" },
      data: JSON.stringify({ content }),
      maxRedirects: 0,
    });
    expect(response.status()).toBe(200);
  });
}

async function removeCategory(base: string, id: string): Promise<void> {
  await withOwner(base, async (request) => {
    const response = await request.delete(TECH_API + "?id=" + id, {
      headers: { cookie: await cookieOf(OWNER()) },
      maxRedirects: 0,
    });
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ deleted: true });
  });
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

async function openPanel(browser: Browser, base: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ baseURL: base });
  const [name, ...rest] = (await cookieOf(OWNER())).split("=");
  await context.addCookies([{ name, value: rest.join("="), url: base }]);
  const page = await context.newPage();
  await page.goto(PANEL);
  return { context, page };
}

const publishButton = (page: Page) => page.getByRole("button", { name: "Publish", exact: true });


const categoryHeadings = (page: Page) => page.locator("section#tech h3");
const categoryCard = (page: Page, i: number) => page.locator("section#tech h3").nth(i).locator("xpath=..");
const techHeading = (page: Page) => page.getByRole("heading", { level: 2, name: "Tech Stack", exact: true });
const experienceHeading = (page: Page) => page.getByRole("heading", { level: 2, name: "Experience", exact: true });
const experienceLink = (page: Page) => page.locator('nav[aria-label="Main navigation"]').getByRole("link", { name: "Experience", exact: true });
const attrsOf = (locator: Locator, name: string): Promise<(string | null)[]> => locator.evaluateAll((els, n) => els.map((el) => el.getAttribute(n)), name);

const FRONTEND: Category = { category: "Frontend", tools: [{ name: "React", icon: "/icons/react.png" }, { name: "Angular", icon: "/icons/angular.png" }] };
const BACKEND: Category = { category: "Backend", tools: [{ name: "Node.js", icon: "/icons/node.png" }] };
const REACT_ONLY: Category = { category: "Frontend", tools: [{ name: "React", icon: "/icons/react.png" }] };
const UPLOADED = "https://stand-in.invalid/storage/v1/object/public/images/55555555-5555-4555-8555-555555555555.png";
const SENIOR: Content = { year: "2027", title: "Senior Engineer", company: "Acme Pte Ltd", duration: "Jan 2027 - Present", description: "Leads the platform team.", details: [] };

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

test("E2E-01: a saved category stays hidden until Publish, then the landing page shows it", async ({ baseURL, browser }) => {
  const base = String(baseURL);
  await blank(base);
  await addCategory(base, FRONTEND, 0);
  await addCategory(base, BACKEND, 1);
  const before = await visitorText(base);
  expect(before).not.toContain("React icon");
  expect(before).not.toContain("Node.js icon");

  const { context, page } = await openPanel(browser, base);
  try {
    await publishButton(page).click();
    await expect(page.getByRole("status").filter({ hasText: /Published\./ })).toBeVisible();
    await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toHaveCount(0);
  } finally {
    await context.close();
  }
  await waitFor(base, "Node.js icon");

  const visitor = await browser.newContext({ baseURL: base });
  const landing = await visitor.newPage();
  try {
    await landing.goto("/");
    await expect(techHeading(landing)).toBeVisible();
    const headings = await landing.locator("section#experience h2").allInnerTexts();
    expect(headings.map((h) => h.trim())).toEqual(["Tech Stack"]);
    await expect(categoryHeadings(landing)).toHaveText(["Frontend", "Backend"]);
    const images = landing.locator("section#tech img");
    expect(await attrsOf(images, "alt")).toEqual(["React icon", "Angular icon", "Node.js icon"]);
    expect(await attrsOf(images, "src")).toEqual(["/icons/react.png", "/icons/angular.png", "/icons/node.png"]);
    await expect(categoryCard(landing, 0).locator("img")).toHaveCount(2);
    await expect(categoryCard(landing, 0).locator("p")).toHaveText(["React", "Angular"]);
    await expect(categoryCard(landing, 1).locator("img")).toHaveCount(1);
    await expect(categoryCard(landing, 1).locator("p")).toHaveText(["Node.js"]);
    await expect(experienceHeading(landing)).toHaveCount(0);
    await expect(experienceLink(landing)).toHaveCount(1);
  } finally {
    await visitor.close();
  }
});

test("E2E-02: an uploaded icon address is shown as saved", async ({ baseURL, browser }) => {
  const base = String(baseURL);
  await blank(base);
  await addCategory(base, { category: "Diagrams", tools: [{ name: "Uploaded", icon: UPLOADED }] }, 0);
  await publish(base);
  await waitFor(base, "Uploaded icon");

  const context = await browser.newContext({ baseURL: base });
  const page = await context.newPage();
  try {
    await page.goto("/");
    const image = page.locator('section#tech img[alt="Uploaded icon"]');
    await expect(image).toHaveCount(1);
    await expect(image).toHaveAttribute("src", UPLOADED);
    await expect(categoryCard(page, 0).locator("p")).toHaveText(["Uploaded"]);
  } finally {
    await context.close();
  }
});

test("E2E-03: an edited and an added category change for visitors only after Publish", async ({ baseURL, browser }) => {
  const base = String(baseURL);
  await blank(base);
  const id = await addCategory(base, REACT_ONLY, 0);
  await publish(base);
  await waitFor(base, "React icon");
  await editCategory(base, id, { category: "Frontend", tools: [{ name: "React", icon: "/icons/react.png" }, { name: "Vue", icon: "/icons/vue.png" }] });
  await addCategory(base, { category: "Cloud", tools: [{ name: "AWS", icon: "/icons/aws.png" }] }, 1);

  for (let i = 0; i < 2; i++) {
    const text = await visitorText(base);
    expect(text).toContain("React icon");
    expect(text).not.toContain("Vue icon");
    expect(text).not.toContain("AWS icon");
    expect(text).not.toContain(">Cloud</h3>");
  }
  const first = await browser.newContext({ baseURL: base });
  const pageA = await first.newPage();
  try {
    await pageA.goto("/");
    await expect(categoryHeadings(pageA)).toHaveText(["Frontend"]);
    expect(await attrsOf(pageA.locator("section#tech img"), "alt")).toEqual(["React icon"]);
  } finally {
    await first.close();
  }

  await publish(base);
  await waitFor(base, "AWS icon");
  const second = await browser.newContext({ baseURL: base });
  const pageB = await second.newPage();
  try {
    await pageB.goto("/");
    await expect(categoryHeadings(pageB)).toHaveText(["Frontend", "Cloud"]);
    expect(await attrsOf(pageB.locator("section#tech img"), "alt")).toEqual(["React icon", "Vue icon", "AWS icon"]);
    await expect(categoryCard(pageB, 0).locator("p")).toHaveText(["React", "Vue"]);
    await expect(categoryCard(pageB, 1).locator("p")).toHaveText(["AWS"]);
  } finally {
    await second.close();
  }
});

test("E2E-04: a category with no items stays in the panel and is not shown to visitors", async ({ baseURL, browser }) => {
  const base = String(baseURL);
  await blank(base);
  await addCategory(base, REACT_ONLY, 0);
  await addCategory(base, { category: "Tools", tools: [] }, 1);
  await publish(base);
  await waitFor(base, "React icon");

  const context = await browser.newContext({ baseURL: base });
  const page = await context.newPage();
  try {
    await page.goto("/");
    await expect(categoryHeadings(page)).toHaveText(["Frontend"]);
    expect(await page.locator("section#tech").textContent()).not.toContain("Tools");
  } finally {
    await context.close();
  }
  expect(await visitorText(base)).not.toContain(">Tools</h3>");

  const listed = await withOwner(base, async (request) => {
    const response = await request.get(TECH_API, { headers: { cookie: await cookieOf(OWNER()) }, maxRedirects: 0 });
    return { status: response.status(), body: (await response.json()) as { entries: { content: { category: string } }[] } };
  });
  expect(listed.status).toBe(200);
  expect(listed.body.entries.map((e) => e.content.category)).toEqual(["Frontend", "Tools"]);
});

test("E2E-05: deleting every category and publishing removes the block but keeps the timeline and the page", async ({ baseURL, browser }) => {
  const base = String(baseURL);
  await blank(base);
  await addEntry(base, SENIOR, 0);
  const id = await addCategory(base, REACT_ONLY, 0);
  await publish(base);
  await waitFor(base, "Senior Engineer");
  await waitFor(base, "React icon");
  await removeCategory(base, id);

  for (let i = 0; i < 2; i++) {
    expect(await visitorText(base)).toContain("React icon");
  }
  await publish(base);
  await expect.poll(async () => /<h2[^>]*>Tech Stack<\/h2>/.test(await visitorText(base)), { timeout: 60000 }).toBe(false);

  const context = await browser.newContext({ baseURL: base });
  const page = await context.newPage();
  try {
    await page.goto("/");
    await expect(techHeading(page)).toHaveCount(0);
    await expect(page.locator("section#tech")).toHaveCount(0);
    await expect(page.locator("section#tech img")).toHaveCount(0);
    await expect(experienceHeading(page)).toBeVisible();
    await expect(page.locator("section#experience").getByRole("button", { name: /^Senior Engineer at Acme Pte Ltd/ })).toHaveCount(1);
    await expect(experienceLink(page)).toHaveCount(1);
    await expect(page.getByRole("heading", { level: 2, name: "Projects" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Certifications" })).toBeVisible();
    await expect(page.getByRole("contentinfo")).toBeVisible();
  } finally {
    await context.close();
  }
  expect(await visitorText(base)).not.toContain("React icon");
});

test("E2E-06: with nothing saved the Experience section and its link are gone and the rest of the page works", async ({ baseURL, browser }) => {
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
    await expect(page.locator("section#experience")).toHaveCount(0);
    await expect(experienceHeading(page)).toHaveCount(0);
    await expect(techHeading(page)).toHaveCount(0);
    await expect(page.locator('img[src^="/icons/"]')).toHaveCount(0);
    await expect(experienceLink(page)).toHaveCount(0);
    const nav = page.locator('nav[aria-label="Main navigation"]');
    await expect(nav.getByRole("link", { name: "Projects" })).toHaveCount(1);
    await expect(nav.getByRole("link", { name: "Certifications" })).toHaveCount(1);
    await expect(page.getByRole("heading", { level: 2, name: "Projects" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Certifications" })).toBeVisible();
    const body = await page.evaluate(() => document.body.innerText);
    expect(body).not.toMatch(/no tech stack|no experience|coming soon|nothing to show/i);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});

test("E2E-07: no source file holds the old written-in tech stack", async () => {
  for (const file of filesUnder(path.join(process.cwd(), "src"))) {
    expect(fs.readFileSync(file, "utf8"), file + " must not contain /icons/").not.toContain("/icons/");
  }
  const component = readText("src/app/components/techstack.tsx");
  for (const phrase of ["const techStack", "Frontend", "Backend", "ASP.NET", "MS SQL"]) {
    expect(component, "techstack.tsx must not contain " + phrase).not.toContain(phrase);
  }
});

test("E2E-08: category and item text is shown literally, in the saved order, without merging", async ({ baseURL, browser }) => {
  const base = String(baseURL);
  await blank(base);
  await addCategory(
    base,
    {
      category: "Lead <b>Tools</b> & Co",
      tools: [
        { name: "A&B <i>x</i>", icon: "/icons/a.png" },
        { name: "Same", icon: "/icons/s.png" },
        { name: "Same", icon: "/icons/s.png" },
      ],
    },
    0,
  );
  await addCategory(base, { category: "Dup", tools: [{ name: "Two", icon: "/icons/two.png" }] }, 1);
  await addCategory(base, { category: "Dup", tools: [{ name: "One", icon: "/icons/one.png" }] }, 2);
  await publish(base);
  await waitFor(base, "One icon");

  const context = await browser.newContext({ baseURL: base });
  const page = await context.newPage();
  try {
    await page.goto("/");
    await expect(categoryHeadings(page)).toHaveText(["Lead <b>Tools</b> & Co", "Dup", "Dup"]);
    await expect(page.locator("section#tech b")).toHaveCount(0);
    await expect(page.locator("section#tech i")).toHaveCount(0);
    await expect(categoryCard(page, 0).locator("p")).toHaveText(["A&B <i>x</i>", "Same", "Same"]);
    await expect(categoryCard(page, 0).locator("img")).toHaveCount(3);
    await expect(categoryCard(page, 1).locator("p")).toHaveText(["Two"]);
    await expect(categoryCard(page, 2).locator("p")).toHaveText(["One"]);
  } finally {
    await context.close();
  }
});

test("E2E-09: long unbroken words stay inside the card on a 375 pixel screen", async ({ baseURL, browser }) => {
  const base = String(baseURL);
  await blank(base);
  await addCategory(
    base,
    {
      category: "Supercalifragilisticexpialidocious".repeat(2),
      tools: [{ name: "Antidisestablishmentarianism".repeat(2), icon: "/icons/long.png" }],
    },
    0,
  );
  await publish(base);
  await waitFor(base, "Antidisestablishmentarianism");

  const context = await browser.newContext({ baseURL: base, viewport: { width: 375, height: 800 } });
  const page = await context.newPage();
  try {
    await page.goto("/");
    await expect(categoryHeadings(page).first()).toBeVisible();
    const measures = await page.evaluate(() => {
      const heading = document.querySelector("section#tech h3") as HTMLElement;
      const card = heading.parentElement as HTMLElement;
      const item = card.querySelector("p") as HTMLElement;
      return [heading, card, item].map((el) => ({
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        right: el.getBoundingClientRect().right,
      }));
    });
    expect(measures).toHaveLength(3);
    for (const m of measures) {
      expect(m.scrollWidth).toBeLessThanOrEqual(m.clientWidth);
      expect(m.right).toBeLessThanOrEqual(375);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  } finally {
    await context.close();
  }
});

test("E2E-10: a failed publish keeps the old categories and leaks nothing", async ({ baseURL }) => {
  const base = String(baseURL);
  await blank(base);
  const id = await addCategory(base, REACT_ONLY, 0);
  await publish(base);
  await waitFor(base, "React icon");
  await editCategory(base, id, { category: "Frontend", tools: [{ name: "React", icon: "/icons/react.png" }, { name: "Vue", icon: "/icons/vue.png" }] });

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
    expect(text).toContain("React icon");
    expect(text).not.toContain("Vue icon");
  }
});

test("E2E-11: odd stored records are skipped or tolerated", async ({ baseURL, browser }) => {
  const base = String(baseURL);
  await blank(base);
  fs.writeFileSync(
    DB_FILE,
    JSON.stringify({
      tech_categories: [
        { id: "11111111-1111-4111-8111-111111111111", position: 0, data: {} },
        {
          id: "22222222-2222-4222-8222-222222222222",
          position: 1,
          data: {
            category: "Mixed",
            tools: [
              { name: "Ok", icon: "/icons/ok.png" },
              { name: "", icon: "/icons/blank.png" },
              { name: "NoIcon", icon: "" },
              { name: "Relative", icon: "icons/rel.png" },
              { name: "Script", icon: "javascript:alert(1)" },
              { name: "Protocol", icon: "//evil.example/x.png" },
              7,
              null,
              { name: 5, icon: null },
            ],
          },
        },
        { id: "33333333-3333-4333-8333-333333333333", position: 2, data: { category: "AllBad", tools: [{ name: "X", icon: "nope" }] } },
        { id: "44444444-4444-4444-8444-444444444444", position: 3, data: { category: "   ", tools: [{ name: "Y", icon: "/icons/y.png" }] } },
        { id: "55555555-5555-4555-8555-555555555555", position: 4, data: null },
        { id: "66666666-6666-4666-8666-666666666666", position: 5, data: { category: "Real", tools: [{ name: "Z", icon: UPLOADED }] } },
      ],
    }),
  );
  await publish(base);
  await waitFor(base, "Z icon");

  const context = await browser.newContext({ baseURL: base });
  const page = await context.newPage();
  try {
    await page.goto("/");
    await expect(categoryHeadings(page)).toHaveText(["Mixed", "Real"]);
    expect(await attrsOf(categoryCard(page, 0).locator("img"), "alt")).toEqual(["Ok icon"]);
    expect(await attrsOf(categoryCard(page, 1).locator("img"), "alt")).toEqual(["Z icon"]);
    expect(await page.locator("section#tech").textContent()).not.toContain("AllBad");
  } finally {
    await context.close();
  }
  const text = await visitorText(base);
  expect(text).not.toContain("javascript:alert");
  expect(text).not.toContain("evil.example");
});

test("E2E-15: the new files keep the server and browser boundaries", async () => {
  const view = readText("src/lib/publicTechStack.ts");
  for (const phrase of ["server-only", "@/lib/admin", "@/lib/server", "lib/server", "@/lib/auth", "cookies(", "headers("]) {
    expect(view, "publicTechStack view must not contain " + phrase).not.toContain(phrase);
  }
  const read = readText("src/lib/server/publicTechStack.ts");
  const firstLine = read.split("\n").find((line) => line.trim() !== "");
  expect(firstLine?.trim()).toBe('import "server-only";');
  for (const phrase of ["@/lib/auth", "@/lib/admin", "cookies(", "headers(", "console."]) {
    expect(read, "server read must not contain " + phrase).not.toContain(phrase);
  }
  const page = readText("src/app/page.tsx");
  expect(page).toContain("export const revalidate = false");
  expect(page.split("revalidate").length - 1).toBe(1);
  expect(page).toContain("publicTechStack");
  for (const phrase of ["@/lib/auth", "cookies(", "headers("]) expect(page, "page.tsx must not contain " + phrase).not.toContain(phrase);
  for (const file of ["src/app/components/techstack.tsx", "src/app/components/header.tsx"]) {
    const text = readText(file);
    for (const phrase of ["@/lib/server", "@/lib/admin", "fetch(", "process.env"]) {
      expect(text, file + " must not contain " + phrase).not.toContain(phrase);
    }
  }
});
