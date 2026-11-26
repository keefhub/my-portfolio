import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  TECH_COLLECTION,
  TECH_MESSAGES,
  TECH_NAME_MAX,
  checkTechCategory,
  emptyTechCategory,
  itemErrorKey,
  moveTool,
  techDeleteText,
  techFromData,
  techItemDeleteText,
  techItemLine,
  techLabel,
  techToData,
  type TechCategoryContent,
  type TechItem,
} from "../src/lib/admin/techstack";

const IMG = "http://127.0.0.1:9199/v0/b/x/o/images%2Fa.png?alt=media&token=t";
const rep = (c: string, n: number) => c.repeat(n);

const FIRESTORE = "http://127.0.0.1:8080";
const PROJECT = "thegoldenpothos-5b3a1";
const DOCS = `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents`;
const PANEL = "/bright-warm-greenhouse/";
const PLACEHOLDER = "REPLACE_WITH_OWNER_UID";
const BIG = 1000000000000;
const ADMIN = { Authorization: "Bearer owner", "Content-Type": "application/json" };
const repoText = (name: string) => readFileSync(join(process.cwd(), name), "utf8");
const IMGURL = (id: string) =>
  `http://127.0.0.1:9199/v0/b/thegoldenpothos-5b3a1.firebasestorage.app/o/images%2F${id}.png?alt=media&token=t`;

type Tool = { name: string; icon: string };
type Cat = { id: string; category: string; tools: Tool[]; position: number; updatedAt: number };
const F: Cat = {
  id: "e2e-f",
  category: "Frontend",
  tools: [
    { name: "React", icon: "/icons/react.png" },
    { name: "Angular", icon: "/icons/angular.png" },
  ],
  position: 0,
  updatedAt: 1,
};
const K: Cat = {
  id: "e2e-k",
  category: "Backend",
  tools: [
    { name: "Node.js", icon: "/icons/node.png" },
    { name: "ASP.NET Core", icon: "/icons/dotnet.png" },
  ],
  position: 1,
  updatedAt: 1,
};
const C: Cat = {
  id: "e2e-c",
  category: "Cloud",
  tools: [
    { name: "Firebase", icon: "/icons/firebase.png" },
    { name: "Docker", icon: "/icons/docker.png" },
  ],
  position: 2,
  updatedAt: 1,
};
const at = (x: Cat, p: number): Cat => ({ ...x, position: p });
const core = (c: Cat) => {
  const { updatedAt: _u, ...rest } = c;
  return rest;
};

async function RF(uid: string | null): Promise<void> {
  const text = repoText("firestore.rules");
  const content = uid === null ? text : text.replace(PLACEHOLDER, uid);
  const res = await fetch(`${FIRESTORE}/emulator/v1/projects/${PROJECT}:securityRules`, {
    method: "PUT",
    body: JSON.stringify({ rules: { files: [{ name: "firestore.rules", content }] } }),
  });
  expect(res.status).toBe(200);
}

const str = (v: string) => ({ stringValue: v });
async function seedCat(c: Cat): Promise<void> {
  const fields = {
    category: str(c.category),
    tools: {
      arrayValue: {
        values: c.tools.map((t) => ({ mapValue: { fields: { name: str(t.name), icon: str(t.icon) } } })),
      },
    },
    position: { integerValue: String(c.position) },
    updatedAt: { integerValue: String(c.updatedAt) },
  };
  const res = await fetch(`${DOCS}/techCategories/${c.id}`, { method: "PATCH", headers: ADMIN, body: JSON.stringify({ fields }) });
  expect(res.status).toBe(200);
}
async function seedRaw(id: string, fields: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${DOCS}/techCategories/${id}`, { method: "PATCH", headers: ADMIN, body: JSON.stringify({ fields }) });
  expect(res.status).toBe(200);
}
async function readCats(): Promise<Cat[]> {
  const res = await fetch(`${DOCS}/techCategories?pageSize=300`, { headers: ADMIN });
  const body = (await res.json()) as { documents?: { name: string; fields: any }[] };
  const list = (body.documents ?? []).map((d) => {
    const f = d.fields;
    const values: any[] = f.tools?.arrayValue?.values ?? [];
    return {
      id: d.name.split("/").pop() as string,
      category: f.category.stringValue,
      tools: values.map((v) => ({
        name: v.mapValue.fields.name.stringValue,
        icon: v.mapValue.fields.icon.stringValue,
      })),
      position: Number(f.position.integerValue),
      updatedAt: Number(f.updatedAt.integerValue),
    } as Cat;
  });
  return list.sort((x, y) => x.position - y.position || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
}
async function seedImage(id: string, name: string): Promise<void> {
  const fields = {
    name: str(name),
    storagePath: str(`images/${id}.png`),
    url: str(IMGURL(id)),
    contentType: str("image/png"),
    size: { integerValue: "1000" },
    createdAt: { integerValue: "1" },
  };
  const res = await fetch(`${DOCS}/images/${id}`, { method: "PATCH", headers: ADMIN, body: JSON.stringify({ fields }) });
  expect(res.status).toBe(200);
}
async function clearAll(): Promise<void> {
  for (const col of ["techCategories", "images"]) {
    const res = await fetch(`${DOCS}/${col}?pageSize=300`, { headers: ADMIN });
    const body = (await res.json()) as { documents?: { name: string }[] };
    for (const d of body.documents ?? []) await fetch(`${FIRESTORE}/v1/${d.name}`, { method: "DELETE", headers: ADMIN });
  }
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
async function openTech(page: Page): Promise<void> {
  await nav(page).getByRole("button", { name: "Tech stack", exact: true }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Tech stack" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add category", exact: true })).toBeVisible();
}
async function reopen(page: Page): Promise<void> {
  await page.reload();
  await expect(nav(page)).toBeVisible();
  await openTech(page);
}
const ENTRIES = (page: Page) => page.getByRole("list", { name: "Tech categories list" }).getByRole("listitem");
const rowFor = (page: Page, label: string) => ENTRIES(page).filter({ has: page.getByText(label, { exact: true }) });
const ITEMS = (page: Page, label: string) =>
  rowFor(page, label).getByRole("group", { name: "Items of " + label, exact: true }).locator("p");
const item = (page: Page, n: number) => page.getByRole("group", { name: "Item " + n, exact: true });
const field = (page: Page, label: string) => page.getByLabel(label, { exact: true });
const EDITOR = (page: Page) => page.locator('section[aria-label="Tech stack editor"]');
const GROUP = (page: Page) => page.getByRole("group", { name: "Confirm delete", exact: true });
const IGROUP = (page: Page) => page.getByRole("group", { name: "Confirm item delete", exact: true });
const btn = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
const text = (page: Page, t: string) => page.getByText(t, { exact: true });
const inBox = (box: ReturnType<typeof rowFor>, name: string) => box.getByRole("button", { name, exact: true });
async function expectOrder(page: Page, names: string[]): Promise<void> {
  await expect(ENTRIES(page)).toHaveCount(names.length);
  for (let i = 0; i < names.length; i++) await expect(ENTRIES(page).nth(i)).toContainText(names[i]);
}

async function measureLayout(page: Page): Promise<{ scrollWidth: number; bad: string[] }> {
  return page.evaluate(() => {
    const root = document.querySelector('section[aria-label="Tech stack editor"]');
    const bad: string[] = [];
    root?.querySelectorAll("button, input, textarea, select").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return;
      const name = (el.textContent || (el as HTMLInputElement).value || el.tagName).slice(0, 20);
      if (r.x < 0 || r.x + r.width > 375) bad.push(`${name} x=${r.x} w=${r.width}`);
      if (el.tagName === "BUTTON" && r.height < 43.99) bad.push(`${name} h=${r.height}`);
    });
    return { scrollWidth: document.documentElement.scrollWidth, bad };
  });
}

test.describe("manage-tech-stack", () => {
  test.describe.configure({ mode: "serial", timeout: 60000 });

  test("E2E-01: checkTechCategory accepts valid categories and returns trimmed content", () => {
    const I: TechCategoryContent = {
      category: " Cloud ",
      tools: [
        { name: " Firebase ", icon: " /icons/firebase.png " },
        { name: "Docker", icon: "/icons/docker.png" },
      ],
    };
    expect(checkTechCategory(I, [])).toEqual({
      ok: true,
      content: {
        category: "Cloud",
        tools: [
          { name: "Firebase", icon: "/icons/firebase.png" },
          { name: "Docker", icon: "/icons/docker.png" },
        ],
      },
    });
    expect(I.category).toBe(" Cloud ");
    expect(I.tools[0].name).toBe(" Firebase ");

    expect(checkTechCategory({ category: "Cloud", tools: [{ name: "Firebase", icon: IMG }] }, [IMG])).toEqual({
      ok: true,
      content: { category: "Cloud", tools: [{ name: "Firebase", icon: IMG }] },
    });

    const live = "https://firebasestorage.googleapis.com/v0/b/x/o/images%2Fa.png?alt=media";
    expect(
      checkTechCategory({ category: "Cloud", tools: [{ name: "Firebase", icon: ` ${live} ` }] }, [live]),
    ).toEqual({ ok: true, content: { category: "Cloud", tools: [{ name: "Firebase", icon: live }] } });

    expect(
      checkTechCategory({ category: rep("A", 80), tools: [{ name: rep("B", 80), icon: "/icons/b.png" }] }, []),
    ).toEqual({
      ok: true,
      content: { category: rep("A", 80), tools: [{ name: rep("B", 80), icon: "/icons/b.png" }] },
    });

    expect(checkTechCategory({ category: "Empty", tools: [] }, [])).toEqual({
      ok: true,
      content: { category: "Empty", tools: [] },
    });
  });

  test("E2E-02: checkTechCategory refuses bad values with keyed messages", () => {
    const B: TechCategoryContent = { category: "Frontend", tools: [{ name: "React", icon: "/icons/react.png" }] };
    const withCat = (category: string): TechCategoryContent => ({ ...B, category });
    const withItem = (patch: Partial<TechItem>, uploaded: string[] = []) =>
      checkTechCategory({ ...B, tools: [{ ...B.tools[0], ...patch }] }, uploaded);
    const iconBad = { ok: false, errors: { "tools.0.icon": 'Icon path must start with "/"' } };

    expect(checkTechCategory(withCat(""), [])).toEqual({ ok: false, errors: { category: "Category name is required" } });
    expect(checkTechCategory(withCat("   "), [])).toEqual({ ok: false, errors: { category: "Category name is required" } });
    expect(checkTechCategory(withCat("\t\n"), [])).toEqual({ ok: false, errors: { category: "Category name is required" } });
    expect(checkTechCategory(withCat(rep("A", 81)), [])).toEqual({
      ok: false,
      errors: { category: "Category name must be 80 characters or fewer" },
    });

    expect(withItem({ name: "" })).toEqual({ ok: false, errors: { "tools.0.name": "Item name is required" } });
    expect(withItem({ name: "   " })).toEqual({ ok: false, errors: { "tools.0.name": "Item name is required" } });
    expect(withItem({ name: rep("B", 81) })).toEqual({
      ok: false,
      errors: { "tools.0.name": "Item name must be 80 characters or fewer" },
    });

    expect(withItem({ icon: "" })).toEqual({ ok: false, errors: { "tools.0.icon": "Icon is required" } });
    expect(withItem({ icon: "   " })).toEqual({ ok: false, errors: { "tools.0.icon": "Icon is required" } });

    expect(withItem({ icon: "https://example.com/react.png" })).toEqual(iconBad);
    expect(withItem({ icon: "icons/react.png" })).toEqual(iconBad);
    expect(withItem({ icon: "//cdn.example.com/a.png" })).toEqual(iconBad);
    expect(withItem({ icon: "/" })).toEqual(iconBad);
    expect(withItem({ icon: "/icons/my react.png" })).toEqual(iconBad);
    expect(withItem({ icon: IMG }, [])).toEqual(iconBad);

    expect(
      checkTechCategory(
        { category: "", tools: [{ name: "", icon: "" }, { name: "Vue", icon: "vue.png" }] },
        [],
      ),
    ).toEqual({
      ok: false,
      errors: {
        category: "Category name is required",
        "tools.0.name": "Item name is required",
        "tools.0.icon": "Icon is required",
        "tools.1.icon": 'Icon path must start with "/"',
      },
    });

    expect(checkTechCategory(withCat("  Frontend  "), [])).toEqual({ ok: true, content: B });

    expect(itemErrorKey(0, "name")).toBe("tools.0.name");
    expect(itemErrorKey(3, "icon")).toBe("tools.3.icon");
    expect(TECH_MESSAGES.categoryRequired).toBe("Category name is required");
    expect(TECH_MESSAGES.categoryTooLong).toBe("Category name must be 80 characters or fewer");
    expect(TECH_MESSAGES.itemRequired).toBe("Item name is required");
    expect(TECH_MESSAGES.itemTooLong).toBe("Item name must be 80 characters or fewer");
    expect(TECH_MESSAGES.iconRequired).toBe("Icon is required");
    expect(TECH_MESSAGES.iconInvalid).toBe('Icon path must start with "/"');
  });

  test("E2E-03: pure helpers read, write, label, word and move tech categories", () => {
    const a = techFromData({
      category: "Cloud",
      tools: [
        { name: "Firebase", icon: "/icons/firebase.png" },
        { name: "Docker", icon: "/icons/docker.png" },
      ],
      position: 3,
      updatedAt: 5,
    });
    expect(a).toEqual({
      category: "Cloud",
      tools: [
        { name: "Firebase", icon: "/icons/firebase.png" },
        { name: "Docker", icon: "/icons/docker.png" },
      ],
    });
    expect(techFromData({})).toEqual({ category: "", tools: [] });
    expect(techFromData({ category: 5, tools: "x" })).toEqual({ category: "", tools: [] });
    expect(techFromData({ category: "Only a name" })).toEqual({ category: "Only a name", tools: [] });
    expect(
      techFromData({
        category: "Mixed",
        tools: ["x", null, 7, { name: "Ok", icon: "/icons/ok.png" }, { name: 5, icon: null }],
      }),
    ).toEqual({
      category: "Mixed",
      tools: [
        { name: "Ok", icon: "/icons/ok.png" },
        { name: "", icon: "" },
      ],
    });
    expect(techFromData(null)).toEqual({ category: "", tools: [] });
    expect(techFromData("x")).toEqual({ category: "", tools: [] });

    const e1 = emptyTechCategory();
    const e2 = emptyTechCategory();
    expect(e1).toEqual({ category: "", tools: [{ name: "", icon: "" }] });
    expect(e2).toEqual({ category: "", tools: [{ name: "", icon: "" }] });
    expect(e1).not.toBe(e2);
    expect(e1.tools).not.toBe(e2.tools);

    const data = techToData(a);
    expect(Object.keys(data).sort()).toEqual(["category", "tools"]);
    const dataTools = data.tools as TechItem[];
    for (const t of dataTools) expect(Object.keys(t).sort()).toEqual(["icon", "name"]);
    expect(dataTools).not.toBe(a.tools);

    expect(techLabel(a)).toBe("Cloud");

    expect(techDeleteText(a)).toBe('Delete "Cloud" (2 items)? This cannot be undone.');
    expect(techDeleteText({ category: "Solo", tools: [{ name: "A", icon: "/a.png" }] })).toBe(
      'Delete "Solo" (1 item)? This cannot be undone.',
    );
    expect(techDeleteText({ category: "Bare", tools: [] })).toBe('Delete "Bare" (0 items)? This cannot be undone.');

    expect(techItemDeleteText(" Node.js ", 0)).toBe('Delete the item "Node.js"? This cannot be undone.');
    expect(techItemDeleteText("  ", 1)).toBe("Delete item 2? This cannot be undone.");

    expect(techItemLine({ name: "Firebase", icon: IMG }, [{ url: IMG, name: "firebase-logo.png" }])).toBe(
      "Firebase: image firebase-logo.png",
    );
    expect(
      techItemLine({ name: "Docker", icon: "/icons/docker.png" }, [{ url: IMG, name: "firebase-logo.png" }]),
    ).toBe("Docker: path /icons/docker.png");
    expect(techItemLine({ name: "X", icon: "" }, [{ url: "", name: "blank.png" }])).toBe("X: path ");

    const T: TechItem[] = [
      { name: "A", icon: "/a.png" },
      { name: "B", icon: "/b.png" },
      { name: "C", icon: "/c.png" },
    ];
    const names = (r: TechItem[] | null) => (r === null ? null : r.map((t) => t.name));
    expect(names(moveTool(T, 1, "up"))).toEqual(["B", "A", "C"]);
    expect(names(moveTool(T, 1, "down"))).toEqual(["A", "C", "B"]);
    expect(moveTool(T, 0, "up")).toBeNull();
    expect(moveTool(T, 2, "down")).toBeNull();
    expect(moveTool(T, 5, "up")).toBeNull();
    expect(moveTool(T, -1, "down")).toBeNull();
    expect(T.map((t) => t.name)).toEqual(["A", "B", "C"]);

    expect(TECH_COLLECTION).toBe("techCategories");
    expect(TECH_NAME_MAX).toBe(80);
    expect(TECH_MESSAGES.emptyList).toBe("No tech categories yet.");
    expect(TECH_MESSAGES.listLabel).toBe("Tech categories list");
    expect(TECH_MESSAGES.addLabel).toBe("Add category");
    expect(TECH_MESSAGES.imagesFailed).toBe("The uploaded images could not be loaded.");
    expect(TECH_MESSAGES.noItems).toBe("No items");
  });

  test("E2E-04: adding a category with an uploaded image and a path item saves and survives a reload", async ({ page }) => {
    await ownerSession(page);
    await seedImage("e2e-04", "firebase-logo.png");
    await openTech(page);
    await expect(text(page, "No tech categories yet.")).toBeVisible();
    await expect(page.getByRole("list", { name: "Tech categories list" })).toHaveCount(0);
    await expect(btn(page, "Add category")).toBeVisible();
    await expect(btn(page, "Add entry")).toHaveCount(0);
    expect(await readCats()).toEqual([]);
    await btn(page, "Add category").click();
    await expect(page.getByRole("heading", { level: 3, name: "Add entry" })).toBeVisible();
    await expect(field(page, "Category name")).toHaveValue("");
    await expect(field(page, "Item 1 name")).toHaveValue("");
    await expect(field(page, "Item 1 icon path")).toHaveValue("");
    await expect(field(page, "Item 1 uploaded image")).toHaveValue("");
    await expect(item(page, 2)).toHaveCount(0);
    await field(page, "Category name").fill("Cloud");
    await field(page, "Item 1 name").fill("Firebase");
    await field(page, "Item 1 uploaded image").selectOption({ label: "firebase-logo.png" });
    await expect(field(page, "Item 1 icon path")).toHaveValue("");
    await expect(field(page, "Item 1 uploaded image")).toHaveValue("e2e-04");
    await btn(page, "Add item").click();
    await expect(item(page, 2)).toBeVisible();
    await field(page, "Item 2 name").fill("Docker");
    await field(page, "Item 2 icon path").fill("/icons/docker.png");
    await btn(page, "Save").click();
    await expect(text(page, "Entry saved")).toBeVisible();
    await expect(page.getByRole("heading", { level: 3, name: "Add entry" })).toHaveCount(0);
    await expect(text(page, "No tech categories yet.")).toHaveCount(0);
    await expect(ENTRIES(page)).toHaveCount(1);
    const lines = ["Firebase: image firebase-logo.png", "Docker: path /icons/docker.png"];
    await expect(ITEMS(page, "Cloud")).toHaveText(lines);
    const got = await readCats();
    expect(got).toHaveLength(1);
    expect(got[0].category).toBe("Cloud");
    expect(got[0].tools).toEqual([
      { name: "Firebase", icon: IMGURL("e2e-04") },
      { name: "Docker", icon: "/icons/docker.png" },
    ]);
    expect(got[0].position).toBe(0);
    expect(got[0].updatedAt).toBeGreaterThan(BIG);
    await reopen(page);
    await expect(ITEMS(page, "Cloud")).toHaveText(lines);
    await expect(text(page, "No tech categories yet.")).toHaveCount(0);
    await inBox(ENTRIES(page), "Edit").click();
    await expect(page.getByRole("heading", { level: 3, name: "Edit entry" })).toBeVisible();
    await expect(field(page, "Category name")).toHaveValue("Cloud");
    await expect(field(page, "Item 1 name")).toHaveValue("Firebase");
    await expect(field(page, "Item 1 uploaded image")).toHaveValue("e2e-04");
    await expect(field(page, "Item 1 icon path")).toHaveValue("");
    await expect(field(page, "Item 2 name")).toHaveValue("Docker");
    await expect(field(page, "Item 2 uploaded image")).toHaveValue("");
    await expect(field(page, "Item 2 icon path")).toHaveValue("/icons/docker.png");
  });

  test("E2E-05: editing a category renames it, edits and adds items, and survives a reload", async ({ page }) => {
    await ownerSession(page);
    await seedCat(at(C, 0));
    await openTech(page);
    await inBox(rowFor(page, "Cloud"), "Edit").click();
    await expect(page.getByRole("heading", { level: 3, name: "Edit entry" })).toBeVisible();
    await expect(field(page, "Category name")).toHaveValue("Cloud");
    await expect(field(page, "Item 1 name")).toHaveValue("Firebase");
    await expect(field(page, "Item 1 icon path")).toHaveValue("/icons/firebase.png");
    await expect(field(page, "Item 2 name")).toHaveValue("Docker");
    await expect(field(page, "Item 2 icon path")).toHaveValue("/icons/docker.png");
    await expect(item(page, 3)).toHaveCount(0);
    await field(page, "Category name").fill("Cloud and DevOps");
    await field(page, "Item 2 icon path").fill("/icons/docker-new.png");
    await btn(page, "Add item").click();
    await field(page, "Item 3 name").fill("GitHub Actions");
    await field(page, "Item 3 icon path").fill("/icons/actions.png");
    await btn(page, "Save").click();
    await expect(text(page, "Entry saved")).toBeVisible();
    await expect(ENTRIES(page)).toHaveCount(1);
    const lines = [
      "Firebase: path /icons/firebase.png",
      "Docker: path /icons/docker-new.png",
      "GitHub Actions: path /icons/actions.png",
    ];
    await expect(ITEMS(page, "Cloud and DevOps")).toHaveText(lines);
    await expect(text(page, "Cloud")).toHaveCount(0);
    const got = await readCats();
    expect(got).toHaveLength(1);
    expect(got[0].id).toBe("e2e-c");
    expect(got[0].category).toBe("Cloud and DevOps");
    expect(got[0].tools).toEqual([
      { name: "Firebase", icon: "/icons/firebase.png" },
      { name: "Docker", icon: "/icons/docker-new.png" },
      { name: "GitHub Actions", icon: "/icons/actions.png" },
    ]);
    expect(got[0].position).toBe(0);
    expect(got[0].updatedAt).toBeGreaterThan(BIG);
    await reopen(page);
    await expect(ITEMS(page, "Cloud and DevOps")).toHaveText(lines);
    await expect(text(page, "Cloud")).toHaveCount(0);
  });

  test("E2E-06: moving categories stores at once, moving items is stored by Save", async ({ page }) => {
    await ownerSession(page);
    await seedCat(F);
    await seedCat(K);
    await seedCat(C);
    await openTech(page);
    await expectOrder(page, ["Frontend", "Backend", "Cloud"]);
    await expect(inBox(rowFor(page, "Frontend"), "Move up")).toHaveCount(0);
    await expect(inBox(rowFor(page, "Frontend"), "Move down")).toHaveCount(1);
    await inBox(rowFor(page, "Frontend"), "Move down").click();
    await expect(text(page, "Order saved")).toBeVisible();
    await expectOrder(page, ["Backend", "Frontend", "Cloud"]);
    const moved = await readCats();
    expect(moved.map((c) => c.id)).toEqual(["e2e-k", "e2e-f", "e2e-c"]);
    expect(moved.map((c) => c.position)).toEqual([0, 1, 2]);
    const fx = [K, F, C];
    moved.forEach((c, i) => expect(core(c)).toEqual({ ...core(fx[i]), position: i }));
    await inBox(rowFor(page, "Frontend"), "Edit").click();
    await expect(page.getByRole("heading", { level: 3, name: "Edit entry" })).toBeVisible();
    await expect(inBox(item(page, 1), "Move up")).toHaveCount(0);
    await expect(inBox(item(page, 1), "Move down")).toHaveCount(1);
    await expect(inBox(item(page, 2), "Move up")).toHaveCount(1);
    await expect(inBox(item(page, 2), "Move down")).toHaveCount(0);
    await inBox(item(page, 2), "Move up").click();
    await expect(field(page, "Item 1 name")).toHaveValue("Angular");
    await expect(field(page, "Item 1 icon path")).toHaveValue("/icons/angular.png");
    await expect(field(page, "Item 2 name")).toHaveValue("React");
    await expect(field(page, "Item 2 icon path")).toHaveValue("/icons/react.png");
    const mid = await readCats();
    expect(mid.find((c) => c.id === "e2e-f")!.tools).toEqual([
      { name: "React", icon: "/icons/react.png" },
      { name: "Angular", icon: "/icons/angular.png" },
    ]);
    await btn(page, "Save").click();
    await expect(text(page, "Entry saved")).toBeVisible();
    const lines = ["Angular: path /icons/angular.png", "React: path /icons/react.png"];
    await expect(ITEMS(page, "Frontend")).toHaveText(lines);
    const got = await readCats();
    expect(got.map((c) => c.id)).toEqual(["e2e-k", "e2e-f", "e2e-c"]);
    const f = got.find((c) => c.id === "e2e-f")!;
    expect(f.tools).toEqual([
      { name: "Angular", icon: "/icons/angular.png" },
      { name: "React", icon: "/icons/react.png" },
    ]);
    expect(f.position).toBe(1);
    expect(core(got.find((c) => c.id === "e2e-k")!)).toEqual(core(at(K, 0)));
    expect(core(got.find((c) => c.id === "e2e-c")!)).toEqual(core(at(C, 2)));
    await reopen(page);
    await expectOrder(page, ["Backend", "Frontend", "Cloud"]);
    await expect(ITEMS(page, "Frontend")).toHaveText(lines);
  });

  test("E2E-07: deleting a category asks first and removes it for good", async ({ page }) => {
    await ownerSession(page);
    await seedCat(F);
    await seedCat(at(K, 1));
    await openTech(page);
    await inBox(rowFor(page, "Backend"), "Delete").click();
    await expect(rowFor(page, "Backend").getByRole("group", { name: "Confirm delete", exact: true })).toContainText(
      'Delete "Backend" (2 items)? This cannot be undone.',
    );
    await expect(ENTRIES(page)).toHaveCount(2);
    expect((await readCats()).map((c) => c.id)).toEqual(["e2e-f", "e2e-k"]);
    await inBox(GROUP(page), "Confirm").click();
    await expect(text(page, "Entry deleted")).toBeVisible();
    await expect(GROUP(page)).toHaveCount(0);
    await expect(ENTRIES(page)).toHaveCount(1);
    await expect(ENTRIES(page)).toContainText("Frontend");
    await expect(text(page, "Backend")).toHaveCount(0);
    await expect(text(page, "Node.js: path /icons/node.png")).toHaveCount(0);
    const got = await readCats();
    expect(got.map((c) => c.id)).toEqual(["e2e-f"]);
    expect(core(got[0])).toEqual(core(F));
    await reopen(page);
    await expect(ENTRIES(page)).toHaveCount(1);
    await expect(ENTRIES(page)).toContainText("Frontend");
    await expect(text(page, "Backend")).toHaveCount(0);
  });

  test("E2E-08: cancelling a category delete keeps it", async ({ page }) => {
    await ownerSession(page);
    await seedCat(F);
    await seedCat(at(K, 1));
    await openTech(page);
    await inBox(rowFor(page, "Backend"), "Delete").click();
    await inBox(GROUP(page), "Cancel").click();
    await expect(GROUP(page)).toHaveCount(0);
    await expectOrder(page, ["Frontend", "Backend"]);
    await expect(inBox(rowFor(page, "Backend"), "Delete")).toBeEnabled();
    await expect(text(page, "Entry deleted")).toHaveCount(0);
    const got = await readCats();
    expect(got.map((c) => c.id)).toEqual(["e2e-f", "e2e-k"]);
    expect(core(got[0])).toEqual(core(F));
    expect(core(got[1])).toEqual(core(at(K, 1)));
    await reopen(page);
    await expectOrder(page, ["Frontend", "Backend"]);
    await expect(ITEMS(page, "Backend")).toHaveText(["Node.js: path /icons/node.png", "ASP.NET Core: path /icons/dotnet.png"]);
  });

  test("E2E-09: a confirmed item removal in an edit form is stored at once", async ({ page }) => {
    await ownerSession(page);
    await seedCat(F);
    await seedCat(at(K, 1));
    await openTech(page);
    await inBox(rowFor(page, "Backend"), "Edit").click();
    await expect(page.getByRole("heading", { level: 3, name: "Edit entry" })).toBeVisible();
    await inBox(item(page, 1), "Delete").click();
    await expect(item(page, 1).getByRole("group", { name: "Confirm item delete", exact: true })).toContainText(
      'Delete the item "Node.js"? This cannot be undone.',
    );
    await expect(field(page, "Item 1 name")).toHaveValue("Node.js");
    expect((await readCats()).find((c) => c.id === "e2e-k")!.tools).toEqual([
      { name: "Node.js", icon: "/icons/node.png" },
      { name: "ASP.NET Core", icon: "/icons/dotnet.png" },
    ]);
    await inBox(IGROUP(page), "Confirm").click();
    await expect(text(page, "Entry saved")).toBeVisible();
    await expect(page.getByRole("heading", { level: 3, name: "Edit entry" })).toHaveCount(0);
    await expect(ITEMS(page, "Backend")).toHaveText(["ASP.NET Core: path /icons/dotnet.png"]);
    const got = await readCats();
    expect(got.map((c) => c.id)).toEqual(["e2e-f", "e2e-k"]);
    const k = got[1];
    expect(k.category).toBe("Backend");
    expect(k.tools).toEqual([{ name: "ASP.NET Core", icon: "/icons/dotnet.png" }]);
    expect(k.position).toBe(1);
    expect(k.updatedAt).toBeGreaterThan(BIG);
    expect(core(got[0])).toEqual(core(F));
    await reopen(page);
    await expect(ITEMS(page, "Backend")).toHaveText(["ASP.NET Core: path /icons/dotnet.png"]);
    await expect(text(page, "Node.js: path /icons/node.png")).toHaveCount(0);

    await inBox(rowFor(page, "Backend"), "Edit").click();
    await expect(page.getByRole("heading", { level: 3, name: "Edit entry" })).toBeVisible();
    await field(page, "Category name").fill("");
    await inBox(item(page, 1), "Delete").click();
    await inBox(IGROUP(page), "Confirm").click();
    await expect(page.getByRole("heading", { level: 3, name: "Edit entry" })).toBeVisible();
    await expect(field(page, "Category name")).toHaveAccessibleDescription("Category name is required");
    await expect(item(page, 1)).toHaveCount(0);
    await expect(text(page, "Entry saved")).toHaveCount(0);
    const after = (await readCats()).find((c) => c.id === "e2e-k")!;
    expect(after.category).toBe("Backend");
    expect(after.tools).toEqual([{ name: "ASP.NET Core", icon: "/icons/dotnet.png" }]);
    await btn(page, "Cancel").click();
    await expectOrder(page, ["Frontend", "Backend"]);
    await expect(ITEMS(page, "Backend")).toHaveText(["ASP.NET Core: path /icons/dotnet.png"]);
  });

  test("E2E-10: cancelling an item removal changes nothing", async ({ page }) => {
    await ownerSession(page);
    await seedCat(F);
    await seedCat(at(K, 1));
    await openTech(page);
    await inBox(rowFor(page, "Backend"), "Edit").click();
    await inBox(item(page, 1), "Delete").click();
    await inBox(IGROUP(page), "Cancel").click();
    await expect(IGROUP(page)).toHaveCount(0);
    await expect(item(page, 1)).toBeVisible();
    await expect(field(page, "Item 1 name")).toHaveValue("Node.js");
    await expect(inBox(item(page, 1), "Delete")).toBeEnabled();
    await expect(text(page, "Entry saved")).toHaveCount(0);
    const got = await readCats();
    expect(got.map((c) => c.id)).toEqual(["e2e-f", "e2e-k"]);
    expect(core(got[0])).toEqual(core(F));
    expect(core(got[1])).toEqual(core(at(K, 1)));
    await btn(page, "Cancel").click();
    await expectOrder(page, ["Frontend", "Backend"]);
    await reopen(page);
    await inBox(rowFor(page, "Backend"), "Edit").click();
    await expect(field(page, "Item 1 name")).toHaveValue("Node.js");
    await expect(field(page, "Item 2 name")).toHaveValue("ASP.NET Core");
  });

  test("E2E-11: a bad category name, item name or icon is refused with its own message", async ({ page }) => {
    await ownerSession(page);
    await openTech(page);
    await btn(page, "Add category").click();
    const addHeading = page.getByRole("heading", { level: 3, name: "Add entry" });
    const catF = field(page, "Category name");
    const nameF = field(page, "Item 1 name");
    const pathF = field(page, "Item 1 icon path");
    const settled = async () => {
      await expect(addHeading).toBeVisible();
      await expect(text(page, "Entry saved")).toHaveCount(0);
      expect(await readCats()).toEqual([]);
    };

    await catF.fill("");
    await nameF.fill("React");
    await pathF.fill("/icons/react.png");
    await btn(page, "Save").click();
    await expect(catF).toHaveAccessibleDescription("Category name is required");
    await expect(nameF).toHaveAccessibleDescription("");
    await expect(pathF).toHaveAccessibleDescription("");
    await expect(nameF).toHaveValue("React");
    await expect(pathF).toHaveValue("/icons/react.png");
    await settled();

    await catF.fill("Frontend");
    await nameF.fill("");
    await pathF.fill("/icons/react.png");
    await btn(page, "Save").click();
    await expect(nameF).toHaveAccessibleDescription("Item name is required");
    await expect(catF).toHaveAccessibleDescription("");
    await expect(pathF).toHaveAccessibleDescription("");
    await expect(catF).toHaveValue("Frontend");
    await expect(pathF).toHaveValue("/icons/react.png");
    await settled();

    await catF.fill("Frontend");
    await nameF.fill("React");
    await pathF.fill("");
    await btn(page, "Save").click();
    await expect(pathF).toHaveAccessibleDescription("Icon is required");
    await expect(catF).toHaveAccessibleDescription("");
    await expect(nameF).toHaveAccessibleDescription("");
    await expect(catF).toHaveValue("Frontend");
    await expect(nameF).toHaveValue("React");
    await settled();

    await catF.fill("Frontend");
    await nameF.fill("React");
    await pathF.fill("https://example.com/react.png");
    await btn(page, "Save").click();
    await expect(pathF).toHaveAccessibleDescription('Icon path must start with "/"');
    await expect(catF).toHaveAccessibleDescription("");
    await expect(nameF).toHaveAccessibleDescription("");
    await expect(catF).toHaveValue("Frontend");
    await expect(nameF).toHaveValue("React");
    await expect(pathF).toHaveValue("https://example.com/react.png");
    await settled();

    await btn(page, "Cancel").click();
    await expect(text(page, "No tech categories yet.")).toBeVisible();
    await expect(page.getByRole("list", { name: "Tech categories list" })).toHaveCount(0);
  });

  test("E2E-12: a refused save of an edit keeps the form and stores nothing", async ({ page }) => {
    await ownerSession(page);
    await seedCat(at(C, 0));
    await openTech(page);
    await inBox(rowFor(page, "Cloud"), "Edit").click();
    await field(page, "Category name").fill("Cloud and DevOps");
    await field(page, "Item 2 icon path").fill("/icons/docker-new.png");
    await RF(null);
    await btn(page, "Save").click();
    await expect(
      text(page, "The entry could not be saved. Try again, and check that you are signed in as the owner."),
    ).toBeVisible();
    await expect(page.getByRole("heading", { level: 3, name: "Edit entry" })).toBeVisible();
    await expect(field(page, "Category name")).toHaveValue("Cloud and DevOps");
    await expect(field(page, "Item 2 icon path")).toHaveValue("/icons/docker-new.png");
    await expect(text(page, "Entry saved")).toHaveCount(0);
    const got = await readCats();
    expect(got).toHaveLength(1);
    expect(got[0].category).toBe("Cloud");
    expect(got[0].tools).toEqual([
      { name: "Firebase", icon: "/icons/firebase.png" },
      { name: "Docker", icon: "/icons/docker.png" },
    ]);
    await reopen(page);
    await expectOrder(page, ["Cloud"]);
    await expect(text(page, "Cloud and DevOps")).toHaveCount(0);
  });

  test("E2E-13: long names, paths and options stay within a 375 pixel screen", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await ownerSession(page);
    const L1: Cat = {
      id: "e2e-l1",
      category: "Microsoft Platform",
      tools: [
        { name: "Microsoft Azure DevOps Services with Boards and Pipelines", icon: "/icons/azure-devops.png" },
        { name: rep("A", 80), icon: "/icons/" + rep("a", 70) + ".png" },
      ],
      position: 0,
      updatedAt: 1,
    };
    const L2: Cat = {
      id: "e2e-l2",
      category: rep("B", 80),
      tools: [{ name: "Short", icon: "/icons/s.png" }],
      position: 1,
      updatedAt: 1,
    };
    await seedCat(L1);
    await seedCat(L2);
    await seedImage("e2e-13", rep("I", 80) + ".png");
    await openTech(page);
    const check = async () => {
      const m = await measureLayout(page);
      expect(m.scrollWidth).toBeLessThanOrEqual(375);
      expect(m.bad).toEqual([]);
    };
    const row1 = rowFor(page, "Microsoft Platform");
    for (const b of ["Edit", "Delete", "Move down"]) await expect(inBox(row1, b)).toBeVisible();
    await check();
    const box = await ITEMS(page, "Microsoft Platform").first().boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x + box!.width).toBeLessThanOrEqual(375);
    expect(box!.height).toBeGreaterThan(40);
    await inBox(row1, "Edit").click();
    await expect(page.getByRole("heading", { level: 3, name: "Edit entry" })).toBeVisible();
    await expect(field(page, "Item 1 name")).toHaveValue("Microsoft Azure DevOps Services with Boards and Pipelines");
    await check();
    await btn(page, "Add item").click();
    await field(page, "Item 3 name").fill(rep("N", 80));
    await field(page, "Item 3 icon path").fill("/icons/" + rep("n", 70) + ".png");
    await field(page, "Item 3 uploaded image").selectOption({ label: rep("I", 80) + ".png" });
    await check();
    await btn(page, "Save").click();
    await expect(text(page, "Entry saved")).toBeVisible();
    await expect(ITEMS(page, "Microsoft Platform")).toHaveCount(3);
    await check();
    await inBox(rowFor(page, rep("B", 80)), "Delete").click();
    await check();
    await expect(inBox(GROUP(page), "Confirm")).toBeVisible();
    await expect(inBox(GROUP(page), "Cancel")).toBeVisible();
    await inBox(GROUP(page), "Cancel").click();
  });

  test("E2E-14: a new category goes to the bottom of the list", async ({ page }) => {
    await ownerSession(page);
    await seedCat(F);
    await seedCat(at(K, 1));
    await openTech(page);
    await btn(page, "Add category").click();
    await field(page, "Category name").fill("Frontend");
    await field(page, "Item 1 name").fill("Vue");
    await field(page, "Item 1 icon path").fill("/icons/vue.png");
    await btn(page, "Save").click();
    await expect(text(page, "Entry saved")).toBeVisible();
    await expectOrder(page, ["Frontend", "Backend", "Frontend"]);
    await expect(EDITOR(page).getByRole("alert")).toHaveCount(0);
    await expect(inBox(ENTRIES(page).first(), "Move up")).toHaveCount(0);
    await expect(inBox(ENTRIES(page).last(), "Move down")).toHaveCount(0);
    const got = await readCats();
    expect(got).toHaveLength(3);
    expect(got.slice(0, 2).map((c) => c.id)).toEqual(["e2e-f", "e2e-k"]);
    expect(got[2].category).toBe("Frontend");
    expect(got[2].tools).toEqual([{ name: "Vue", icon: "/icons/vue.png" }]);
    expect(got[2].position).toBe(2);
    expect(got[2].updatedAt).toBeGreaterThan(BIG);
    expect(core(got[0])).toEqual(core(F));
    expect(core(got[1])).toEqual(core(at(K, 1)));
    await reopen(page);
    await expectOrder(page, ["Frontend", "Backend", "Frontend"]);
  });

  test("E2E-15: image and path replace each other and a removal in the add form stores nothing", async ({ page }) => {
    await ownerSession(page);
    await seedImage("e2e-15", "firebase-logo.png");
    await openTech(page);
    await btn(page, "Add category").click();
    await field(page, "Category name").fill("Cloud");
    await field(page, "Item 1 name").fill("Firebase");
    await field(page, "Item 1 uploaded image").selectOption({ label: "firebase-logo.png" });
    await expect(field(page, "Item 1 icon path")).toHaveValue("");
    await expect(field(page, "Item 1 uploaded image")).toHaveValue("e2e-15");
    await field(page, "Item 1 icon path").fill("/icons/new.png");
    await expect(field(page, "Item 1 uploaded image")).toHaveValue("");
    await expect(field(page, "Item 1 icon path")).toHaveValue("/icons/new.png");
    await field(page, "Item 1 uploaded image").selectOption({ label: "firebase-logo.png" });
    await expect(field(page, "Item 1 icon path")).toHaveValue("");
    await btn(page, "Add item").click();
    await field(page, "Item 2 name").fill("Temp");
    await inBox(item(page, 2), "Delete").click();
    await expect(IGROUP(page)).toContainText('Delete the item "Temp"? This cannot be undone.');
    await inBox(IGROUP(page), "Cancel").click();
    await expect(IGROUP(page)).toHaveCount(0);
    await expect(item(page, 2)).toBeVisible();
    await expect(field(page, "Item 2 name")).toHaveValue("Temp");
    await inBox(item(page, 2), "Delete").click();
    await inBox(IGROUP(page), "Confirm").click();
    await expect(item(page, 2)).toHaveCount(0);
    await expect(item(page, 1)).toBeVisible();
    await expect(page.getByRole("heading", { level: 3, name: "Add entry" })).toBeVisible();
    await expect(text(page, "Entry saved")).toHaveCount(0);
    expect(await readCats()).toEqual([]);
    await btn(page, "Add item").click();
    await expect(field(page, "Item 2 name")).toHaveValue("");
    await inBox(item(page, 2), "Delete").click();
    await expect(IGROUP(page)).toContainText("Delete item 2? This cannot be undone.");
    await inBox(IGROUP(page), "Confirm").click();
    await expect(item(page, 2)).toHaveCount(0);
    expect(await readCats()).toEqual([]);
    await btn(page, "Save").click();
    await expect(text(page, "Entry saved")).toBeVisible();
    const got = await readCats();
    expect(got).toHaveLength(1);
    expect(got[0].category).toBe("Cloud");
    expect(got[0].tools).toEqual([{ name: "Firebase", icon: IMGURL("e2e-15") }]);
    await reopen(page);
    await inBox(ENTRIES(page), "Edit").click();
    await expect(field(page, "Item 1 uploaded image")).toHaveValue("e2e-15");
    await expect(field(page, "Item 1 icon path")).toHaveValue("");
    await expect(item(page, 2)).toHaveCount(0);
  });

  test("E2E-16: hand-written or partial stored categories still list and open", async ({ page }) => {
    await ownerSession(page);
    await seedCat(at(F, 0));
    await seedRaw("e2e-h1", {
      category: str("Hand written"),
      tools: {
        arrayValue: {
          values: [
            { stringValue: "x" },
            { mapValue: { fields: { name: str("Ok"), icon: str("/icons/ok.png") } } },
          ],
        },
      },
    });
    await seedRaw("e2e-h2", { category: str("Only a name") });
    await openTech(page);
    await expectOrder(page, ["Frontend", "Hand written", "Only a name"]);
    await expect(EDITOR(page).getByRole("alert")).toHaveCount(0);
    await expect(inBox(ENTRIES(page).first(), "Move up")).toHaveCount(0);
    await expect(inBox(ENTRIES(page).last(), "Move down")).toHaveCount(0);
    await expect(ITEMS(page, "Frontend")).toHaveText(["React: path /icons/react.png", "Angular: path /icons/angular.png"]);
    await expect(ITEMS(page, "Hand written")).toHaveText(["Ok: path /icons/ok.png"]);
    await expect(ITEMS(page, "Only a name")).toHaveText(["No items"]);
    await inBox(rowFor(page, "Only a name"), "Edit").click();
    await expect(field(page, "Category name")).toHaveValue("Only a name");
    await expect(item(page, 1)).toHaveCount(0);
    await btn(page, "Cancel").click();
    await inBox(rowFor(page, "Hand written"), "Edit").click();
    await expect(field(page, "Item 1 name")).toHaveValue("Ok");
    await expect(item(page, 2)).toHaveCount(0);
  });

  test("E2E-17: a failed image list keeps the path usable and a web address is still refused", async ({ page }) => {
    await ownerSession(page);
    const U: Cat = {
      id: "e2e-u",
      category: "Backend",
      tools: [{ name: "Node.js", icon: "https://example.com/gone.png" }],
      position: 0,
      updatedAt: 1,
    };
    await seedCat(U);
    await seedImage("e2e-17", "unused.png");
    await RF(null);
    await reopen(page);
    await expect(ITEMS(page, "Backend")).toHaveText(["Node.js: path https://example.com/gone.png"]);
    await inBox(ENTRIES(page), "Edit").click();
    await expect(text(page, "The uploaded images could not be loaded.")).toBeVisible();
    await expect(field(page, "Item 1 icon path")).toHaveValue("https://example.com/gone.png");
    await expect(field(page, "Item 1 uploaded image").locator("option")).toHaveText(["None"]);
    await btn(page, "Save").click();
    await expect(page.getByRole("heading", { level: 3, name: "Edit entry" })).toBeVisible();
    await expect(field(page, "Item 1 icon path")).toHaveAccessibleDescription('Icon path must start with "/"');
    await expect(text(page, "Entry saved")).toHaveCount(0);
    const got = await readCats();
    expect(got).toHaveLength(1);
    expect(core(got[0])).toEqual(core(U));
  });

  test("E2E-18: the menu shows the Tech stack editor and keeps Blog posts as the placeholder", async ({ page }) => {
    await ownerSession(page);
    const MENU = ["Profile", "Experience", "Projects", "Certifications", "Tech stack", "Blog posts", "Images"];
    const h2 = page.getByRole("heading", { level: 2, name: "Tech stack" });
    const blog = text(page, "Blog posts editor is not available yet.");
    const old = text(page, "Tech stack editor is not available yet.");
    const menu = nav(page).getByRole("button");
    await nav(page).getByRole("button", { name: "Blog posts", exact: true }).click();
    await expect(page.getByRole("heading", { level: 2, name: "Blog posts" })).toBeVisible();
    await expect(h2).toHaveCount(0);
    await expect(EDITOR(page)).toHaveCount(0);
    await expect(old).toHaveCount(0);
    await expect(menu).toHaveText(MENU);
    await nav(page).getByRole("button", { name: "Tech stack", exact: true }).click();
    await expect(h2).toBeVisible();
    await expect(btn(page, "Add category")).toBeVisible();
    await expect(EDITOR(page)).toHaveCount(1);
    await expect(blog).toHaveCount(0);
    await expect(old).toHaveCount(0);
    await expect(menu).toHaveText(MENU);
    await nav(page).getByRole("button", { name: "Certifications", exact: true }).click();
    await expect(page.getByRole("heading", { level: 2, name: "Certifications" })).toBeVisible();
    await expect(h2).toHaveCount(0);
    await expect(EDITOR(page)).toHaveCount(0);
    await expect(old).toHaveCount(0);
    await expect(menu).toHaveText(MENU);
    await nav(page).getByRole("button", { name: "Blog posts", exact: true }).click();
    await expect(page.getByRole("heading", { level: 2, name: "Blog posts" })).toBeVisible();
    await expect(h2).toHaveCount(0);
    await expect(old).toHaveCount(0);
    await expect(menu).toHaveText(MENU);
    await nav(page).getByRole("button", { name: "Tech stack", exact: true }).click();
    await expect(h2).toBeVisible();
    await expect(blog).toHaveCount(0);
    await expect(old).toHaveCount(0);
    await expect(menu).toHaveText(MENU);
  });

  test("E2E-19: the changed files keep to the house rules", () => {
    const files = [
      "src/app/components/admin/ListEditor.tsx",
      "src/app/components/admin/TechStackEditor.tsx",
      "src/lib/admin/techstack.ts",
      "src/lib/firebase/techstack.ts",
    ];
    const banned = [
      /#[0-9a-fA-F]{3,8}\b/,
      /\brgba?\(/,
      /\bhsla?\(/,
      /dark:/,
      /console\./,
      /<img/,
      /@\/lib\/blog/,
      /dangerouslySetInnerHTML/,
      /process\.env/,
      /email/i,
      new RegExp("eslint" + "-disable"),
      new RegExp("@ts" + "-ignore"),
      new RegExp("@ts" + "-nocheck"),
    ];
    const words = [
      "firebase/auth",
      "getFirebaseAuth",
      "currentUser",
      "displayName",
      "photoURL",
      "watchAuth",
      "signInWithGoogle",
      "signOutUser",
      "onAuthStateChanged",
      "getAuth",
      "providerData",
      "getIdToken",
      "accessToken",
    ];
    for (const f of files) {
      const t = repoText(f);
      for (const re of banned) expect(t, `${f} matches ${re}`).not.toMatch(re);
      for (const w of words) expect(t, `${f} has ${w}`).not.toContain(w);
    }
    for (const f of files.slice(1)) {
      const t = repoText(f);
      for (const w of ["Add entry", "Confirm delete"]) expect(t, `${f} has ${w}`).not.toContain(w);
    }
    const le = repoText("src/app/components/admin/ListEditor.tsx");
    for (const w of [
      "rowDetails",
      "deleteText",
      "saveNow",
      "addLabel",
      "emptyText",
      "listLabel",
      "newPosition",
      "Add entry",
      "Move up",
      "Move down",
      "Confirm delete",
    ])
      expect(le, `ListEditor has ${w}`).toContain(w);
    const te = repoText("src/app/components/admin/TechStackEditor.tsx");
    for (const w of ["bottomPosition", "listImages", "photoSelection", "savingOn", "rowDetails", "deleteText", "saveNow"])
      expect(te, `TechStackEditor has ${w}`).toContain(w);
    expect(te).not.toContain("firebase/firestore");
    expect(repoText("src/lib/admin/techstack.ts")).not.toContain("firebase");
    expect(repoText("src/lib/firebase/techstack.ts")).toContain("createListStore");
  });

  test("E2E-20: public pages never carry the tech stack editor and the panel does", async ({ browser }) => {
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
      for (const s of ["No tech categories yet.", "firestore.googleapis.com", "thegoldenpothos-5b3a1"])
        expect(t, `${path} contains ${s}`).not.toContain(s);
    }
    expect(await visit(PANEL)).toContain("No tech categories yet.");
  });
});
