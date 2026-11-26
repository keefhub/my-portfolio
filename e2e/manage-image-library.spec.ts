import { expect, test, type Page } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const AUTH = "http://127.0.0.1:9099";
const FIRESTORE = "http://127.0.0.1:8080";
const STORAGE = "http://127.0.0.1:9199";
const PROJECT = "thegoldenpothos-5b3a1";
const BUCKET = "thegoldenpothos-5b3a1.firebasestorage.app";
const DOCS = `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents`;
const OBJ = `${STORAGE}/v0/b/${BUCKET}/o`;
const PLACEHOLDER = "REPLACE_WITH_OWNER_UID";

const ROOT = process.cwd();
const repoText = (name: string) => readFileSync(join(ROOT, name), "utf8");

type Account = { uid: string; token: string };
type Who = Account | "admin" | undefined;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

function storageAuth(who: Who): Record<string, string> {
  if (who === "admin") return { Authorization: "Bearer owner" };
  if (who) return { Authorization: `Firebase ${who.token}` };
  return {};
}

function docsAuth(who: Who): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (who === "admin") h.Authorization = "Bearer owner";
  else if (who) h.Authorization = `Bearer ${who.token}`;
  return h;
}

function put(name: string, type: string, bytes: number, who: Who) {
  return fetch(`${OBJ}?name=images%2F${name}`, {
    method: "POST",
    headers: { "Content-Type": type, ...storageAuth(who) },
    body: bytes === 0 ? undefined : Buffer.alloc(bytes, 1),
  });
}

function get(name: string, who: Who) {
  return fetch(`${OBJ}/images%2F${name}?alt=media`, { method: "GET", headers: storageAuth(who) });
}

function remove(name: string, who: Who) {
  return fetch(`${OBJ}/images%2F${name}`, { method: "DELETE", headers: storageAuth(who) });
}

function list(who: Who) {
  return fetch(`${OBJ}?prefix=images%2F`, { method: "GET", headers: storageAuth(who) });
}

async function adminList(): Promise<string[]> {
  const res = await list("admin");
  const body = (await res.json()) as { items?: { name: string }[] };
  return (body.items ?? []).map((i) => i.name);
}

function change(path: string, name: string, who: Who) {
  return fetch(`${DOCS}/${path}`, {
    method: "PATCH",
    headers: docsAuth(who),
    body: JSON.stringify({ fields: { name: { stringValue: name } } }),
  });
}

function read(path: string, who: Who) {
  return fetch(`${DOCS}/${path}`, { method: "GET", headers: docsAuth(who) });
}

function del(path: string, who: Who) {
  return fetch(`${DOCS}/${path}`, { method: "DELETE", headers: docsAuth(who) });
}

async function storedName(res: Response): Promise<string | undefined> {
  const body = (await res.json()) as { fields?: { name?: { stringValue?: string } } };
  return body.fields?.name?.stringValue;
}

async function seedDoc(path: string, name: string): Promise<void> {
  const res = await change(path, name, "admin");
  expect(res.status).toBe(200);
}


const PANEL = "/bright-warm-greenhouse/";
const IMG = "http://127.0.0.1:9199/v0/b/thegoldenpothos-5b3a1.firebasestorage.app/o/images%2F";
const NOTICE = "Saving is not switched on yet.";
const PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const JPEG_B64 = "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=";
const WEBP_B64 = "UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==";

async function adminClear(): Promise<void> {
  for (const name of await adminList()) {
    await fetch(`${OBJ}/${encodeURIComponent(name)}`, { method: "DELETE", headers: storageAuth("admin") });
  }
  const res = await fetch(`${DOCS}/images?pageSize=300`, { headers: docsAuth("admin") });
  const body = (await res.json()) as { documents?: { name: string }[] };
  for (const d of body.documents ?? []) {
    await fetch(`${FIRESTORE}/v1/${d.name}`, { method: "DELETE", headers: docsAuth("admin") });
  }
}

async function docsList(): Promise<any[]> {
  const res = await fetch(`${DOCS}/images?pageSize=300`, { headers: docsAuth("admin") });
  const body = (await res.json()) as { documents?: any[] };
  return body.documents ?? [];
}

const nav = (page: Page) => page.getByRole("navigation", { name: "Admin sections" });

async function P(page: Page): Promise<void> {
  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Sign in with Google" }).click();
  const popup = await popupPromise;
  await popup.waitForLoadState("load");
  await popup.locator("#add-account-button").click();
  await popup.locator("#autogen-button").click();
  await popup.locator("#sign-in").click();
}

async function ownerSession(page: Page): Promise<string> {
  await adminClear();
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

async function openLibrary(page: Page): Promise<void> {
  await nav(page).getByRole("button", { name: "Images", exact: true }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Images" })).toBeVisible();
}

type TestFile = { name: string; mimeType: string; buffer: Buffer };

function file(name: string, type: string, bytes: number, script = false): TestFile {
  let head: Buffer;
  if (type === "image/png") head = Buffer.from(PNG_B64, "base64");
  else if (type === "image/jpeg") head = Buffer.from(JPEG_B64, "base64");
  else if (type === "image/webp") head = Buffer.from(WEBP_B64, "base64");
  else if (type === "image/svg+xml") {
    const text =
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10">' +
      (script ? "<script>window.top.__svgRan=true</script>" : "") +
      '<rect width="10" height="10"/></svg><!--';
    const tail = "-->";
    const pad = Math.max(0, bytes - text.length - tail.length);
    return { name, mimeType: type, buffer: bytes === 0 ? Buffer.alloc(0) : Buffer.from(text + " ".repeat(pad) + tail) };
  } else if (type === "application/pdf") head = Buffer.from("%PDF-1.4");
  else if (type === "image/gif") head = Buffer.from("GIF89a");
  else if (type === "text/html") head = Buffer.from("<html></html>");
  else head = Buffer.alloc(0);
  if (bytes === 0) return { name, mimeType: type, buffer: Buffer.alloc(0) };
  const buffer = Buffer.alloc(bytes, 0);
  head.copy(buffer, 0, 0, Math.min(head.length, bytes));
  return { name, mimeType: type, buffer };
}

async function upload(page: Page, f: TestFile): Promise<void> {
  await page.getByLabel("Image file").setInputFiles(f);
  await page.getByRole("button", { name: "Upload", exact: true }).click();
}

const items = (page: Page) => page.getByRole("list", { name: "Uploaded images" }).getByRole("listitem");
const item = (page: Page, name: string) => items(page).filter({ hasText: name });
const EMPTY = "No images uploaded yet";
const naturalWidth = (page: Page, name: string) =>
  item(page, name).getByRole("img", { name }).evaluate((el) => (el as HTMLImageElement).naturalWidth);

async function checkStored(page: Page, name: string, sizeText: string, type: string, bytes: number) {
  await ownerSession(page);
  await openLibrary(page);
  await expect(page.getByText(EMPTY)).toBeVisible();
  await upload(page, file(name, type, bytes));
  const it = item(page, name);
  await expect(it).toBeVisible();
  await expect(it).toContainText(sizeText);
  const img = it.getByRole("img", { name });
  await expect(img).toBeVisible();
  expect(await img.getAttribute("src")).toMatch(new RegExp("^" + IMG.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  await expect.poll(() => naturalWidth(page, name)).toBeGreaterThan(0);
  await expect(page.getByText(EMPTY)).toHaveCount(0);
  await page.reload();
  await expect(nav(page)).toBeVisible();
  await openLibrary(page);
  await expect(item(page, name)).toBeVisible();
  await expect(item(page, name)).toContainText(sizeText);
  expect(await adminList()).toHaveLength(1);
}

async function twoThenRefuse(page: Page, bad: TestFile, message: string) {
  await ownerSession(page);
  await openLibrary(page);
  await upload(page, file("one.png", "image/png", 1000));
  await expect(items(page)).toHaveCount(1);
  await upload(page, file("two.png", "image/png", 1000));
  await expect(items(page)).toHaveCount(2);
  const B = await adminList();
  await upload(page, bad);
  await expect(page.getByText(message)).toBeVisible();
  await expect(items(page)).toHaveCount(2);
  expect(await adminList()).toEqual(B);
  expect(B).toHaveLength(2);
  expect(await docsList()).toHaveLength(2);
}

const TYPE_MSG = "Only PNG, JPEG, WebP or SVG images can be uploaded";
const CONFIRM_TEXT = (n: string) => `Delete "${n}"? Records that still use this image will show a broken image.`;

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

test.describe("manage-image-library", () => {
  test.describe.configure({ mode: "serial", timeout: 60000 });

  test("E2E-01: the owner can store png, jpeg, webp and svg images up to 5 MB and anyone can fetch them", async () => {
    const A = await signUp();
    await RS(A.uid);
    const puts: [string, string, number][] = [
      ["e2e-01.png", "image/png", 1000],
      ["e2e-01.jpg", "image/jpeg", 1000],
      ["e2e-01.webp", "image/webp", 1000],
      ["e2e-01.svg", "image/svg+xml", 1000],
      ["e2e-01-5mb.png", "image/png", 5242880],
    ];
    for (const [name, type, bytes] of puts) {
      expect((await put(name, type, bytes, A)).status).toBe(200);
    }
    for (const [name] of puts) {
      expect((await get(name, undefined)).status).toBe(200);
    }
  });

  test("E2E-02: only the owner can store an image", async () => {
    const A = await signUp();
    const B = await signUp();
    await RS(A.uid);
    expect((await put("e2e-02-out.png", "image/png", 1000, undefined)).status).toBe(403);
    expect((await put("e2e-02-other.png", "image/png", 1000, B)).status).toBe(403);
    await RS(null);
    expect((await put("e2e-02-unset.png", "image/png", 1000, A)).status).toBe(403);
    const names = await adminList();
    for (const n of ["e2e-02-out.png", "e2e-02-other.png", "e2e-02-unset.png"]) {
      expect(names).not.toContain(`images/${n}`);
    }
  });

  test("E2E-03: only the owner can delete an image", async () => {
    const A = await signUp();
    const B = await signUp();
    await RS(A.uid);
    for (const n of ["e2e-03-a.png", "e2e-03-b.png", "e2e-03-c.png"]) {
      expect((await put(n, "image/png", 1000, "admin")).status).toBe(200);
    }
    expect((await remove("e2e-03-a.png", undefined)).status).toBe(403);
    expect((await remove("e2e-03-b.png", B)).status).toBe(403);
    await RS(null);
    expect((await remove("e2e-03-c.png", A)).status).toBe(403);
    for (const n of ["e2e-03-a.png", "e2e-03-b.png", "e2e-03-c.png"]) {
      expect((await get(n, undefined)).status).toBe(200);
    }
  });

  test("E2E-04: oversize and non-image files are refused", async () => {
    const A = await signUp();
    await RS(A.uid);
    expect((await put("e2e-04-huge.png", "image/png", 5347738, A)).status).toBe(403);
    expect((await put("e2e-04.pdf", "application/pdf", 1000, A)).status).toBe(403);
    expect((await put("e2e-04.html", "text/html", 1000, A)).status).toBe(403);
    expect((await put("e2e-04.gif", "image/gif", 1000, A)).status).toBe(403);
    const names = await adminList();
    for (const n of ["e2e-04-huge.png", "e2e-04.pdf", "e2e-04.html", "e2e-04.gif"]) {
      expect(names).not.toContain(`images/${n}`);
    }
  });

  test("E2E-05: the 5 MB limit is exact", async () => {
    const A = await signUp();
    await RS(A.uid);
    expect((await put("e2e-05-edge.png", "image/png", 5242881, A)).status).toBe(403);
    expect((await put("e2e-05-ok.png", "image/png", 5242880, A)).status).toBe(200);
    const names = await adminList();
    expect(names).toContain("images/e2e-05-ok.png");
    expect(names).not.toContain("images/e2e-05-edge.png");
  });

  test("E2E-06: an empty file is refused", async () => {
    const A = await signUp();
    await RS(A.uid);
    expect((await put("e2e-06.png", "image/png", 0, A)).status).toBe(403);
    expect(await adminList()).not.toContain("images/e2e-06.png");
  });

  test("E2E-07: a stored image is served to a signed-out visitor with its type", async () => {
    const A = await signUp();
    await RS(A.uid);
    expect((await put("e2e-07.png", "image/png", 1000, A)).status).toBe(200);
    const res = await get("e2e-07.png", undefined);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect((await res.arrayBuffer()).byteLength).toBe(1000);
  });

  test("E2E-08: the stored images cannot be listed by anyone", async () => {
    const A = await signUp();
    await RS(A.uid);
    expect((await put("e2e-08.png", "image/png", 1000, A)).status).toBe(200);
    expect((await list(undefined)).status).toBe(403);
    expect((await list(A)).status).toBe(403);
  });

  test("E2E-09: only the owner can write the image list", async () => {
    const A = await signUp();
    const B = await signUp();
    await RF(A.uid);
    expect((await change("images/e2e-09-out", "Defaced", undefined)).status).toBe(403);
    expect((await change("images/e2e-09-other", "Defaced", B)).status).toBe(403);
    await RF(null);
    expect((await change("images/e2e-09-unset", "Defaced", A)).status).toBe(403);
    for (const n of ["e2e-09-out", "e2e-09-other", "e2e-09-unset"]) {
      expect((await read(`images/${n}`, "admin")).status).toBe(404);
    }
  });

  test("E2E-10: only the owner can delete from the image list", async () => {
    const A = await signUp();
    const B = await signUp();
    await RF(A.uid);
    for (const n of ["e2e-10-a", "e2e-10-b", "e2e-10-c"]) {
      await seedDoc(`images/${n}`, "Keep");
    }
    expect((await del("images/e2e-10-a", undefined)).status).toBe(403);
    expect((await del("images/e2e-10-b", B)).status).toBe(403);
    await RF(null);
    expect((await del("images/e2e-10-c", A)).status).toBe(403);
    for (const n of ["e2e-10-a", "e2e-10-b", "e2e-10-c"]) {
      const res = await read(`images/${n}`, "admin");
      expect(res.status).toBe(200);
      expect(await storedName(res)).toBe("Keep");
    }
  });

  test("E2E-11: the owner alone can read and change the image list", async () => {
    const A = await signUp();
    await RF(A.uid);
    expect((await change("images/e2e-11", "Mine", A)).status).toBe(200);
    expect((await read("images/e2e-11", undefined)).status).toBe(403);
    const own = await read("images/e2e-11", A);
    expect(own.status).toBe(200);
    expect(await storedName(own)).toBe("Mine");
    expect((await del("images/e2e-11", A)).status).toBe(200);
    expect((await read("images/e2e-11", "admin")).status).toBe(404);
  });

  test("E2E-12: the owner placeholder is the same in the three places", async () => {
    const ownerTs = repoText("src/lib/admin/owner.ts");
    let ownerValue: string | undefined;
    if (ownerTs.includes("export const OWNER_UID: string = OWNER_UID_PLACEHOLDER;")) {
      ownerValue = PLACEHOLDER;
    } else {
      ownerValue = /export const OWNER_UID: string = "([^"]*)";/.exec(ownerTs)?.[1];
    }
    const re = /function\s+ownerUid\s*\(\s*\)\s*\{\s*return\s+'([^']*)'\s*;\s*\}/;
    const fsValue = re.exec(repoText("firestore.rules"))?.[1];
    const storageText = repoText("storage.rules");
    const stValue = re.exec(storageText)?.[1];
    expect(ownerValue).toBeDefined();
    expect(fsValue).toBeDefined();
    expect(stValue).toBeDefined();
    expect(fsValue).toBe(ownerValue);
    expect(stValue).toBe(ownerValue);
    const count = storageText.split(PLACEHOLDER).length - 1;
    expect(count).toBe(ownerValue === PLACEHOLDER ? 1 : 0);
    expect(ownerValue).toBe(PLACEHOLDER);
    expect(fsValue).toBe(PLACEHOLDER);
    expect(stValue).toBe(PLACEHOLDER);
  });

  test("E2E-13: firebase.json names the storage rules and emulator and keeps hosting", async () => {
    const config = JSON.parse(repoText("firebase.json")) as Record<string, any>;
    expect(config.storage?.rules).toBe("storage.rules");
    expect(config.emulators?.storage).toEqual({ host: "127.0.0.1", port: 9199 });
    expect(config.emulators?.firestore).toEqual({ host: "127.0.0.1", port: 8080 });
    expect(config.emulators?.auth).toEqual({ host: "127.0.0.1", port: 9099 });
    const emulatorKeys = ["auth", "firestore", "storage", "ui", "singleProjectMode"];
    for (const key of Object.keys(config.emulators ?? {})) expect(emulatorKeys).toContain(key);
    expect(config.hosting?.public).toBe("out");
    expect(config.hosting?.trailingSlash).toBe(true);
    expect(config.hosting?.cleanUrls).toBe(false);
    const allowed = ["hosting", "firestore", "storage", "emulators"];
    for (const key of Object.keys(config)) expect(allowed).toContain(key);
    for (const key of ["functions", "extensions", "database", "dataconnect", "remoteconfig", "apphosting"]) {
      expect(config).not.toHaveProperty(key);
    }
  });

  test("E2E-14: the live deploy publishes the storage rules and staging does not", async () => {
    const pkg = JSON.parse(repoText("package.json")) as { scripts: Record<string, string> };
    const workflow = repoText(".github/workflows/pipeline.yml");
    const prodStart = workflow.indexOf("  deploy-production:");
    const stagingStart = workflow.indexOf("  deploy-staging:");
    expect(prodStart).toBeGreaterThan(-1);
    expect(stagingStart).toBeGreaterThan(-1);
    const prod = workflow.slice(prodStart);
    const staging = workflow.slice(stagingStart, prodStart);
    expect(pkg.scripts["deploy:rules"]).toBe(
      "firebase deploy --only firestore:rules,storage --project thegoldenpothos-5b3a1",
    );
    expect(prod).toContain("npm run deploy:rules");
    expect(staging).not.toContain("deploy:rules");
    expect(staging).not.toContain("storage");
    expect(staging).not.toContain("firestore");
  });

  test("E2E-15: the storage rules name no email and read no environment", async () => {
    for (const needle of ["email", "process.env"]) {
      const res = spawnSync("git", ["grep", "--untracked", "-n", "-i", needle, "--", "storage.rules"], {
        cwd: ROOT,
        encoding: "utf8",
      });
      expect(res.status).toBe(1);
      expect(res.stdout).toBe("");
    }
  });
  test("E2E-16: validateImageFile accepts or refuses a file by size and type", async () => {
    // Loaded inside the row so a missing module fails only the rows that need it.
    const { validateImageFile } = await import("../src/lib/admin/images");
    const TYPE = "Only PNG, JPEG, WebP or SVG images can be uploaded";
    const BIG = "That image is over 5 MB";
    const cases: Array<[number, string]> = [
      [1, "image/png"],
      [5242880, "image/png"],
      [5242881, "image/png"],
      [5347738, "image/png"],
      [1000, "application/pdf"],
      [1000, "image/gif"],
      [1000, ""],
      [0, "image/png"],
      [0, "application/pdf"],
      [5347738, "application/pdf"],
      [1000, "image/png"],
      [1000, "image/jpeg"],
      [1000, "image/webp"],
      [1000, "image/svg+xml"],
    ];
    const results = cases.map(([size, type]) => validateImageFile({ name: "a", size, type }));
    expect(results).toEqual([
      null,
      null,
      BIG,
      BIG,
      TYPE,
      TYPE,
      TYPE,
      "That file is empty",
      "That file is empty",
      TYPE,
      null,
      null,
      null,
      null,
    ]);
  });

  test("E2E-17: formatBytes writes a size as B, KB or MB", async () => {
    const { formatBytes } = await import("../src/lib/admin/images");
    const inputs = [0, 1023, 1024, 1536, 20480, 204800, 307200, 1048576, 1572864, 5242880, 5347738];
    expect(inputs.map((n) => formatBytes(n))).toEqual([
      "0 B",
      "1023 B",
      "1 KB",
      "1.5 KB",
      "20 KB",
      "200 KB",
      "300 KB",
      "1 MB",
      "1.5 MB",
      "5 MB",
      "5.1 MB",
    ]);
  });

  test("E2E-18: storagePathFor names the stored path by type and refuses other types", async () => {
    const { storagePathFor } = await import("../src/lib/admin/images");
    expect(storagePathFor("abc", "image/png")).toBe("images/abc.png");
    expect(storagePathFor("abc", "image/jpeg")).toBe("images/abc.jpg");
    expect(storagePathFor("abc", "image/webp")).toBe("images/abc.webp");
    expect(storagePathFor("abc", "image/svg+xml")).toBe("images/abc.svg");
    expect(() => storagePathFor("abc", "application/pdf")).toThrow();
  });
  test("E2E-19: the menu lists Images last and the notice is gone for the owner", async ({ page }) => {
    await ownerSession(page);
    await expect(nav(page).getByRole("button")).toHaveText([
      "Profile", "Experience", "Projects", "Certifications", "Tech stack", "Blog posts", "Images",
    ]);
    await expect(page.getByText(NOTICE)).toHaveCount(0);
  });

  test("E2E-20: a png is uploaded, listed with its size and survives a reload", async ({ page }) => {
    await checkStored(page, "headshot.png", "200 KB", "image/png", 204800);
  });

  test("E2E-21: a jpeg is uploaded, listed with its size and survives a reload", async ({ page }) => {
    await checkStored(page, "cover.jpg", "1 MB", "image/jpeg", 1048576);
  });

  test("E2E-22: a webp is uploaded, listed with its size and survives a reload", async ({ page }) => {
    await checkStored(page, "badge.webp", "300 KB", "image/webp", 307200);
  });

  test("E2E-23: an svg is uploaded, listed with its size and survives a reload", async ({ page }) => {
    await checkStored(page, "logo.svg", "20 KB", "image/svg+xml", 20480);
  });

  test("E2E-24: a 5 MB png is uploaded, listed with its size and survives a reload", async ({ page }) => {
    await checkStored(page, "big.png", "5 MB", "image/png", 5242880);
  });

  test("E2E-25: an svg with a script never runs it", async ({ page }) => {
    await ownerSession(page);
    await openLibrary(page);
    await upload(page, file("scripted.svg", "image/svg+xml", 2048, true));
    await expect(item(page, "scripted.svg")).toBeVisible();
    expect(await page.evaluate(() => (window as any).__svgRan)).toBeUndefined();
    await expect(page.getByRole("list", { name: "Uploaded images" }).locator("svg, object, iframe, embed")).toHaveCount(0);
    await expect.poll(() => naturalWidth(page, "scripted.svg")).toBeGreaterThan(0);
  });

  test("E2E-26: copy address puts the working address on the clipboard", async ({ page, request }) => {
    await ownerSession(page);
    await openLibrary(page);
    await upload(page, file("headshot.png", "image/png", 204800));
    const it = item(page, "headshot.png");
    await expect(it).toBeVisible();
    await it.getByRole("button", { name: "Copy address" }).click();
    await expect(page.getByText("Address copied")).toBeVisible();
    const C = await page.evaluate(() => navigator.clipboard.readText());
    expect(C).toBe(await it.getByRole("img").getAttribute("src"));
    expect(C.startsWith(IMG)).toBe(true);
    const res = await request.get(C);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toBe("image/png");
    expect((await res.body()).length).toBe(204800);
  });

  test("E2E-27: a blocked clipboard shows a failure and never says copied", async ({ page }) => {
    await page.addInitScript(() => {
      Clipboard.prototype.writeText = () => Promise.reject(new Error("blocked"));
    });
    await ownerSession(page);
    await openLibrary(page);
    await upload(page, file("headshot.png", "image/png", 204800));
    const it = item(page, "headshot.png");
    await expect(it).toBeVisible();
    await it.getByRole("button", { name: "Copy address" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "The address could not be copied." })).toBeVisible();
    await expect(page.getByText("Address copied")).toHaveCount(0);
  });

  test("E2E-28: an image over 5 MB is refused and nothing is stored", async ({ page }) => {
    await twoThenRefuse(page, file("huge.png", "image/png", 5347738), "That image is over 5 MB");
  });

  test("E2E-29: a pdf is refused and nothing is stored", async ({ page }) => {
    await twoThenRefuse(page, file("cv.pdf", "application/pdf", 1000), TYPE_MSG);
  });

  test("E2E-30: a gif is refused and nothing is stored", async ({ page }) => {
    await twoThenRefuse(page, file("spin.gif", "image/gif", 1000), TYPE_MSG);
  });

  test("E2E-31: an empty file is refused and nothing is stored", async ({ page }) => {
    await twoThenRefuse(page, file("blank.png", "image/png", 0), "That file is empty");
  });

  test("E2E-32: uploading with no file chosen asks for one", async ({ page }) => {
    await ownerSession(page);
    await openLibrary(page);
    await page.getByRole("button", { name: "Upload", exact: true }).click();
    await expect(page.getByText("Choose an image first.")).toBeVisible();
    await expect(page.getByText(EMPTY)).toBeVisible();
    expect(await adminList()).toEqual([]);
  });

  async function oldLogo(page: Page): Promise<string> {
    await ownerSession(page);
    await openLibrary(page);
    await upload(page, file("old-logo.png", "image/png", 1000));
    const it = item(page, "old-logo.png");
    await expect(it).toBeVisible();
    const U = await it.getByRole("img").getAttribute("src");
    await it.getByRole("button", { name: "Delete", exact: true }).click();
    return U as string;
  }

  test("E2E-33: a confirmed delete removes the image, its file and its entry", async ({ page, request }) => {
    const U = await oldLogo(page);
    const group = page.getByRole("group", { name: "Confirm delete" });
    await expect(group).toBeVisible();
    await expect(group).toContainText(CONFIRM_TEXT("old-logo.png"));
    await group.getByRole("button", { name: "Confirm" }).click();
    await expect(items(page)).toHaveCount(0);
    await expect(page.getByText(EMPTY)).toBeVisible();
    await page.reload();
    await expect(nav(page)).toBeVisible();
    await openLibrary(page);
    await expect(items(page)).toHaveCount(0);
    await expect(page.getByText(EMPTY)).toBeVisible();
    expect((await request.get(U)).status()).toBe(404);
    expect(await adminList()).toEqual([]);
    expect(await docsList()).toEqual([]);
  });

  test("E2E-34: cancelling a delete changes nothing", async ({ page, request }) => {
    const U = await oldLogo(page);
    const group = page.getByRole("group", { name: "Confirm delete" });
    await expect(group).toContainText(CONFIRM_TEXT("old-logo.png"));
    await group.getByRole("button", { name: "Cancel" }).click();
    await expect(group).toHaveCount(0);
    await expect(item(page, "old-logo.png")).toBeVisible();
    await page.reload();
    await expect(nav(page)).toBeVisible();
    await openLibrary(page);
    await expect(item(page, "old-logo.png")).toBeVisible();
    expect((await request.get(U)).status()).toBe(200);
    expect(await adminList()).toHaveLength(1);
  });

  test("E2E-35: a double click on Delete opens the confirmation and deletes nothing", async ({ page, request }) => {
    await ownerSession(page);
    await openLibrary(page);
    await upload(page, file("twice.png", "image/png", 1000));
    const it = item(page, "twice.png");
    await expect(it).toBeVisible();
    const U = (await it.getByRole("img").getAttribute("src")) as string;
    await it.getByRole("button", { name: "Delete", exact: true }).dblclick();
    await expect(page.getByRole("group", { name: "Confirm delete" })).toBeVisible();
    await expect(item(page, "twice.png")).toBeVisible();
    expect((await request.get(U)).status()).toBe(200);
    expect(await adminList()).toHaveLength(1);
    expect(await docsList()).toHaveLength(1);
  });

  test("E2E-36: the library fits a 375px phone with long names", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    const LONG = "a-very-long-image-file-name-without-spaces-".repeat(4) + ".png";
    await ownerSession(page);
    await openLibrary(page);
    await upload(page, file(LONG, "image/png", 1000));
    await expect(item(page, LONG)).toBeVisible();
    await upload(page, file("headshot.png", "image/png", 204800));
    await expect(item(page, "headshot.png")).toBeVisible();
    await expect(items(page)).toHaveCount(2);
    // the most recent upload is first, so match each item by its content rather than position
    for (const [name, size] of [[LONG, "1000 B"], ["headshot.png", "200 KB"]]) {
      const it = item(page, name);
      await expect(it.getByRole("img")).toBeVisible();
      await expect(it).toContainText(size);
    }
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(sw).toBeLessThanOrEqual(375);
    const nameBox = await page.getByText(LONG, { exact: true }).boundingBox();
    expect(nameBox).not.toBeNull();
    expect(nameBox!.x).toBeGreaterThanOrEqual(0);
    expect(nameBox!.x + nameBox!.width).toBeLessThanOrEqual(375);
    for (let i = 0; i < 2; i++) {
      const it = items(page).nth(i);
      for (const label of ["Copy address", "Delete"]) {
        const b = it.getByRole("button", { name: label, exact: true });
        await expect(b).toBeVisible();
        const box = await b.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(375);
        expect(box!.height).toBeGreaterThanOrEqual(44);
      }
    }
  });

  test("E2E-37: a signed-out visitor sees no library and no data requests", async ({ page }) => {
    await adminClear();
    await seedDoc("images/e2e-37", "secret-logo.png");
    const urls: string[] = [];
    page.on("request", (r) => urls.push(r.url()));
    await page.goto(PANEL);
    await expect(page.getByRole("button", { name: "Sign in with Google" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Images" })).toHaveCount(0);
    await expect(nav(page)).toHaveCount(0);
    await expect(page.getByRole("list", { name: "Uploaded images" })).toHaveCount(0);
    expect(await page.locator("body").innerText()).not.toContain("secret-logo.png");
    expect(urls.filter((u) => u.startsWith("http://127.0.0.1:8080") || u.startsWith("http://127.0.0.1:9199"))).toEqual([]);
  });

  test("E2E-38: a not-allowed account sees no library and no data requests", async ({ page }) => {
    await adminClear();
    await seedDoc("images/e2e-38", "secret-logo.png");
    await page.addInitScript(() => window.localStorage.setItem("admin.ownerUid", "not-this-account-0000000000"));
    const urls: string[] = [];
    page.on("request", (r) => urls.push(r.url()));
    await page.goto(PANEL);
    await P(page);
    await expect(page.getByText("This account is not allowed to use the admin panel.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Images" })).toHaveCount(0);
    await expect(nav(page)).toHaveCount(0);
    expect(await page.locator("body").innerText()).not.toContain("secret-logo.png");
    expect(urls.filter((u) => u.startsWith("http://127.0.0.1:8080") || u.startsWith("http://127.0.0.1:9199"))).toEqual([]);
  });

  test("E2E-39: while the owner is unfilled the list read is refused and nothing is listed", async ({ page }) => {
    await adminClear();
    await seedDoc("images/e2e-39", "secret-logo.png");
    await RF(null);
    await RS(null);
    await page.goto(PANEL);
    await P(page);
    await expect(page.getByText(/^Your user ID:/)).toBeVisible();
    await nav(page).getByRole("button", { name: "Images", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "The images could not be loaded." })).toBeVisible();
    await expect(page.getByText(EMPTY)).toHaveCount(0);
    await expect(page.getByText("secret-logo.png")).toHaveCount(0);
    await expect(page.getByRole("list", { name: "Uploaded images" })).toHaveCount(0);
    await expect(page.getByText(NOTICE)).toBeVisible();
  });

  test("E2E-40: while the owner is unfilled an upload fails with a message", async ({ page }) => {
    await adminClear();
    await RF(null);
    await RS(null);
    await page.goto(PANEL);
    await P(page);
    await expect(page.getByText(/^Your user ID:/)).toBeVisible();
    await nav(page).getByRole("button", { name: "Images", exact: true }).click();
    await upload(page, file("headshot.png", "image/png", 204800));
    await expect(page.getByRole("alert").filter({ hasText: "The image could not be uploaded." })).toBeVisible();
    expect(await adminList()).toEqual([]);
    expect(await docsList()).toEqual([]);
    await expect(page.getByRole("heading", { level: 2, name: "Images" })).toBeVisible();
    await expect(page.getByText(NOTICE)).toBeVisible();
  });

  test("E2E-41: a failed entry write removes the stored file", async ({ page }) => {
    await ownerSession(page);
    await openLibrary(page);
    await expect(page.getByText(EMPTY)).toBeVisible();
    await RF(null);
    await upload(page, file("headshot.png", "image/png", 204800));
    await expect(page.getByRole("alert").filter({ hasText: "The image could not be uploaded." })).toBeVisible();
    expect(await adminList()).toEqual([]);
    expect(await docsList()).toEqual([]);
    await expect(page.getByText(EMPTY)).toBeVisible();
  });

  test("E2E-42: a dropped upload connection fails promptly", async ({ page }) => {
    test.setTimeout(60000);
    await ownerSession(page);
    await openLibrary(page);
    await page.route(
      (url) => url.href.startsWith("http://127.0.0.1:9199"),
      (route) => (route.request().method() === "POST" ? route.abort("failed") : route.continue()),
    );
    await upload(page, file("headshot.png", "image/png", 204800));
    await expect(page.getByRole("alert").filter({ hasText: "The image could not be uploaded." })).toBeVisible({ timeout: 40000 });
    await expect(items(page)).toHaveCount(0);
    await expect(page.getByText(EMPTY)).toBeVisible();
    expect(await adminList()).toEqual([]);
  });

  test("E2E-43: a refused file delete keeps the image and the entry", async ({ page }) => {
    await ownerSession(page);
    await openLibrary(page);
    await upload(page, file("old-logo.png", "image/png", 1000));
    await expect(item(page, "old-logo.png")).toBeVisible();
    await page.route(
      (url) => url.href.startsWith("http://127.0.0.1:9199"),
      (route) =>
        route.request().method() === "DELETE"
          ? route.fulfill({
              status: 403,
              contentType: "application/json",
              body: '{"error":{"code":403,"message":"Permission denied."}}',
            })
          : route.continue(),
    );
    const it = item(page, "old-logo.png");
    await it.getByRole("button", { name: "Delete", exact: true }).click();
    await it.getByRole("button", { name: "Confirm" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "That image could not be deleted." })).toBeVisible();
    await expect(item(page, "old-logo.png")).toBeVisible();
    await page.reload();
    await expect(nav(page)).toBeVisible();
    await openLibrary(page);
    await expect(item(page, "old-logo.png")).toBeVisible();
    expect(await adminList()).toHaveLength(1);
    expect(await docsList()).toHaveLength(1);
  });

  test("E2E-44: an image whose file is already gone can still be deleted", async ({ page }) => {
    await ownerSession(page);
    await openLibrary(page);
    await upload(page, file("half-gone.png", "image/png", 1000));
    await expect(item(page, "half-gone.png")).toBeVisible();
    const names = await adminList();
    expect(names).toHaveLength(1);
    const res = await fetch(`${OBJ}/${encodeURIComponent(names[0])}`, { method: "DELETE", headers: storageAuth("admin") });
    expect(res.status).toBe(204);
    await page.reload();
    await expect(nav(page)).toBeVisible();
    await openLibrary(page);
    const it = item(page, "half-gone.png");
    await expect(it).toBeVisible();
    await it.getByRole("button", { name: "Delete", exact: true }).click();
    await it.getByRole("button", { name: "Confirm" }).click();
    await expect(items(page)).toHaveCount(0);
    await expect(page.getByText(EMPTY)).toBeVisible();
    expect(await docsList()).toEqual([]);
  });

  test("E2E-45: deleting an image already deleted elsewhere says so", async ({ page }) => {
    await ownerSession(page);
    await openLibrary(page);
    await upload(page, file("old-logo.png", "image/png", 1000));
    await expect(item(page, "old-logo.png")).toBeVisible();
    const page2 = await page.context().newPage();
    await page2.goto(PANEL);
    await expect(nav(page2)).toBeVisible();
    await openLibrary(page2);
    await expect(item(page2, "old-logo.png")).toBeVisible();
    const it = item(page, "old-logo.png");
    await it.getByRole("button", { name: "Delete", exact: true }).click();
    await it.getByRole("button", { name: "Confirm" }).click();
    await expect(page.getByText(EMPTY)).toBeVisible();
    const it2 = item(page2, "old-logo.png");
    await it2.getByRole("button", { name: "Delete", exact: true }).click();
    await it2.getByRole("button", { name: "Confirm" }).click();
    await expect(page2.getByRole("alert").filter({ hasText: "That image was already deleted." })).toBeVisible();
    await expect(items(page2)).toHaveCount(0);
    await expect(page2.getByText(EMPTY)).toBeVisible();
  });

  test("E2E-46: an upload stores a named file and a complete entry", async ({ page, request }) => {
    await ownerSession(page);
    await openLibrary(page);
    await upload(page, file("headshot.png", "image/png", 204800));
    await expect(item(page, "headshot.png")).toBeVisible();
    const N = await adminList();
    const D = await docsList();
    expect(N).toHaveLength(1);
    expect(N[0]).toMatch(/^images\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$/);
    expect(D).toHaveLength(1);
    const f = D[0].fields;
    expect(f.name.stringValue).toBe("headshot.png");
    expect(f.storagePath.stringValue).toBe(N[0]);
    expect(f.contentType.stringValue).toBe("image/png");
    expect(f.size.integerValue).toBe("204800");
    expect(f.createdAt.integerValue).toMatch(/^\d{13}$/);
    const last = (D[0].name as string).split("/").pop();
    expect(last).toBe(N[0].replace("images/", "").replace(".png", ""));
    const url = f.url.stringValue as string;
    expect(url.startsWith(IMG)).toBe(true);
    expect(url).toContain("alt=media");
    const res = await request.get(url);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toBe("image/png");
    expect((await res.body()).length).toBe(204800);
  });

  test("E2E-47: the newest image is listed first", async ({ page }) => {
    await ownerSession(page);
    await openLibrary(page);
    await upload(page, file("first.png", "image/png", 1000));
    await expect(items(page)).toHaveCount(1);
    await upload(page, file("second.png", "image/png", 1000));
    await expect(items(page)).toHaveCount(2);
    await expect(items(page).nth(0)).toContainText("second.png");
    await expect(items(page).nth(1)).toContainText("first.png");
    await page.reload();
    await expect(nav(page)).toBeVisible();
    await openLibrary(page);
    await expect(items(page)).toHaveCount(2);
    await expect(items(page).nth(0)).toContainText("second.png");
    await expect(items(page).nth(1)).toContainText("first.png");
  });

  test("E2E-48: the same file uploaded twice is stored twice", async ({ page }) => {
    await ownerSession(page);
    await openLibrary(page);
    await upload(page, file("headshot.png", "image/png", 204800));
    await expect(items(page)).toHaveCount(1);
    await upload(page, file("headshot.png", "image/png", 204800));
    await expect(item(page, "headshot.png")).toHaveCount(2);
    const srcs = await items(page).getByRole("img").evaluateAll((els) => els.map((e) => (e as HTMLImageElement).src));
    expect(srcs).toHaveLength(2);
    expect(srcs[0]).not.toBe(srcs[1]);
    expect(await adminList()).toHaveLength(2);
    expect(await docsList()).toHaveLength(2);
  });

  test("E2E-49: a double click on Upload uploads once", async ({ page }) => {
    await ownerSession(page);
    await openLibrary(page);
    await page.getByLabel("Image file").setInputFiles(file("headshot.png", "image/png", 204800));
    const up = page.getByRole("button", { name: "Upload", exact: true });
    await up.dblclick();
    await expect(items(page)).toHaveCount(1);
    await expect(up).toBeEnabled();
    await page.reload();
    await expect(nav(page)).toBeVisible();
    await openLibrary(page);
    await expect(items(page)).toHaveCount(1);
    expect(await adminList()).toHaveLength(1);
    expect(await docsList()).toHaveLength(1);
  });

  test("E2E-50: the controls work from the keyboard", async ({ page }) => {
    await ownerSession(page);
    await openLibrary(page);
    await upload(page, file("headshot.png", "image/png", 204800));
    const it = item(page, "headshot.png");
    await expect(it).toBeVisible();
    await it.getByRole("button", { name: "Copy address" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText("Address copied")).toBeVisible();
    await it.getByRole("button", { name: "Delete", exact: true }).focus();
    await page.keyboard.press("Enter");
    const group = page.getByRole("group", { name: "Confirm delete" });
    await expect(group).toBeVisible();
    await group.getByRole("button", { name: "Cancel" }).focus();
    await page.keyboard.press("Enter");
    await expect(group).toHaveCount(0);
    await expect(it.getByRole("img", { name: "headshot.png" })).toBeVisible();
  });

  test("E2E-51: the library uses the light and dark theme tokens", async ({ browser }) => {
    for (const [t, bg, fg] of [
      ["light", "rgb(249, 247, 245)", "rgb(45, 45, 45)"],
      ["dark", "rgb(31, 31, 53)", "rgb(228, 228, 236)"],
    ] as const) {
      const context = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"] });
      await context.addInitScript((theme) => window.localStorage.setItem("theme", theme), t);
      const page = await context.newPage();
      try {
        await ownerSession(page);
        await openLibrary(page);
        await upload(page, file("headshot.png", "image/png", 204800));
        const it = item(page, "headshot.png");
        await expect(it).toBeVisible();
        await expect(page.locator("html")).toHaveAttribute("data-theme", t);
        await expect(it).toHaveCSS("background-color", bg);
        await expect(page.getByText("headshot.png", { exact: true })).toHaveCSS("color", fg);
      } finally {
        await context.close();
      }
    }
  });

  test("E2E-52: the library source uses tokens only", async () => {
    const src = repoText("src/app/components/admin/ImageLibrary.tsx");
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(src).not.toMatch(/\brgba?\(/);
    expect(src).not.toMatch(/\bhsla?\(/);
    expect(src).not.toMatch(/dark:/);
    expect(src).toContain("var(--surface-alt)");
  });

  test("E2E-53: public pages load no Firebase and the panel loads storage", async ({ browser }) => {
    async function collect(path: string): Promise<string> {
      const context = await browser.newContext();
      const page = await context.newPage();
      const texts: string[] = [];
      page.on("response", async (res) => {
        const ct = res.headers()["content-type"] ?? "";
        if (ct.includes("javascript")) {
          try {
            texts.push(await res.text());
          } catch {
            /* ignore */
          }
        }
      });
      await page.goto(path, { waitUntil: "networkidle" });
      texts.push(await page.content());
      await context.close();
      return texts.join("\n");
    }
    const needles = [
      "firebasestorage.googleapis.com",
      "firebasestorage.app",
      "thegoldenpothos-5b3a1",
      "firestore.googleapis.com",
    ];
    for (const path of ["/", "/blog/hello-world/"]) {
      const all = await collect(path);
      for (const n of needles) expect(all).not.toContain(n);
    }
    expect(await collect(PANEL)).toContain("firebasestorage.app");
  });

  test("E2E-54: the saving-off notice names both rules files", async ({ page }) => {
    await page.goto(PANEL);
    await P(page);
    await expect(page.getByText(NOTICE)).toBeVisible();
    await expect(page.getByRole("list", { name: "How to switch saving on" }).getByRole("listitem")).toHaveText([
      "In src/lib/admin/owner.ts, set OWNER_UID to your user ID, in quotes.",
      "In firestore.rules and storage.rules, replace REPLACE_WITH_OWNER_UID with your user ID, keeping the quotes.",
      "Merge the change to master. The live deploy then publishes the database and file storage rules.",
    ]);
  });
});
