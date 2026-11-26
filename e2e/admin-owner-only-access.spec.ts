import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const AUTH = "http://127.0.0.1:9099";
const FIRESTORE = "http://127.0.0.1:8080";
const PROJECT = "thegoldenpothos-5b3a1";
const DOCS = `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents`;
const PLACEHOLDER = "REPLACE_WITH_OWNER_UID";

const ROOT = process.cwd();
const rulesText = () => readFileSync(join(ROOT, "firestore.rules"), "utf8");

type Account = { uid: string; token: string };
type Fields = Record<string, unknown>;

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

async function R(uid: string | null): Promise<void> {
  const original = rulesText();
  const content = uid === null ? original : original.replace(PLACEHOLDER, uid);
  const res = await fetch(`${FIRESTORE}/emulator/v1/projects/${PROJECT}:securityRules`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rules: { files: [{ name: "firestore.rules", content }] } }),
  });
  expect(res.status).toBe(200);
}

async function seed(path: string, fields: Fields): Promise<void> {
  const res = await fetch(`${DOCS}/${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: "Bearer owner" },
    body: JSON.stringify({ fields }),
  });
  expect(res.status).toBe(200);
}

const str = (value: string) => ({ stringValue: value });
const bool = (value: boolean) => ({ booleanValue: value });

function headers(who?: Account): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (who) h.Authorization = `Bearer ${who.token}`;
  return h;
}

function change(path: string, name: string, who?: Account) {
  return fetch(`${DOCS}/${path}`, {
    method: "PATCH",
    headers: headers(who),
    body: JSON.stringify({ fields: { name: str(name) } }),
  });
}

function read(path: string, who?: Account) {
  return fetch(`${DOCS}/${path}`, { method: "GET", headers: headers(who) });
}

function del(path: string, who?: Account) {
  return fetch(`${DOCS}/${path}`, { method: "DELETE", headers: headers(who) });
}

async function storedName(res: Response): Promise<string | undefined> {
  const body = (await res.json()) as { fields?: { name?: { stringValue?: string } } };
  return body.fields?.name?.stringValue;
}

test.describe("owner-only database rules", () => {
  test.describe.configure({ mode: "serial" });

  test("E2E-01: the owner can change and read a profile document", async () => {
    const A = await signUp();
    await R(A.uid);
    await seed("profile/e2e-01", { name: str("Before") });
    const changed = await change("profile/e2e-01", "Written by owner", A);
    expect(changed.status).toBe(200);
    const got = await read("profile/e2e-01", A);
    expect(got.status).toBe(200);
    expect(await storedName(got)).toBe("Written by owner");
  });

  test("E2E-02: a signed-out change is refused and the value is kept", async () => {
    const A = await signUp();
    await R(A.uid);
    await seed("profile/e2e-02", { name: str("Before") });
    const changed = await change("profile/e2e-02", "Defaced");
    expect(changed.status).toBe(403);
    const got = await read("profile/e2e-02");
    expect(got.status).toBe(200);
    expect(await storedName(got)).toBe("Before");
  });

  test("E2E-03: another signed-in account's change is refused", async () => {
    const A = await signUp();
    const B = await signUp();
    await R(A.uid);
    await seed("profile/e2e-03", { name: str("Before") });
    const changed = await change("profile/e2e-03", "Defaced", B);
    expect(changed.status).toBe(403);
    const got = await read("profile/e2e-03", B);
    expect(got.status).toBe(200);
    expect(await storedName(got)).toBe("Before");
  });

  test("E2E-04: with the placeholder owner ID no account can change anything", async () => {
    const A = await signUp();
    await R(null);
    await seed("profile/e2e-04", { name: str("Before") });
    const changed = await change("profile/e2e-04", "Defaced", A);
    expect(changed.status).toBe(403);
    const got = await read("profile/e2e-04", A);
    expect(got.status).toBe(200);
    expect(await storedName(got)).toBe("Before");
  });

  test("E2E-05: every content collection refuses a signed-out or non-owner change", async () => {
    const A = await signUp();
    await R(null);
    for (const collection of ["profile", "experience", "projects", "certifications", "techCategories", "blogPosts"]) {
      const path = `${collection}/e2e-05`;
      const fields: Fields = { name: str("Before") };
      if (collection === "blogPosts") fields.draft = bool(false);
      await seed(path, fields);
      expect((await change(path, "Defaced", A)).status).toBe(403);
      expect((await change(path, "Defaced")).status).toBe(403);
      const got = await read(path);
      expect(got.status).toBe(200);
      expect(await storedName(got)).toBe("Before");
    }
  });

  test("E2E-06: only the owner can delete a document", async () => {
    const A = await signUp();
    const B = await signUp();
    await R(A.uid);
    await seed("experience/e2e-06", { name: str("Before") });
    expect((await del("experience/e2e-06")).status).toBe(403);
    expect((await del("experience/e2e-06", B)).status).toBe(403);
    expect((await read("experience/e2e-06")).status).toBe(200);
    expect((await del("experience/e2e-06", A)).status).toBe(200);
    expect((await read("experience/e2e-06")).status).toBe(404);
  });

  test("E2E-07: a signed-out visitor cannot read a draft post", async () => {
    const A = await signUp();
    await R(A.uid);
    await seed("blogPosts/e2e-07", { title: str("Hidden draft title"), draft: bool(true) });
    const res = await read("blogPosts/e2e-07");
    expect(res.status).toBe(403);
    expect(await res.text()).not.toContain("Hidden draft title");
  });

  test("E2E-08: a non-owner account cannot read a draft post", async () => {
    const A = await signUp();
    const B = await signUp();
    await R(A.uid);
    await seed("blogPosts/e2e-08", { title: str("Hidden draft title"), draft: bool(true) });
    const res = await read("blogPosts/e2e-08", B);
    expect(res.status).toBe(403);
    expect(await res.text()).not.toContain("Hidden draft title");
  });

  test("E2E-09: the owner can read a draft post", async () => {
    const A = await signUp();
    await R(A.uid);
    await seed("blogPosts/e2e-09", { title: str("Hidden draft title"), draft: bool(true) });
    const res = await read("blogPosts/e2e-09", A);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { fields?: { title?: { stringValue?: string } } };
    expect(body.fields?.title?.stringValue).toBe("Hidden draft title");
  });

  test("E2E-10: published content is public and a post without a draft flag is not", async () => {
    const A = await signUp();
    await R(A.uid);
    for (const collection of ["profile", "experience", "projects", "certifications", "techCategories"]) {
      await seed(`${collection}/e2e-10`, { name: str("Public value") });
    }
    await seed("blogPosts/e2e-10", { title: str("Public post title"), draft: bool(false) });
    await seed("blogPosts/e2e-10-nodraft", { title: str("No draft flag") });

    for (const collection of ["profile", "experience", "projects", "certifications", "techCategories"]) {
      const res = await read(`${collection}/e2e-10`);
      expect(res.status).toBe(200);
      expect(await storedName(res)).toBe("Public value");
    }
    const post = await read("blogPosts/e2e-10");
    expect(post.status).toBe(200);
    const postBody = (await post.json()) as { fields?: { title?: { stringValue?: string } } };
    expect(postBody.fields?.title?.stringValue).toBe("Public post title");

    expect((await read("blogPosts/e2e-10-nodraft")).status).toBe(403);
    expect((await read("blogPosts/e2e-10-nodraft", A)).status).toBe(200);
  });

  test("E2E-11: a signed-out list of posts needs the published filter", async () => {
    const A = await signUp();
    await R(A.uid);
    await seed("blogPosts/e2e-11-draft", { title: str("Hidden draft title"), draft: bool(true) });
    await seed("blogPosts/e2e-11-pub", { title: str("Public post title"), draft: bool(false) });

    const unfiltered = await fetch(`${DOCS}:runQuery`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ structuredQuery: { from: [{ collectionId: "blogPosts" }] } }),
    });
    expect(unfiltered.status).toBe(403);

    const filtered = await fetch(`${DOCS}:runQuery`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: "blogPosts" }],
          where: {
            fieldFilter: { field: { fieldPath: "draft" }, op: "EQUAL", value: { booleanValue: false } },
          },
        },
      }),
    });
    expect(filtered.status).toBe(200);
    const text = await filtered.text();
    expect(text).toContain("Public post title");
    expect(text).not.toContain("Hidden draft title");
  });

  test("E2E-12: paths that are not named in the rules are refused to everyone", async () => {
    const A = await signUp();
    await R(A.uid);
    await seed("images/e2e-12", { name: str("Before") });
    await seed("notes/e2e-12", { name: str("Before") });
    const statuses: number[] = [];
    for (const path of ["images/e2e-12", "notes/e2e-12"]) {
      statuses.push((await change(path, "Defaced", A)).status);
    }
    for (const path of ["images/e2e-12", "notes/e2e-12"]) {
      statuses.push((await read(path, A)).status);
    }
    for (const path of ["images/e2e-12", "notes/e2e-12"]) {
      statuses.push((await read(path)).status);
    }
    expect(statuses).toEqual([403, 403, 403, 403, 403, 403]);
  });

  test("E2E-13: the owner can save the same document twice in a row", async () => {
    const A = await signUp();
    await R(A.uid);
    await seed("profile/e2e-13", { name: str("Before") });
    const first = await change("profile/e2e-13", "First save", A);
    expect(first.status).toBe(200);
    const second = await change("profile/e2e-13", "Second save", A);
    expect(second.status).toBe(200);
    const got = await read("profile/e2e-13", A);
    expect(got.status).toBe(200);
    expect(await storedName(got)).toBe("Second save");
  });
});

test("E2E-19: the owner ID in owner.ts and in firestore.rules agree", () => {
  const owner = readFileSync(join(ROOT, "src/lib/admin/owner.ts"), "utf8");
  const rules = rulesText();

  let ownerValue: string | undefined;
  if (owner.includes("export const OWNER_UID: string = OWNER_UID_PLACEHOLDER;")) {
    ownerValue = PLACEHOLDER;
  } else {
    ownerValue = owner.match(/export const OWNER_UID: string = "([^"]*)";/)?.[1];
  }
  const rulesValue = rules.match(/function\s+ownerUid\s*\(\s*\)\s*\{\s*return\s+'([^']*)'\s*;\s*\}/)?.[1];

  expect(ownerValue).toBeDefined();
  expect(rulesValue).toBeDefined();
  expect(rulesValue).toBe(ownerValue);

  const occurrences = rules.split(PLACEHOLDER).length - 1;
  expect(occurrences).toBe(ownerValue === PLACEHOLDER ? 1 : 0);
  expect(ownerValue).toBe(PLACEHOLDER);
  expect(rulesValue).toBe(PLACEHOLDER);
});

test("E2E-22: firebase.json points Firestore at the rules and the emulator", () => {
  const config = JSON.parse(readFileSync(join(ROOT, "firebase.json"), "utf8")) as Record<string, any>;
  expect(config.firestore?.rules).toBe("firestore.rules");
  expect(config.emulators?.firestore).toEqual({ host: "127.0.0.1", port: 8080 });
  expect(config.emulators?.auth).toEqual({ host: "127.0.0.1", port: 9099 });
  expect(config.hosting?.public).toBe("out");
  expect(config.hosting?.trailingSlash).toBe(true);
  expect(config.hosting?.cleanUrls).toBe(false);
  const allowed = ["hosting", "firestore", "emulators"];
  for (const key of Object.keys(config)) expect(allowed).toContain(key);
  for (const key of ["functions", "extensions", "database", "dataconnect", "remoteconfig", "apphosting"]) {
    expect(config).not.toHaveProperty(key);
  }
});
