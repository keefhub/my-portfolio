import { expect, test } from "@playwright/test";
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
});
