import { expect, test, type Page } from "@playwright/test";
import { spawnSync } from "node:child_process";
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
    await seed("gallery/e2e-12", { name: str("Before") });
    await seed("notes/e2e-12", { name: str("Before") });
    const statuses: number[] = [];
    for (const path of ["gallery/e2e-12", "notes/e2e-12"]) {
      statuses.push((await change(path, "Defaced", A)).status);
    }
    for (const path of ["gallery/e2e-12", "notes/e2e-12"]) {
      statuses.push((await read(path, A)).status);
    }
    for (const path of ["gallery/e2e-12", "notes/e2e-12"]) {
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
  const allowed = ["hosting", "firestore", "storage", "emulators"];
  for (const key of Object.keys(config)) expect(allowed).toContain(key);
  for (const key of ["functions", "extensions", "database", "dataconnect", "remoteconfig", "apphosting"]) {
    expect(config).not.toHaveProperty(key);
  }
});

test("E2E-21: the live deploy publishes the rules after hosting and uses no new secret", () => {
  const workflow = readFileSync(join(ROOT, ".github/workflows/pipeline.yml"), "utf8");
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
  };
  const prodStart = workflow.indexOf("  deploy-production:");
  const stagingStart = workflow.indexOf("  deploy-staging:");
  expect(prodStart).toBeGreaterThan(-1);
  expect(stagingStart).toBeGreaterThan(-1);
  expect(stagingStart).toBeLessThan(prodStart);
  const prod = workflow.slice(prodStart);
  const staging = workflow.slice(stagingStart, prodStart);

  expect(prod).toContain("npm run deploy:rules");
  expect(prod).toContain("GOOGLE_APPLICATION_CREDENTIALS");
  expect(prod.indexOf("FirebaseExtended/action-hosting-deploy")).toBeGreaterThan(-1);
  expect(prod.indexOf("FirebaseExtended/action-hosting-deploy")).toBeLessThan(
    prod.indexOf("npm run deploy:rules"),
  );
  expect(prod).not.toContain("continue-on-error");
  expect(staging).not.toContain("deploy:rules");
  expect(staging).not.toContain("firestore");

  const secrets = new Set([...workflow.matchAll(/secrets\.([A-Za-z0-9_]+)/g)].map((m) => m[1]));
  expect(secrets).toEqual(new Set(["GITHUB_TOKEN", "FIREBASE_SERVICE_ACCOUNT"]));

  expect(pkg.scripts["deploy:rules"]).toBe(
    "firebase deploy --only firestore:rules,storage --project thegoldenpothos-5b3a1",
  );
  expect(pkg.scripts.deploy).toBe(
    "npm run build && firebase deploy --only hosting --project thegoldenpothos-5b3a1",
  );
});

// ---- Panel notice rows (E2E-14 to E2E-18, E2E-20) ----

const PANEL = "/bright-warm-greenhouse/";
const SECTIONS = ["Profile", "Experience", "Projects", "Certifications", "Tech stack", "Blog posts", "Images"];
const NOTICE_TEXT = "Saving is not switched on yet.";
const EXPLANATION = "You can look around, but nothing you change will be saved until your account is set up.";
const STEPS = [
  "In src/lib/admin/owner.ts, set OWNER_UID to your user ID, in quotes.",
  "In firestore.rules and storage.rules, replace REPLACE_WITH_OWNER_UID with your user ID, keeping the quotes.",
  "Merge the change to master. The live deploy then publishes the database and file storage rules.",
];

async function signInViaPopup(page: Page): Promise<void> {
  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Sign in with Google" }).click();
  const popup = await popupPromise;
  await popup.waitForLoadState("load");
  await popup.locator("#add-account-button").click();
  await popup.locator("#autogen-button").click();
  await popup.locator("#sign-in").click();
}

async function overrideOwner(page: Page, value: string): Promise<void> {
  await page.addInitScript((v) => {
    window.localStorage.setItem("admin.ownerUid", v);
  }, value);
}

const notice = (page: Page) => page.getByText(NOTICE_TEXT, { exact: true });
const steps = (page: Page) => page.getByRole("list", { name: "How to switch saving on" });
const adminNav = (page: Page) => page.getByRole("navigation", { name: "Admin sections" });

test("E2E-14: the unfilled-owner screen shows the saving-off notice and its steps", async ({ page }) => {
  await page.goto(PANEL);
  await signInViaPopup(page);
  await expect(notice(page)).toBeVisible();
  await expect(page.getByText(EXPLANATION, { exact: true })).toBeVisible();
  await expect(page.getByText(/^Your user ID: [A-Za-z0-9]{20,}$/)).toBeVisible();
  await expect(steps(page).getByRole("listitem")).toHaveText(STEPS);
  await expect(adminNav(page).getByRole("button")).toHaveText(SECTIONS);
  for (const name of SECTIONS) {
    await expect(adminNav(page).getByRole("button", { name, exact: true })).toBeVisible();
  }
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();
});

test("E2E-15: once the owner ID is filled in the notice and the ID line go away", async ({ page }) => {
  await page.goto(PANEL);
  await signInViaPopup(page);
  const line = await page.getByText(/^Your user ID:/).innerText();
  const uid = line.replace("Your user ID: ", "");
  await expect(notice(page)).toBeVisible();
  await page.evaluate((v) => window.localStorage.setItem("admin.ownerUid", v), uid);
  await page.reload();
  await expect(adminNav(page)).toBeVisible();
  await expect(adminNav(page).getByRole("button")).toHaveText(SECTIONS);
  await expect(notice(page)).toHaveCount(0);
  await expect(steps(page)).toHaveCount(0);
  await expect(page.getByText(/^Your user ID:/)).toHaveCount(0);
});

test("E2E-16: a not-allowed account does not see the saving-off notice", async ({ page }) => {
  await overrideOwner(page, "not-this-account-0000000000");
  await page.goto(PANEL);
  await signInViaPopup(page);
  await expect(page.getByText("This account is not allowed to use the admin panel.")).toBeVisible();
  await expect(notice(page)).toHaveCount(0);
  await expect(steps(page)).toHaveCount(0);
});

test("E2E-17: the signed-out screen does not show the saving-off notice", async ({ page }) => {
  await page.goto(PANEL);
  await expect(page.getByRole("button", { name: "Sign in with Google" })).toBeVisible();
  await expect(notice(page)).toHaveCount(0);
  await expect(steps(page)).toHaveCount(0);
});

test("E2E-18: the notice fits a 375px screen and the user ID stays selectable", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto(PANEL);
  await signInViaPopup(page);
  await expect(notice(page)).toBeVisible();
  const code = page.getByText(/^Your user ID:/).locator("code");
  const uid = (await code.innerText()).trim();
  await code.dblclick();

  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(375);

  const region = page.getByRole("region", { name: "Saving status" });
  const boxes = [await region.boundingBox()];
  const items = steps(page).getByRole("listitem");
  const count = await items.count();
  expect(count).toBe(3);
  for (let i = 0; i < count; i++) boxes.push(await items.nth(i).boundingBox());
  for (const box of boxes) {
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(375);
  }

  const selected = await page.evaluate(() => window.getSelection()?.toString() ?? "");
  expect(selected).toBe(uid);
});

test("E2E-20: no admin source or the rules file mentions email or process.env", () => {
  for (const needle of ["email", "process.env"]) {
    const args = ["grep", "--untracked", "-n"];
    if (needle === "email") args.push("-i");
    args.push(needle, "--", "firestore.rules", "src/lib/admin", "src/app/components/admin");
    const res = spawnSync("git", args, { cwd: ROOT, encoding: "utf8" });
    expect(res.stdout).toBe("");
    expect(res.status).toBe(1);
  }
});
