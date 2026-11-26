import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  UNPOSITIONED,
  LIST_MESSAGES,
  changedPositions,
  deleteQuestion,
  failureMessage,
  moveEntry,
  sortEntries,
  topPosition,
} from "../src/lib/admin/list";
import {
  EXPERIENCE_MESSAGES,
  checkExperience,
  emptyExperience,
  experienceFromData,
  experienceLabel,
  experienceToData,
} from "../src/lib/admin/experience";

const FIRESTORE = "http://127.0.0.1:8080";
const PROJECT = "thegoldenpothos-5b3a1";
const DOCS = `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents`;
const PANEL = "/bright-warm-greenhouse/";
const PLACEHOLDER = "REPLACE_WITH_OWNER_UID";
const BIG = 1000000000000;
const ADMIN = { Authorization: "Bearer owner", "Content-Type": "application/json" };
const repoText = (name: string) => readFileSync(join(process.cwd(), name), "utf8");

type Exp = { id: string; year: string; title: string; company: string; duration: string; description: string; details: string[]; position: number; updatedAt: number };
const A: Exp = { id: "e2e-a", year: "2026", title: "Engineer", company: "Alpha", duration: "Jan 2026 - Present", description: "Alpha work.", details: ["Alpha detail one", "Alpha detail two"], position: 0, updatedAt: 1 };
const B: Exp = { id: "e2e-b", year: "2025", title: "Engineer", company: "Beta", duration: "Jan 2025 - Dec 2025", description: "Beta work.", details: [], position: 1, updatedAt: 1 };
const C: Exp = { id: "e2e-c", year: "2024", title: "Intern", company: "Gamma", duration: "Jun 2024 - Aug 2024", description: "Gamma work.", details: ["Gamma detail"], position: 2, updatedAt: 1 };
const at = (x: Exp, p: number): Exp => ({ ...x, position: p });

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
async function RD(): Promise<void> {
  await putRules("rules_version = '2'; service cloud.firestore { match /databases/{database}/documents { match /{document=**} { allow read, write: if false; } } }");
}

const str = (v: string) => ({ stringValue: v });
async function seedExp(e: Exp): Promise<void> {
  const fields = {
    year: str(e.year),
    title: str(e.title),
    company: str(e.company),
    duration: str(e.duration),
    description: str(e.description),
    details: { arrayValue: e.details.length ? { values: e.details.map(str) } : {} },
    position: { integerValue: String(e.position) },
    updatedAt: { integerValue: String(e.updatedAt) },
  };
  const res = await fetch(`${DOCS}/experience/${e.id}`, { method: "PATCH", headers: ADMIN, body: JSON.stringify({ fields }) });
  expect(res.status).toBe(200);
}
async function readExp(): Promise<Exp[]> {
  const res = await fetch(`${DOCS}/experience?pageSize=300`, { headers: ADMIN });
  const body = (await res.json()) as { documents?: { name: string; fields: any }[] };
  const list = (body.documents ?? []).map((d) => {
    const f = d.fields;
    return {
      id: d.name.split("/").pop() as string,
      year: f.year.stringValue,
      title: f.title.stringValue,
      company: f.company.stringValue,
      duration: f.duration.stringValue,
      description: f.description.stringValue,
      details: (f.details.arrayValue.values ?? []).map((v: any) => v.stringValue),
      position: Number(f.position.integerValue),
      updatedAt: Number(f.updatedAt.integerValue),
    } as Exp;
  });
  return list.sort((x, y) => x.position - y.position || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
}
async function ORDER(): Promise<string[]> {
  return (await readExp()).map((e) => `${e.title} at ${e.company}`);
}
async function clearAll(): Promise<void> {
  const res = await fetch(`${DOCS}/experience?pageSize=300`, { headers: ADMIN });
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
async function openExperience(page: Page): Promise<void> {
  await nav(page).getByRole("button", { name: "Experience", exact: true }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Experience" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add entry", exact: true })).toBeVisible();
}
async function reopen(page: Page): Promise<void> {
  await page.reload();
  await expect(nav(page)).toBeVisible();
  await openExperience(page);
}
const ENTRIES = (page: Page) => page.getByRole("list", { name: "Experience entries" }).getByRole("listitem");
const rowFor = (page: Page, label: string) => ENTRIES(page).filter({ has: page.getByText(label, { exact: true }) });
const field = (page: Page, label: string) => page.getByLabel(label, { exact: true });
const DETAILS = (page: Page) => page.getByRole("textbox", { name: /^Detail line \d+$/ });
const detail = (page: Page, n: number) => page.getByRole("textbox", { name: `Detail line ${n}`, exact: true });
const saveBtn = (page: Page) => page.getByRole("button", { name: "Save", exact: true });
const EDITOR = (page: Page) => page.locator('section[aria-label="Experience editor"]');
const GROUP = (page: Page) => page.getByRole("group", { name: "Confirm delete" });
const NOTICE = (page: Page) => page.getByText("Saving is not switched on yet.", { exact: true });
const btn = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
const text = (page: Page, t: string) => page.getByText(t, { exact: true });

async function fillCore(page: Page, v: { year: string; title: string; company: string; duration: string; description: string }): Promise<void> {
  await field(page, "Year").fill(v.year);
  await field(page, "Title").fill(v.title);
  await field(page, "Company").fill(v.company);
  await field(page, "Duration").fill(v.duration);
  await field(page, "Description").fill(v.description);
}
const LEAD = { year: "2027", title: "Lead", company: "Delta", duration: "2027", description: "Leads." };
const SWE = { year: "2027", title: "Software Engineer", company: "Acme Pte Ltd", duration: "Jan 2027 - Present", description: "Built internal tools." };

async function measureLayout(page: Page): Promise<{ scrollWidth: number; bad: string[] }> {
  return page.evaluate(() => {
    const root = document.querySelector('section[aria-label="Experience editor"]');
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

test.describe("manage-experience", () => {
  test.describe.configure({ mode: "serial", timeout: 60000 });

  test("E2E-01: checkExperience trims texts, drops blank detail lines and does not mutate input", () => {
    const I = {
      year: " 2027 ",
      title: "  Software Engineer ",
      company: " Acme Pte Ltd",
      duration: " Jan 2027 - Present ",
      description: "  Built internal tools.  ",
      details: ["  Shipped a billing dashboard ", "   ", "", "Mentored two interns"],
    };
    const first = checkExperience(I);
    expect(first).toEqual({
      ok: true,
      content: {
        year: "2027",
        title: "Software Engineer",
        company: "Acme Pte Ltd",
        duration: "Jan 2027 - Present",
        description: "Built internal tools.",
        details: ["Shipped a billing dashboard", "Mentored two interns"],
      },
    });
    expect(I.details).toHaveLength(4);
    expect(I.year).toBe(" 2027 ");
    const second = checkExperience({ ...I, details: [] });
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.content.details).toEqual([]);
  });

  test("E2E-02: checkExperience refuses each blank required text with its own message", () => {
    const B = {
      year: "2027",
      title: "Engineer",
      company: "Alpha",
      duration: "Jan 2027 - Present",
      description: "Built things.",
      details: [] as string[],
    };
    const r1 = checkExperience({ ...B, year: "   " });
    const r2 = checkExperience({ ...B, title: "" });
    const r3 = checkExperience({ ...B, company: "\t" });
    const r4 = checkExperience({ ...B, duration: "" });
    const r5 = checkExperience({ ...B, description: " \n " });
    const r6 = checkExperience({
      ...B,
      year: "   ",
      title: "",
      company: "\t",
      duration: "",
      description: " \n ",
    });
    const r7 = checkExperience(B);
    expect(r1).toEqual({ ok: false, errors: { year: "Year is required" } });
    expect(r2).toEqual({ ok: false, errors: { title: "Title is required" } });
    expect(r3).toEqual({ ok: false, errors: { company: "Company is required" } });
    expect(r4).toEqual({ ok: false, errors: { duration: "Duration is required" } });
    expect(r5).toEqual({ ok: false, errors: { description: "Description is required" } });
    expect(r6).toEqual({
      ok: false,
      errors: {
        year: "Year is required",
        title: "Title is required",
        company: "Company is required",
        duration: "Duration is required",
        description: "Description is required",
      },
    });
    expect(r7).toEqual({ ok: true, content: B });
  });

  test("E2E-03: experienceFromData is tolerant and experienceToData copies details", () => {
    const empty = { year: "", title: "", company: "", duration: "", description: "", details: [] };
    const a = experienceFromData({
      year: "2026",
      title: "Engineer",
      company: "Alpha",
      duration: "Jan 2026 - Present",
      description: "Alpha work.",
      details: ["One", "Two"],
      position: 3,
      updatedAt: 5,
    });
    expect(a).toEqual({
      year: "2026",
      title: "Engineer",
      company: "Alpha",
      duration: "Jan 2026 - Present",
      description: "Alpha work.",
      details: ["One", "Two"],
    });
    expect(experienceFromData({})).toEqual(empty);
    expect(
      experienceFromData({
        year: 5,
        title: null,
        company: {},
        duration: [],
        description: false,
        details: "x",
      }),
    ).toEqual(empty);
    expect(experienceFromData({ details: [1, "ok", null, "fine"] })).toEqual({
      ...empty,
      details: ["ok", "fine"],
    });
    expect(experienceFromData(null)).toEqual(empty);
    expect(experienceFromData("x")).toEqual(empty);

    const e1 = emptyExperience();
    const e2 = emptyExperience();
    e1.details.push("z");
    expect(e2.details).toHaveLength(0);

    const data = experienceToData(a);
    expect(Object.keys(data).sort()).toEqual(
      ["company", "description", "details", "duration", "title", "year"].sort(),
    );
    expect(data.details).toEqual(a.details);
    expect(data.details).not.toBe(a.details);
  });

  test("E2E-04: sortEntries orders by position then id, topPosition finds the new top", () => {
    const E = (id: string, p: number) => ({ id, position: p, content: id });
    const input = [E("b", 2), E("a", 2), E("c", -1), E("d", UNPOSITIONED)];
    const sorted = sortEntries(input);
    expect(sorted.map((e) => e.id)).toEqual(["c", "a", "b", "d"]);
    expect(input.map((e) => e.id)).toEqual(["b", "a", "c", "d"]);
    expect(UNPOSITIONED).toBe(Number.MAX_SAFE_INTEGER);
    expect(topPosition([])).toBe(0);
    expect(topPosition([E("a", 0), E("b", 1)])).toBe(-1);
    expect(topPosition([E("a", 5), E("b", -3)])).toBe(-4);
    expect(topPosition([E("a", UNPOSITIONED)])).toBe(0);
    expect(topPosition([E("a", UNPOSITIONED), E("b", 7)])).toBe(6);
  });

  test("E2E-05: moveEntry swaps one step and changedPositions lists the renumbered entries", () => {
    const E = (id: string, p: number) => ({ id, position: p, content: id });
    const L = [E("a", 10), E("b", 20), E("c", 30)];
    const L0 = [E("a", 0), E("b", 1), E("c", 2)];
    const m1 = moveEntry(L, "c", "up");
    const m2 = moveEntry(L, "a", "down");
    expect(m1?.map((e) => e.id)).toEqual(["a", "c", "b"]);
    expect(m1?.map((e) => e.position)).toEqual([0, 1, 2]);
    expect(m2?.map((e) => e.id)).toEqual(["b", "a", "c"]);
    expect(m2?.map((e) => e.position)).toEqual([0, 1, 2]);
    expect(moveEntry(L, "a", "up")).toBeNull();
    expect(moveEntry(L, "c", "down")).toBeNull();
    expect(moveEntry(L, "zzz", "up")).toBeNull();
    expect(moveEntry([E("a", 5)], "a", "up")).toBeNull();
    expect(moveEntry([E("a", 5)], "a", "down")).toBeNull();
    expect(L.map((e) => e.position)).toEqual([10, 20, 30]);
    expect(changedPositions(L, moveEntry(L, "c", "up")!)).toEqual([
      { id: "a", position: 0 },
      { id: "c", position: 1 },
      { id: "b", position: 2 },
    ]);
    expect(changedPositions(L0, moveEntry(L0, "a", "down")!)).toEqual([
      { id: "b", position: 0 },
      { id: "a", position: 1 },
    ]);
    expect(changedPositions(L0, L0)).toEqual([]);
  });

  test("E2E-06: shared wording, failure sentences, label and messages are exact", () => {
    expect(deleteQuestion("Engineer at Beta")).toBe(
      'Delete "Engineer at Beta"? This cannot be undone.',
    );
    expect(failureMessage("save", false)).toBe(
      "The entry could not be saved. Saving is not switched on yet.",
    );
    expect(failureMessage("save", true)).toBe(
      "The entry could not be saved. Try again, and check that you are signed in as the owner.",
    );
    expect(failureMessage("move", false)).toBe(
      "The entry could not be moved. Saving is not switched on yet.",
    );
    expect(failureMessage("move", true)).toBe(
      "The entry could not be moved. Try again, and check that you are signed in as the owner.",
    );
    expect(failureMessage("delete", false)).toBe(
      "The entry could not be deleted. Saving is not switched on yet.",
    );
    expect(failureMessage("delete", true)).toBe(
      "The entry could not be deleted. Try again, and check that you are signed in as the owner.",
    );
    expect(
      experienceLabel({
        year: "2026",
        title: "Engineer",
        company: "Alpha",
        duration: "d",
        description: "x",
        details: [],
      }),
    ).toBe("Engineer at Alpha");
    expect(LIST_MESSAGES).toMatchObject({
      loading: "Loading entries…",
      loadFailed: "The entries could not be loaded.",
      empty: "No entries yet.",
      saved: "Entry saved",
      moved: "Order saved",
      deleted: "Entry deleted",
      saving: "Saving…",
      deleting: "Deleting…",
    });
    expect(EXPERIENCE_MESSAGES).toMatchObject({
      yearRequired: "Year is required",
      titleRequired: "Title is required",
      companyRequired: "Company is required",
      durationRequired: "Duration is required",
      descriptionRequired: "Description is required",
    });
  });
  test("E2E-07: an empty collection shows the empty list and the Add entry button", async ({ page }) => {
    await ownerSession(page);
    await openExperience(page);
    await expect(text(page, "No entries yet.")).toBeVisible();
    await expect(btn(page, "Add entry")).toBeVisible();
    await expect(page.getByRole("list", { name: "Experience entries" })).toHaveCount(0);
    for (const n of ["Edit", "Move up", "Move down", "Delete"]) await expect(EDITOR(page).getByRole("button", { name: n, exact: true })).toHaveCount(0);
    await expect(NOTICE(page)).toHaveCount(0);
    expect(await readExp()).toEqual([]);
  });

  test("E2E-08: adding an entry saves it and the form reopens with the stored values", async ({ page }) => {
    await ownerSession(page);
    await openExperience(page);
    await btn(page, "Add entry").click();
    await expect(page.getByRole("heading", { level: 3, name: "Add entry" })).toBeVisible();
    await fillCore(page, SWE);
    await btn(page, "Add detail line").click();
    await detail(page, 1).fill("Shipped a billing dashboard");
    await btn(page, "Add detail line").click();
    await detail(page, 2).fill("Mentored two interns");
    await saveBtn(page).click();
    await expect(text(page, "Entry saved")).toBeVisible();
    await expect(page.getByRole("heading", { level: 3, name: "Add entry" })).toHaveCount(0);
    await expect(text(page, "No entries yet.")).toHaveCount(0);
    await expect(ENTRIES(page)).toHaveCount(1);
    await expect(ENTRIES(page)).toContainText(["Software Engineer at Acme Pte Ltd"]);
    const stored = await readExp();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ year: "2027", title: "Software Engineer", company: "Acme Pte Ltd", duration: "Jan 2027 - Present", description: "Built internal tools.", details: ["Shipped a billing dashboard", "Mentored two interns"], position: 0 });
    expect(stored[0].updatedAt).toBeGreaterThan(BIG);
    await reopen(page);
    await btn(page, "Edit").click();
    await expect(page.getByRole("heading", { level: 3, name: "Edit entry" })).toBeVisible();
    await expect(field(page, "Year")).toHaveValue("2027");
    await expect(field(page, "Title")).toHaveValue("Software Engineer");
    await expect(field(page, "Company")).toHaveValue("Acme Pte Ltd");
    await expect(field(page, "Duration")).toHaveValue("Jan 2027 - Present");
    await expect(field(page, "Description")).toHaveValue("Built internal tools.");
    await expect(DETAILS(page)).toHaveCount(2);
    await expect(DETAILS(page).nth(0)).toHaveValue("Shipped a billing dashboard");
    await expect(DETAILS(page).nth(1)).toHaveValue("Mentored two interns");
  });

  test("E2E-09: a new entry goes to the top of the list", async ({ page }) => {
    await ownerSession(page);
    await seedExp(A);
    await seedExp(B);
    await openExperience(page);
    await btn(page, "Add entry").click();
    await fillCore(page, LEAD);
    await saveBtn(page).click();
    const want = ["Lead at Delta", "Engineer at Alpha", "Engineer at Beta"];
    await expect(text(page, "Entry saved")).toBeVisible();
    await expect(ENTRIES(page)).toContainText(want);
    expect(await ORDER()).toEqual(want);
    const stored = await readExp();
    expect(stored.find((e) => e.title === "Lead")?.position).toBe(-1);
    expect(stored.find((e) => e.id === "e2e-a")).toEqual(A);
    expect(stored.find((e) => e.id === "e2e-b")).toEqual(B);
    await reopen(page);
    await expect(ENTRIES(page)).toContainText(want);
  });

  test("E2E-10: an entry identical to an existing one is added as a second entry", async ({ page }) => {
    await ownerSession(page);
    await seedExp(A);
    await openExperience(page);
    await btn(page, "Add entry").click();
    await fillCore(page, { year: "2026", title: "Engineer", company: "Alpha", duration: "Jan 2026 - Present", description: "Alpha again." });
    await saveBtn(page).click();
    await expect(text(page, "Entry saved")).toBeVisible();
    await expect(ENTRIES(page)).toHaveCount(2);
    await expect(ENTRIES(page)).toContainText(["Engineer at Alpha", "Engineer at Alpha"]);
    await expect(EDITOR(page).getByRole("alert")).toHaveCount(0);
    const stored = await readExp();
    expect(stored).toHaveLength(2);
    expect(stored.find((e) => e.id === "e2e-a")).toEqual(A);
  });

  test("E2E-11: editing an entry changes its fields and keeps its place", async ({ page }) => {
    await ownerSession(page);
    const S: Exp = { id: "e2e-s", year: "2027", title: "Software Engineer", company: "Acme Pte Ltd", duration: "Jan 2027 - Present", description: "Built internal tools.", details: ["Shipped a billing dashboard", "Mentored two interns"], position: 0, updatedAt: 1 };
    await seedExp(S);
    await seedExp(B);
    await openExperience(page);
    await rowFor(page, "Software Engineer at Acme Pte Ltd").getByRole("button", { name: "Edit", exact: true }).click();
    await expect(page.getByRole("heading", { level: 3, name: "Edit entry" })).toBeVisible();
    await expect(field(page, "Year")).toHaveValue("2027");
    await expect(field(page, "Title")).toHaveValue("Software Engineer");
    await expect(field(page, "Company")).toHaveValue("Acme Pte Ltd");
    await expect(field(page, "Duration")).toHaveValue("Jan 2027 - Present");
    await expect(field(page, "Description")).toHaveValue("Built internal tools.");
    await expect(DETAILS(page)).toHaveCount(2);
    await expect(DETAILS(page).nth(0)).toHaveValue("Shipped a billing dashboard");
    await expect(DETAILS(page).nth(1)).toHaveValue("Mentored two interns");
    await field(page, "Company").fill("Acme Group");
    await btn(page, "Remove detail line 1").click();
    await saveBtn(page).click();
    await expect(text(page, "Entry saved")).toBeVisible();
    await expect(ENTRIES(page)).toContainText(["Software Engineer at Acme Group", "Engineer at Beta"]);
    await expect(page.getByText("Acme Pte Ltd")).toHaveCount(0);
    const stored = await readExp();
    const s = stored.find((e) => e.id === "e2e-s")!;
    expect(s).toMatchObject({ ...S, company: "Acme Group", details: ["Mentored two interns"], updatedAt: s.updatedAt });
    expect(s.updatedAt).toBeGreaterThan(BIG);
    expect(stored.find((e) => e.id === "e2e-b")).toEqual(B);
    await reopen(page);
    await rowFor(page, "Software Engineer at Acme Group").getByRole("button", { name: "Edit", exact: true }).click();
    await expect(field(page, "Company")).toHaveValue("Acme Group");
    await expect(DETAILS(page)).toHaveCount(1);
    await expect(DETAILS(page).nth(0)).toHaveValue("Mentored two interns");
  });

  test("E2E-12: Move up swaps with the neighbour and renumbers from 0", async ({ page }) => {
    await ownerSession(page);
    await seedExp(at(A, 10));
    await seedExp(at(B, 20));
    await seedExp(at(C, 30));
    await openExperience(page);
    const alpha = rowFor(page, "Engineer at Alpha");
    const beta = rowFor(page, "Engineer at Beta");
    const gamma = rowFor(page, "Intern at Gamma");
    await expect(ENTRIES(page)).toContainText(["Engineer at Alpha", "Engineer at Beta", "Intern at Gamma"]);
    await expect(alpha.getByRole("button", { name: "Move up", exact: true })).toHaveCount(0);
    await expect(alpha.getByRole("button", { name: "Move down", exact: true })).toHaveCount(1);
    await expect(gamma.getByRole("button", { name: "Move down", exact: true })).toHaveCount(0);
    await expect(gamma.getByRole("button", { name: "Move up", exact: true })).toHaveCount(1);
    await expect(beta.getByRole("button", { name: "Move up", exact: true })).toHaveCount(1);
    await expect(beta.getByRole("button", { name: "Move down", exact: true })).toHaveCount(1);
    await gamma.getByRole("button", { name: "Move up", exact: true }).click();
    const want = ["Engineer at Alpha", "Intern at Gamma", "Engineer at Beta"];
    await expect(ENTRIES(page)).toContainText(want);
    await expect(text(page, "Order saved")).toBeVisible();
    await expect(beta.getByRole("button", { name: "Move down", exact: true })).toHaveCount(0);
    await expect(gamma.getByRole("button", { name: "Move up", exact: true })).toHaveCount(1);
    await expect(gamma.getByRole("button", { name: "Move down", exact: true })).toHaveCount(1);
    const stored = await readExp();
    expect(stored.map((e) => e.id)).toEqual(["e2e-a", "e2e-c", "e2e-b"]);
    expect(stored.map((e) => e.position)).toEqual([0, 1, 2]);
    for (const e of stored) expect(e.updatedAt).toBeGreaterThan(BIG);
    const base: Record<string, Exp> = { "e2e-a": A, "e2e-b": B, "e2e-c": C };
    for (const e of stored) expect({ ...e, position: 0, updatedAt: 0 }).toEqual({ ...base[e.id], position: 0, updatedAt: 0 });
    await reopen(page);
    await expect(ENTRIES(page)).toContainText(want);
  });

  test("E2E-13: Move down writes only the entries whose number changed", async ({ page }) => {
    await ownerSession(page);
    await seedExp(A);
    await seedExp(B);
    await seedExp(C);
    await openExperience(page);
    await rowFor(page, "Engineer at Alpha").getByRole("button", { name: "Move down", exact: true }).click();
    const want = ["Engineer at Beta", "Engineer at Alpha", "Intern at Gamma"];
    await expect(ENTRIES(page)).toContainText(want);
    await expect(text(page, "Order saved")).toBeVisible();
    const stored = await readExp();
    expect(stored.map((e) => e.id)).toEqual(["e2e-b", "e2e-a", "e2e-c"]);
    expect(stored.map((e) => e.position)).toEqual([0, 1, 2]);
    expect(stored.find((e) => e.id === "e2e-a")!.updatedAt).toBeGreaterThan(BIG);
    expect(stored.find((e) => e.id === "e2e-b")!.updatedAt).toBeGreaterThan(BIG);
    expect(stored.find((e) => e.id === "e2e-c")).toEqual(C);
    await reopen(page);
    await expect(ENTRIES(page)).toContainText(want);
  });

  test("E2E-14: a delete asks first, moves between rows, and is permanent once confirmed", async ({ page }) => {
    await ownerSession(page);
    await seedExp(A);
    await seedExp(B);
    await openExperience(page);
    const alpha = rowFor(page, "Engineer at Alpha");
    const beta = rowFor(page, "Engineer at Beta");
    await beta.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(beta.getByRole("group", { name: "Confirm delete" })).toContainText('Delete "Engineer at Beta"? This cannot be undone.');
    await expect(ENTRIES(page)).toHaveCount(2);
    expect(await readExp()).toEqual([A, B]);
    await alpha.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(GROUP(page)).toHaveCount(1);
    await expect(alpha.getByRole("group", { name: "Confirm delete" })).toContainText('Delete "Engineer at Alpha"? This cannot be undone.');
    await expect(beta.getByRole("group", { name: "Confirm delete" })).toHaveCount(0);
    await beta.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(GROUP(page)).toHaveCount(1);
    await expect(beta.getByRole("group", { name: "Confirm delete" })).toHaveCount(1);
    await GROUP(page).getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(text(page, "Entry deleted")).toBeVisible();
    await expect(GROUP(page)).toHaveCount(0);
    await expect(ENTRIES(page)).toHaveCount(1);
    await expect(ENTRIES(page)).toContainText(["Engineer at Alpha"]);
    await expect(page.getByText("Engineer at Beta")).toHaveCount(0);
    expect(await readExp()).toEqual([A]);
    await reopen(page);
    await expect(ENTRIES(page)).toHaveCount(1);
    await expect(page.getByText("Engineer at Beta")).toHaveCount(0);
  });

  test("E2E-15: cancelling a delete changes nothing", async ({ page }) => {
    await ownerSession(page);
    await seedExp(A);
    await seedExp(B);
    await openExperience(page);
    const beta = rowFor(page, "Engineer at Beta");
    await beta.getByRole("button", { name: "Delete", exact: true }).click();
    await GROUP(page).getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(GROUP(page)).toHaveCount(0);
    await expect(ENTRIES(page)).toContainText(["Engineer at Alpha", "Engineer at Beta"]);
    await expect(beta.getByRole("button", { name: "Delete", exact: true })).toBeEnabled();
    await expect(text(page, "Entry deleted")).toHaveCount(0);
    expect(await readExp()).toEqual([A, B]);
    await reopen(page);
    await expect(ENTRIES(page)).toContainText(["Engineer at Alpha", "Engineer at Beta"]);
    expect(await readExp()).toEqual([A, B]);
  });

  test("E2E-16: a blank Year is refused with its own message and typed values stay", async ({ page }) => {
    await ownerSession(page);
    await openExperience(page);
    await btn(page, "Add entry").click();
    await fillCore(page, { ...SWE, year: "" });
    await saveBtn(page).click();
    await expect(field(page, "Year")).toHaveAccessibleDescription("Year is required");
    for (const f of ["Title", "Company", "Duration", "Description"]) await expect(field(page, f)).toHaveAccessibleDescription("");
    await expect(field(page, "Title")).toHaveValue("Software Engineer");
    await expect(field(page, "Company")).toHaveValue("Acme Pte Ltd");
    await expect(field(page, "Duration")).toHaveValue("Jan 2027 - Present");
    await expect(field(page, "Description")).toHaveValue("Built internal tools.");
    await expect(page.getByRole("heading", { level: 3, name: "Add entry" })).toBeVisible();
    await expect(text(page, "Entry saved")).toHaveCount(0);
    expect(await readExp()).toEqual([]);
    await field(page, "Year").fill("2027");
    await saveBtn(page).click();
    await expect(text(page, "Entry saved")).toBeVisible();
    const stored = await readExp();
    expect(stored).toHaveLength(1);
    expect(stored[0].year).toBe("2027");
  });

  test("E2E-17: whitespace-only required fields are each refused", async ({ page }) => {
    await ownerSession(page);
    await openExperience(page);
    await btn(page, "Add entry").click();
    await field(page, "Year").fill("   ");
    await field(page, "Title").fill("");
    await field(page, "Company").fill("  ");
    await field(page, "Duration").fill("");
    await field(page, "Description").fill("   ");
    await btn(page, "Add detail line").click();
    await detail(page, 1).fill("Kept detail");
    await saveBtn(page).click();
    await expect(field(page, "Year")).toHaveAccessibleDescription("Year is required");
    await expect(field(page, "Title")).toHaveAccessibleDescription("Title is required");
    await expect(field(page, "Company")).toHaveAccessibleDescription("Company is required");
    await expect(field(page, "Duration")).toHaveAccessibleDescription("Duration is required");
    await expect(field(page, "Description")).toHaveAccessibleDescription("Description is required");
    await expect(detail(page, 1)).toHaveValue("Kept detail");
    await expect(page.getByRole("heading", { level: 3, name: "Add entry" })).toBeVisible();
    await expect(text(page, "Entry saved")).toHaveCount(0);
    expect(await readExp()).toEqual([]);
  });

  test("E2E-18: cancelling an edit and reloading drop unsaved changes", async ({ page }) => {
    await ownerSession(page);
    await seedExp(A);
    await openExperience(page);
    const row = rowFor(page, "Engineer at Alpha");
    await row.getByRole("button", { name: "Edit", exact: true }).click();
    await field(page, "Title").fill("Unsaved title");
    await btn(page, "Cancel").click();
    await expect(page.getByRole("heading", { level: 3, name: "Edit entry" })).toHaveCount(0);
    await expect(ENTRIES(page)).toHaveCount(1);
    await expect(ENTRIES(page)).toContainText(["Engineer at Alpha"]);
    await expect(page.getByText("Unsaved title")).toHaveCount(0);
    await expect(row.getByRole("button", { name: "Move up", exact: true })).toHaveCount(0);
    await expect(row.getByRole("button", { name: "Move down", exact: true })).toHaveCount(0);
    await row.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(field(page, "Title")).toHaveValue("Engineer");
    await field(page, "Title").fill("Unsaved again");
    await reopen(page);
    await expect(ENTRIES(page)).toContainText(["Engineer at Alpha"]);
    await expect(page.getByText("Unsaved again")).toHaveCount(0);
    expect(await readExp()).toEqual([A]);
  });

  test("E2E-19: at 375 pixels nothing overflows and every button is tall enough", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await ownerSession(page);
    const W = "W".repeat(80);
    await seedExp(A);
    await seedExp({ id: "e2e-long", year: "2025", title: "Engineer", company: W, duration: "Jan 2025 - Dec 2025", description: "Long.", details: [], position: 1, updatedAt: 1 });
    await seedExp(at(C, 2));
    await openExperience(page);
    const long = rowFor(page, `Engineer at ${W}`);
    await expect(long).toHaveCount(1);
    for (const n of ["Edit", "Move up", "Move down", "Delete"]) await expect(long.getByRole("button", { name: n, exact: true })).toBeVisible();
    let m = await measureLayout(page);
    expect(m.scrollWidth).toBeLessThanOrEqual(375);
    expect(m.bad).toEqual([]);
    const box = await text(page, `Engineer at ${W}`).boundingBox();
    expect(box!.x + box!.width).toBeLessThanOrEqual(375);
    await long.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(page.getByRole("heading", { level: 3, name: "Edit entry" })).toBeVisible();
    await expect(field(page, "Company")).toHaveValue(W);
    m = await measureLayout(page);
    expect(m.scrollWidth).toBeLessThanOrEqual(375);
    expect(m.bad).toEqual([]);
    await btn(page, "Cancel").click();
    await long.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(GROUP(page)).toBeVisible();
    await expect(GROUP(page).getByRole("button", { name: "Confirm", exact: true })).toBeVisible();
    await expect(GROUP(page).getByRole("button", { name: "Cancel", exact: true })).toBeVisible();
    m = await measureLayout(page);
    expect(m.scrollWidth).toBeLessThanOrEqual(375);
    expect(m.bad).toEqual([]);
  });

  test("E2E-20: an account that is not the owner yet sees the refusal and keeps its typed values", async ({ page }) => {
    await clearAll();
    await RF(null);
    await page.goto(PANEL);
    await P(page);
    await expect(USER_ID(page)).toBeVisible();
    await openExperience(page);
    await btn(page, "Add entry").click();
    await fillCore(page, SWE);
    await btn(page, "Add detail line").click();
    await detail(page, 1).fill("Kept detail");
    await saveBtn(page).click();
    await expect(text(page, "The entry could not be saved. Saving is not switched on yet.")).toBeVisible();
    await expect(page.getByRole("heading", { level: 3, name: "Add entry" })).toBeVisible();
    await expect(field(page, "Title")).toHaveValue("Software Engineer");
    await expect(detail(page, 1)).toHaveValue("Kept detail");
    await expect(text(page, "Entry saved")).toHaveCount(0);
    expect(await readExp()).toEqual([]);
    await expect(NOTICE(page)).toBeVisible();
    await page.reload();
    await expect(USER_ID(page)).toBeVisible();
    await openExperience(page);
    await expect(text(page, "No entries yet.")).toBeVisible();
  });

  test("E2E-21: move and delete are refused for a not-yet-owner and nothing changes", async ({ page }) => {
    await clearAll();
    await seedExp(A);
    await seedExp(B);
    await RF(null);
    await page.goto(PANEL);
    await P(page);
    await expect(USER_ID(page)).toBeVisible();
    await openExperience(page);
    await rowFor(page, "Engineer at Alpha").getByRole("button", { name: "Move down", exact: true }).click();
    await expect(text(page, "The entry could not be moved. Saving is not switched on yet.")).toBeVisible();
    await expect(ENTRIES(page)).toContainText(["Engineer at Alpha", "Engineer at Beta"]);
    expect(await readExp()).toEqual([A, B]);
    await rowFor(page, "Engineer at Beta").getByRole("button", { name: "Delete", exact: true }).click();
    await GROUP(page).getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(text(page, "The entry could not be deleted. Saving is not switched on yet.")).toBeVisible();
    await expect(GROUP(page)).toBeVisible();
    await expect(rowFor(page, "Engineer at Beta")).toHaveCount(1);
    expect(await readExp()).toEqual([A, B]);
    await GROUP(page).getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(GROUP(page)).toHaveCount(0);
  });

  test("E2E-22: a refused save keeps the form and a retry after the rules allow it succeeds", async ({ page }) => {
    const X = await ownerSession(page);
    await seedExp(A);
    await openExperience(page);
    await rowFor(page, "Engineer at Alpha").getByRole("button", { name: "Edit", exact: true }).click();
    await RF(null);
    await field(page, "Title").fill("Changed");
    await saveBtn(page).click();
    await expect(text(page, "The entry could not be saved. Try again, and check that you are signed in as the owner.")).toBeVisible();
    await expect(field(page, "Title")).toHaveValue("Changed");
    await expect(page.getByRole("heading", { level: 3, name: "Edit entry" })).toBeVisible();
    await expect(text(page, "Entry saved")).toHaveCount(0);
    expect(await readExp()).toEqual([A]);
    await RF(X);
    await saveBtn(page).click();
    await expect(text(page, "Entry saved")).toBeVisible();
    await expect(ENTRIES(page)).toContainText(["Changed at Alpha"]);
    const a = (await readExp()).find((e) => e.id === "e2e-a")!;
    expect(a).toMatchObject({ ...A, title: "Changed", updatedAt: a.updatedAt });
    expect(a.updatedAt).toBeGreaterThan(BIG);
  });

  test("E2E-23: when the list cannot be read only the heading and the failure show", async ({ page }) => {
    await ownerSession(page);
    await seedExp(A);
    await seedExp(B);
    await RD();
    await nav(page).getByRole("button", { name: "Experience", exact: true }).click();
    await expect(text(page, "The entries could not be loaded.")).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Experience" })).toBeVisible();
    await expect(btn(page, "Add entry")).toHaveCount(0);
    await expect(page.getByRole("list", { name: "Experience entries" })).toHaveCount(0);
    expect(await page.locator("body").innerText()).not.toContain("Engineer at Alpha");
  });

  test("E2E-24: a signed-in account that is not allowed never reaches the editor or the collection", async ({ page }) => {
    await clearAll();
    await seedExp(A);
    await page.addInitScript(() => window.localStorage.setItem("admin.ownerUid", "not-this-account-0000000000"));
    const urls: string[] = [];
    page.on("request", (r) => urls.push(r.url()));
    await page.goto(PANEL);
    await P(page);
    await expect(text(page, "This account is not allowed to use the admin panel.")).toBeVisible();
    await expect(nav(page)).toHaveCount(0);
    await expect(btn(page, "Experience")).toHaveCount(0);
    expect(await page.locator("body").innerText()).not.toContain("Engineer at Alpha");
    expect(urls.filter((u) => u.startsWith("http://127.0.0.1:8080"))).toEqual([]);
  });

  test("E2E-25: editing an entry deleted elsewhere fails and does not recreate it", async ({ page }) => {
    await ownerSession(page);
    await seedExp(A);
    await seedExp(B);
    await openExperience(page);
    await rowFor(page, "Engineer at Beta").getByRole("button", { name: "Edit", exact: true }).click();
    const del = await fetch(`${DOCS}/experience/e2e-b`, { method: "DELETE", headers: ADMIN });
    expect(del.status).toBe(200);
    await field(page, "Title").fill("Revived");
    await saveBtn(page).click();
    await expect(text(page, "The entry could not be saved. Try again, and check that you are signed in as the owner.")).toBeVisible();
    await expect(field(page, "Title")).toHaveValue("Revived");
    expect(await readExp()).toEqual([A]);
    await btn(page, "Cancel").click();
    await expect(btn(page, "Add entry")).toBeVisible();
    await reopen(page);
    await expect(ENTRIES(page)).toHaveCount(1);
    await expect(ENTRIES(page)).toContainText(["Engineer at Alpha"]);
    await expect(page.getByText("Engineer at Beta")).toHaveCount(0);
    await expect(page.getByText("Revived")).toHaveCount(0);
  });

  test("E2E-26: the menu shows the Experience editor for Experience and placeholders for the rest", async ({ page }) => {
    await ownerSession(page);
    const MENU = ["Profile", "Experience", "Projects", "Certifications", "Tech stack", "Blog posts", "Images"];
    const h2 = page.getByRole("heading", { level: 2, name: "Experience" });
    await nav(page).getByRole("button", { name: "Tech stack", exact: true }).click();
    await expect(text(page, "Tech stack editor is not available yet.")).toBeVisible();
    await expect(h2).toHaveCount(0);
    await expect(nav(page).getByRole("button")).toHaveText(MENU);
    await nav(page).getByRole("button", { name: "Experience", exact: true }).click();
    await expect(h2).toBeVisible();
    await expect(btn(page, "Add entry")).toBeVisible();
    await expect(text(page, "Tech stack editor is not available yet.")).toHaveCount(0);
    await expect(nav(page).getByRole("button")).toHaveText(MENU);
    await nav(page).getByRole("button", { name: "Tech stack", exact: true }).click();
    await expect(text(page, "Tech stack editor is not available yet.")).toBeVisible();
    await expect(h2).toHaveCount(0);
    await nav(page).getByRole("button", { name: "Experience", exact: true }).click();
    await expect(h2).toBeVisible();
    await nav(page).getByRole("button", { name: "Tech stack", exact: true }).click();
    await expect(text(page, "Tech stack editor is not available yet.")).toBeVisible();
    await nav(page).getByRole("button", { name: "Blog posts", exact: true }).click();
    await expect(text(page, "Blog posts editor is not available yet.")).toBeVisible();
    await expect(nav(page).getByRole("button")).toHaveText(MENU);
  });

  test("E2E-27: a double press writes once", async ({ page }) => {
    await ownerSession(page);
    await seedExp(A);
    await seedExp(B);
    await openExperience(page);
    await btn(page, "Add entry").click();
    await fillCore(page, LEAD);
    await saveBtn(page).evaluate((el: HTMLElement) => {
      el.click();
      el.click();
    });
    await expect(text(page, "Entry saved")).toBeVisible();
    const stored = await readExp();
    expect(stored).toHaveLength(3);
    expect(stored.filter((e) => e.title === "Lead")).toHaveLength(1);
    await rowFor(page, "Lead at Delta").getByRole("button", { name: "Move down", exact: true }).evaluate((el: HTMLElement) => {
      el.click();
      el.click();
    });
    await expect(text(page, "Order saved")).toBeVisible();
    const want = ["Engineer at Alpha", "Lead at Delta", "Engineer at Beta"];
    await expect(ENTRIES(page)).toContainText(want);
    expect(await ORDER()).toEqual(want);
  });

  test("E2E-28: the new files keep to tokens and never touch the account", () => {
    const files = [
      "src/app/components/admin/ListEditor.tsx",
      "src/app/components/admin/ExperienceEditor.tsx",
      "src/app/components/admin/formParts.tsx",
      "src/lib/admin/list.ts",
      "src/lib/admin/experience.ts",
      "src/lib/firebase/list.ts",
      "src/lib/firebase/experience.ts",
    ];
    const banned = ["firebase/auth", "getFirebaseAuth", "currentUser", "displayName", "photoURL", "watchAuth", "signInWithGoogle", "signOutUser", "onAuthStateChanged", "getAuth", "providerData", "getIdToken", "accessToken"];
    for (const f of files) {
      const t = repoText(f);
      for (const re of [/#[0-9a-fA-F]{3,8}\b/, /\brgba?\(/, /\bhsla?\(/, /dark:/, /console\./, /<img/, /@\/lib\/blog/, /dangerouslySetInnerHTML/, /process\.env/, /email/i]) expect(t, `${f} matches ${re}`).not.toMatch(re);
      for (const b of banned) expect(t, `${f} contains ${b}`).not.toContain(b);
      expect(t).not.toMatch(/from\s+["'][^"']*\/auth["']/);
    }
    const parts = repoText("src/app/components/admin/formParts.tsx");
    expect(parts).toContain("var(--surface-alt)");
    expect(parts).toContain("var(--foreground)");
  });

  test("E2E-29: shared wording lives only in the shared files", () => {
    const listEditor = repoText("src/app/components/admin/ListEditor.tsx");
    for (const w of ["Add entry", "Move up", "Move down", "Confirm delete", "Cancel"]) expect(listEditor, `ListEditor has ${w}`).toContain(w);
    for (const f of ["src/app/components/admin/ExperienceEditor.tsx", "src/lib/admin/experience.ts", "src/lib/firebase/experience.ts"]) {
      const t = repoText(f);
      for (const w of ["Add entry", "Move up", "Move down", "Confirm delete", "Cancel", "Delete"]) expect(t, `${f} has ${w}`).not.toContain(w);
    }
    expect(repoText("src/lib/admin/list.ts")).not.toContain("firebase");
    expect(repoText("src/lib/admin/experience.ts")).not.toContain("firebase");
    expect(repoText("src/app/components/admin/ExperienceEditor.tsx")).not.toContain("firebase/firestore");
    expect(repoText("src/lib/firebase/experience.ts")).toContain("createListStore");
  });

  test("E2E-30: the editor follows the light and dark theme tokens", async ({ browser }) => {
    for (const theme of ["light", "dark"] as const) {
      const context = await browser.newContext({ baseURL: "http://127.0.0.1:3100" });
      await context.addInitScript((t) => window.localStorage.setItem("theme", t), theme);
      const page = await context.newPage();
      await ownerSession(page);
      await seedExp(A);
      await openExperience(page);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      const bg = theme === "light" ? "rgb(249, 247, 245)" : "rgb(31, 31, 53)";
      const fg = theme === "light" ? "rgb(45, 45, 45)" : "rgb(228, 228, 236)";
      await expect(btn(page, "Add entry")).toHaveCSS("background-color", bg);
      await expect(btn(page, "Add entry")).toHaveCSS("color", fg);
      await expect(rowFor(page, "Engineer at Alpha")).toHaveCSS("background-color", bg);
      await expect(text(page, "Engineer at Alpha")).toHaveCSS("color", fg);
      await context.close();
    }
  });

  test("E2E-31: public pages never carry the entries and the panel does", async ({ browser }) => {
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
      for (const s of ["No entries yet.", "firestore.googleapis.com", "thegoldenpothos-5b3a1"]) expect(t, `${path} contains ${s}`).not.toContain(s);
    }
    expect(await visit(PANEL)).toContain("No entries yet.");
  });
});
