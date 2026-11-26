import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CERT_MESSAGES,
  CERTIFICATIONS_COLLECTION,
  certificationFromData,
  certificationLabel,
  certificationToData,
  checkCertification,
  emptyCertification,
} from "../src/lib/admin/certifications";

const NAME_MSG = "Enter a name";
const ICON_REQUIRED_MSG = "Pick an uploaded image or enter a badge image path that starts with /";
const ICON_INVALID_MSG = "Enter a badge image path that starts with /";
const URL_MSG = "Enter a link that starts with https://";

const FIRESTORE = "http://127.0.0.1:8080";
const PROJECT = "thegoldenpothos-5b3a1";
const DOCS = `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents`;
const PANEL = "/bright-warm-greenhouse/";
const PLACEHOLDER = "REPLACE_WITH_OWNER_UID";
const BIG = 1000000000000;
const ADMIN = { Authorization: "Bearer owner", "Content-Type": "application/json" };
const repoText = (name: string) => readFileSync(join(process.cwd(), name), "utf8");
const IMGURL = (id: string) => `http://127.0.0.1:9199/v0/b/thegoldenpothos-5b3a1.firebasestorage.app/o/images%2F${id}.png?alt=media&token=t`;

type Cert = { id: string; name: string; icon: string; url: string; position: number; updatedAt: number };
const S: Cert = { id: "e2e-s", name: "Professional Scrum Developer", icon: "/certs/scrum.png", url: "https://www.credly.com/badges/example/public_url", position: 0, updatedAt: 1 };
const G: Cert = { id: "e2e-g", name: "Google IT Automation with Python", icon: "/certs/google-python.png", url: "https://www.coursera.org/account/accomplishments/specialization/certificate/DGLR364HW5KZ", position: 1, updatedAt: 1 };
const B: Cert = { id: "e2e-b", name: "Certified Blockchain Developer", icon: "/certs/blockchain.png", url: "https://www.blockchain-council.org/certificate/example", position: 2, updatedAt: 1 };
const at = (x: Cert, p: number): Cert => ({ ...x, position: p });
const core = (c: Cert) => {
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
async function seedCert(c: Cert): Promise<void> {
  const fields = {
    name: str(c.name),
    icon: str(c.icon),
    url: str(c.url),
    position: { integerValue: String(c.position) },
    updatedAt: { integerValue: String(c.updatedAt) },
  };
  const res = await fetch(`${DOCS}/certifications/${c.id}`, { method: "PATCH", headers: ADMIN, body: JSON.stringify({ fields }) });
  expect(res.status).toBe(200);
}
async function readCerts(): Promise<Cert[]> {
  const res = await fetch(`${DOCS}/certifications?pageSize=300`, { headers: ADMIN });
  const body = (await res.json()) as { documents?: { name: string; fields: any }[] };
  const list = (body.documents ?? []).map((d) => {
    const f = d.fields;
    return {
      id: d.name.split("/").pop() as string,
      name: f.name.stringValue,
      icon: f.icon.stringValue,
      url: f.url.stringValue,
      position: Number(f.position.integerValue),
      updatedAt: Number(f.updatedAt.integerValue),
    } as Cert;
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
  for (const col of ["certifications", "images"]) {
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
async function openCerts(page: Page): Promise<void> {
  await nav(page).getByRole("button", { name: "Certifications", exact: true }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Certifications" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add certification", exact: true })).toBeVisible();
}
async function reopen(page: Page): Promise<void> {
  await page.reload();
  await expect(nav(page)).toBeVisible();
  await openCerts(page);
}
const ENTRIES = (page: Page) => page.getByRole("list", { name: "Certifications list" }).getByRole("listitem");
const rowFor = (page: Page, label: string) => ENTRIES(page).filter({ has: page.getByText(label, { exact: true }) });
const field = (page: Page, label: string) => page.getByLabel(label, { exact: true });
const EDITOR = (page: Page) => page.locator('section[aria-label="Certifications editor"]');
const GROUP = (page: Page) => page.getByRole("group", { name: "Confirm delete" });
const btn = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
const text = (page: Page, t: string) => page.getByText(t, { exact: true });
const inRow = (row: ReturnType<typeof rowFor>, name: string) => row.getByRole("button", { name, exact: true });
async function expectOrder(page: Page, names: string[]): Promise<void> {
  await expect(ENTRIES(page)).toHaveCount(names.length);
  for (let i = 0; i < names.length; i++) await expect(ENTRIES(page).nth(i)).toContainText(names[i]);
}

async function measureLayout(page: Page): Promise<{ scrollWidth: number; bad: string[] }> {
  return page.evaluate(() => {
    const root = document.querySelector('section[aria-label="Certifications editor"]');
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

test.describe("manage-certifications", () => {
  test.describe.configure({ mode: "serial", timeout: 60000 });

  test("E2E-01: the check trims and accepts a good certification", () => {
    const I = {
      name: " Professional Scrum Developer ",
      icon: " /certs/scrum.png ",
      url: " https://www.credly.com/badges/example/public_url ",
    };
    const first = checkCertification(I);
    expect(first).toEqual({
      ok: true,
      content: {
        name: "Professional Scrum Developer",
        icon: "/certs/scrum.png",
        url: "https://www.credly.com/badges/example/public_url",
      },
    });
    expect(I.name).toBe(" Professional Scrum Developer ");
    expect(I.icon).toBe(" /certs/scrum.png ");
    expect(I.url).toBe(" https://www.credly.com/badges/example/public_url ");

    const second = checkCertification({
      name: "Scrum",
      icon: "http://127.0.0.1:9199/v0/b/x/o/images%2Fa.png?alt=media&token=t",
      url: "https://example.com/c",
    });
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.content.icon).toBe("http://127.0.0.1:9199/v0/b/x/o/images%2Fa.png?alt=media&token=t");
    }

    const third = checkCertification({
      name: "Scrum",
      icon: " https://firebasestorage.googleapis.com/v0/b/x/o/images%2Fa.png?alt=media ",
      url: "https://example.com/c",
    });
    expect(third.ok).toBe(true);
    if (third.ok) {
      expect(third.content.icon).toBe("https://firebasestorage.googleapis.com/v0/b/x/o/images%2Fa.png?alt=media");
    }

    const fourth = checkCertification({ name: "Scrum", icon: "/certs/a.png", url: "HTTPS://Example.com/C" });
    expect(fourth.ok).toBe(true);
    if (fourth.ok) {
      expect(fourth.content.url).toBe("HTTPS://Example.com/C");
    }
  });

  test("E2E-02: the check refuses each bad field with its own message", () => {
    const B = { name: "Professional Scrum", icon: "/certs/scrum.png", url: "https://example.com/cred" };
    const results = [
      checkCertification({ ...B, name: "" }),
      checkCertification({ ...B, name: "   " }),
      checkCertification({ ...B, name: "\t\n" }),
      checkCertification({ ...B, url: "credly.com/badge" }),
      checkCertification({ ...B, url: "http://example.com/cred" }),
      checkCertification({ ...B, url: "" }),
      checkCertification({ ...B, url: "https://" }),
      checkCertification({ ...B, icon: "certs/scrum.png" }),
      checkCertification({ ...B, icon: "//cdn.example.com/a.png" }),
      checkCertification({ ...B, icon: "/" }),
      checkCertification({ ...B, icon: "ftp://x.test/a.png" }),
      checkCertification({ ...B, icon: "/certs/my badge.png" }),
      checkCertification({ ...B, icon: "" }),
      checkCertification({ ...B, icon: "   " }),
      checkCertification({ name: "", icon: "certs/x.png", url: "x" }),
      checkCertification({ ...B, name: "  Professional Scrum  " }),
    ];

    for (let i = 0; i < 3; i++) {
      expect(results[i].ok).toBe(false);
      expect((r => r.ok === false && r.errors)(results[i])).toEqual({ name: NAME_MSG });
    }
    for (let i = 3; i < 7; i++) {
      expect(results[i].ok).toBe(false);
      expect((r => r.ok === false && r.errors)(results[i])).toEqual({ url: URL_MSG });
    }
    for (let i = 7; i < 12; i++) {
      expect(results[i].ok).toBe(false);
      expect((r => r.ok === false && r.errors)(results[i])).toEqual({ icon: ICON_INVALID_MSG });
    }
    for (let i = 12; i < 14; i++) {
      expect(results[i].ok).toBe(false);
      expect((r => r.ok === false && r.errors)(results[i])).toEqual({ icon: ICON_REQUIRED_MSG });
    }
    expect(results[14].ok).toBe(false);
    expect(results[14].ok === false && results[14].errors).toEqual({
      name: NAME_MSG,
      icon: ICON_INVALID_MSG,
      url: URL_MSG,
    });
    expect(results[15]).toEqual({ ok: true, content: B });

    expect(CERT_MESSAGES.nameRequired).toBe(NAME_MSG);
    expect(CERT_MESSAGES.iconRequired).toBe(ICON_REQUIRED_MSG);
    expect(CERT_MESSAGES.iconInvalid).toBe(ICON_INVALID_MSG);
    expect(CERT_MESSAGES.urlInvalid).toBe(URL_MSG);
  });

  test("E2E-03: reading, writing and labelling stored certifications", () => {
    const a = certificationFromData({
      name: "Professional Scrum Developer",
      icon: "/certs/scrum.png",
      url: "https://www.credly.com/badges/example/public_url",
      position: 3,
      updatedAt: 5,
    });
    const blank = { name: "", icon: "", url: "" };

    expect(a).toEqual({
      name: "Professional Scrum Developer",
      icon: "/certs/scrum.png",
      url: "https://www.credly.com/badges/example/public_url",
    });
    expect(certificationFromData({})).toEqual(blank);
    expect(certificationFromData({ name: 5, icon: null, url: [] })).toEqual(blank);
    expect(certificationFromData({ name: "Only a name" })).toEqual({ ...blank, name: "Only a name" });
    expect(certificationFromData(null)).toEqual(blank);
    expect(certificationFromData("x")).toEqual(blank);

    const e1 = emptyCertification();
    const e2 = emptyCertification();
    expect(e1).toEqual(e2);
    expect(e1).not.toBe(e2);

    expect(Object.keys(certificationToData(a)).sort()).toEqual(["icon", "name", "url"]);
    expect(certificationToData(a)).toEqual({
      name: "Professional Scrum Developer",
      icon: "/certs/scrum.png",
      url: "https://www.credly.com/badges/example/public_url",
    });
    expect(certificationLabel(a)).toBe("Professional Scrum Developer");

    expect(CERT_MESSAGES.emptyList).toBe("No certifications yet.");
    expect(CERT_MESSAGES.listLabel).toBe("Certifications list");
    expect(CERT_MESSAGES.addLabel).toBe("Add certification");
    expect(CERT_MESSAGES.imagesFailed).toBe("The uploaded images could not be loaded.");
    expect(CERTIFICATIONS_COLLECTION).toBe("certifications");
  });

  test("E2E-04: adding a certification with an uploaded image saves and survives a reload", async ({ page }) => {
    await ownerSession(page);
    await seedImage("e2e-04", "scrum-badge.png");
    await openCerts(page);
    await expect(text(page, "No certifications yet.")).toBeVisible();
    await expect(page.getByRole("list", { name: "Certifications list" })).toHaveCount(0);
    await expect(btn(page, "Add certification")).toBeVisible();
    await expect(btn(page, "Add entry")).toHaveCount(0);
    expect(await readCerts()).toEqual([]);
    await btn(page, "Add certification").click();
    await expect(page.getByRole("heading", { level: 3, name: "Add entry" })).toBeVisible();
    await field(page, "Name").fill("Professional Scrum Developer");
    await field(page, "Uploaded image").selectOption({ label: "scrum-badge.png" });
    await expect(field(page, "Badge image path")).toHaveValue("");
    await expect(field(page, "Uploaded image")).toHaveValue("e2e-04");
    await field(page, "Credential link").fill("https://www.credly.com/badges/example/public_url");
    await btn(page, "Save").click();
    await expect(text(page, "Entry saved")).toBeVisible();
    await expect(page.getByRole("heading", { level: 3, name: "Add entry" })).toHaveCount(0);
    await expect(text(page, "No certifications yet.")).toHaveCount(0);
    await expect(ENTRIES(page)).toHaveCount(1);
    await expect(ENTRIES(page)).toContainText("Professional Scrum Developer");
    const got = await readCerts();
    expect(got).toHaveLength(1);
    expect(got[0].name).toBe("Professional Scrum Developer");
    expect(got[0].icon).toBe(IMGURL("e2e-04"));
    expect(got[0].url).toBe("https://www.credly.com/badges/example/public_url");
    expect(got[0].position).toBe(0);
    expect(got[0].updatedAt).toBeGreaterThan(BIG);
    await reopen(page);
    await inRow(ENTRIES(page), "Edit").click();
    await expect(page.getByRole("heading", { level: 3, name: "Edit entry" })).toBeVisible();
    await expect(field(page, "Name")).toHaveValue("Professional Scrum Developer");
    await expect(field(page, "Uploaded image")).toHaveValue("e2e-04");
    await expect(field(page, "Badge image path")).toHaveValue("");
    await expect(field(page, "Credential link")).toHaveValue("https://www.credly.com/badges/example/public_url");
  });

  test("E2E-05: adding a certification with a badge path saves and survives a reload", async ({ page }) => {
    await ownerSession(page);
    await seedImage("e2e-05", "scrum-badge.png");
    await openCerts(page);
    await btn(page, "Add certification").click();
    await field(page, "Name").fill("Professional Scrum Developer");
    await field(page, "Badge image path").fill("/certs/scrum.png");
    await expect(field(page, "Uploaded image")).toHaveValue("");
    await field(page, "Credential link").fill("https://www.credly.com/badges/example/public_url");
    await btn(page, "Save").click();
    await expect(text(page, "Entry saved")).toBeVisible();
    await expect(ENTRIES(page)).toHaveCount(1);
    await expect(ENTRIES(page)).toContainText("Professional Scrum Developer");
    const got = await readCerts();
    expect(got).toHaveLength(1);
    expect(got[0].name).toBe("Professional Scrum Developer");
    expect(got[0].icon).toBe("/certs/scrum.png");
    expect(got[0].url).toBe("https://www.credly.com/badges/example/public_url");
    expect(got[0].position).toBe(0);
    expect(got[0].updatedAt).toBeGreaterThan(BIG);
    await reopen(page);
    await inRow(ENTRIES(page), "Edit").click();
    await expect(field(page, "Name")).toHaveValue("Professional Scrum Developer");
    await expect(field(page, "Badge image path")).toHaveValue("/certs/scrum.png");
    await expect(field(page, "Uploaded image")).toHaveValue("");
    await expect(field(page, "Credential link")).toHaveValue("https://www.credly.com/badges/example/public_url");
  });

  test("E2E-06: a new certification goes to the bottom of the list", async ({ page }) => {
    await ownerSession(page);
    await seedCert(S);
    await seedCert(G);
    await openCerts(page);
    await btn(page, "Add certification").click();
    await field(page, "Name").fill("Professional Scrum Developer");
    await field(page, "Badge image path").fill("/certs/scrum-2.png");
    await field(page, "Credential link").fill("https://example.com/cred");
    await btn(page, "Save").click();
    await expect(text(page, "Entry saved")).toBeVisible();
    const order = ["Professional Scrum Developer", "Google IT Automation with Python", "Professional Scrum Developer"];
    await expectOrder(page, order);
    await expect(EDITOR(page).getByRole("alert")).toHaveCount(0);
    await expect(inRow(ENTRIES(page).first(), "Move up")).toHaveCount(0);
    await expect(inRow(ENTRIES(page).last(), "Move down")).toHaveCount(0);
    const got = await readCerts();
    expect(got).toHaveLength(3);
    expect(got.slice(0, 2).map((c) => c.id)).toEqual(["e2e-s", "e2e-g"]);
    expect(got[2].name).toBe("Professional Scrum Developer");
    expect(got[2].icon).toBe("/certs/scrum-2.png");
    expect(got[2].url).toBe("https://example.com/cred");
    expect(got[2].position).toBe(2);
    expect(got[2].updatedAt).toBeGreaterThan(BIG);
    expect(core(got[0])).toEqual(core(S));
    expect(core(got[1])).toEqual(core(G));
    await reopen(page);
    await expectOrder(page, order);
  });

  test("E2E-07: editing a certification keeps its place and survives a reload", async ({ page }) => {
    await ownerSession(page);
    await seedCert(S);
    await seedCert(at(B, 1));
    await openCerts(page);
    await inRow(rowFor(page, "Certified Blockchain Developer"), "Edit").click();
    await expect(page.getByRole("heading", { level: 3, name: "Edit entry" })).toBeVisible();
    await expect(field(page, "Name")).toHaveValue("Certified Blockchain Developer");
    await expect(field(page, "Badge image path")).toHaveValue("/certs/blockchain.png");
    await expect(field(page, "Uploaded image")).toHaveValue("");
    await expect(field(page, "Credential link")).toHaveValue("https://www.blockchain-council.org/certificate/example");
    await field(page, "Name").fill("Certified Blockchain Developer (2026)");
    await btn(page, "Save").click();
    await expect(text(page, "Entry saved")).toBeVisible();
    const order = ["Professional Scrum Developer", "Certified Blockchain Developer (2026)"];
    await expectOrder(page, order);
    await expect(text(page, "Certified Blockchain Developer")).toHaveCount(0);
    const got = await readCerts();
    const b = got.find((c) => c.id === "e2e-b");
    const s = got.find((c) => c.id === "e2e-s");
    expect(b).toBeDefined();
    expect(s).toBeDefined();
    expect(b!.updatedAt).toBeGreaterThan(BIG);
    expect(core(b!)).toEqual({ ...core(at(B, 1)), name: "Certified Blockchain Developer (2026)" });
    expect(core(s!)).toEqual(core(S));
    await reopen(page);
    await expectOrder(page, order);
    await expect(text(page, "Certified Blockchain Developer")).toHaveCount(0);
  });

  test("E2E-08: moving a certification up saves the new order", async ({ page }) => {
    await ownerSession(page);
    await seedCert(S);
    await seedCert(G);
    await seedCert(B);
    await openCerts(page);
    await expectOrder(page, [S.name, G.name, B.name]);
    await expect(inRow(rowFor(page, S.name), "Move up")).toHaveCount(0);
    await expect(inRow(rowFor(page, S.name), "Move down")).toHaveCount(1);
    await expect(inRow(rowFor(page, B.name), "Move down")).toHaveCount(0);
    await expect(inRow(rowFor(page, B.name), "Move up")).toHaveCount(1);
    await expect(inRow(rowFor(page, G.name), "Move up")).toHaveCount(1);
    await expect(inRow(rowFor(page, G.name), "Move down")).toHaveCount(1);
    await inRow(rowFor(page, B.name), "Move up").click();
    await expectOrder(page, [S.name, B.name, G.name]);
    await expect(text(page, "Order saved")).toBeVisible();
    const got = await readCerts();
    expect(got.map((c) => c.id)).toEqual(["e2e-s", "e2e-b", "e2e-g"]);
    expect(got.map((c) => c.position)).toEqual([0, 1, 2]);
    const fx = [S, B, G];
    got.forEach((c, i) => expect(core(c)).toEqual({ ...core(fx[i]), position: i }));
    await reopen(page);
    await expectOrder(page, [S.name, B.name, G.name]);
  });

  test("E2E-09: deleting a certification asks first and removes it for good", async ({ page }) => {
    await ownerSession(page);
    await seedCert(S);
    await seedCert(G);
    await openCerts(page);
    await inRow(rowFor(page, G.name), "Delete").click();
    await expect(rowFor(page, G.name).getByRole("group", { name: "Confirm delete" })).toContainText(`Delete "${G.name}"? This cannot be undone.`);
    await expect(ENTRIES(page)).toHaveCount(2);
    expect((await readCerts()).map((c) => c.id)).toEqual(["e2e-s", "e2e-g"]);
    await GROUP(page).getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(text(page, "Entry deleted")).toBeVisible();
    await expect(GROUP(page)).toHaveCount(0);
    await expect(ENTRIES(page)).toHaveCount(1);
    await expect(ENTRIES(page)).toContainText(S.name);
    await expect(text(page, G.name)).toHaveCount(0);
    const got = await readCerts();
    expect(got.map((c) => c.id)).toEqual(["e2e-s"]);
    expect(core(got[0])).toEqual(core(S));
    await reopen(page);
    await expect(ENTRIES(page)).toHaveCount(1);
    await expect(ENTRIES(page)).toContainText(S.name);
    await expect(text(page, G.name)).toHaveCount(0);
  });

  test("E2E-10: cancelling a delete keeps the certification", async ({ page }) => {
    await ownerSession(page);
    await seedCert(S);
    await seedCert(G);
    await openCerts(page);
    await inRow(rowFor(page, G.name), "Delete").click();
    await GROUP(page).getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(GROUP(page)).toHaveCount(0);
    await expectOrder(page, [S.name, G.name]);
    await expect(inRow(rowFor(page, G.name), "Delete")).toBeEnabled();
    await expect(text(page, "Entry deleted")).toHaveCount(0);
    const got = await readCerts();
    expect(got.map((c) => c.id)).toEqual(["e2e-s", "e2e-g"]);
    expect(core(got[0])).toEqual(core(S));
    expect(core(got[1])).toEqual(core(G));
    await reopen(page);
    await expectOrder(page, [S.name, G.name]);
    expect((await readCerts()).map((c) => c.id)).toEqual(["e2e-s", "e2e-g"]);
  });

  test("E2E-11: a bad name, link or badge is refused with its own message and nothing is saved", async ({ page }) => {
    await ownerSession(page);
    await openCerts(page);
    await btn(page, "Add certification").click();
    const addHeading = page.getByRole("heading", { level: 3, name: "Add entry" });
    const nameF = field(page, "Name");
    const pathF = field(page, "Badge image path");
    const linkF = field(page, "Credential link");

    await nameF.fill("");
    await pathF.fill("/certs/scrum.png");
    await linkF.fill("https://example.com/cred");
    await btn(page, "Save").click();
    await expect(nameF).toHaveAccessibleDescription("Enter a name");
    await expect(pathF).toHaveAccessibleDescription("");
    await expect(linkF).toHaveAccessibleDescription("");
    await expect(pathF).toHaveValue("/certs/scrum.png");
    await expect(linkF).toHaveValue("https://example.com/cred");
    await expect(addHeading).toBeVisible();
    await expect(text(page, "Entry saved")).toHaveCount(0);
    expect(await readCerts()).toEqual([]);

    await nameF.fill("Professional Scrum");
    await pathF.fill("/certs/scrum.png");
    await linkF.fill("credly.com/badge");
    await btn(page, "Save").click();
    await expect(linkF).toHaveAccessibleDescription("Enter a link that starts with https://");
    await expect(nameF).toHaveAccessibleDescription("");
    await expect(pathF).toHaveAccessibleDescription("");
    await expect(nameF).toHaveValue("Professional Scrum");
    await expect(pathF).toHaveValue("/certs/scrum.png");
    await expect(linkF).toHaveValue("credly.com/badge");
    await expect(addHeading).toBeVisible();
    await expect(text(page, "Entry saved")).toHaveCount(0);
    expect(await readCerts()).toEqual([]);

    await nameF.fill("Professional Scrum");
    await pathF.fill("certs/scrum.png");
    await linkF.fill("https://example.com/cred");
    await btn(page, "Save").click();
    await expect(pathF).toHaveAccessibleDescription("Enter a badge image path that starts with /");
    await expect(nameF).toHaveAccessibleDescription("");
    await expect(linkF).toHaveAccessibleDescription("");
    await expect(nameF).toHaveValue("Professional Scrum");
    await expect(pathF).toHaveValue("certs/scrum.png");
    await expect(linkF).toHaveValue("https://example.com/cred");
    await expect(addHeading).toBeVisible();
    await expect(text(page, "Entry saved")).toHaveCount(0);
    expect(await readCerts()).toEqual([]);

    await btn(page, "Cancel").click();
    await expect(text(page, "No certifications yet.")).toBeVisible();
    await expect(page.getByRole("list", { name: "Certifications list" })).toHaveCount(0);
  });

  test("E2E-12: choosing an image and typing a path replace each other", async ({ page }) => {
    await ownerSession(page);
    await seedCert({ id: "e2e-c1", name: "Professional Scrum Developer", icon: "/certs/old.png", url: "https://www.credly.com/badges/example/public_url", position: 0, updatedAt: 1 });
    await seedImage("e2e-12", "scrum-badge.png");
    await openCerts(page);
    await inRow(ENTRIES(page), "Edit").click();
    await expect(field(page, "Badge image path")).toHaveValue("/certs/old.png");
    await expect(field(page, "Uploaded image")).toHaveValue("");
    await field(page, "Uploaded image").selectOption({ label: "scrum-badge.png" });
    await expect(field(page, "Badge image path")).toHaveValue("");
    await expect(field(page, "Uploaded image")).toHaveValue("e2e-12");
    await field(page, "Badge image path").fill("/certs/new.png");
    await expect(field(page, "Uploaded image")).toHaveValue("");
    await expect(field(page, "Badge image path")).toHaveValue("/certs/new.png");
    await field(page, "Uploaded image").selectOption({ label: "scrum-badge.png" });
    await expect(field(page, "Badge image path")).toHaveValue("");
    await btn(page, "Save").click();
    await expect(text(page, "Entry saved")).toBeVisible();
    const got = await readCerts();
    expect(got).toHaveLength(1);
    expect(got[0].icon).toBe(IMGURL("e2e-12"));
    expect(got[0].name).toBe("Professional Scrum Developer");
    expect(got[0].url).toBe("https://www.credly.com/badges/example/public_url");
    await reopen(page);
    await inRow(ENTRIES(page), "Edit").click();
    await expect(field(page, "Uploaded image")).toHaveValue("e2e-12");
    await expect(field(page, "Badge image path")).toHaveValue("");
  });

  test("E2E-13: a failed image list still lets a typed path be saved", async ({ page }) => {
    await ownerSession(page);
    await seedCert({ id: "e2e-c2", name: "Professional Scrum Developer", icon: "https://example.com/gone.png", url: "https://example.com/cred", position: 0, updatedAt: 1 });
    await openCerts(page);
    await inRow(ENTRIES(page), "Edit").click();
    await expect(field(page, "Badge image path")).toHaveValue("https://example.com/gone.png");
    await expect(field(page, "Uploaded image")).toHaveValue("");
    await expect(field(page, "Uploaded image").locator("option")).toHaveText(["None"]);
    await expect(text(page, "The uploaded images could not be loaded.")).toHaveCount(0);
    await field(page, "Name").fill("Professional Scrum Developer 2");
    await btn(page, "Save").click();
    await expect(text(page, "Entry saved")).toBeVisible();
    const got = await readCerts();
    expect(got).toHaveLength(1);
    expect(got[0].icon).toBe("https://example.com/gone.png");
    expect(got[0].name).toBe("Professional Scrum Developer 2");
    expect(got[0].url).toBe("https://example.com/cred");
    await seedImage("e2e-13", "scrum-badge.png");
    await RF(null);
    await reopen(page);
    await inRow(ENTRIES(page), "Edit").click();
    await expect(text(page, "The uploaded images could not be loaded.")).toBeVisible();
    await expect(field(page, "Badge image path")).toHaveValue("https://example.com/gone.png");
    await expect(field(page, "Uploaded image").locator("option")).toHaveText(["None"]);
  });

  test("E2E-14: long names, paths and options stay within a 375 pixel screen", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await ownerSession(page);
    const rep = (ch: string) => ch.repeat(80);
    const L1: Cert = { id: "e2e-l1", name: rep("A"), icon: "/certs/" + "a".repeat(70) + ".png", url: "https://example.com/" + "u".repeat(70), position: 0, updatedAt: 1 };
    const L2: Cert = { id: "e2e-l2", name: rep("B"), icon: "/certs/b.png", url: "https://example.com/b", position: 1, updatedAt: 1 };
    const L3: Cert = { id: "e2e-l3", name: rep("C"), icon: "/certs/c.png", url: "https://example.com/c", position: 2, updatedAt: 1 };
    await seedCert(L1);
    await seedCert(L2);
    await seedCert(L3);
    await seedImage("e2e-14", "I".repeat(80) + ".png");
    await openCerts(page);
    const check = async () => {
      const m = await measureLayout(page);
      expect(m.scrollWidth).toBeLessThanOrEqual(375);
      expect(m.bad).toEqual([]);
    };
    const row1 = rowFor(page, L1.name);
    for (const b of ["Edit", "Delete", "Move down"]) await expect(inRow(row1, b)).toBeVisible();
    await check();
    await inRow(row1, "Move down").click();
    await expect(text(page, "Order saved")).toBeVisible();
    await expectOrder(page, [L2.name, L1.name, L3.name]);
    await check();
    const box = await ENTRIES(page).first().getByText(L2.name, { exact: true }).boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x + box!.width).toBeLessThanOrEqual(375);
    await inRow(rowFor(page, L3.name), "Edit").click();
    await expect(page.getByRole("heading", { level: 3, name: "Edit entry" })).toBeVisible();
    await expect(field(page, "Name")).toHaveValue(L3.name);
    await check();
    await field(page, "Name").fill(rep("E"));
    await expect(btn(page, "Save")).toBeVisible();
    await btn(page, "Save").click();
    await expectOrder(page, [L2.name, L1.name, rep("E")]);
    await check();
    await inRow(rowFor(page, L2.name), "Delete").click();
    await check();
    await expect(GROUP(page).getByRole("button", { name: "Confirm", exact: true })).toBeVisible();
    await expect(GROUP(page).getByRole("button", { name: "Cancel", exact: true })).toBeVisible();
    await GROUP(page).getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(text(page, "Entry deleted")).toBeVisible();
    await expectOrder(page, [L1.name, rep("E")]);
    const before = await readCerts();
    await btn(page, "Add certification").click();
    await field(page, "Name").fill(rep("N"));
    await field(page, "Badge image path").fill("/certs/" + "n".repeat(70) + ".png");
    await field(page, "Credential link").fill("https://example.com/" + "n".repeat(70));
    await check();
    await btn(page, "Save").click();
    await expectOrder(page, [L1.name, rep("E"), rep("N")]);
    await check();
    await expect(btn(page, "Add certification")).toBeVisible();
    const got = await readCerts();
    expect(got).toHaveLength(3);
    expect(got[2].name).toBe(rep("N"));
    expect(got[2].position).toBeGreaterThan(before[before.length - 1].position);
  });

  test("E2E-15: the menu shows the Certifications editor for Certifications and placeholders for the rest", async ({ page }) => {
    await ownerSession(page);
    const MENU = ["Profile", "Experience", "Projects", "Certifications", "Tech stack", "Blog posts", "Images"];
    const h2 = page.getByRole("heading", { level: 2, name: "Certifications" });
    await nav(page).getByRole("button", { name: "Tech stack", exact: true }).click();
    await expect(page.getByRole("heading", { level: 2, name: "Tech stack" })).toBeVisible();
    await expect(h2).toHaveCount(0);
    await expect(EDITOR(page)).toHaveCount(0);
    await expect(nav(page).getByRole("button")).toHaveText(MENU);
    await nav(page).getByRole("button", { name: "Certifications", exact: true }).click();
    await expect(h2).toBeVisible();
    await expect(btn(page, "Add certification")).toBeVisible();
    await expect(EDITOR(page)).toHaveCount(1);
    await expect(text(page, "Tech stack editor is not available yet.")).toHaveCount(0);
    await expect(nav(page).getByRole("button")).toHaveText(MENU);
    await nav(page).getByRole("button", { name: "Projects", exact: true }).click();
    await expect(page.getByRole("heading", { level: 2, name: "Projects" })).toBeVisible();
    await expect(h2).toHaveCount(0);
    await expect(EDITOR(page)).toHaveCount(0);
    await expect(nav(page).getByRole("button")).toHaveText(MENU);
    await nav(page).getByRole("button", { name: "Blog posts", exact: true }).click();
    await expect(page.getByRole("heading", { level: 2, name: "Blog posts" })).toBeVisible();
    await expect(h2).toHaveCount(0);
    await expect(nav(page).getByRole("button")).toHaveText(MENU);
    await nav(page).getByRole("button", { name: "Experience", exact: true }).click();
    await expect(page.getByRole("heading", { level: 2, name: "Experience" })).toBeVisible();
    await expect(text(page, "Blog posts editor is not available yet.")).toHaveCount(0);
    await expect(nav(page).getByRole("button")).toHaveText(MENU);
  });

  test("E2E-16: the changed files keep to the house rules", () => {
    const F = [
      "src/app/components/admin/ListEditor.tsx",
      "src/app/components/admin/CertificationsEditor.tsx",
      "src/lib/admin/certifications.ts",
      "src/lib/firebase/certifications.ts",
    ];
    const banned = [/#[0-9a-fA-F]{3,8}\b/, /\brgba?\(/, /\bhsla?\(/, /dark:/, /console\./, /<img/, /@\/lib\/blog/, /dangerouslySetInnerHTML/, /process\.env/, /email/i, new RegExp("eslint" + "-disable"), new RegExp("@ts" + "-ignore"), new RegExp("@ts" + "-nocheck")];
    const words = ["firebase/auth", "getFirebaseAuth", "currentUser", "displayName", "photoURL", "watchAuth", "signInWithGoogle", "signOutUser", "onAuthStateChanged", "getAuth", "providerData", "getIdToken", "accessToken"];
    for (const f of F) {
      const t = repoText(f);
      for (const re of banned) expect(t, `${f} matches ${re}`).not.toMatch(re);
      for (const w of words) expect(t, `${f} has ${w}`).not.toContain(w);
    }
    for (const f of F.slice(1)) {
      const t = repoText(f);
      for (const w of ["Add entry", "Move up", "Move down", "Confirm delete", "Delete"]) expect(t, `${f} has ${w}`).not.toContain(w);
    }
    const le = repoText("src/app/components/admin/ListEditor.tsx");
    for (const w of ["addLabel", "emptyText", "listLabel", "newPosition", "Add entry", "Move up", "Move down", "Confirm delete"]) expect(le, `ListEditor has ${w}`).toContain(w);
    const ce = repoText("src/app/components/admin/CertificationsEditor.tsx");
    for (const w of ["bottomPosition", "listImages", "photoSelection", "savingOn"]) expect(ce, `CertificationsEditor has ${w}`).toContain(w);
    expect(ce).not.toContain("firebase/firestore");
    expect(repoText("src/lib/admin/certifications.ts")).not.toContain("firebase");
    expect(repoText("src/lib/firebase/certifications.ts")).toContain("createListStore");
  });

  test("E2E-17: public pages never carry the certifications editor and the panel does", async ({ browser }) => {
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
      for (const s of ["No certifications yet.", "firestore.googleapis.com", "thegoldenpothos-5b3a1"]) expect(t, `${path} contains ${s}`).not.toContain(s);
    }
    expect(await visit(PANEL)).toContain("No certifications yet.");
  });
});
