import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PROJECT_MESSAGES,
  PROJECTS_COLLECTION,
  checkProject,
  emptyProject,
  projectFromData,
  projectLabel,
  projectToData,
} from "../src/lib/admin/projects";
import { UNPOSITIONED, bottomPosition, topPosition } from "../src/lib/admin/list";

const GITHUB_MSG = "GitHub link must start with https:// or http://";
const DEMO_MSG = "Demo link must start with https:// or http://";
const EMPTY = { title: "", shortDesc: "", description: [], tech: [], github: "", demo: "" };

const FIRESTORE = "http://127.0.0.1:8080";
const PROJECT = "thegoldenpothos-5b3a1";
const DOCS = `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents`;
const PANEL = "/bright-warm-greenhouse/";
const PLACEHOLDER = "REPLACE_WITH_OWNER_UID";
const BIG = 1000000000000;
const ADMIN = { Authorization: "Bearer owner", "Content-Type": "application/json" };
const repoText = (name: string) => readFileSync(join(process.cwd(), name), "utf8");

type Proj = { id: string; title: string; shortDesc: string; description: string[]; tech: string[]; github: string; demo: string; position: number; updatedAt: number };
const K: Proj = { id: "e2e-k", title: "Kaafei", shortDesc: "My side coffee geek", description: ["Coffee shop site."], tech: ["Next.js", "Tailwind"], github: "", demo: "https://kaafei.org", position: 0, updatedAt: 1 };
const W: Proj = { id: "e2e-w", title: "Portfolio Website", shortDesc: "My interactive resume", description: ["Portfolio paragraph one.", "Portfolio paragraph two."], tech: ["Next.js", "Framer Motion"], github: "https://github.com/keefhub/my-portfolio", demo: "", position: 1, updatedAt: 1 };
const R: Proj = { id: "e2e-r", title: "Recipe Database", shortDesc: "Recipes in MySQL", description: ["Recipe paragraph."], tech: ["React.js", "MySQL"], github: "https://github.com/keefhub/C-projects", demo: "", position: 2, updatedAt: 1 };
const at = (x: Proj, p: number): Proj => ({ ...x, position: p });
const core = (p: Proj) => {
  const { updatedAt: _u, ...rest } = p;
  return rest;
};

async function putRules(content: string): Promise<void> {
  const res = await fetch(`${FIRESTORE}/emulator/v1/projects/${PROJECT}:securityRules`, {
    method: "PUT",
    body: JSON.stringify({ rules: { files: [{ name: "firestore.rules", content }] } }),
  });
  expect(res.status).toBe(200);
}
async function RF(uid: string | null): Promise<void> {
  const text = repoText("firestore.rules");
  await putRules(uid === null ? text : text.replace(PLACEHOLDER, uid));
}

const str = (v: string) => ({ stringValue: v });
const strList = (v: string[]) => ({ arrayValue: v.length ? { values: v.map(str) } : {} });
async function seedProj(p: Proj): Promise<void> {
  const fields = {
    title: str(p.title),
    shortDesc: str(p.shortDesc),
    description: strList(p.description),
    tech: strList(p.tech),
    github: str(p.github),
    demo: str(p.demo),
    position: { integerValue: String(p.position) },
    updatedAt: { integerValue: String(p.updatedAt) },
  };
  const res = await fetch(`${DOCS}/projects/${p.id}`, { method: "PATCH", headers: ADMIN, body: JSON.stringify({ fields }) });
  expect(res.status).toBe(200);
}
async function readProj(): Promise<Proj[]> {
  const res = await fetch(`${DOCS}/projects?pageSize=300`, { headers: ADMIN });
  const body = (await res.json()) as { documents?: { name: string; fields: any }[] };
  const list = (body.documents ?? []).map((d) => {
    const f = d.fields;
    return {
      id: d.name.split("/").pop() as string,
      title: f.title.stringValue,
      shortDesc: f.shortDesc.stringValue,
      description: (f.description.arrayValue.values ?? []).map((v: any) => v.stringValue),
      tech: (f.tech.arrayValue.values ?? []).map((v: any) => v.stringValue),
      github: f.github.stringValue,
      demo: f.demo.stringValue,
      position: Number(f.position.integerValue),
      updatedAt: Number(f.updatedAt.integerValue),
    } as Proj;
  });
  return list.sort((x, y) => x.position - y.position || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
}
async function clearAll(): Promise<void> {
  const res = await fetch(`${DOCS}/projects?pageSize=300`, { headers: ADMIN });
  const body = (await res.json()) as { documents?: { name: string }[] };
  for (const d of body.documents ?? []) await fetch(`${FIRESTORE}/v1/${d.name}`, { method: "DELETE", headers: ADMIN });
}

async function P(page: Page): Promise<void> {
  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Sign in with Google" }).click();
  const popup = await popupPromise;
  await popup.waitForLoadState("load");
  await popup.locator("#add-account-button").click();
  await popup.locator("#autogen-button").click();
  await popup.locator("#sign-in").click();
}
const nav = (page: Page) => page.getByRole("navigation", { name: "Admin sections" });
const USER_ID = (page: Page) => page.getByText(/^Your user ID:/);
async function ownerSession(page: Page): Promise<string> {
  await clearAll();
  await page.goto(PANEL);
  await P(page);
  const idLine = page.getByText(/^Your user ID: [A-Za-z0-9]{20,}$/);
  await expect(idLine).toBeVisible();
  const X = (await idLine.locator("code").innerText()).trim();
  await page.evaluate((v) => window.localStorage.setItem("admin.ownerUid", v), X);
  await page.reload();
  await expect(nav(page)).toBeVisible();
  await expect(USER_ID(page)).toHaveCount(0);
  await RF(X);
  return X;
}
async function openProjects(page: Page): Promise<void> {
  await nav(page).getByRole("button", { name: "Projects", exact: true }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Projects" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add entry", exact: true })).toBeVisible();
}
async function reopen(page: Page): Promise<void> {
  await page.reload();
  await expect(nav(page)).toBeVisible();
  await openProjects(page);
}
const ENTRIES = (page: Page) => page.getByRole("list", { name: "Projects list" }).getByRole("listitem");
const rowFor = (page: Page, label: string) => ENTRIES(page).filter({ has: page.getByText(label, { exact: true }) });
const field = (page: Page, label: string) => page.getByLabel(label, { exact: true });
const PARAS = (page: Page) => page.getByRole("textbox", { name: /^Paragraph \d+$/ });
const TECHS = (page: Page) => page.getByRole("textbox", { name: /^Tech name \d+$/ });
const EDITOR = (page: Page) => page.locator('section[aria-label="Projects editor"]');
const GROUP = (page: Page) => page.getByRole("group", { name: "Confirm delete" });
const btn = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
const text = (page: Page, t: string) => page.getByText(t, { exact: true });
const inRow = (row: ReturnType<typeof rowFor>, name: string) => row.getByRole("button", { name, exact: true });

async function measureLayout(page: Page): Promise<{ scrollWidth: number; bad: string[] }> {
  return page.evaluate(() => {
    const root = document.querySelector('section[aria-label="Projects editor"]');
    const bad: string[] = [];
    root?.querySelectorAll("button, input, textarea").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return;
      const name = (el.textContent || (el as HTMLInputElement).value || el.tagName).slice(0, 20);
      if (r.x < 0 || r.x + r.width > 375) bad.push(`${name} x=${r.x} w=${r.width}`);
      if (el.tagName === "BUTTON" && r.height < 43.99) bad.push(`${name} h=${r.height}`);
    });
    return { scrollWidth: document.documentElement.scrollWidth, bad };
  });
}

test.describe("manage-projects", () => {
  test.describe.configure({ mode: "serial", timeout: 60000 });

  test("E2E-01: checkProject trims, drops blanks and does not mutate the input", () => {
    const input = {
      title: " Kaafei ",
      shortDesc: " My side coffee geek ",
      description: ["  Coffee shop site. ", "   ", ""],
      tech: ["  Next.js ", "", " Tailwind", "  "],
      github: "  ",
      demo: " https://kaafei.org ",
    };
    expect(checkProject(input)).toEqual({
      ok: true,
      content: {
        title: "Kaafei",
        shortDesc: "My side coffee geek",
        description: ["Coffee shop site."],
        tech: ["Next.js", "Tailwind"],
        github: "",
        demo: "https://kaafei.org",
      },
    });
    expect(input.tech).toHaveLength(4);
    expect(input.description).toHaveLength(3);
    expect(input.title).toBe(" Kaafei ");
  });

  test("E2E-02: checkProject refuses an empty title only", () => {
    const B = { title: "Kaafei", shortDesc: "", description: [], tech: [], github: "", demo: "" };
    const refused = [
      checkProject({ ...B, title: "   " }),
      checkProject({ ...B, title: "" }),
      checkProject({ ...B, title: "\t\n" }),
      checkProject({
        title: "",
        shortDesc: "My side coffee geek",
        description: [],
        tech: [],
        github: "",
        demo: "https://kaafei.org",
      }),
    ];
    for (const r of refused) {
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors).toEqual({ title: "Title is required" });
    }
    expect(checkProject(B)).toEqual({ ok: true, content: B });
    expect(checkProject({ ...B, title: "  Kaafei  " })).toEqual({ ok: true, content: B });
  });

  test("E2E-03: checkProject requires http(s) links when present", () => {
    const B = { title: "Kaafei", shortDesc: "", description: [], tech: [], github: "", demo: "" };
    const errorsOf = (r: ReturnType<typeof checkProject>) => {
      expect(r.ok).toBe(false);
      return r.ok ? null : r.errors;
    };
    expect(errorsOf(checkProject({ ...B, github: "ftp://x.test" }))).toEqual({ github: GITHUB_MSG });
    expect(errorsOf(checkProject({ ...B, demo: "kaafei.org" }))).toEqual({ demo: DEMO_MSG });
    expect(errorsOf(checkProject({ ...B, github: "httpx://a.test" }))).toEqual({ github: GITHUB_MSG });
    expect(errorsOf(checkProject({ ...B, github: "http:/a.test" }))).toEqual({ github: GITHUB_MSG });

    const okDemo = checkProject({ ...B, demo: "http://kaafei.org" });
    expect(okDemo.ok).toBe(true);
    if (okDemo.ok) expect(okDemo.content.demo).toBe("http://kaafei.org");
    const upper = checkProject({ ...B, demo: "HTTPS://Kaafei.org" });
    expect(upper.ok).toBe(true);
    if (upper.ok) expect(upper.content.demo).toBe("HTTPS://Kaafei.org");
    const padded = checkProject({ ...B, github: " https://github.com/keefhub/x " });
    expect(padded.ok).toBe(true);
    if (padded.ok) expect(padded.content.github).toBe("https://github.com/keefhub/x");
    const blank = checkProject({ ...B, demo: "   " });
    expect(blank.ok).toBe(true);
    if (blank.ok) expect(blank.content.demo).toBe("");

    expect(
      errorsOf(checkProject({ ...B, title: "", demo: "kaafei.org", github: "ftp://x.test" })),
    ).toEqual({ title: "Title is required", github: GITHUB_MSG, demo: DEMO_MSG });

    expect(PROJECT_MESSAGES.githubInvalid).toBe(GITHUB_MSG);
    expect(PROJECT_MESSAGES.demoInvalid).toBe(DEMO_MSG);
  });

  test("E2E-04: projectFromData is tolerant and the data helpers round-trip", () => {
    const a = projectFromData({
      title: "Kaafei",
      shortDesc: "My side coffee geek",
      description: ["One", "Two"],
      tech: ["Next.js"],
      github: "",
      demo: "https://kaafei.org",
      position: 3,
      updatedAt: 5,
    });
    expect(a).toEqual({
      title: "Kaafei",
      shortDesc: "My side coffee geek",
      description: ["One", "Two"],
      tech: ["Next.js"],
      github: "",
      demo: "https://kaafei.org",
    });
    expect(projectFromData({})).toEqual(EMPTY);
    expect(
      projectFromData({ title: 5, shortDesc: null, description: "x", tech: {}, github: [], demo: false }),
    ).toEqual(EMPTY);
    expect(projectFromData({ description: [1, "ok", null, "fine"], tech: ["a", 2] })).toEqual({
      ...EMPTY,
      description: ["ok", "fine"],
      tech: ["a"],
    });
    expect(projectFromData(null)).toEqual(EMPTY);
    expect(projectFromData("x")).toEqual(EMPTY);

    const first = emptyProject();
    const second = emptyProject();
    first.description.push("z");
    first.tech.push("z");
    expect(second.description).toHaveLength(0);
    expect(second.tech).toHaveLength(0);

    const data = projectToData(a);
    expect(Object.keys(data).sort()).toEqual(
      ["demo", "description", "github", "shortDesc", "tech", "title"],
    );
    expect(data.description).toEqual(a.description);
    expect(data.tech).toEqual(a.tech);
    expect(data.description).not.toBe(a.description);
    expect(data.tech).not.toBe(a.tech);

    expect(projectLabel(a)).toBe("Kaafei");
    expect(PROJECT_MESSAGES.titleRequired).toBe("Title is required");
    expect(PROJECT_MESSAGES.emptyList).toBe("No projects yet.");
    expect(PROJECT_MESSAGES.listLabel).toBe("Projects list");
    expect(PROJECTS_COLLECTION).toBe("projects");
  });

  test("E2E-05: bottomPosition gives the next place after the last and leaves input alone", () => {
    const E = (id: string, p: number) => ({ id, position: p, content: id });
    expect(bottomPosition([])).toBe(0);
    const two = [E("a", 0), E("b", 1)];
    expect(bottomPosition(two)).toBe(2);
    expect(bottomPosition([E("a", 5), E("b", -3)])).toBe(6);
    expect(bottomPosition([E("a", UNPOSITIONED)])).toBe(0);
    expect(bottomPosition([E("a", UNPOSITIONED), E("b", 7)])).toBe(8);
    expect(two).toEqual([E("a", 0), E("b", 1)]);
    expect(topPosition(two)).toBe(-1);
  });
  test("E2E-06: adding a project saves it at the end and it survives a reload", async ({ page }) => {
    await ownerSession(page);
    await openProjects(page);
    await expect(text(page, "No projects yet.")).toBeVisible();
    await expect(page.getByRole("list", { name: "Projects list" })).toHaveCount(0);
    for (const n of ["Edit", "Move up", "Move down", "Delete"]) await expect(EDITOR(page).getByRole("button", { name: n, exact: true })).toHaveCount(0);
    expect(await readProj()).toEqual([]);
    await btn(page, "Add entry").click();
    await expect(page.getByRole("heading", { level: 3, name: "Add entry" })).toBeVisible();
    await field(page, "Title").fill("Kaafei");
    await field(page, "Short description").fill("My side coffee geek");
    await field(page, "Demo link").fill("https://kaafei.org");
    await btn(page, "Add paragraph").click();
    await field(page, "Paragraph 1").fill("Coffee shop site.");
    await btn(page, "Add tech name").click();
    await field(page, "Tech name 1").fill("Next.js");
    await btn(page, "Add tech name").click();
    await field(page, "Tech name 2").fill("Vue");
    await btn(page, "Add tech name").click();
    await field(page, "Tech name 3").fill("Tailwind");
    await btn(page, "Remove tech name 2").click();
    await expect(TECHS(page)).toHaveCount(2);
    await expect(TECHS(page).nth(0)).toHaveValue("Next.js");
    await expect(TECHS(page).nth(1)).toHaveValue("Tailwind");
    await btn(page, "Save").click();
    await expect(text(page, "Entry saved")).toBeVisible();
    await expect(page.getByRole("heading", { level: 3, name: "Add entry" })).toHaveCount(0);
    await expect(text(page, "No projects yet.")).toHaveCount(0);
    await expect(ENTRIES(page)).toHaveCount(1);
    await expect(ENTRIES(page)).toContainText(["Kaafei"]);
    const saved = await readProj();
    expect(saved).toHaveLength(1);
    expect(saved[0].title).toBe("Kaafei");
    expect(saved[0].shortDesc).toBe("My side coffee geek");
    expect(saved[0].description).toEqual(["Coffee shop site."]);
    expect(saved[0].tech).toEqual(["Next.js", "Tailwind"]);
    expect(saved[0].github).toBe("");
    expect(saved[0].demo).toBe("https://kaafei.org");
    expect(saved[0].position).toBe(0);
    expect(saved[0].updatedAt).toBeGreaterThan(BIG);
    await reopen(page);
    await inRow(ENTRIES(page), "Edit").click();
    await expect(page.getByRole("heading", { level: 3, name: "Edit entry" })).toBeVisible();
    await expect(field(page, "Title")).toHaveValue("Kaafei");
    await expect(field(page, "Short description")).toHaveValue("My side coffee geek");
    await expect(field(page, "GitHub link")).toHaveValue("");
    await expect(field(page, "Demo link")).toHaveValue("https://kaafei.org");
    await expect(PARAS(page)).toHaveCount(1);
    await expect(PARAS(page).nth(0)).toHaveValue("Coffee shop site.");
    await expect(TECHS(page)).toHaveCount(2);
    await expect(TECHS(page).nth(0)).toHaveValue("Next.js");
    await expect(TECHS(page).nth(1)).toHaveValue("Tailwind");
  });

  test("E2E-07: editing a project changes only that project", async ({ page }) => {
    await ownerSession(page);
    await seedProj(K);
    await seedProj(W);
    await openProjects(page);
    await inRow(rowFor(page, "Kaafei"), "Edit").click();
    await expect(page.getByRole("heading", { level: 3, name: "Edit entry" })).toBeVisible();
    await expect(field(page, "Title")).toHaveValue("Kaafei");
    await expect(field(page, "Short description")).toHaveValue("My side coffee geek");
    await expect(field(page, "Demo link")).toHaveValue("https://kaafei.org");
    await expect(PARAS(page)).toHaveCount(1);
    await expect(TECHS(page)).toHaveCount(2);
    await field(page, "Title").fill("Kaafei Coffee");
    await btn(page, "Save").click();
    await expect(text(page, "Entry saved")).toBeVisible();
    await expect(ENTRIES(page)).toContainText(["Kaafei Coffee", "Portfolio Website"]);
    await expect(text(page, "Kaafei")).toHaveCount(0);
    const list = await readProj();
    const k = list.find((p) => p.id === "e2e-k")!;
    const w = list.find((p) => p.id === "e2e-w")!;
    expect(k.title).toBe("Kaafei Coffee");
    expect(k.updatedAt).toBeGreaterThan(BIG);
    expect(core(k)).toEqual({ ...core(K), title: "Kaafei Coffee" });
    expect(core(w)).toEqual(core(W));
    await reopen(page);
    await expect(ENTRIES(page)).toContainText(["Kaafei Coffee", "Portfolio Website"]);
    await expect(text(page, "Kaafei")).toHaveCount(0);
  });

  test("E2E-08: moving a project up swaps the order and keeps it after a reload", async ({ page }) => {
    await ownerSession(page);
    await seedProj(K);
    await seedProj(W);
    await seedProj(R);
    await openProjects(page);
    await expect(ENTRIES(page)).toContainText(["Kaafei", "Portfolio Website", "Recipe Database"]);
    const kr = rowFor(page, "Kaafei");
    const wr = rowFor(page, "Portfolio Website");
    const rr = rowFor(page, "Recipe Database");
    await expect(inRow(kr, "Move up")).toHaveCount(0);
    await expect(inRow(kr, "Move down")).toHaveCount(1);
    await expect(inRow(rr, "Move down")).toHaveCount(0);
    await expect(inRow(rr, "Move up")).toHaveCount(1);
    await expect(inRow(wr, "Move up")).toHaveCount(1);
    await expect(inRow(wr, "Move down")).toHaveCount(1);
    await inRow(rr, "Move up").click();
    await expect(ENTRIES(page)).toContainText(["Kaafei", "Recipe Database", "Portfolio Website"]);
    await expect(text(page, "Order saved")).toBeVisible();
    const list = await readProj();
    expect(list.map((p) => p.id)).toEqual(["e2e-k", "e2e-r", "e2e-w"]);
    expect(list.map((p) => p.position)).toEqual([0, 1, 2]);
    const fx = [K, R, W];
    list.forEach((p, i) => expect(core(p)).toEqual({ ...core(fx[i]), position: i }));
    await reopen(page);
    await expect(ENTRIES(page)).toContainText(["Kaafei", "Recipe Database", "Portfolio Website"]);
  });

  test("E2E-09: a project without a title is refused and nothing is saved", async ({ page }) => {
    await ownerSession(page);
    await openProjects(page);
    await btn(page, "Add entry").click();
    await field(page, "Short description").fill("My side coffee geek");
    await field(page, "Demo link").fill("https://kaafei.org");
    await btn(page, "Save").click();
    await expect(field(page, "Title")).toHaveAccessibleDescription("Title is required");
    await expect(field(page, "Short description")).toHaveAccessibleDescription("");
    await expect(field(page, "GitHub link")).toHaveAccessibleDescription("");
    await expect(field(page, "Demo link")).toHaveAccessibleDescription("");
    await expect(field(page, "Short description")).toHaveValue("My side coffee geek");
    await expect(field(page, "Demo link")).toHaveValue("https://kaafei.org");
    await expect(page.getByRole("heading", { level: 3, name: "Add entry" })).toBeVisible();
    await expect(text(page, "Entry saved")).toHaveCount(0);
    expect(await readProj()).toEqual([]);
    await btn(page, "Cancel").click();
    await expect(text(page, "No projects yet.")).toBeVisible();
    await expect(page.getByRole("list", { name: "Projects list" })).toHaveCount(0);
  });

  test("E2E-10: a confirmed delete removes the project for good", async ({ page }) => {
    await ownerSession(page);
    await seedProj(K);
    await seedProj(R);
    await openProjects(page);
    await inRow(rowFor(page, "Recipe Database"), "Delete").click();
    await expect(rowFor(page, "Recipe Database").locator(GROUP(page))).toHaveCount(1);
    await expect(GROUP(page)).toContainText('Delete "Recipe Database"? This cannot be undone.');
    await expect(ENTRIES(page)).toHaveCount(2);
    expect((await readProj()).map((p) => p.id)).toEqual(["e2e-k", "e2e-r"]);
    await GROUP(page).getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(text(page, "Entry deleted")).toBeVisible();
    await expect(GROUP(page)).toHaveCount(0);
    await expect(ENTRIES(page)).toHaveCount(1);
    await expect(ENTRIES(page)).toContainText(["Kaafei"]);
    await expect(page.getByText("Recipe Database")).toHaveCount(0);
    const list = await readProj();
    expect(list.map((p) => p.id)).toEqual(["e2e-k"]);
    expect(core(list[0])).toEqual(core(K));
    await reopen(page);
    await expect(ENTRIES(page)).toHaveCount(1);
    await expect(ENTRIES(page)).toContainText(["Kaafei"]);
    await expect(page.getByText("Recipe Database")).toHaveCount(0);
  });

  test("E2E-11: cancelling a delete keeps the project", async ({ page }) => {
    await ownerSession(page);
    await seedProj(K);
    await seedProj(R);
    await openProjects(page);
    await inRow(rowFor(page, "Recipe Database"), "Delete").click();
    await GROUP(page).getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(GROUP(page)).toHaveCount(0);
    await expect(ENTRIES(page)).toContainText(["Kaafei", "Recipe Database"]);
    await expect(inRow(rowFor(page, "Recipe Database"), "Delete")).toBeEnabled();
    await expect(text(page, "Entry deleted")).toHaveCount(0);
    let list = await readProj();
    expect(list.map((p) => p.id)).toEqual(["e2e-k", "e2e-r"]);
    expect(core(list[0])).toEqual(core(K));
    expect(core(list[1])).toEqual(core(R));
    await reopen(page);
    await expect(ENTRIES(page)).toContainText(["Kaafei", "Recipe Database"]);
    list = await readProj();
    expect(list.map((p) => p.id)).toEqual(["e2e-k", "e2e-r"]);
  });

  test("E2E-12: at 375 pixels nothing overflows and every button is tall enough", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await ownerSession(page);
    const rep = (c: string) => c.repeat(80);
    const LONG: Proj = {
      id: "e2e-long",
      title: rep("L"),
      shortDesc: rep("S"),
      description: [rep("P")],
      tech: [rep("T")],
      github: "https://github.com/" + "g".repeat(60),
      demo: "https://" + "d".repeat(70),
      position: 1,
      updatedAt: 1,
    };
    await seedProj(K);
    await seedProj(LONG);
    await seedProj(at(R, 2));
    await openProjects(page);
    const long = rowFor(page, rep("L"));
    await expect(long).toHaveCount(1);
    for (const n of ["Edit", "Move up", "Move down", "Delete"]) await expect(inRow(long, n)).toBeVisible();
    let m = await measureLayout(page);
    expect(m.scrollWidth).toBeLessThanOrEqual(375);
    expect(m.bad).toEqual([]);
    const box = await text(page, rep("L")).boundingBox();
    expect(box!.x + box!.width).toBeLessThanOrEqual(375);
    await inRow(long, "Edit").click();
    await expect(page.getByRole("heading", { level: 3, name: "Edit entry" })).toBeVisible();
    await expect(field(page, "Title")).toHaveValue(rep("L"));
    await expect(field(page, "Paragraph 1")).toHaveValue(rep("P"));
    await expect(field(page, "Tech name 1")).toHaveValue(rep("T"));
    m = await measureLayout(page);
    expect(m.scrollWidth).toBeLessThanOrEqual(375);
    expect(m.bad).toEqual([]);
    await expect(btn(page, "Save")).toBeVisible();
    await expect(btn(page, "Add paragraph")).toBeVisible();
    await expect(btn(page, "Add tech name")).toBeVisible();
    await btn(page, "Cancel").click();
    await inRow(long, "Delete").click();
    await expect(GROUP(page)).toBeVisible();
    await expect(GROUP(page).getByRole("button", { name: "Confirm", exact: true })).toBeVisible();
    await expect(GROUP(page).getByRole("button", { name: "Cancel", exact: true })).toBeVisible();
    m = await measureLayout(page);
    expect(m.scrollWidth).toBeLessThanOrEqual(375);
    expect(m.bad).toEqual([]);
  });

  test("E2E-13: a new project goes to the end and a repeated title is allowed", async ({ page }) => {
    await ownerSession(page);
    await seedProj(K);
    await seedProj(W);
    await openProjects(page);
    await btn(page, "Add entry").click();
    await field(page, "Title").fill("Kaafei");
    await field(page, "Short description").fill("Second Kaafei");
    await btn(page, "Save").click();
    await expect(text(page, "Entry saved")).toBeVisible();
    await expect(ENTRIES(page)).toContainText(["Kaafei", "Portfolio Website", "Kaafei"]);
    await expect(EDITOR(page).getByRole("alert")).toHaveCount(0);
    await expect(inRow(ENTRIES(page).first(), "Move up")).toHaveCount(0);
    await expect(inRow(ENTRIES(page).last(), "Move down")).toHaveCount(0);
    const list = await readProj();
    expect(list).toHaveLength(3);
    expect(list.slice(0, 2).map((p) => p.id)).toEqual(["e2e-k", "e2e-w"]);
    expect(list[2].title).toBe("Kaafei");
    expect(list[2].shortDesc).toBe("Second Kaafei");
    expect(list[2].description).toEqual([]);
    expect(list[2].tech).toEqual([]);
    expect(list[2].github).toBe("");
    expect(list[2].demo).toBe("");
    expect(list[2].position).toBe(2);
    expect(list[2].updatedAt).toBeGreaterThan(BIG);
    expect(core(list[0])).toEqual(core(K));
    expect(core(list[1])).toEqual(core(W));
    await reopen(page);
    await expect(ENTRIES(page)).toContainText(["Kaafei", "Portfolio Website", "Kaafei"]);
  });

  test("E2E-14: a link that is not http(s) is refused and an empty one is accepted", async ({ page }) => {
    await ownerSession(page);
    await openProjects(page);
    await btn(page, "Add entry").click();
    await field(page, "Title").fill("Kaafei");
    await field(page, "GitHub link").fill("ftp://x.test");
    await field(page, "Demo link").fill("kaafei.org");
    await btn(page, "Save").click();
    await expect(field(page, "GitHub link")).toHaveAccessibleDescription("GitHub link must start with https:// or http://");
    await expect(field(page, "Demo link")).toHaveAccessibleDescription("Demo link must start with https:// or http://");
    await expect(field(page, "Title")).toHaveAccessibleDescription("");
    await expect(field(page, "Title")).toHaveValue("Kaafei");
    await expect(field(page, "GitHub link")).toHaveValue("ftp://x.test");
    await expect(field(page, "Demo link")).toHaveValue("kaafei.org");
    await expect(page.getByRole("heading", { level: 3, name: "Add entry" })).toBeVisible();
    await expect(text(page, "Entry saved")).toHaveCount(0);
    expect(await readProj()).toEqual([]);
    await field(page, "GitHub link").fill("   ");
    await field(page, "Demo link").fill("");
    await btn(page, "Save").click();
    await expect(text(page, "Entry saved")).toBeVisible();
    const list = await readProj();
    expect(list).toHaveLength(1);
    expect(list[0].title).toBe("Kaafei");
    expect(list[0].shortDesc).toBe("");
    expect(list[0].description).toEqual([]);
    expect(list[0].tech).toEqual([]);
    expect(list[0].github).toBe("");
    expect(list[0].demo).toBe("");
  });

  test("E2E-15: an account that is not the owner yet sees the refusal and keeps its typed values", async ({ page }) => {
    await clearAll();
    await RF(null);
    await page.goto(PANEL);
    await P(page);
    await expect(USER_ID(page)).toBeVisible();
    await openProjects(page);
    await btn(page, "Add entry").click();
    await field(page, "Title").fill("Kaafei");
    await field(page, "Demo link").fill("https://kaafei.org");
    await btn(page, "Add paragraph").click();
    await field(page, "Paragraph 1").fill("Coffee shop site.");
    await btn(page, "Save").click();
    await expect(text(page, "The entry could not be saved. Saving is not switched on yet.")).toBeVisible();
    await expect(page.getByRole("heading", { level: 3, name: "Add entry" })).toBeVisible();
    await expect(field(page, "Title")).toHaveValue("Kaafei");
    await expect(field(page, "Demo link")).toHaveValue("https://kaafei.org");
    await expect(field(page, "Paragraph 1")).toHaveValue("Coffee shop site.");
    await expect(text(page, "Entry saved")).toHaveCount(0);
    expect(await readProj()).toEqual([]);
    await expect(text(page, "Saving is not switched on yet.")).toBeVisible();
    await page.reload();
    await expect(USER_ID(page)).toBeVisible();
    await openProjects(page);
    await expect(text(page, "No projects yet.")).toBeVisible();
  });

  test("E2E-16: the menu shows the Projects editor for Projects and placeholders for the rest", async ({ page }) => {
    await ownerSession(page);
    const MENU = ["Profile", "Experience", "Projects", "Certifications", "Tech stack", "Blog posts", "Images"];
    const h2 = page.getByRole("heading", { level: 2, name: "Projects" });
    await nav(page).getByRole("button", { name: "Tech stack", exact: true }).click();
    await expect(text(page, "Tech stack editor is not available yet.")).toBeVisible();
    await expect(h2).toHaveCount(0);
    await expect(nav(page).getByRole("button")).toHaveText(MENU);
    await nav(page).getByRole("button", { name: "Projects", exact: true }).click();
    await expect(h2).toBeVisible();
    await expect(btn(page, "Add entry")).toBeVisible();
    await expect(EDITOR(page)).toHaveCount(1);
    await expect(text(page, "Tech stack editor is not available yet.")).toHaveCount(0);
    await expect(nav(page).getByRole("button")).toHaveText(MENU);
    await nav(page).getByRole("button", { name: "Experience", exact: true }).click();
    await expect(page.getByRole("heading", { level: 2, name: "Experience" })).toBeVisible();
    await expect(h2).toHaveCount(0);
    await expect(EDITOR(page)).toHaveCount(0);
    await expect(nav(page).getByRole("button")).toHaveText(MENU);
    await nav(page).getByRole("button", { name: "Tech stack", exact: true }).click();
    await expect(text(page, "Tech stack editor is not available yet.")).toBeVisible();
    await expect(nav(page).getByRole("button")).toHaveText(MENU);
    await nav(page).getByRole("button", { name: "Blog posts", exact: true }).click();
    await expect(text(page, "Blog posts editor is not available yet.")).toBeVisible();
    await expect(text(page, "Tech stack editor is not available yet.")).toHaveCount(0);
    await expect(nav(page).getByRole("button")).toHaveText(MENU);
  });

  test("E2E-17: the new files keep to the house rules", () => {
    const F = [
      "src/app/components/admin/ListEditor.tsx",
      "src/app/components/admin/ProjectsEditor.tsx",
      "src/lib/admin/list.ts",
      "src/lib/admin/projects.ts",
      "src/lib/firebase/projects.ts",
    ];
    const banned = [/#[0-9a-fA-F]{3,8}\b/, /\brgba?\(/, /\bhsla?\(/, /dark:/, /console\./, /<img/, /@\/lib\/blog/, /dangerouslySetInnerHTML/, /process\.env/, /email/i, new RegExp("eslint" + "-disable"), new RegExp("@ts" + "-ignore"), new RegExp("@ts" + "-nocheck")];
    const words = ["firebase/auth", "getFirebaseAuth", "currentUser", "displayName", "photoURL", "watchAuth", "signInWithGoogle", "signOutUser", "onAuthStateChanged", "getAuth", "providerData", "getIdToken", "accessToken"];
    for (const f of F) {
      const t = repoText(f);
      for (const re of banned) expect(t, `${f} matches ${re}`).not.toMatch(re);
      for (const w of words) expect(t, `${f} has ${w}`).not.toContain(w);
    }
    for (const f of ["src/app/components/admin/ProjectsEditor.tsx", "src/lib/admin/projects.ts", "src/lib/firebase/projects.ts"]) {
      const t = repoText(f);
      for (const w of ["Add entry", "Move up", "Move down", "Confirm delete", "Cancel", "Delete"]) expect(t, `${f} has ${w}`).not.toContain(w);
    }
    const le = repoText("src/app/components/admin/ListEditor.tsx");
    for (const w of ["emptyText", "listLabel", "newPosition", "Add entry", "Move up", "Move down", "Confirm delete"]) expect(le, `ListEditor has ${w}`).toContain(w);
    expect(repoText("src/lib/admin/list.ts")).toContain("bottomPosition");
    expect(repoText("src/lib/admin/list.ts")).not.toContain("firebase");
    expect(repoText("src/lib/admin/projects.ts")).not.toContain("firebase");
    expect(repoText("src/app/components/admin/ProjectsEditor.tsx")).not.toContain("firebase/firestore");
    expect(repoText("src/app/components/admin/ProjectsEditor.tsx")).toContain("bottomPosition");
    expect(repoText("src/lib/firebase/projects.ts")).toContain("createListStore");
  });

  test("E2E-18: public pages never carry the projects editor and the panel does", async ({ browser }) => {
    async function visit(path: string): Promise<string> {
      const context = await browser.newContext({ baseURL: "http://127.0.0.1:3100" });
      const page = await context.newPage();
      const scripts: Promise<string>[] = [];
      page.on("response", (r) => {
        if ((r.headers()["content-type"] ?? "").includes("javascript")) scripts.push(r.text().catch(() => ""));
      });
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const html = await page.content();
      const joined = [...(await Promise.all(scripts)), html].join("\n");
      await context.close();
      return joined;
    }
    for (const path of ["/", "/blog/hello-world/"]) {
      const t = await visit(path);
      for (const s of ["No projects yet.", "firestore.googleapis.com", "thegoldenpothos-5b3a1"]) expect(t, `${path} contains ${s}`).not.toContain(s);
    }
    expect(await visit(PANEL)).toContain("No projects yet.");
  });
});
