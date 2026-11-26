import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// Intent acceptance for docs/requirements/admin-content-panel-intent.md.
// Every test goes through the running app (the built out/ served on :3100) or through the emulators the slices
// already use. Ids: §5.n is the n-th hard constraint, §6.n the n-th definition-of-done line.

const AUTH = "http://127.0.0.1:9099";
const FIRESTORE = "http://127.0.0.1:8080";
const STORAGE = "http://127.0.0.1:9199";
const PROJECT = "thegoldenpothos-5b3a1";
const BUCKET = "thegoldenpothos-5b3a1.firebasestorage.app";
const DOCS = `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents`;
const OBJ = `${STORAGE}/v0/b/${BUCKET}/o`;
const IMG = `${OBJ}/images%2F`;
const PLACEHOLDER = "REPLACE_WITH_OWNER_UID";
const PANEL = "/bright-warm-greenhouse/";
const SLUG_PART = "bright-warm-greenhouse";
const OTHER_UID = "not-this-account-0000000000";
const NOT_ALLOWED = "This account is not allowed to use the admin panel.";
const NOTICE = "Saving is not switched on yet.";
const SIX = ["Profile", "Experience", "Projects", "Certifications", "Tech stack", "Blog posts"];
const COLLECTIONS = ["profile", "experience", "projects", "certifications", "techCategories", "blogPosts", "images"];
const ROOT = process.cwd();
const repoText = (name: string) => readFileSync(join(ROOT, name), "utf8");

type Account = { uid: string; token: string };
type Who = Account | "admin" | undefined;
type Fields = Record<string, unknown>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const str = (v: string) => ({ stringValue: v });
const int = (v: number) => ({ integerValue: String(v) });
const bool = (v: boolean) => ({ booleanValue: v });
const arr = (values: unknown[]) => ({ arrayValue: values.length ? { values } : {} });

// ---------- emulator plumbing ----------

async function signUp(): Promise<Account> {
  let lastError: unknown;
  for (let i = 0; i < 20; i++) {
    try {
      const res = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=any-key`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ returnSecureToken: true }),
      });
      const body = (await res.json()) as { localId: string; idToken: string };
      return { uid: body.localId, token: body.idToken };
    } catch (e) {
      lastError = e;
      await sleep(500);
    }
  }
  throw lastError;
}

// uid null loads the committed rules untouched (the placeholder owner, who matches nobody).
async function RF(uid: string | null): Promise<void> {
  const original = repoText("firestore.rules");
  const content = uid === null ? original : original.replace(PLACEHOLDER, uid);
  const res = await fetch(`${FIRESTORE}/emulator/v1/projects/${PROJECT}:securityRules`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rules: { files: [{ name: "firestore.rules", content }] } }),
  });
  expect(res.status).toBe(200);
}

async function RS(uid: string | null): Promise<void> {
  const original = repoText("storage.rules");
  const content = uid === null ? original : original.replace(PLACEHOLDER, uid);
  const res = await fetch(`${STORAGE}/internal/setRules`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rules: { files: [{ name: "storage.rules", content }] } }),
  });
  expect(res.status).toBe(200);
}

function docsAuth(who: Who): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (who === "admin") h.Authorization = "Bearer owner";
  else if (who) h.Authorization = `Bearer ${who.token}`;
  return h;
}
function storageAuth(who: Who): Record<string, string> {
  if (who === "admin") return { Authorization: "Bearer owner" };
  if (who) return { Authorization: `Firebase ${who.token}` };
  return {};
}

function writeDoc(path: string, fields: Fields, who: Who) {
  return fetch(`${DOCS}/${path}`, { method: "PATCH", headers: docsAuth(who), body: JSON.stringify({ fields }) });
}
function readDoc(path: string, who: Who) {
  return fetch(`${DOCS}/${path}`, { method: "GET", headers: docsAuth(who) });
}
function deleteDoc(path: string, who: Who) {
  return fetch(`${DOCS}/${path}`, { method: "DELETE", headers: docsAuth(who) });
}
async function seed(path: string, fields: Fields): Promise<void> {
  expect((await writeDoc(path, fields, "admin")).status).toBe(200);
}
async function docField(path: string, key: string): Promise<string | undefined> {
  const res = await readDoc(path, "admin");
  if (res.status !== 200) return undefined;
  const body = (await res.json()) as { fields?: Record<string, { stringValue?: string }> };
  return body.fields?.[key]?.stringValue;
}
async function docExists(path: string): Promise<boolean> {
  return (await readDoc(path, "admin")).status === 200;
}
async function docIds(col: string): Promise<string[]> {
  const res = await fetch(`${DOCS}/${col}?pageSize=300`, { headers: docsAuth("admin") });
  const body = (await res.json()) as { documents?: { name: string }[] };
  return (body.documents ?? []).map((d) => d.name.split("/").pop() as string);
}
async function docsOf(col: string): Promise<{ id: string; fields: Record<string, any> }[]> {
  const res = await fetch(`${DOCS}/${col}?pageSize=300`, { headers: docsAuth("admin") });
  const body = (await res.json()) as { documents?: { name: string; fields?: Record<string, any> }[] };
  return (body.documents ?? []).map((d) => ({ id: d.name.split("/").pop() as string, fields: d.fields ?? {} }));
}

function putObject(name: string, type: string, bytes: number, who: Who) {
  return fetch(`${OBJ}?name=images%2F${name}`, {
    method: "POST",
    headers: { "Content-Type": type, ...storageAuth(who) },
    body: bytes === 0 ? undefined : Buffer.alloc(bytes, 1),
  });
}
function getObject(name: string, who: Who) {
  return fetch(`${OBJ}/images%2F${name}?alt=media`, { method: "GET", headers: storageAuth(who) });
}
function removeObject(name: string, who: Who) {
  return fetch(`${OBJ}/images%2F${name}`, { method: "DELETE", headers: storageAuth(who) });
}
async function storedFiles(): Promise<string[]> {
  const res = await fetch(`${OBJ}?prefix=images%2F`, { headers: storageAuth("admin") });
  const body = (await res.json()) as { items?: { name: string }[] };
  return (body.items ?? []).map((i) => i.name);
}

async function clearAll(): Promise<void> {
  for (const col of COLLECTIONS) {
    for (const id of await docIds(col)) await deleteDoc(`${col}/${id}`, "admin");
  }
  for (const name of await storedFiles()) {
    await fetch(`${OBJ}/${encodeURIComponent(name)}`, { method: "DELETE", headers: storageAuth("admin") });
  }
}

// ---------- seed shapes (mirror what the editors store) ----------

async function seedProfile(name: string): Promise<void> {
  await seed("profile/main", {
    name: str(name),
    headline: str("Seeded headline"),
    about: arr([str("Seeded paragraph.")]),
    photo: str(""),
    email: str(""),
    resumeLink: str(""),
    socialLinks: arr([]),
    updatedAt: int(1),
  });
}
async function seedExperience(id: string, title: string, company: string, position: number): Promise<void> {
  await seed(`experience/${id}`, {
    year: str("2026"),
    title: str(title),
    company: str(company),
    duration: str("2026"),
    description: str("Seeded work."),
    details: arr([]),
    position: int(position),
    updatedAt: int(1),
  });
}
async function seedProject(id: string, title: string, position: number): Promise<void> {
  await seed(`projects/${id}`, {
    title: str(title),
    shortDesc: str("Seeded"),
    description: arr([]),
    tech: arr([]),
    github: str(""),
    demo: str(""),
    position: int(position),
    updatedAt: int(1),
  });
}
async function seedCert(id: string, name: string, position: number): Promise<void> {
  await seed(`certifications/${id}`, {
    name: str(name),
    icon: str("/certs/scrum.png"),
    url: str("https://example.com/credential"),
    position: int(position),
    updatedAt: int(1),
  });
}
async function seedCategory(id: string, category: string, position: number): Promise<void> {
  const tool = (n: string, i: string) => ({ mapValue: { fields: { name: str(n), icon: str(i) } } });
  await seed(`techCategories/${id}`, {
    category: str(category),
    tools: arr([tool("React", "/icons/react.png"), tool("Node.js", "/icons/node.png")]),
    position: int(position),
    updatedAt: int(1),
  });
}
async function seedPost(id: string, title: string, draft: boolean | null, body = "Seeded body", date = "2026-05-15"): Promise<void> {
  const fields: Fields = {
    title: str(title),
    excerpt: str("Seeded excerpt"),
    date: str(date),
    tags: arr([]),
    featured: bool(false),
    coverImage: str(""),
    coverAlt: str(""),
    body: str(body),
    createdAt: int(1),
    updatedAt: int(1),
  };
  if (draft !== null) fields.draft = bool(draft);
  await seed(`blogPosts/${id}`, fields);
}
async function seedImageDoc(id: string, name: string): Promise<void> {
  await seed(`images/${id}`, {
    name: str(name),
    storagePath: str(`images/${id}.png`),
    url: str(`${IMG}${id}.png?alt=media&token=t`),
    contentType: str("image/png"),
    size: int(1000),
    createdAt: int(1),
  });
}

// ---------- browser plumbing ----------

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
const btn = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
const text = (page: Page, t: string) => page.getByText(t, { exact: true });
const field = (page: Page, label: string) => page.getByLabel(label, { exact: true });
const alertWith = (page: Page, t: string) => page.getByRole("alert").filter({ hasText: t });
const GROUP = (page: Page) => page.getByRole("group", { name: "Confirm delete", exact: true });

async function setOwnerOverride(page: Page, value: string): Promise<void> {
  await page.addInitScript((v) => {
    window.localStorage.setItem("admin.ownerUid", v);
  }, value);
}

// Clears every collection and file, signs in as a fresh account, makes that account the owner (the dev-only
// override) and loads both rules files with that account as the owner.
async function ownerSession(page: Page): Promise<string> {
  await clearAll();
  await page.goto(PANEL);
  await P(page);
  const idText = page.getByText(/^Your user ID: [A-Za-z0-9]{20,}$/);
  await expect(idText).toBeVisible();
  const X = (await idText.locator("code").innerText()).trim();
  await page.evaluate((v) => window.localStorage.setItem("admin.ownerUid", v), X);
  await page.reload();
  await expect(nav(page)).toBeVisible();
  await expect(page.getByText(/^Your user ID:/)).toHaveCount(0);
  await RF(X);
  await RS(X);
  return X;
}

// A signed-in account that the panel itself does not recognise as the owner.
async function strangerSession(page: Page): Promise<void> {
  await setOwnerOverride(page, OTHER_UID);
  await page.goto(PANEL);
  await P(page);
  await expect(alertWith(page, NOT_ALLOWED)).toBeVisible();
}

async function openSection(page: Page, menu: string): Promise<void> {
  await nav(page).getByRole("button", { name: menu, exact: true }).click();
  await expect(page.getByRole("heading", { level: 2, name: menu })).toBeVisible();
}
async function reopenSection(page: Page, menu: string): Promise<void> {
  await page.reload();
  await expect(nav(page)).toBeVisible();
  await openSection(page, menu);
}

// ---------- test files for the library ----------

const PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const JPEG_B64 = "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=";
const WEBP_B64 = "UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==";

type TestFile = { name: string; mimeType: string; buffer: Buffer };
function makeFile(name: string, type: string, bytes: number): TestFile {
  if (bytes === 0) return { name, mimeType: type, buffer: Buffer.alloc(0) };
  if (type === "image/svg+xml") {
    const head = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg><!--';
    const tail = "-->";
    const pad = Math.max(0, bytes - head.length - tail.length);
    return { name, mimeType: type, buffer: Buffer.from(head + " ".repeat(pad) + tail) };
  }
  let head: Buffer;
  if (type === "image/png") head = Buffer.from(PNG_B64, "base64");
  else if (type === "image/jpeg") head = Buffer.from(JPEG_B64, "base64");
  else if (type === "image/webp") head = Buffer.from(WEBP_B64, "base64");
  else if (type === "application/pdf") head = Buffer.from("%PDF-1.4");
  else if (type === "image/gif") head = Buffer.from("GIF89a");
  else head = Buffer.from("<html></html>");
  const buffer = Buffer.alloc(bytes, 0);
  head.copy(buffer, 0, 0, Math.min(head.length, bytes));
  return { name, mimeType: type, buffer };
}

async function upload(page: Page, f: TestFile): Promise<void> {
  await page.getByLabel("Image file").setInputFiles(f);
  await page.getByRole("button", { name: "Upload", exact: true }).click();
}
const libItems = (page: Page) => page.getByRole("list", { name: "Uploaded images" }).getByRole("listitem");
const libItem = (page: Page, name: string) => libItems(page).filter({ hasText: name });
const naturalWidth = (page: Page, name: string) =>
  libItem(page, name).getByRole("img", { name }).evaluate((el) => (el as HTMLImageElement).naturalWidth);

// ---------- list-editor plumbing ----------

const entries = (page: Page, list: string) => page.getByRole("list", { name: list }).getByRole("listitem");
const rowIn = (page: Page, list: string, label: string) => entries(page, list).filter({ hasText: label });
const inRow = (row: Locator, name: string) => row.getByRole("button", { name, exact: true });

type ListCfg = {
  menu: string;
  list: string;
  addBtn: string;
  col: string;
  fillFirst: (p: Page) => Promise<void>;
  fillSecond: (p: Page) => Promise<void>;
  first: string;
  second: string;
  editFirst: (p: Page) => Promise<void>;
  firstEdited: string;
};

// Add two, edit one, reorder, delete after confirming; after each step a reload shows the stored state.
async function exerciseList(page: Page, c: ListCfg): Promise<void> {
  await ownerSession(page);
  await openSection(page, c.menu);
  await expect(entries(page, c.list)).toHaveCount(0);

  await btn(page, c.addBtn).click();
  await c.fillFirst(page);
  await btn(page, "Save").click();
  await expect(entries(page, c.list)).toHaveCount(1);
  await btn(page, c.addBtn).click();
  await c.fillSecond(page);
  await btn(page, "Save").click();
  await expect(entries(page, c.list)).toHaveCount(2);
  expect(await docIds(c.col)).toHaveLength(2);
  await reopenSection(page, c.menu);
  await expect(entries(page, c.list)).toHaveCount(2);
  await expect(rowIn(page, c.list, c.first)).toHaveCount(1);
  await expect(rowIn(page, c.list, c.second)).toHaveCount(1);

  await inRow(rowIn(page, c.list, c.first), "Edit").click();
  await c.editFirst(page);
  await btn(page, "Save").click();
  await expect(rowIn(page, c.list, c.firstEdited)).toHaveCount(1);
  await expect(text(page, c.first)).toHaveCount(0);
  await reopenSection(page, c.menu);
  await expect(rowIn(page, c.list, c.firstEdited)).toHaveCount(1);
  await expect(entries(page, c.list)).toHaveCount(2);

  const labels = [c.firstEdited, c.second];
  const topText = await entries(page, c.list).nth(0).innerText();
  const top = topText.includes(labels[0]) ? labels[0] : labels[1];
  const bottom = top === labels[0] ? labels[1] : labels[0];
  await inRow(entries(page, c.list).nth(1), "Move up").click();
  await expect(text(page, "Order saved")).toBeVisible();
  await expect(entries(page, c.list).nth(0)).toContainText(bottom);
  await expect(entries(page, c.list).nth(1)).toContainText(top);
  await reopenSection(page, c.menu);
  await expect(entries(page, c.list).nth(0)).toContainText(bottom);
  await expect(entries(page, c.list).nth(1)).toContainText(top);

  await inRow(rowIn(page, c.list, top), "Delete").click();
  await expect(GROUP(page)).toBeVisible();
  expect(await docIds(c.col)).toHaveLength(2);
  await GROUP(page).getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(text(page, "Entry deleted")).toBeVisible();
  await expect(entries(page, c.list)).toHaveCount(1);
  await expect(entries(page, c.list).first()).toContainText(bottom);
  expect(await docIds(c.col)).toHaveLength(1);
  await reopenSection(page, c.menu);
  await expect(entries(page, c.list)).toHaveCount(1);
  await expect(entries(page, c.list).first()).toContainText(bottom);
  await expect(page.getByText(top)).toHaveCount(0);
}

// ---------- source scanning ----------

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry === "out" || entry === ".git") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}
const rel = (p: string) => p.slice(ROOT.length + 1);
const ADMIN_SOURCES = ["src/lib/firebase", "src/lib/admin", "src/app/components/admin", "src/app/bright-warm-greenhouse"];
const adminFiles = () => ADMIN_SOURCES.flatMap((d) => walk(join(ROOT, d)));

function repoPosts(): { slug: string; title: string; draft: boolean }[] {
  const dir = join(ROOT, "content/blog");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      const raw = readFileSync(join(dir, f), "utf8");
      const front = /^---\n([\s\S]*?)\n---/.exec(raw)?.[1] ?? "";
      const pick = (key: string) => new RegExp(`^${key}:\\s*"?(.*?)"?\\s*$`, "m").exec(front)?.[1] ?? "";
      return { slug: pick("slug"), title: pick("title"), draft: pick("draft") === "true" };
    });
}

const FIREBASE_MARKERS = [
  "thegoldenpothos-5b3a1",
  "identitytoolkit.googleapis.com",
  "firestore.googleapis.com",
  "firebasestorage",
  "securetoken.googleapis.com",
];
const FIREBASE_HOSTS = ["firebase", "firestore.googleapis.com", "identitytoolkit", "securetoken", "apis.google.com", ":9099", ":8080", ":9199"];

async function visitPublic(browser: Browser, path: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const requests: string[] = [];
  const scripts: string[] = [];
  const pending: Promise<void>[] = [];
  const errors: string[] = [];
  page.on("request", (r) => requests.push(r.url()));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (res) => {
    if (res.request().resourceType() === "script") {
      pending.push(res.text().then((t) => void scripts.push(t)).catch(() => undefined));
    }
  });
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  await Promise.all(pending);
  const html = await page.content();
  return { page, context, requests, scripts, html, errors };
}

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

test.describe("admin content panel: intent acceptance", () => {
  test.describe.configure({ mode: "serial", timeout: 120000 });

  // ================= §6 definition of done =================

  test("E2E-ACC-01: signed out, the panel offers Sign in with Google and shows no site content (§6.1)", async ({ page }) => {
    await clearAll();
    await seedProfile("Seeded Private Name");
    await seedPost("acc-01-draft", "Seeded Draft Secret", true);
    const dataRequests: string[] = [];
    page.on("request", (r) => {
      const u = r.url();
      if (u.startsWith(FIRESTORE) || u.startsWith(STORAGE)) dataRequests.push(u);
    });
    await page.goto(PANEL);
    await expect(btn(page, "Sign in with Google")).toBeVisible();
    await expect(nav(page)).toHaveCount(0);
    for (const s of SIX) await expect(btn(page, s)).toHaveCount(0);
    const body = await page.locator("body").innerText();
    for (const s of ["Seeded Private Name", "Seeded Draft Secret", "Seeded headline", "Keith Lim"]) expect(body).not.toContain(s);
    expect(dataRequests).toEqual([]);
  });

  test("E2E-ACC-02: signed in as the owner, the menu has the six sections and each opens its editor (§6.2)", async ({ page }) => {
    await ownerSession(page);
    const labels = (await nav(page).getByRole("button").allInnerTexts()).map((s) => s.trim());
    expect(labels.slice(0, 6)).toEqual(SIX);
    await expect(btn(page, "Sign out")).toBeVisible();
    for (const s of SIX) {
      await openSection(page, s);
    }
    await expect(page.getByText(NOT_ALLOWED)).toHaveCount(0);
  });

  test("E2E-ACC-03: a different Google account is told it is not allowed, sees no content and can sign out (§6.3)", async ({ page }) => {
    await clearAll();
    await seedProfile("Seeded Private Name");
    await seedPost("acc-03-pub", "Seeded Published Title", false);
    const dataRequests: string[] = [];
    page.on("request", (r) => {
      const u = r.url();
      if (u.startsWith(FIRESTORE) || u.startsWith(STORAGE)) dataRequests.push(u);
    });
    await strangerSession(page);
    await expect(btn(page, "Sign out")).toBeVisible();
    await expect(nav(page)).toHaveCount(0);
    for (const s of SIX) await expect(btn(page, s)).toHaveCount(0);
    const body = await page.locator("body").innerText();
    for (const s of ["Seeded Private Name", "Seeded Published Title", "Seeded headline"]) expect(body).not.toContain(s);
    expect(dataRequests).toEqual([]);
    await btn(page, "Sign out").click();
    await expect(btn(page, "Sign in with Google")).toBeVisible();
    await expect(page.getByText(NOT_ALLOWED)).toHaveCount(0);
  });

  test("E2E-ACC-04: against the database stand-in, signed-out and non-owner writes are refused and the owner's succeeds (§6.4)", async () => {
    const owner = await signUp();
    const other = await signUp();
    await RF(owner.uid);
    for (const col of COLLECTIONS) {
      const path = `${col}/acc-04`;
      await seed(path, { name: str("Before"), draft: bool(false) });
      expect((await writeDoc(path, { name: str("Defaced") }, undefined)).status).toBe(403);
      expect((await writeDoc(path, { name: str("Defaced") }, other)).status).toBe(403);
      expect(await docField(path, "name")).toBe("Before");
      expect((await writeDoc(path, { name: str("Changed by owner"), draft: bool(false) }, owner)).status).toBe(200);
      expect(await docField(path, "name")).toBe("Changed by owner");
    }
  });

  test("E2E-ACC-05: the owner edits the whole profile, saves, reloads and sees the saved values (§6.5)", async ({ page }) => {
    await ownerSession(page);
    await openSection(page, "Profile");
    await field(page, "Name").fill("Keith Acceptance");
    await field(page, "Headline").fill("Accepted Engineer");
    await btn(page, "Add paragraph").click();
    await field(page, "About paragraph 1").fill("First accepted paragraph.");
    await btn(page, "Add paragraph").click();
    await field(page, "About paragraph 2").fill("Second accepted paragraph.");
    await field(page, "Photo path").fill("/profile/placeholder.jpg");
    await field(page, "Email").fill("accept@example.org");
    await field(page, "Resume link").fill("/resume.pdf");
    await btn(page, "Add social link").click();
    await field(page, "Social link 1 label").fill("GitHub");
    await field(page, "Social link 1 address").fill("https://github.com/example");
    await btn(page, "Add social link").click();
    await field(page, "Social link 2 label").fill("LinkedIn");
    await field(page, "Social link 2 address").fill("https://linkedin.com/in/example");
    await btn(page, "Save").click();
    await expect(text(page, "Profile saved")).toBeVisible();
    await reopenSection(page, "Profile");
    await expect(field(page, "Name")).toHaveValue("Keith Acceptance");
    await expect(field(page, "Headline")).toHaveValue("Accepted Engineer");
    await expect(field(page, "About paragraph 1")).toHaveValue("First accepted paragraph.");
    await expect(field(page, "About paragraph 2")).toHaveValue("Second accepted paragraph.");
    await expect(field(page, "Photo path")).toHaveValue("/profile/placeholder.jpg");
    await expect(field(page, "Email")).toHaveValue("accept@example.org");
    await expect(field(page, "Resume link")).toHaveValue("/resume.pdf");
    await expect(field(page, "Social link 1 label")).toHaveValue("GitHub");
    await expect(field(page, "Social link 1 address")).toHaveValue("https://github.com/example");
    await expect(field(page, "Social link 2 label")).toHaveValue("LinkedIn");
    await expect(field(page, "Social link 2 address")).toHaveValue("https://linkedin.com/in/example");
    expect(await docField("profile/main", "name")).toBe("Keith Acceptance");
  });

  test("E2E-ACC-06: experience entries can be added, edited, reordered and deleted after confirming, and persist (§6.6)", async ({ page }) => {
    const fill = (title: string, company: string) => async (p: Page) => {
      await field(p, "Year").fill("2026");
      await field(p, "Title").fill(title);
      await field(p, "Company").fill(company);
      await field(p, "Duration").fill("2026 - Present");
      await field(p, "Description").fill("Acceptance work.");
    };
    await exerciseList(page, {
      menu: "Experience",
      list: "Experience entries",
      addBtn: "Add entry",
      col: "experience",
      fillFirst: fill("Engineer", "Alpha"),
      fillSecond: fill("Lead", "Beta"),
      first: "Engineer at Alpha",
      second: "Lead at Beta",
      editFirst: async (p) => {
        await field(p, "Company").fill("Alpha Group");
      },
      firstEdited: "Engineer at Alpha Group",
    });
  });

  test("E2E-ACC-07: projects can be added, edited, reordered and deleted after confirming, and persist (§6.6)", async ({ page }) => {
    const fill = (title: string) => async (p: Page) => {
      await field(p, "Title").fill(title);
      await field(p, "Short description").fill("Acceptance project");
    };
    await exerciseList(page, {
      menu: "Projects",
      list: "Projects list",
      addBtn: "Add entry",
      col: "projects",
      fillFirst: fill("Kaafei Accept"),
      fillSecond: fill("Recipe Accept"),
      first: "Kaafei Accept",
      second: "Recipe Accept",
      editFirst: async (p) => {
        await field(p, "Title").fill("Kaafei Renamed");
      },
      firstEdited: "Kaafei Renamed",
    });
  });

  test("E2E-ACC-08: certifications can be added, edited, reordered and deleted after confirming, and persist (§6.6)", async ({ page }) => {
    const fill = (name: string, badge: string) => async (p: Page) => {
      await field(p, "Name").fill(name);
      await field(p, "Badge image path").fill(badge);
      await field(p, "Credential link").fill("https://example.com/credential");
    };
    await exerciseList(page, {
      menu: "Certifications",
      list: "Certifications list",
      addBtn: "Add certification",
      col: "certifications",
      fillFirst: fill("Scrum Accept", "/certs/scrum.png"),
      fillSecond: fill("Python Accept", "/certs/google-python.png"),
      first: "Scrum Accept",
      second: "Python Accept",
      editFirst: async (p) => {
        await field(p, "Name").fill("Scrum Renamed");
      },
      firstEdited: "Scrum Renamed",
    });
  });

  test("E2E-ACC-09: tech categories and their items can be added, edited, reordered and deleted after confirming, and persist (§6.6)", async ({ page }) => {
    const fill = (category: string, item: string, icon: string) => async (p: Page) => {
      await field(p, "Category name").fill(category);
      await field(p, "Item 1 name").fill(item);
      await field(p, "Item 1 icon path").fill(icon);
    };
    await exerciseList(page, {
      menu: "Tech stack",
      list: "Tech categories list",
      addBtn: "Add category",
      col: "techCategories",
      fillFirst: fill("Frontend Accept", "React", "/icons/react.png"),
      fillSecond: fill("Backend Accept", "Node.js", "/icons/node.png"),
      first: "Frontend Accept",
      second: "Backend Accept",
      editFirst: async (p) => {
        await field(p, "Category name").fill("Frontend Renamed");
      },
      firstEdited: "Frontend Renamed",
    });

    // The items of a category: add one, change the order of its items, delete one after confirming.
    await reopenSection(page, "Tech stack");
    const items = (label: string) =>
      rowIn(page, "Tech categories list", label).getByRole("group", { name: "Items of " + label, exact: true }).locator("p");
    const label = "Backend Accept";
    await inRow(rowIn(page, "Tech categories list", label), "Edit").click();
    await btn(page, "Add item").click();
    await field(page, "Item 2 name").fill("Angular");
    await field(page, "Item 2 icon path").fill("/icons/angular.png");
    await inRow(page.getByRole("group", { name: "Item 2", exact: true }), "Move up").click();
    await btn(page, "Save").click();
    await expect(items(label)).toHaveText(["Angular: path /icons/angular.png", "Node.js: path /icons/node.png"]);
    await reopenSection(page, "Tech stack");
    await expect(items(label)).toHaveText(["Angular: path /icons/angular.png", "Node.js: path /icons/node.png"]);
    await inRow(rowIn(page, "Tech categories list", label), "Edit").click();
    await inRow(page.getByRole("group", { name: "Item 1", exact: true }), "Delete").click();
    const itemGroup = page.getByRole("group", { name: "Confirm item delete", exact: true });
    await expect(itemGroup).toBeVisible();
    await itemGroup.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(items(label)).toHaveText(["Node.js: path /icons/node.png"]);
    await reopenSection(page, "Tech stack");
    await expect(items(label)).toHaveText(["Node.js: path /icons/node.png"]);
  });

  test("E2E-ACC-10: the owner writes blog posts in markdown with every setting and sees them listed with their status (§6.7)", async ({ page }) => {
    await ownerSession(page);
    await openSection(page, "Blog posts");
    await btn(page, "Add post").click();
    await field(page, "Title").fill("Acceptance draft post");
    await field(page, "Excerpt").fill("A draft excerpt");
    await field(page, "Date").fill("2026-05-15");
    await field(page, "Slug").fill("acceptance-draft-post");
    await field(page, "Body").fill("## Draft heading\n\nSome **markdown** body.");
    await field(page, "Tags").fill("nextjs, firebase");
    await field(page, "Cover image path").fill("/profile/placeholder.jpg");
    await field(page, "Cover alt text").fill("A cover");
    await field(page, "Featured").check();
    await btn(page, "Save").click();
    await expect(entries(page, "Blog posts list")).toHaveCount(1);
    await btn(page, "Add post").click();
    await field(page, "Title").fill("Acceptance published post");
    await field(page, "Excerpt").fill("A published excerpt");
    await field(page, "Date").fill("2026-06-20");
    await field(page, "Slug").fill("acceptance-published-post");
    await field(page, "Body").fill("Published body");
    await field(page, "Status").selectOption("Published");
    await btn(page, "Save").click();
    await expect(entries(page, "Blog posts list")).toHaveCount(2);

    await reopenSection(page, "Blog posts");
    const draft = rowIn(page, "Blog posts list", "Acceptance draft post");
    const published = rowIn(page, "Blog posts list", "Acceptance published post");
    await expect(draft).toContainText("Slug: acceptance-draft-post");
    await expect(draft).toContainText("Date: 15 May 2026");
    await expect(draft).toContainText("Status: Draft");
    await expect(published).toContainText("Slug: acceptance-published-post");
    await expect(published).toContainText("Status: Published");
    await inRow(draft, "Edit").click();
    await expect(field(page, "Title")).toHaveValue("Acceptance draft post");
    await expect(field(page, "Excerpt")).toHaveValue("A draft excerpt");
    await expect(field(page, "Date")).toHaveValue("2026-05-15");
    await expect(field(page, "Slug")).toHaveValue("acceptance-draft-post");
    await expect(field(page, "Body")).toHaveValue("## Draft heading\n\nSome **markdown** body.");
    await expect(field(page, "Tags")).toHaveValue("nextjs, firebase");
    await expect(field(page, "Cover image path")).toHaveValue("/profile/placeholder.jpg");
    await expect(field(page, "Cover alt text")).toHaveValue("A cover");
    await expect(field(page, "Status")).toHaveValue("Draft");
    await expect(field(page, "Featured")).toBeChecked();
  });

  test("E2E-ACC-11: saving a post with a slug that is already used is refused with a message and overwrites nothing (§6.8)", async ({ page }) => {
    await ownerSession(page);
    await seedPost("taken-slug", "The original post", false, "Original body");
    await openSection(page, "Blog posts");
    await btn(page, "Add post").click();
    await field(page, "Title").fill("An impostor post");
    await field(page, "Excerpt").fill("Impostor excerpt");
    await field(page, "Date").fill("2026-06-01");
    await field(page, "Slug").fill("taken-slug");
    await field(page, "Body").fill("Impostor body");
    await btn(page, "Save").click();
    await expect(text(page, "A post with this slug already exists")).toBeVisible();
    await expect(text(page, "Entry saved")).toHaveCount(0);
    expect(await docField("blogPosts/taken-slug", "title")).toBe("The original post");
    expect(await docField("blogPosts/taken-slug", "body")).toBe("Original body");
    expect(await docIds("blogPosts")).toEqual(["taken-slug"]);
    await btn(page, "Cancel").click();
    await expect(page.getByText("An impostor post")).toHaveCount(0);
    await reopenSection(page, "Blog posts");
    await expect(entries(page, "Blog posts list")).toHaveCount(1);
    await expect(entries(page, "Blog posts list").first()).toContainText("The original post");
  });

  test("E2E-ACC-12: the owner previews a post's markdown the way the blog renders it, before saving (§6.9)", async ({ page, browser }) => {
    await ownerSession(page);
    const raw = repoText("content/blog/hello-world.md");
    const markdown = raw.replace(/^---\n[\s\S]*?\n---\n/, "");
    await openSection(page, "Blog posts");
    await btn(page, "Add post").click();
    await field(page, "Title").fill("Preview only");
    await field(page, "Excerpt").fill("Never saved");
    await field(page, "Date").fill("2026-05-15");
    await field(page, "Slug").fill("preview-only");
    await field(page, "Body").fill(markdown);
    await btn(page, "Preview").click();
    const pv = page.locator('section[aria-label="Post preview"]');
    await expect(pv).toBeVisible();
    const clean = (rows: string[]) => rows.map((s) => s.replace(/#\s*$/, "").trim());
    const preview = {
      headings: clean(await pv.locator("h2, h3, h4").allInnerTexts()),
      code: await pv.locator("pre code").count(),
      links: await pv.locator("a:not(.heading-anchor)").evaluateAll((els) => els.map((e) => e.getAttribute("href"))),
      lists: await pv.locator("li").count(),
    };
    expect(preview.headings.length).toBeGreaterThan(0);

    // The same markdown, rendered by the public blog from the repo file.
    const context = await browser.newContext();
    const blog = await context.newPage();
    await blog.goto("/blog/hello-world/");
    const prose = blog.getByRole("article").locator("> div");
    await expect(prose).toHaveCount(1);
    const published = {
      headings: clean(await prose.locator("h2, h3, h4").allInnerTexts()),
      code: await prose.locator("pre code").count(),
      links: await prose.locator("a:not(.heading-anchor)").evaluateAll((els) => els.map((e) => e.getAttribute("href"))),
      lists: await prose.locator("li").count(),
    };
    await context.close();
    expect(preview).toEqual(published);

    // Previewing writes nothing.
    expect(await docIds("blogPosts")).toEqual([]);
    await expect(text(page, "Entry saved")).toHaveCount(0);
  });

  test("E2E-ACC-13: a draft the owner writes in the panel cannot be read signed out, and is readable once published (§6.10)", async ({ page }) => {
    await ownerSession(page);
    await openSection(page, "Blog posts");
    await btn(page, "Add post").click();
    await field(page, "Title").fill("Hidden until published");
    await field(page, "Excerpt").fill("Hidden excerpt");
    await field(page, "Date").fill("2026-05-15");
    await field(page, "Slug").fill("hidden-until-published");
    await field(page, "Body").fill("Hidden body");
    await btn(page, "Save").click();
    await expect(rowIn(page, "Blog posts list", "Hidden until published")).toContainText("Status: Draft");
    const signedOut = await readDoc("blogPosts/hidden-until-published", undefined);
    expect(signedOut.status).toBe(403);
    expect(await signedOut.text()).not.toContain("Hidden until published");
    const other = await signUp();
    expect((await readDoc("blogPosts/hidden-until-published", other)).status).toBe(403);

    await inRow(rowIn(page, "Blog posts list", "Hidden until published"), "Edit").click();
    await field(page, "Status").selectOption("Published");
    await btn(page, "Save").click();
    await expect(rowIn(page, "Blog posts list", "Hidden until published")).toContainText("Status: Published");
    const after = await readDoc("blogPosts/hidden-until-published", undefined);
    expect(after.status).toBe(200);
    expect(await after.text()).toContain("Hidden until published");
  });

  test("E2E-ACC-14: the owner uploads png, jpeg, webp, svg and 5 MB images, sees them listed, copies an address and deletes one after confirming (§6.11)", async ({ page, request }) => {
    await ownerSession(page);
    await openSection(page, "Images");
    const uploads: [string, string, number][] = [
      ["one.png", "image/png", 1000],
      ["two.jpg", "image/jpeg", 1000],
      ["three.webp", "image/webp", 1000],
      ["four.svg", "image/svg+xml", 1000],
      ["five-mb.png", "image/png", 5242880],
    ];
    for (const [name, type, bytes] of uploads) {
      await upload(page, makeFile(name, type, bytes));
      await expect(libItem(page, name)).toBeVisible();
      await expect.poll(() => naturalWidth(page, name)).toBeGreaterThan(0);
    }
    await expect(libItems(page)).toHaveCount(5);
    expect(await storedFiles()).toHaveLength(5);
    await reopenSection(page, "Images");
    await expect(libItems(page)).toHaveCount(5);

    const svg = libItem(page, "four.svg");
    await inRow(svg, "Copy address").click();
    await expect(page.getByText("Address copied")).toBeVisible();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toBe(await svg.getByRole("img").getAttribute("src"));
    const fetched = await request.get(copied);
    expect(fetched.status()).toBe(200);
    expect(fetched.headers()["content-type"]).toBe("image/svg+xml");

    const big = libItem(page, "five-mb.png");
    const bigUrl = (await big.getByRole("img").getAttribute("src")) as string;
    await inRow(big, "Delete").click();
    await expect(GROUP(page)).toBeVisible();
    expect(await storedFiles()).toHaveLength(5);
    await GROUP(page).getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(libItems(page)).toHaveCount(4);
    await expect(libItem(page, "five-mb.png")).toHaveCount(0);
    expect(await storedFiles()).toHaveLength(4);
    expect(await docIds("images")).toHaveLength(4);
    expect((await request.get(bigUrl)).status()).toBe(404);
    await reopenSection(page, "Images");
    await expect(libItems(page)).toHaveCount(4);
  });

  test("E2E-ACC-15: an image over 5 MB, a file of another type and an empty file are refused with a message and nothing is stored (§6.12)", async ({ page }) => {
    await ownerSession(page);
    await openSection(page, "Images");
    await upload(page, makeFile("keeper.png", "image/png", 1000));
    await expect(libItems(page)).toHaveCount(1);
    const before = await storedFiles();
    const TYPE = "Only PNG, JPEG, WebP or SVG images can be uploaded";
    const refusals: [TestFile, string][] = [
      [makeFile("huge.png", "image/png", 5347738), "That image is over 5 MB"],
      [makeFile("cv.pdf", "application/pdf", 1000), TYPE],
      [makeFile("spin.gif", "image/gif", 1000), TYPE],
      [makeFile("page.png", "text/html", 1000), TYPE],
      [makeFile("blank.png", "image/png", 0), "That file is empty"],
    ];
    for (const [file, message] of refusals) {
      await upload(page, file);
      await expect(page.getByText(message)).toBeVisible();
      await expect(libItems(page)).toHaveCount(1);
      expect(await storedFiles()).toEqual(before);
      expect(await docIds("images")).toHaveLength(1);
    }
    await reopenSection(page, "Images");
    await expect(libItems(page)).toHaveCount(1);
  });

  test("E2E-ACC-16: against the storage stand-in, signed-out and non-owner uploads are refused and the owner's succeeds (§6.13)", async () => {
    const owner = await signUp();
    const other = await signUp();
    await RS(owner.uid);
    expect((await putObject("acc-16-out.png", "image/png", 1000, undefined)).status).toBe(403);
    expect((await putObject("acc-16-other.png", "image/png", 1000, other)).status).toBe(403);
    const names = await storedFiles();
    expect(names).not.toContain("images/acc-16-out.png");
    expect(names).not.toContain("images/acc-16-other.png");
    expect((await putObject("acc-16-owner.png", "image/png", 1000, owner)).status).toBe(200);
    expect(await storedFiles()).toContain("images/acc-16-owner.png");
    const served = await getObject("acc-16-owner.png", undefined);
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toBe("image/png");
  });

  test("E2E-ACC-17: an uploaded image chosen in profile, certifications, tech stack and blog posts is still chosen after a reload (§6.14)", async ({ page, request }) => {
    await ownerSession(page);
    await openSection(page, "Images");
    await upload(page, makeFile("chosen.png", "image/png", 2048));
    await expect(libItem(page, "chosen.png")).toBeVisible();
    const [image] = await docsOf("images");
    const imageId = image.id;
    const imageUrl = image.fields.url.stringValue as string;
    expect((await request.get(imageUrl)).status()).toBe(200);

    await openSection(page, "Profile");
    await field(page, "Name").fill("Keith Image");
    await field(page, "Headline").fill("Image owner");
    await field(page, "Uploaded image").selectOption({ label: "chosen.png" });
    await expect(field(page, "Photo path")).toHaveValue("");
    await btn(page, "Save").click();
    await expect(text(page, "Profile saved")).toBeVisible();
    await reopenSection(page, "Profile");
    await expect(field(page, "Uploaded image")).toHaveValue(imageId);
    await expect(field(page, "Photo path")).toHaveValue("");
    expect(await docField("profile/main", "photo")).toBe(imageUrl);

    await openSection(page, "Certifications");
    await btn(page, "Add certification").click();
    await field(page, "Name").fill("Image cert");
    await field(page, "Uploaded image").selectOption({ label: "chosen.png" });
    await field(page, "Credential link").fill("https://example.com/credential");
    await btn(page, "Save").click();
    await expect(entries(page, "Certifications list")).toHaveCount(1);
    await reopenSection(page, "Certifications");
    await inRow(entries(page, "Certifications list").first(), "Edit").click();
    await expect(field(page, "Uploaded image")).toHaveValue(imageId);
    await expect(field(page, "Badge image path")).toHaveValue("");
    expect((await docsOf("certifications"))[0].fields.icon.stringValue).toBe(imageUrl);

    await openSection(page, "Tech stack");
    await btn(page, "Add category").click();
    await field(page, "Category name").fill("Image category");
    await field(page, "Item 1 name").fill("Chosen");
    await field(page, "Item 1 uploaded image").selectOption({ label: "chosen.png" });
    await btn(page, "Save").click();
    await expect(entries(page, "Tech categories list")).toHaveCount(1);
    await reopenSection(page, "Tech stack");
    await inRow(entries(page, "Tech categories list").first(), "Edit").click();
    await expect(field(page, "Item 1 uploaded image")).toHaveValue(imageId);
    await expect(field(page, "Item 1 icon path")).toHaveValue("");
    const tool = (await docsOf("techCategories"))[0].fields.tools.arrayValue.values[0].mapValue.fields;
    expect(tool.icon.stringValue).toBe(imageUrl);

    await openSection(page, "Blog posts");
    await btn(page, "Add post").click();
    await field(page, "Title").fill("Image post");
    await field(page, "Excerpt").fill("Has a cover");
    await field(page, "Date").fill("2026-05-15");
    await field(page, "Slug").fill("image-post");
    await field(page, "Body").fill("Body");
    await field(page, "Cover alt text").fill("Chosen cover");
    await field(page, "Uploaded image").selectOption({ label: "chosen.png" });
    await btn(page, "Save").click();
    await expect(entries(page, "Blog posts list")).toHaveCount(1);
    await reopenSection(page, "Blog posts");
    await inRow(entries(page, "Blog posts list").first(), "Edit").click();
    await expect(field(page, "Uploaded image")).toHaveValue(imageId);
    await expect(field(page, "Cover image path")).toHaveValue("");
    expect(await docField("blogPosts/image-post", "coverImage")).toBe(imageUrl);
  });

  test("E2E-ACC-18: a repo image path given in profile, certifications, tech stack and blog posts is still there after a reload and its file loads (§6.14)", async ({ page, request }) => {
    const paths = { photo: "/profile/placeholder.jpg", badge: "/certs/scrum.png", icon: "/icons/react.png", cover: "/profile/placeholder.jpg" };
    for (const p of Object.values(paths)) {
      expect(existsSync(join(ROOT, "public", p))).toBe(true);
      expect((await request.get(p)).status()).toBe(200);
    }
    await ownerSession(page);
    await seedImageDoc("acc-18", "unused.png");

    await openSection(page, "Profile");
    await field(page, "Name").fill("Keith Path");
    await field(page, "Headline").fill("Path owner");
    await field(page, "Photo path").fill(paths.photo);
    await expect(field(page, "Uploaded image")).toHaveValue("");
    await btn(page, "Save").click();
    await expect(text(page, "Profile saved")).toBeVisible();
    await reopenSection(page, "Profile");
    await expect(field(page, "Photo path")).toHaveValue(paths.photo);
    await expect(field(page, "Uploaded image")).toHaveValue("");

    await openSection(page, "Certifications");
    await btn(page, "Add certification").click();
    await field(page, "Name").fill("Path cert");
    await field(page, "Badge image path").fill(paths.badge);
    await field(page, "Credential link").fill("https://example.com/credential");
    await btn(page, "Save").click();
    await expect(entries(page, "Certifications list")).toHaveCount(1);
    await reopenSection(page, "Certifications");
    await inRow(entries(page, "Certifications list").first(), "Edit").click();
    await expect(field(page, "Badge image path")).toHaveValue(paths.badge);
    await expect(field(page, "Uploaded image")).toHaveValue("");

    await openSection(page, "Tech stack");
    await btn(page, "Add category").click();
    await field(page, "Category name").fill("Path category");
    await field(page, "Item 1 name").fill("React");
    await field(page, "Item 1 icon path").fill(paths.icon);
    await btn(page, "Save").click();
    await expect(entries(page, "Tech categories list")).toHaveCount(1);
    await reopenSection(page, "Tech stack");
    await inRow(entries(page, "Tech categories list").first(), "Edit").click();
    await expect(field(page, "Item 1 icon path")).toHaveValue(paths.icon);
    await expect(field(page, "Item 1 uploaded image")).toHaveValue("");

    await openSection(page, "Blog posts");
    await btn(page, "Add post").click();
    await field(page, "Title").fill("Path post");
    await field(page, "Excerpt").fill("Has a cover path");
    await field(page, "Date").fill("2026-05-15");
    await field(page, "Slug").fill("path-post");
    await field(page, "Body").fill("Body");
    await field(page, "Cover image path").fill(paths.cover);
    await btn(page, "Save").click();
    await expect(entries(page, "Blog posts list")).toHaveCount(1);
    await reopenSection(page, "Blog posts");
    await inRow(entries(page, "Blog posts list").first(), "Edit").click();
    await expect(field(page, "Cover image path")).toHaveValue(paths.cover);
    await expect(field(page, "Uploaded image")).toHaveValue("");
  });

  test("E2E-ACC-19: choosing delete and then cancelling keeps the record in all six lists and the image library (§6.15)", async ({ page }) => {
    await ownerSession(page);
    await seedExperience("acc-19-exp", "Cancel Engineer", "Cancel Co", 0);
    await seedProject("acc-19-proj", "Cancel Project", 0);
    await seedCert("acc-19-cert", "Cancel Certificate", 0);
    await seedCategory("acc-19-cat", "Cancel Category", 0);
    await seedPost("acc-19-post", "Cancel Post", false);
    await seedImageDoc("acc-19-img", "cancel-logo.png");
    const targets: [string, string, string, string, string][] = [
      ["Experience", "Experience entries", "Cancel Engineer at Cancel Co", "experience", "acc-19-exp"],
      ["Projects", "Projects list", "Cancel Project", "projects", "acc-19-proj"],
      ["Certifications", "Certifications list", "Cancel Certificate", "certifications", "acc-19-cert"],
      ["Tech stack", "Tech categories list", "Cancel Category", "techCategories", "acc-19-cat"],
      ["Blog posts", "Blog posts list", "Cancel Post", "blogPosts", "acc-19-post"],
      ["Images", "Uploaded images", "cancel-logo.png", "images", "acc-19-img"],
    ];
    for (const [menu, list, label, col, id] of targets) {
      await openSection(page, menu);
      const row = rowIn(page, list, label);
      await inRow(row, "Delete").click();
      await expect(GROUP(page)).toBeVisible();
      await GROUP(page).getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(GROUP(page)).toHaveCount(0);
      await expect(row).toHaveCount(1);
      expect(await docExists(`${col}/${id}`)).toBe(true);
      await reopenSection(page, menu);
      await expect(rowIn(page, list, label)).toHaveCount(1);
      expect(await docExists(`${col}/${id}`)).toBe(true);
    }
  });

  test("E2E-ACC-20: every panel screen fits a 375 pixel phone with no sideways scrolling (§6.16)", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    const fits = async (what: string) => {
      const result = await page.evaluate(() => {
        const root = document.querySelector('[aria-label="Admin"]') ?? document.body;
        const bad: string[] = [];
        root.querySelectorAll("button, input, textarea, select").forEach((el) => {
          const r = el.getBoundingClientRect();
          if (r.width === 0 && r.height === 0) return;
          const name = (el.getAttribute("aria-label") ?? el.textContent ?? el.tagName).trim().slice(0, 30);
          if (r.x < -0.5 || r.x + r.width > 375.5) bad.push(`${name} x=${r.x} w=${r.width}`);
        });
        return { sw: document.documentElement.scrollWidth, bad };
      });
      expect(result.sw, `${what}: page width`).toBeLessThanOrEqual(375);
      expect(result.bad, `${what}: controls outside the screen`).toEqual([]);
    };

    await clearAll();
    await page.goto(PANEL);
    await expect(btn(page, "Sign in with Google")).toBeVisible();
    await fits("signed out");
    await P(page);
    await expect(page.getByText(/^Your user ID: [A-Za-z0-9]{20,}$/)).toBeVisible();
    await fits("saving-off notice");
    const X = (await page.getByText(/^Your user ID:/).locator("code").innerText()).trim();
    await page.evaluate((v) => window.localStorage.setItem("admin.ownerUid", v), X);
    await page.reload();
    await expect(nav(page)).toBeVisible();
    await RF(X);
    await RS(X);
    const long = "A-very-long-unbroken-name-".repeat(5);
    await seedProfile(long);
    await seedExperience("acc-20-exp", long, long, 0);
    await seedProject("acc-20-proj", long, 0);
    await seedCert("acc-20-cert", long, 0);
    await seedCategory("acc-20-cat", long, 0);
    await seedPost("acc-20-post", long, false);
    await seedImageDoc("acc-20-img", long + ".png");
    await page.reload();
    await expect(nav(page)).toBeVisible();
    await fits("menu");

    for (const s of SIX) {
      await openSection(page, s);
      await fits(s);
    }
    await openSection(page, "Experience");
    await btn(page, "Add entry").click();
    await fits("Experience add form");
    await btn(page, "Cancel").click();
    await openSection(page, "Projects");
    await btn(page, "Add entry").click();
    await fits("Projects add form");
    await btn(page, "Cancel").click();
    await openSection(page, "Certifications");
    await btn(page, "Add certification").click();
    await fits("Certifications add form");
    await btn(page, "Cancel").click();
    await openSection(page, "Tech stack");
    await btn(page, "Add category").click();
    await btn(page, "Add item").click();
    await fits("Tech stack add form");
    await btn(page, "Cancel").click();
    await openSection(page, "Blog posts");
    await btn(page, "Add post").click();
    await field(page, "Body").fill("## Wide\n\n" + "x".repeat(300));
    await fits("Blog post add form");
    await btn(page, "Preview").click();
    await expect(page.locator('section[aria-label="Post preview"]')).toBeVisible();
    await fits("Blog post preview");
    await openSection(page, "Images");
    await expect(libItems(page)).toHaveCount(1);
    await fits("Images");
    await inRow(libItems(page).first(), "Delete").click();
    await expect(GROUP(page)).toBeVisible();
    await fits("Images delete confirmation");

    const context = await page.context().browser()!.newContext({ viewport: { width: 375, height: 667 } });
    const stranger = await context.newPage();
    await strangerSession(stranger);
    const sw = await stranger.evaluate(() => document.documentElement.scrollWidth);
    expect(sw).toBeLessThanOrEqual(375);
    await context.close();
  });

  test("E2E-ACC-21: the public site still loads and its home page and a post load no Firebase script (§6.17)", async ({ browser, request }) => {
    const home = await visitPublic(browser, "/");
    await expect(home.page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(home.errors).toEqual([]);
    for (const t of home.scripts) for (const m of FIREBASE_MARKERS) expect(t).not.toContain(m);
    for (const m of FIREBASE_MARKERS) expect(home.html).not.toContain(m);
    expect(home.requests.filter((u) => FIREBASE_HOSTS.some((h) => new URL(u).host.includes(h)))).toEqual([]);
    await home.context.close();

    const index = await visitPublic(browser, "/blog/");
    const firstPost = index.page.locator('a[href^="/blog/"]:not([href="/blog/"])').first();
    await expect(firstPost).toBeVisible();
    await firstPost.click();
    await expect(index.page).toHaveURL(/\/blog\/[^/]+\/$/);
    await expect(index.page.getByRole("heading", { level: 1 })).toBeVisible();
    await index.context.close();

    const post = await visitPublic(browser, "/blog/hello-world/");
    await expect(post.page.getByRole("heading", { level: 1 })).toHaveText("Hello, World — Welcome to My Blog");
    for (const t of post.scripts) for (const m of FIREBASE_MARKERS) expect(t).not.toContain(m);
    for (const m of FIREBASE_MARKERS) expect(post.html).not.toContain(m);
    expect(post.requests.filter((u) => FIREBASE_HOSTS.some((h) => new URL(u).host.includes(h)))).toEqual([]);
    await post.context.close();

    const rss = await request.get("/rss.xml");
    expect(rss.ok()).toBe(true);
    expect(await rss.text()).toContain("<rss");
    const sitemap = await request.get("/sitemap.xml");
    expect(sitemap.ok()).toBe(true);
    expect(await sitemap.text()).toContain("<urlset");

    const panel = await visitPublic(browser, PANEL);
    expect(panel.scripts.some((t) => t.includes("thegoldenpothos-5b3a1"))).toBe(true);
    await panel.context.close();
  });

  test("E2E-ACC-22: the panel page carries a no-index instruction and its address is absent from sitemap.xml and robots.txt (§6.18)", async ({ page, request }) => {
    await page.goto(PANEL);
    const contents = await page
      .locator('meta[name="robots"], meta[name="googlebot"]')
      .evaluateAll((els) => els.map((e) => e.getAttribute("content") ?? ""));
    expect(contents.length).toBeGreaterThan(0);
    for (const c of contents) expect(c).toContain("noindex");
    const sitemap = await request.get("/sitemap.xml");
    expect(sitemap.status()).toBe(200);
    expect(await sitemap.text()).not.toContain(SLUG_PART);
    const robots = await request.get("/robots.txt");
    expect(robots.status()).toBe(200);
    expect(await robots.text()).not.toContain(SLUG_PART);
  });

  // ================= §5 hard constraints =================

  test("E2E-ACC-23: no server, API route, middleware or Cloud Function exists, and the panel is a plain static file (§5.1)", async ({ request }) => {
    expect(repoText("next.config.ts")).toMatch(/output:\s*["']export["']/);
    expect(existsSync(join(ROOT, "src/app/api"))).toBe(false);
    for (const f of ["middleware.ts", "middleware.js", "proxy.ts", "proxy.js", "src/middleware.ts", "src/middleware.js", "src/proxy.ts", "src/proxy.js"]) {
      expect(existsSync(join(ROOT, f)), f).toBe(false);
    }
    const routes = walk(join(ROOT, "src/app")).filter((f) => /(^|\/)route\.(ts|tsx|js)$/.test(f));
    for (const f of routes) expect(readFileSync(f, "utf8"), rel(f)).toContain('export const dynamic = "force-static"');
    expect(existsSync(join(ROOT, "functions"))).toBe(false);
    const config = JSON.parse(repoText("firebase.json")) as Record<string, unknown>;
    expect(config).not.toHaveProperty("functions");
    expect(config).not.toHaveProperty("apphosting");
    const pkg = JSON.parse(repoText("package.json")) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    for (const d of ["firebase-functions", "firebase-admin", "express", "fastify", "koa"]) expect(deps).not.toContain(d);
    expect(existsSync(join(ROOT, "out", SLUG_PART, "index.html"))).toBe(true);
    const res = await request.get(PANEL);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/html");
  });

  test("E2E-ACC-24: signed-out and non-owner creates, updates and deletes are refused in every collection and change nothing (§5.2)", async () => {
    const owner = await signUp();
    const other = await signUp();
    await RF(owner.uid);
    for (const col of COLLECTIONS) {
      const keep = `${col}/acc-24-keep`;
      await seed(keep, { name: str("Before"), draft: bool(false) });
      for (const who of [undefined, other] as Who[]) {
        const created = `${col}/acc-24-new-${who ? "other" : "out"}`;
        expect((await writeDoc(created, { name: str("Planted"), draft: bool(false) }, who)).status, `${col} create`).toBe(403);
        expect(await docExists(created), `${col} created`).toBe(false);
        expect((await writeDoc(keep, { name: str("Defaced") }, who)).status, `${col} update`).toBe(403);
        expect((await deleteDoc(keep, who)).status, `${col} delete`).toBe(403);
        expect(await docField(keep, "name"), `${col} value`).toBe("Before");
      }
    }
  });

  test("E2E-ACC-25: a non-owner signed in to the panel with the interface fooled still cannot save, upload or read private data (§5.2)", async ({ page }) => {
    const owner = await signUp();
    await clearAll();
    await RF(owner.uid);
    await RS(owner.uid);
    await seedProfile("Original Name");
    await seedPost("acc-25-draft", "Secret Draft Title", true);
    await page.goto(PANEL);
    await P(page);
    const idText = page.getByText(/^Your user ID: [A-Za-z0-9]{20,}$/);
    await expect(idText).toBeVisible();
    const mine = (await idText.locator("code").innerText()).trim();
    expect(mine).not.toBe(owner.uid);
    // The panel is told this account is the owner (the dev-only override); the rules still are not.
    await page.evaluate((v) => window.localStorage.setItem("admin.ownerUid", v), mine);
    await page.reload();
    await expect(nav(page)).toBeVisible();

    await openSection(page, "Profile");
    await field(page, "Name").fill("Defaced Name");
    await btn(page, "Save").click();
    await expect(alertWith(page, "The profile could not be saved")).toBeVisible();
    await expect(text(page, "Profile saved")).toHaveCount(0);
    expect(await docField("profile/main", "name")).toBe("Original Name");

    await openSection(page, "Experience");
    await btn(page, "Add entry").click();
    await field(page, "Year").fill("2026");
    await field(page, "Title").fill("Planted");
    await field(page, "Company").fill("Intruder");
    await field(page, "Duration").fill("2026");
    await field(page, "Description").fill("Planted entry");
    await btn(page, "Save").click();
    await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toBeVisible();
    await expect(text(page, "Entry saved")).toHaveCount(0);
    expect(await docIds("experience")).toEqual([]);

    await openSection(page, "Blog posts");
    expect(await page.locator("body").innerText()).not.toContain("Secret Draft Title");

    await openSection(page, "Images");
    await upload(page, makeFile("planted.png", "image/png", 1000));
    await expect(alertWith(page, "The image could not be uploaded.")).toBeVisible();
    expect(await storedFiles()).toEqual([]);
    expect(await docIds("images")).toEqual([]);
  });

  test("E2E-ACC-26: while the owner ID is still the placeholder, nobody can write, and the panel says saving is off (§5.3)", async ({ page }) => {
    await clearAll();
    await RF(null);
    await RS(null);
    expect(repoText("firestore.rules")).toContain(PLACEHOLDER);
    const anyone = await signUp();
    for (const col of COLLECTIONS) {
      const keep = `${col}/acc-26-keep`;
      await seed(keep, { name: str("Before"), draft: bool(false) });
      expect((await writeDoc(keep, { name: str("Defaced") }, anyone)).status, `${col} update`).toBe(403);
      expect((await writeDoc(`${col}/acc-26-new`, { name: str("Planted"), draft: bool(false) }, anyone)).status, `${col} create`).toBe(403);
      expect((await deleteDoc(keep, anyone)).status, `${col} delete`).toBe(403);
      expect(await docField(keep, "name")).toBe("Before");
      expect(await docExists(`${col}/acc-26-new`)).toBe(false);
    }
    await clearAll();
    await page.goto(PANEL);
    await P(page);
    await expect(page.getByText(NOTICE, { exact: true })).toBeVisible();
    await openSection(page, "Profile");
    await field(page, "Name").fill("Hopeful Name");
    await field(page, "Headline").fill("Hopeful headline");
    await btn(page, "Save").click();
    await expect(alertWith(page, "The profile could not be saved. Saving is not switched on yet.")).toBeVisible();
    await expect(text(page, "Profile saved")).toHaveCount(0);
    expect(await docIds("profile")).toEqual([]);
  });

  test("E2E-ACC-27: a draft post, or a post with no draft setting, cannot be read, listed or queried by anyone but the owner (§5.4)", async ({ browser }) => {
    const owner = await signUp();
    const other = await signUp();
    await clearAll();
    await RF(owner.uid);
    await seedPost("acc-27-draft", "Secret Draft Title", true);
    await seedPost("acc-27-nodraft", "Secret Untagged Title", null);
    await seedPost("acc-27-pub", "Public Post Title", false);
    for (const who of [undefined, other] as Who[]) {
      for (const id of ["acc-27-draft", "acc-27-nodraft"]) {
        const res = await readDoc(`blogPosts/${id}`, who);
        expect(res.status).toBe(403);
        expect(await res.text()).not.toContain("Secret");
      }
      const unfiltered = await fetch(`${DOCS}:runQuery`, {
        method: "POST",
        headers: docsAuth(who),
        body: JSON.stringify({ structuredQuery: { from: [{ collectionId: "blogPosts" }] } }),
      });
      expect(unfiltered.status).toBe(403);
      const wantDrafts = await fetch(`${DOCS}:runQuery`, {
        method: "POST",
        headers: docsAuth(who),
        body: JSON.stringify({
          structuredQuery: {
            from: [{ collectionId: "blogPosts" }],
            where: { fieldFilter: { field: { fieldPath: "draft" }, op: "EQUAL", value: { booleanValue: true } } },
          },
        }),
      });
      expect(wantDrafts.status).toBe(403);
      const listed = await fetch(`${DOCS}/blogPosts`, { headers: docsAuth(who) });
      expect(listed.status).toBe(403);
      expect(await listed.text()).not.toContain("Secret");
      // Publishing it by writing is refused too, so it stays unreadable.
      expect((await writeDoc("blogPosts/acc-27-draft", { draft: bool(false) }, who)).status).toBe(403);
      expect((await readDoc("blogPosts/acc-27-draft", who)).status).toBe(403);
    }
    const published = await fetch(`${DOCS}:runQuery`, {
      method: "POST",
      headers: docsAuth(undefined),
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: "blogPosts" }],
          where: { fieldFilter: { field: { fieldPath: "draft" }, op: "EQUAL", value: { booleanValue: false } } },
        },
      }),
    });
    expect(published.status).toBe(200);
    const publishedText = await published.text();
    expect(publishedText).toContain("Public Post Title");
    expect(publishedText).not.toContain("Secret");
    expect((await readDoc("blogPosts/acc-27-draft", owner)).status).toBe(200);

    // The public blog never shows it either.
    const visit = await visitPublic(browser, "/blog/");
    expect(await visit.page.locator("body").innerText()).not.toContain("Secret Draft Title");
    await visit.context.close();
  });

  test("E2E-ACC-28: signed out, or signed in as another account, the panel shows no database content and fetches none, even when its sections are asked for (§5.5)", async ({ browser }) => {
    await clearAll();
    await seedProfile("Seeded Private Name");
    await seedExperience("acc-28-exp", "Seeded Engineer", "Seeded Co", 0);
    await seedProject("acc-28-proj", "Seeded Project", 0);
    await seedCert("acc-28-cert", "Seeded Certificate", 0);
    await seedCategory("acc-28-cat", "Seeded Category", 0);
    await seedPost("acc-28-post", "Seeded Published Post", false);
    await seedPost("acc-28-draft", "Seeded Draft Secret", true);
    await seedImageDoc("acc-28-img", "seeded-logo.png");
    const secrets = [
      "Seeded Private Name",
      "Seeded Engineer",
      "Seeded Project",
      "Seeded Certificate",
      "Seeded Category",
      "Seeded Published Post",
      "Seeded Draft Secret",
      "seeded-logo.png",
    ];
    for (const mode of ["signed-out", "stranger"]) {
      const context = await browser.newContext();
      const page = await context.newPage();
      const dataRequests: string[] = [];
      page.on("request", (r) => {
        const u = r.url();
        if (u.startsWith(FIRESTORE) || u.startsWith(STORAGE)) dataRequests.push(u);
      });
      if (mode === "stranger") {
        await strangerSession(page);
      } else {
        await page.goto(PANEL);
        await expect(btn(page, "Sign in with Google")).toBeVisible();
      }
      for (const hash of ["#profile", "#blog-posts", "#images", "?section=experience"]) {
        await page.goto(PANEL + hash);
        if (mode === "stranger") await expect(alertWith(page, NOT_ALLOWED)).toBeVisible();
        else await expect(btn(page, "Sign in with Google")).toBeVisible();
        const body = await page.locator("body").innerText();
        for (const s of secrets) expect(body, `${mode} ${hash}`).not.toContain(s);
        await expect(nav(page)).toHaveCount(0);
      }
      expect(dataRequests, mode).toEqual([]);
      await context.close();
    }
  });

  test("E2E-ACC-29: clicking Delete alone, even twice or then leaving the page, deletes nothing in any list (§5.6)", async ({ page }) => {
    await ownerSession(page);
    await seedExperience("acc-29-exp", "Guard Engineer", "Guard Co", 0);
    await seedProject("acc-29-proj", "Guard Project", 0);
    await seedCert("acc-29-cert", "Guard Certificate", 0);
    await seedCategory("acc-29-cat", "Guard Category", 0);
    await seedPost("acc-29-post", "Guard Post", false);
    await seedImageDoc("acc-29-img", "guard-logo.png");
    const targets: [string, string, string, string, string][] = [
      ["Experience", "Experience entries", "Guard Engineer at Guard Co", "experience", "acc-29-exp"],
      ["Projects", "Projects list", "Guard Project", "projects", "acc-29-proj"],
      ["Certifications", "Certifications list", "Guard Certificate", "certifications", "acc-29-cert"],
      ["Tech stack", "Tech categories list", "Guard Category", "techCategories", "acc-29-cat"],
      ["Blog posts", "Blog posts list", "Guard Post", "blogPosts", "acc-29-post"],
      ["Images", "Uploaded images", "guard-logo.png", "images", "acc-29-img"],
    ];
    for (const [menu, list, label, col, id] of targets) {
      await openSection(page, menu);
      await inRow(rowIn(page, list, label), "Delete").dblclick();
      await expect(GROUP(page)).toBeVisible();
      await expect(text(page, "Entry deleted")).toHaveCount(0);
      expect(await docExists(`${col}/${id}`), `${menu} after click`).toBe(true);
      await reopenSection(page, menu);
      await expect(rowIn(page, list, label)).toHaveCount(1);
      expect(await docExists(`${col}/${id}`), `${menu} after leaving`).toBe(true);
    }
    // Removing one item of a category is a delete too, and also waits for its own confirmation.
    await openSection(page, "Tech stack");
    await inRow(rowIn(page, "Tech categories list", "Guard Category"), "Edit").click();
    await inRow(page.getByRole("group", { name: "Item 1", exact: true }), "Delete").click();
    await expect(page.getByRole("group", { name: "Confirm item delete", exact: true })).toBeVisible();
    const tools = (await docsOf("techCategories"))[0].fields.tools.arrayValue.values as unknown[];
    expect(tools).toHaveLength(2);
  });

  test("E2E-ACC-30: only Authentication, Firestore and Storage are used: no other Firebase module, function or service is reached (§5.7)", async ({ page }) => {
    const config = JSON.parse(repoText("firebase.json")) as Record<string, any>;
    for (const key of Object.keys(config)) expect(["hosting", "firestore", "storage", "emulators"]).toContain(key);
    for (const key of Object.keys(config.emulators)) expect(["auth", "firestore", "storage", "ui", "singleProjectMode"]).toContain(key);
    const allowed = new Set(["firebase/app", "firebase/auth", "firebase/firestore", "firebase/storage"]);
    for (const f of walk(join(ROOT, "src")).filter((p) => /\.(ts|tsx)$/.test(p))) {
      const source = readFileSync(f, "utf8");
      for (const m of source.matchAll(/from\s+["'](firebase\/[^"']+)["']/g)) expect(allowed.has(m[1]), `${rel(f)} imports ${m[1]}`).toBe(true);
      expect(source, rel(f)).not.toMatch(/firebase-admin|firebase-functions/);
    }
    const deniedHosts = /cloudfunctions|run\.app|firebaseappcheck|firebaseinstallations|firebaseremoteconfig|firebaselogging|firebase-settings|google-analytics|googletagmanager|firebaseml|fcm\.googleapis|firebasedatabase|firebaseio/;
    const hosts = new Set<string>();
    page.on("request", (r) => {
      const u = new URL(r.url());
      if (u.protocol.startsWith("http")) hosts.add(u.host);
    });
    await ownerSession(page);
    await openSection(page, "Images");
    await upload(page, makeFile("service.png", "image/png", 1000));
    await expect(libItems(page)).toHaveCount(1);
    await openSection(page, "Blog posts");
    await openSection(page, "Profile");
    expect(hosts.has("127.0.0.1:9099")).toBe(true);
    expect(hosts.has("127.0.0.1:8080")).toBe(true);
    expect(hosts.has("127.0.0.1:9199")).toBe(true);
    for (const h of hosts) expect(h, `host ${h}`).not.toMatch(deniedHosts);
  });

  test("E2E-ACC-31: storage refuses signed-out and non-owner uploads and deletes, files over 5 MB and anything that is not a PNG, JPEG, WebP or SVG image (§5.8)", async () => {
    const owner = await signUp();
    const other = await signUp();
    await clearAll();
    await RS(owner.uid);
    expect((await putObject("acc-31-keep.png", "image/png", 1000, owner)).status).toBe(200);
    for (const who of [undefined, other] as Who[]) {
      expect((await putObject(`acc-31-new-${who ? "other" : "out"}.png`, "image/png", 1000, who)).status).toBe(403);
      expect((await removeObject("acc-31-keep.png", who)).status).toBe(403);
    }
    expect((await getObject("acc-31-keep.png", undefined)).status).toBe(200);
    const refused: [string, string, number][] = [
      ["acc-31-over.png", "image/png", 5242881],
      ["acc-31-huge.jpg", "image/jpeg", 5347738],
      ["acc-31.pdf", "application/pdf", 1000],
      ["acc-31.gif", "image/gif", 1000],
      ["acc-31.html", "text/html", 1000],
      ["acc-31-lie.png", "text/plain", 1000],
      ["acc-31-empty.png", "image/png", 0],
    ];
    for (const [name, type, bytes] of refused) expect((await putObject(name, type, bytes, owner)).status, name).toBe(403);
    const names = await storedFiles();
    expect(names).toEqual(["images/acc-31-keep.png"]);
    expect((await putObject("acc-31-edge.png", "image/png", 5242880, owner)).status).toBe(200);
  });

  test("E2E-ACC-32: while the owner ID is still the placeholder, storage refuses every upload and delete, and the panel's upload says so (§5.9)", async ({ page }) => {
    await clearAll();
    await RF(null);
    await RS(null);
    expect(repoText("storage.rules")).toContain(PLACEHOLDER);
    const anyone = await signUp();
    expect((await putObject("acc-32-seed.png", "image/png", 1000, "admin")).status).toBe(200);
    expect((await putObject("acc-32-new.png", "image/png", 1000, anyone)).status).toBe(403);
    expect((await removeObject("acc-32-seed.png", anyone)).status).toBe(403);
    expect((await getObject("acc-32-seed.png", undefined)).status).toBe(200);
    expect(await storedFiles()).toEqual(["images/acc-32-seed.png"]);
    await removeObject("acc-32-seed.png", "admin");

    await page.goto(PANEL);
    await P(page);
    await expect(page.getByText(/^Your user ID:/)).toBeVisible();
    await openSection(page, "Images");
    await upload(page, makeFile("hopeful.png", "image/png", 1000));
    await expect(alertWith(page, "The image could not be uploaded.")).toBeVisible();
    expect(await storedFiles()).toEqual([]);
    expect(await docIds("images")).toEqual([]);
  });

  test("E2E-ACC-33: content in the database never reaches the public pages, which keep the repo's content and ship no Firebase code (§5.10)", async ({ browser, request }) => {
    await clearAll();
    await seedProfile("Database Only Name");
    await seedPost("database-only-post", "Database Only Post Title", false);
    await seedExperience("acc-33-exp", "Database Only Role", "Database Only Co", 0);
    const posts = repoPosts().filter((p) => !p.draft);
    expect(posts.length).toBeGreaterThan(0);

    const home = await visitPublic(browser, "/");
    const homeText = await home.page.locator("body").innerText();
    expect(homeText).toContain("Keith Lim");
    for (const s of ["Database Only Name", "Database Only Role", "Database Only Co"]) expect(homeText).not.toContain(s);
    for (const m of FIREBASE_MARKERS) expect(home.html).not.toContain(m);
    await home.context.close();

    const index = await visitPublic(browser, "/blog/");
    const indexText = await index.page.locator("body").innerText();
    for (const p of posts) expect(indexText).toContain(p.title);
    expect(indexText).not.toContain("Database Only Post Title");
    for (const m of FIREBASE_MARKERS) expect(index.html).not.toContain(m);
    await index.context.close();

    for (const p of posts) {
      const visit = await visitPublic(browser, `/blog/${p.slug}/`);
      await expect(visit.page.getByRole("heading", { level: 1 })).toHaveText(p.title);
      for (const t of visit.scripts) for (const m of FIREBASE_MARKERS) expect(t).not.toContain(m);
      for (const m of FIREBASE_MARKERS) expect(visit.html).not.toContain(m);
      await visit.context.close();
    }
    const missing = await request.get("/blog/database-only-post/");
    expect(missing.status()).toBe(404);

    const rss = await (await request.get("/rss.xml")).text();
    const sitemap = await (await request.get("/sitemap.xml")).text();
    const robots = await (await request.get("/robots.txt")).text();
    for (const p of posts) {
      expect(rss).toContain(`/blog/${p.slug}/`);
      expect(sitemap).toContain(`/blog/${p.slug}/`);
    }
    for (const body of [rss, sitemap, robots]) {
      expect(body).not.toContain("Database Only");
      expect(body).not.toContain("database-only-post");
      for (const m of FIREBASE_MARKERS) expect(body).not.toContain(m);
    }
  });

  test("E2E-ACC-34: the panel's address cannot be found from any public page, feed, sitemap or robots file (§5.11)", async ({ page, request }) => {
    const posts = repoPosts();
    const urls = ["/", "/blog/", "/rss.xml", "/sitemap.xml", "/robots.txt", ...posts.map((p) => `/blog/${p.slug}/`)];
    for (const u of urls) {
      const res = await request.get(u);
      expect(res.status(), u).toBe(200);
      const body = await res.text();
      expect(body, u).not.toContain(SLUG_PART);
    }
    const robots = await (await request.get("/robots.txt")).text();
    expect(robots.toLowerCase()).not.toMatch(/disallow:\s*\/bright/);
    for (const u of ["/", "/blog/"]) {
      await page.goto(u);
      const hrefs = await page.locator("a[href]").evaluateAll((els) => els.map((e) => e.getAttribute("href") ?? ""));
      expect(hrefs.filter((h) => h.includes(SLUG_PART))).toEqual([]);
    }
    await page.goto(PANEL);
    const robotsMeta = await page.locator('meta[name="robots"]').evaluateAll((els) => els.map((e) => e.getAttribute("content") ?? ""));
    for (const c of robotsMeta) expect(c).toContain("noindex");
  });

  test("E2E-ACC-35: no secret, key file, .env file or personal email is committed anywhere in the repo or its rules (§5.12)", async () => {
    const tracked = spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { cwd: ROOT, encoding: "utf8" }).stdout.split("\n").filter(Boolean);
    expect(tracked.length).toBeGreaterThan(0);
    expect(tracked.filter((f) => /(^|\/)\.env(\.|$)/.test(f) && !/\.env\.example$/.test(f))).toEqual([]);
    expect(tracked.filter((f) => /service[-_]?account.*\.json$|\.pem$|\.p12$|\.key$/i.test(f))).toEqual([]);

    const secretPatterns = ["-----BEGIN [A-Z ]*PRIVATE" + " KEY-----", '"private' + '_key"', "client" + "_secret", "AIza[0-9A-Za-z_-]{30,}"];
    for (const pattern of secretPatterns) {
      const hit = spawnSync("git", ["grep", "--untracked", "-IlE", pattern, "--", ".", ":(exclude)package-lock.json", ":(exclude)e2e"], { cwd: ROOT, encoding: "utf8" });
      expect(hit.stdout, pattern).toBe("");
    }
    const emailPattern = "[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\\.[A-Za-z]{2,}";
    const paths = ["firestore.rules", "storage.rules", "firebase.json", ".github/workflows/pipeline.yml", ...ADMIN_SOURCES];
    const hits = spawnSync("git", ["grep", "--untracked", "-IhoE", emailPattern, "--", ...paths], { cwd: ROOT, encoding: "utf8" }).stdout.split("\n").filter(Boolean);
    expect(hits.filter((h) => h !== "name@site.com")).toEqual([]);
    const workflow = repoText(".github/workflows/pipeline.yml");
    const secrets = new Set([...workflow.matchAll(/secrets\.([A-Za-z0-9_]+)/g)].map((m) => m[1]));
    expect(secrets).toEqual(new Set(["GITHUB_TOKEN", "FIREBASE_SERVICE_ACCOUNT"]));
    for (const f of adminFiles()) expect(readFileSync(f, "utf8"), rel(f)).not.toContain("process.env");
  });

  test("E2E-ACC-36: the panel styles itself with the site's colour tokens in light and dark, with no raw colours in its source (§5.13)", async ({ browser }) => {
    for (const f of adminFiles().filter((p) => /\.(tsx|ts|css)$/.test(p))) {
      const source = readFileSync(f, "utf8");
      expect(source, rel(f)).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(source, rel(f)).not.toMatch(/\brgba?\(/);
      expect(source, rel(f)).not.toMatch(/\bhsla?\(/);
      expect(source, rel(f)).not.toMatch(/dark:/);
    }
    const seen: Record<string, string> = {};
    for (const theme of ["light", "dark"]) {
      const context = await browser.newContext();
      await context.addInitScript((t) => window.localStorage.setItem("theme", t), theme);
      const page = await context.newPage();
      try {
        const token = (name: string, prop: "backgroundColor" | "color") =>
          page.evaluate(
            ([n, p]) => {
              const d = document.createElement("div");
              (d.style as unknown as Record<string, string>)[p] = `var(${n})`;
              document.body.appendChild(d);
              const v = getComputedStyle(d)[p as "color"];
              d.remove();
              return v;
            },
            [name, prop] as const,
          );
        await page.goto(PANEL);
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        const region = page.getByRole("region", { name: "Admin" });
        await expect(region).toHaveCSS("background-color", await token("--surface", "backgroundColor"));
        await expect(page.getByRole("heading", { level: 1, name: "Admin" })).toHaveCSS("color", await token("--foreground", "color"));
        seen[theme] = await token("--surface", "backgroundColor");

        await ownerSession(page);
        await seedExperience("acc-36-exp", "Token Engineer", "Token Co", 0);
        await seedImageDoc("acc-36-img", "token-logo.png");
        for (const menu of ["Profile", "Experience"]) {
          await openSection(page, menu);
          await expect(page.getByRole("heading", { level: 2, name: menu })).toHaveCSS("color", await token("--foreground", "color"));
        }
        await openSection(page, "Images");
        await expect(libItem(page, "token-logo.png")).toHaveCSS("background-color", await token("--surface-alt", "backgroundColor"));
      } finally {
        await context.close();
      }
    }
    expect(seen.light).not.toBe(seen.dark);
  });
});
