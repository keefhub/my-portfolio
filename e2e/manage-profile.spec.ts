import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checkProfile, emptyProfile, photoSelection, profileFromData } from "../src/lib/admin/profile";

const B = { name: "Keith", headline: "Engineer", about: [] as string[], photo: "", email: "", resumeLink: "", socialLinks: [] as { label: string; url: string }[] };
const EMPTY = { name: "", headline: "", about: [], photo: "", email: "", resumeLink: "", socialLinks: [] };
const LINK_MSG = "Enter a full web address starting with https://";

const FIRESTORE = "http://127.0.0.1:8080";
const PROJECT = "thegoldenpothos-5b3a1";
const DOCS = `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents`;
const PANEL = "/bright-warm-greenhouse/";
const PLACEHOLDER = "REPLACE_WITH_OWNER_UID";
const ADMIN = { Authorization: "Bearer owner", "Content-Type": "application/json" };
const repoText = (name: string) => readFileSync(join(process.cwd(), name), "utf8");

type Link = { label: string; url: string };
type Profile = { name: string; headline: string; about: string[]; photo: string; email: string; resumeLink: string; socialLinks: Link[]; updatedAt: number };

const FULL: Profile = {
  name: "Keith Lim",
  headline: "Software Engineer",
  about: ["First paragraph.", "Second paragraph."],
  photo: "/images/old.jpg",
  email: "keith@example.com",
  resumeLink: "/resume.pdf",
  socialLinks: [
    { label: "GitHub", url: "https://github.com/keefhub" },
    { label: "LinkedIn", url: "https://linkedin.com/in/keefhub" },
  ],
  updatedAt: 1,
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
async function RD(): Promise<void> {
  await putRules("rules_version = '2'; service cloud.firestore { match /databases/{database}/documents { match /{document=**} { allow read, write: if false; } } }");
}

const str = (v: string) => ({ stringValue: v });
function encode(p: Profile) {
  return {
    name: str(p.name),
    headline: str(p.headline),
    photo: str(p.photo),
    email: str(p.email),
    resumeLink: str(p.resumeLink),
    about: { arrayValue: p.about.length ? { values: p.about.map(str) } : {} },
    socialLinks: {
      arrayValue: p.socialLinks.length
        ? { values: p.socialLinks.map((l) => ({ mapValue: { fields: { label: str(l.label), url: str(l.url) } } })) }
        : {},
    },
    updatedAt: { integerValue: String(p.updatedAt) },
  };
}
async function seedProfile(p: Profile): Promise<void> {
  const res = await fetch(`${DOCS}/profile/main`, { method: "PATCH", headers: ADMIN, body: JSON.stringify({ fields: encode(p) }) });
  expect(res.status).toBe(200);
}
async function readProfile(): Promise<Profile | null> {
  const res = await fetch(`${DOCS}/profile/main`, { headers: ADMIN });
  if (res.status === 404) return null;
  const f = ((await res.json()) as any).fields;
  return {
    name: f.name.stringValue,
    headline: f.headline.stringValue,
    photo: f.photo.stringValue,
    email: f.email.stringValue,
    resumeLink: f.resumeLink.stringValue,
    about: (f.about.arrayValue.values ?? []).map((v: any) => v.stringValue),
    socialLinks: (f.socialLinks.arrayValue.values ?? []).map((v: any) => ({ label: v.mapValue.fields.label.stringValue, url: v.mapValue.fields.url.stringValue })),
    updatedAt: Number(f.updatedAt.integerValue),
  };
}
const IMGURL = (id: string) => `http://127.0.0.1:9199/v0/b/thegoldenpothos-5b3a1.firebasestorage.app/o/images%2F${id}.png?alt=media&token=t`;
async function seedImage(id: string, name: string): Promise<void> {
  const fields = { name: str(name), storagePath: str(`images/${id}.png`), url: str(IMGURL(id)), contentType: str("image/png"), size: { integerValue: "1000" }, createdAt: { integerValue: "1" } };
  const res = await fetch(`${DOCS}/images/${id}`, { method: "PATCH", headers: ADMIN, body: JSON.stringify({ fields }) });
  expect(res.status).toBe(200);
}
async function clearAll(): Promise<void> {
  const res = await fetch(`${DOCS}/images?pageSize=300`, { headers: ADMIN });
  const body = (await res.json()) as { documents?: { name: string }[] };
  for (const d of body.documents ?? []) await fetch(`${FIRESTORE}/v1/${d.name}`, { method: "DELETE", headers: ADMIN });
  await fetch(`${DOCS}/profile/main`, { method: "DELETE", headers: ADMIN });
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
const saveBtn = (page: Page) => page.getByRole("button", { name: "Save", exact: true });
async function openProfile(page: Page): Promise<void> {
  await nav(page).getByRole("button", { name: "Profile", exact: true }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Profile" })).toBeVisible();
  await expect(saveBtn(page)).toBeVisible();
}
const field = (page: Page, label: string) => page.getByLabel(label, { exact: true });
const PARAS = (page: Page) => page.getByRole("textbox", { name: /^About paragraph \d+$/ });
const LABELS = (page: Page) => page.getByRole("textbox", { name: /^Social link \d+ label$/ });
const ADDRS = (page: Page) => page.getByRole("textbox", { name: /^Social link \d+ address$/ });
const save = (page: Page) => saveBtn(page).click();
const saved = (page: Page) => page.getByText("Profile saved", { exact: true });
const NOTICE = (page: Page) => page.getByText("Saving is not switched on yet.", { exact: true });
async function reopen(page: Page): Promise<void> {
  await page.reload();
  await expect(nav(page)).toBeVisible();
  await openProfile(page);
}
const BIG = 1000000000000;
const UNSAVED = "Typed name kept";

test.describe("manage-profile", () => {
  test.describe.configure({ mode: "serial", timeout: 60000 });

  test("E2E-01: checkProfile trims, drops blank rows and keeps order", () => {
    const result = checkProfile({
      name: "  Keith Lim  ",
      headline: "Engineer",
      about: ["  First  ", "   ", "Second"],
      photo: " /images/keith.jpg ",
      email: " a@b.c ",
      resumeLink: " https://example.com/cv.pdf ",
      socialLinks: [
        { label: " GitHub ", url: " https://github.com/keefhub " },
        { label: "", url: "" },
        { label: "  ", url: "  " },
      ],
    });
    expect(result).toEqual({
      ok: true,
      content: {
        name: "Keith Lim",
        headline: "Engineer",
        about: ["First", "Second"],
        photo: "/images/keith.jpg",
        email: "a@b.c",
        resumeLink: "https://example.com/cv.pdf",
        socialLinks: [{ label: "GitHub", url: "https://github.com/keefhub" }],
      },
    });
  });

  test("E2E-02: name and headline are required", () => {
    const r1 = checkProfile({ ...B, name: "   " });
    expect(r1.ok).toBe(false);
    if (!r1.ok) {
      expect(r1.errors.name).toBe("Name is required");
      expect(r1.errors.headline).toBeUndefined();
      expect(r1.errors.email).toBeUndefined();
      expect(r1.errors.resumeLink).toBeUndefined();
    }
    const r2 = checkProfile({ ...B, headline: "" });
    expect(r2.ok).toBe(false);
    if (!r2.ok) {
      expect(r2.errors.headline).toBe("Headline is required");
      expect(r2.errors.name).toBeUndefined();
      expect(r2.errors.email).toBeUndefined();
      expect(r2.errors.resumeLink).toBeUndefined();
    }
    const r3 = checkProfile({ ...B, name: "\t", headline: "  " });
    expect(r3.ok).toBe(false);
    if (!r3.ok) {
      expect(r3.errors.name).toBe("Name is required");
      expect(r3.errors.headline).toBe("Headline is required");
      expect(r3.errors.email).toBeUndefined();
      expect(r3.errors.resumeLink).toBeUndefined();
    }
    const r4 = checkProfile(B);
    expect(r4.ok).toBe(true);
    if (r4.ok) expect(r4.content).toEqual(B);
  });

  test("E2E-03: email must look like an address when given", () => {
    for (const email of ["keith-at-example", "a@b", "a b@c.de", "@b.cd"]) {
      const r = checkProfile({ ...B, email });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.errors.email).toBe("Enter an email address like name@site.com");
        expect(r.errors.name).toBeUndefined();
        expect(r.errors.headline).toBeUndefined();
        expect(r.errors.resumeLink).toBeUndefined();
      }
    }
    const good: [string, string][] = [["a@b.c", "a@b.c"], ["name@site.com", "name@site.com"], ["", ""], ["  a@b.c  ", "a@b.c"]];
    for (const [email, expected] of good) {
      const r = checkProfile({ ...B, email });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.content.email).toBe(expected);
    }
  });

  test("E2E-04: resume link must be a web address or a path", () => {
    for (const resumeLink of ["resume please", "github.com/cv", "ftp://example.com/cv", "https://", "//example.com/cv"]) {
      const r = checkProfile({ ...B, resumeLink });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.errors.resumeLink).toBe("Enter a web address or a path starting with /");
        expect(r.errors.name).toBeUndefined();
        expect(r.errors.headline).toBeUndefined();
        expect(r.errors.email).toBeUndefined();
      }
    }
    const good: [string, string][] = [
      ["/resume.pdf", "/resume.pdf"],
      ["/", "/"],
      ["https://example.com/cv.pdf", "https://example.com/cv.pdf"],
      ["http://example.com/cv.pdf", "http://example.com/cv.pdf"],
      ["", ""],
      ["  /resume.pdf  ", "/resume.pdf"],
    ];
    for (const [resumeLink, expected] of good) {
      const r = checkProfile({ ...B, resumeLink });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.content.resumeLink).toBe(expected);
    }
  });

  test("E2E-05: social links need an https address unless blank", () => {
    const bad: { label: string; url: string }[][] = [
      [{ label: "GitHub", url: "github.com/keefhub" }],
      [{ label: "X", url: "http://example.com" }],
      [{ label: "X", url: "https://" }],
      [{ label: "X", url: "HTTPS://example.com" }],
      [{ label: "X", url: "" }],
    ];
    for (const socialLinks of bad) {
      const r = checkProfile({ ...B, socialLinks });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors.socialLinks).toEqual([LINK_MSG]);
    }
    const f = [{ label: "Mastodon", url: "https://example.social/@keith" }];
    const rf = checkProfile({ ...B, socialLinks: f });
    expect(rf.ok).toBe(true);
    if (rf.ok) expect(rf.content.socialLinks).toEqual(f);

    const rg = checkProfile({ ...B, socialLinks: [{ label: "", url: "https://example.com" }] });
    expect(rg.ok).toBe(true);
    if (rg.ok) expect(rg.content.socialLinks).toEqual([{ label: "", url: "https://example.com" }]);

    const rh = checkProfile({ ...B, socialLinks: [{ label: "", url: "" }] });
    expect(rh.ok).toBe(true);
    if (rh.ok) expect(rh.content.socialLinks).toEqual([]);

    const ri = checkProfile({
      ...B,
      socialLinks: [{ label: "A", url: "https://a.test" }, { label: "B", url: "nope" }, { label: "", url: "" }],
    });
    expect(ri.ok).toBe(false);
    if (!ri.ok) {
      expect(ri.errors.socialLinks).toHaveLength(3);
      expect(ri.errors.socialLinks[0]).toBeUndefined();
      expect(ri.errors.socialLinks[1]).toBe(LINK_MSG);
      expect(ri.errors.socialLinks[2]).toBeUndefined();
    }
  });

  test("E2E-06: profileFromData reads a stored record tolerantly", () => {
    expect(
      profileFromData({
        name: "Keith Lim",
        headline: "Engineer",
        about: ["One", "Two"],
        photo: "/images/keith.jpg",
        email: "a@b.c",
        resumeLink: "/resume.pdf",
        socialLinks: [{ label: "GitHub", url: "https://github.com/keefhub" }],
        updatedAt: 5,
      }),
    ).toEqual({
      name: "Keith Lim",
      headline: "Engineer",
      about: ["One", "Two"],
      photo: "/images/keith.jpg",
      email: "a@b.c",
      resumeLink: "/resume.pdf",
      socialLinks: [{ label: "GitHub", url: "https://github.com/keefhub" }],
    });
    expect(profileFromData({})).toEqual(EMPTY);
    expect(
      profileFromData({
        name: 5,
        headline: null,
        about: "text",
        photo: 7,
        email: {},
        resumeLink: [],
        socialLinks: [{ label: "a" }, "bad", null, { label: "L", url: "https://x.test" }],
      }),
    ).toEqual({ ...EMPTY, socialLinks: [{ label: "a", url: "" }, { label: "L", url: "https://x.test" }] });
    expect(profileFromData({ about: [1, "ok", null] })).toEqual({ ...EMPTY, about: ["ok"] });
    expect(profileFromData(null)).toEqual(EMPTY);
    expect(profileFromData("x")).toEqual(EMPTY);

    const first = emptyProfile();
    const second = emptyProfile();
    first.about.push("z");
    expect(second.about).toHaveLength(0);
  });

  test("E2E-07: photoSelection matches a stored photo to an uploaded image", () => {
    const I = [
      { id: "i1", url: "https://x.test/1.png" },
      { id: "i2", url: "https://x.test/2.png" },
    ];
    expect(photoSelection("https://x.test/2.png", I)).toEqual({ imageId: "i2", path: "" });
    expect(photoSelection("/images/keith.jpg", I)).toEqual({ imageId: "", path: "/images/keith.jpg" });
    expect(photoSelection("https://x.test/gone.png", I)).toEqual({ imageId: "", path: "https://x.test/gone.png" });
    expect(photoSelection("", I)).toEqual({ imageId: "", path: "" });
    expect(photoSelection("https://x.test/1.png", [])).toEqual({ imageId: "", path: "https://x.test/1.png" });
  });
  test("E2E-08: a first visit shows an empty form", async ({ page }) => {
    await ownerSession(page);
    await openProfile(page);
    for (const l of ["Name", "Headline", "Email", "Resume link", "Photo path"]) await expect(field(page, l)).toHaveValue("");
    await expect(field(page, "Uploaded image")).toHaveValue("");
    await expect(field(page, "Uploaded image").locator("option")).toHaveText(["None"]);
    await expect(PARAS(page)).toHaveCount(0);
    await expect(LABELS(page)).toHaveCount(0);
    await expect(ADDRS(page)).toHaveCount(0);
    await expect(page.getByText("No profile has been saved yet.")).toBeVisible();
    await expect(saveBtn(page)).toBeVisible();
    await expect(NOTICE(page)).toHaveCount(0);
    expect(await readProfile()).toBeNull();
  });

  test("E2E-09: editing the stored profile saves and survives a reload", async ({ page }) => {
    await ownerSession(page);
    await seedProfile(FULL);
    await seedImage("e2e-09", "keith.png");
    await openProfile(page);
    await field(page, "Name").fill("Keith Lee");
    await field(page, "Headline").fill("Senior Engineer");
    await field(page, "Email").fill("keith.lee@example.org");
    await field(page, "Resume link").fill("https://example.com/keith-cv.pdf");
    await PARAS(page).first().fill("Updated first paragraph.");
    await field(page, "Uploaded image").selectOption({ label: "keith.png" });
    await save(page);
    await expect(saved(page)).toBeVisible();
    const got = await readProfile();
    expect(got).toMatchObject({ ...FULL, updatedAt: got!.updatedAt, name: "Keith Lee", headline: "Senior Engineer", email: "keith.lee@example.org", resumeLink: "https://example.com/keith-cv.pdf", about: ["Updated first paragraph.", "Second paragraph."], photo: IMGURL("e2e-09") });
    expect(got!.updatedAt).toBeGreaterThan(BIG);
    await reopen(page);
    await expect(field(page, "Name")).toHaveValue("Keith Lee");
    await expect(field(page, "Headline")).toHaveValue("Senior Engineer");
    await expect(field(page, "Email")).toHaveValue("keith.lee@example.org");
    await expect(field(page, "Resume link")).toHaveValue("https://example.com/keith-cv.pdf");
    await expect(PARAS(page).nth(0)).toHaveValue("Updated first paragraph.");
    await expect(PARAS(page).nth(1)).toHaveValue("Second paragraph.");
    await expect(field(page, "Uploaded image")).toHaveValue("e2e-09");
    await expect(field(page, "Photo path")).toHaveValue("");
  });

  test("E2E-10: typing a photo path unpicks the uploaded image", async ({ page }) => {
    await ownerSession(page);
    await seedProfile({ ...FULL, photo: IMGURL("e2e-10") });
    await seedImage("e2e-10", "keith.png");
    await openProfile(page);
    await expect(field(page, "Uploaded image")).toHaveValue("e2e-10");
    await expect(field(page, "Photo path")).toHaveValue("");
    await field(page, "Photo path").fill("/images/keith.jpg");
    await expect(field(page, "Uploaded image")).toHaveValue("");
    await save(page);
    await expect(saved(page)).toBeVisible();
    expect((await readProfile())!.photo).toBe("/images/keith.jpg");
    await reopen(page);
    await expect(field(page, "Photo path")).toHaveValue("/images/keith.jpg");
    await expect(field(page, "Uploaded image")).toHaveValue("");
  });

  test("E2E-11: picking an uploaded image empties the photo path", async ({ page }) => {
    await ownerSession(page);
    await seedProfile(FULL);
    await seedImage("e2e-11", "keith.png");
    await openProfile(page);
    await expect(field(page, "Photo path")).toHaveValue("/images/old.jpg");
    await expect(field(page, "Uploaded image")).toHaveValue("");
    await field(page, "Uploaded image").selectOption({ label: "keith.png" });
    await expect(field(page, "Photo path")).toHaveValue("");
    await save(page);
    await expect(saved(page)).toBeVisible();
    expect((await readProfile())!.photo).toBe(IMGURL("e2e-11"));
  });

  test("E2E-12: a stored photo with no matching image stays as a path", async ({ page }) => {
    await ownerSession(page);
    await seedProfile({ ...FULL, photo: "https://example.com/gone.png" });
    await openProfile(page);
    await expect(field(page, "Photo path")).toHaveValue("https://example.com/gone.png");
    await expect(field(page, "Uploaded image")).toHaveValue("");
    await expect(field(page, "Uploaded image").locator("option")).toHaveText(["None"]);
    await save(page);
    await expect(saved(page)).toBeVisible();
    expect((await readProfile())!.photo).toBe("https://example.com/gone.png");
  });

  test("E2E-13: paragraphs and links can be added and removed", async ({ page }) => {
    await ownerSession(page);
    await seedProfile(FULL);
    await openProfile(page);
    await page.getByRole("button", { name: "Add paragraph", exact: true }).click();
    await PARAS(page).nth(2).fill("Third paragraph.");
    await page.getByRole("button", { name: "Remove social link 1", exact: true }).click();
    await page.getByRole("button", { name: "Add social link", exact: true }).click();
    await field(page, "Social link 2 label").fill("Mastodon");
    await field(page, "Social link 2 address").fill("https://example.social/@keith");
    await expect(PARAS(page)).toHaveCount(3);
    await expect(LABELS(page)).toHaveCount(2);
    await save(page);
    await expect(saved(page)).toBeVisible();
    const got = (await readProfile())!;
    expect(got.about).toEqual(["First paragraph.", "Second paragraph.", "Third paragraph."]);
    expect(got.socialLinks).toEqual([
      { label: "LinkedIn", url: "https://linkedin.com/in/keefhub" },
      { label: "Mastodon", url: "https://example.social/@keith" },
    ]);
    await reopen(page);
    await expect(PARAS(page)).toHaveCount(3);
    await expect(PARAS(page).nth(0)).toHaveValue("First paragraph.");
    await expect(PARAS(page).nth(1)).toHaveValue("Second paragraph.");
    await expect(PARAS(page).nth(2)).toHaveValue("Third paragraph.");
    await expect(LABELS(page)).toHaveCount(2);
    await expect(field(page, "Social link 1 label")).toHaveValue("LinkedIn");
    await expect(field(page, "Social link 1 address")).toHaveValue("https://linkedin.com/in/keefhub");
    await expect(field(page, "Social link 2 label")).toHaveValue("Mastodon");
    await expect(field(page, "Social link 2 address")).toHaveValue("https://example.social/@keith");
    for (const v of await LABELS(page).evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value))) expect(v).not.toBe("GitHub");
  });

  test("E2E-14: blank added rows are dropped on save", async ({ page }) => {
    await ownerSession(page);
    await seedProfile(FULL);
    await openProfile(page);
    await page.getByRole("button", { name: "Add paragraph", exact: true }).click();
    await page.getByRole("button", { name: "Add social link", exact: true }).click();
    await save(page);
    await expect(saved(page)).toBeVisible();
    const got = (await readProfile())!;
    expect(got.about).toEqual(FULL.about);
    expect(got.socialLinks).toEqual(FULL.socialLinks);
    await expect(PARAS(page)).toHaveCount(2);
    await expect(LABELS(page)).toHaveCount(2);
  });

  test("E2E-15: an empty name is refused beside its field", async ({ page }) => {
    await ownerSession(page);
    await seedProfile(FULL);
    await openProfile(page);
    await field(page, "Headline").fill("Typed headline kept");
    await field(page, "Name").fill("   ");
    await save(page);
    await expect(field(page, "Name")).toHaveAccessibleDescription("Name is required");
    await expect(field(page, "Headline")).toHaveValue("Typed headline kept");
    await expect(page.getByText("Profile saved")).toHaveCount(0);
    expect(await readProfile()).toEqual(FULL);
  });

  test("E2E-16: an empty headline is refused beside its field", async ({ page }) => {
    await ownerSession(page);
    await seedProfile(FULL);
    await openProfile(page);
    await field(page, "Name").fill(UNSAVED);
    await field(page, "Headline").fill("");
    await save(page);
    await expect(field(page, "Headline")).toHaveAccessibleDescription("Headline is required");
    await expect(field(page, "Name")).toHaveValue(UNSAVED);
    await expect(page.getByText("Profile saved")).toHaveCount(0);
    expect(await readProfile()).toEqual(FULL);
  });

  test("E2E-17: a malformed email is refused", async ({ page }) => {
    await ownerSession(page);
    await seedProfile(FULL);
    await openProfile(page);
    await field(page, "Name").fill(UNSAVED);
    await field(page, "Email").fill("keith-at-example");
    await save(page);
    await expect(field(page, "Email")).toHaveAccessibleDescription("Enter an email address like name@site.com");
    await expect(field(page, "Name")).toHaveValue(UNSAVED);
    await expect(page.getByText("Profile saved")).toHaveCount(0);
    expect(await readProfile()).toEqual(FULL);
  });

  test("E2E-18: a malformed resume link is refused", async ({ page }) => {
    await ownerSession(page);
    await seedProfile(FULL);
    await openProfile(page);
    await field(page, "Name").fill(UNSAVED);
    await field(page, "Resume link").fill("resume please");
    await save(page);
    await expect(field(page, "Resume link")).toHaveAccessibleDescription("Enter a web address or a path starting with /");
    await expect(field(page, "Name")).toHaveValue(UNSAVED);
    await expect(page.getByText("Profile saved")).toHaveCount(0);
    expect(await readProfile()).toEqual(FULL);
  });

  test("E2E-19: a social link without https is refused at its row", async ({ page }) => {
    await ownerSession(page);
    await seedProfile(FULL);
    await openProfile(page);
    await field(page, "Name").fill(UNSAVED);
    await field(page, "Social link 1 address").fill("github.com/keefhub");
    await save(page);
    await expect(field(page, "Social link 1 address")).toHaveAccessibleDescription("Enter a full web address starting with https://");
    await expect(field(page, "Social link 2 address")).toHaveAccessibleDescription("");
    await expect(field(page, "Name")).toHaveValue(UNSAVED);
    await expect(page.getByText("Profile saved")).toHaveCount(0);
    expect(await readProfile()).toEqual(FULL);
  });

  test("E2E-20: every refused field is reported at once", async ({ page }) => {
    await ownerSession(page);
    await seedProfile(FULL);
    await openProfile(page);
    await field(page, "Name").fill("");
    await field(page, "Email").fill("x");
    await field(page, "Social link 2 address").fill("nope");
    await save(page);
    await expect(field(page, "Name")).toHaveAccessibleDescription("Name is required");
    await expect(field(page, "Email")).toHaveAccessibleDescription("Enter an email address like name@site.com");
    await expect(field(page, "Social link 2 address")).toHaveAccessibleDescription("Enter a full web address starting with https://");
    await expect(field(page, "Social link 1 address")).toHaveAccessibleDescription("");
    await expect(field(page, "Headline")).toHaveAccessibleDescription("");
    expect(await readProfile()).toEqual(FULL);
  });

  test("E2E-21: optional fields can be emptied", async ({ page }) => {
    await ownerSession(page);
    await seedProfile(FULL);
    await openProfile(page);
    await field(page, "Email").fill("");
    await field(page, "Resume link").fill("");
    await field(page, "Photo path").fill("");
    await save(page);
    await expect(saved(page)).toBeVisible();
    const got = (await readProfile())!;
    expect(got).toMatchObject({ ...FULL, updatedAt: got.updatedAt, email: "", resumeLink: "", photo: "" });
    expect(got.updatedAt).toBeGreaterThan(BIG);
  });

  test("E2E-22: with saving off a save fails with the notice wording and keeps typed values", async ({ page }) => {
    await clearAll();
    await seedProfile(FULL);
    await RF(null);
    await page.goto(PANEL);
    await P(page);
    await expect(USER_ID(page)).toBeVisible();
    await nav(page).getByRole("button", { name: "Profile", exact: true }).click();
    await expect(saveBtn(page)).toBeVisible();
    await expect(field(page, "Name")).toHaveValue("Keith Lim");
    await expect(page.getByRole("alert").filter({ hasText: "The uploaded images could not be loaded." })).toBeVisible();
    await field(page, "Name").fill("Changed name");
    await field(page, "Headline").fill("Changed headline");
    await field(page, "Social link 1 label").fill("Changed link");
    await save(page);
    await expect(page.getByRole("alert").filter({ hasText: "The profile could not be saved. Saving is not switched on yet." })).toBeVisible();
    await expect(field(page, "Name")).toHaveValue("Changed name");
    await expect(field(page, "Headline")).toHaveValue("Changed headline");
    await expect(field(page, "Social link 1 label")).toHaveValue("Changed link");
    await expect(page.getByText("Profile saved")).toHaveCount(0);
    expect(await readProfile()).toEqual(FULL);
    await page.reload();
    await expect(USER_ID(page)).toBeVisible();
    await nav(page).getByRole("button", { name: "Profile", exact: true }).click();
    await expect(saveBtn(page)).toBeVisible();
    await expect(field(page, "Name")).toHaveValue("Keith Lim");
    await expect(field(page, "Headline")).toHaveValue("Software Engineer");
    await expect(field(page, "Social link 1 label")).toHaveValue("GitHub");
    await expect(NOTICE(page)).toBeVisible();
  });

  test("E2E-23: a refused write for the owner shows the generic failure and can be retried", async ({ page }) => {
    const X = await ownerSession(page);
    await seedProfile(FULL);
    await openProfile(page);
    await RF(null);
    await field(page, "Name").fill("Changed");
    await save(page);
    await expect(page.getByRole("alert").filter({ hasText: "The profile could not be saved. Try again, and check that you are signed in as the owner." })).toBeVisible();
    await expect(field(page, "Name")).toHaveValue("Changed");
    await expect(page.getByText("Profile saved")).toHaveCount(0);
    expect(await readProfile()).toEqual(FULL);
    await RF(X);
    await save(page);
    await expect(saved(page)).toBeVisible();
    expect((await readProfile())!.name).toBe("Changed");
  });

  test("E2E-24: a signed-in account that is not allowed sees no profile and reads nothing", async ({ page }) => {
    await clearAll();
    await seedProfile(FULL);
    await page.addInitScript(() => window.localStorage.setItem("admin.ownerUid", "not-this-account-0000000000"));
    const urls: string[] = [];
    page.on("request", (r) => urls.push(r.url()));
    await page.goto(PANEL);
    await P(page);
    await expect(page.getByText("This account is not allowed to use the admin panel.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Profile", exact: true })).toHaveCount(0);
    await expect(nav(page)).toHaveCount(0);
    expect(await page.locator("body").innerText()).not.toContain("Keith Lim");
    expect(urls.filter((u) => u.startsWith("http://127.0.0.1:8080"))).toEqual([]);
  });

  test("E2E-25: the editor fits a 375px screen", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await ownerSession(page);
    await seedProfile({ ...FULL, about: ["x".repeat(300), "Second paragraph."], socialLinks: [{ label: FULL.socialLinks[0].label, url: "https://example.com/" + "a".repeat(200) }, FULL.socialLinks[1]] });
    await openProfile(page);
    await page.getByRole("button", { name: "Add paragraph", exact: true }).click();
    await PARAS(page).nth(2).fill("Third");
    await page.getByRole("button", { name: "Add social link", exact: true }).click();
    await field(page, "Social link 3 label").fill("Mastodon");
    await field(page, "Social link 3 address").fill("https://example.social/@keith");
    await expect(PARAS(page)).toHaveCount(3);
    await expect(LABELS(page)).toHaveCount(3);
    await expect(PARAS(page).nth(2)).toHaveValue("Third");
    await expect(field(page, "Social link 3 label")).toHaveValue("Mastodon");
    await expect(field(page, "Social link 3 address")).toHaveValue("https://example.social/@keith");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    const boxes = await page.evaluate(() =>
      Array.from(document.querySelectorAll('section[aria-label="Profile editor"] :is(input, textarea, select, button)'))
        .map((el) => {
          const r = el.getBoundingClientRect();
          return { tag: el.tagName, x: r.x, right: r.x + r.width, w: r.width, h: r.height };
        })
        .filter((b) => b.w > 0 && b.h > 0),
    );
    expect(boxes.length).toBeGreaterThan(0);
    for (const b of boxes) {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.right).toBeLessThanOrEqual(375);
      if (b.tag === "BUTTON") expect(b.h).toBeGreaterThanOrEqual(44);
    }
  });

  test("E2E-26: unsaved edits are dropped on leaving the screen or reloading", async ({ page }) => {
    await ownerSession(page);
    await seedProfile(FULL);
    await openProfile(page);
    await field(page, "Name").fill("Unsaved name");
    await nav(page).getByRole("button", { name: "Experience", exact: true }).click();
    await openProfile(page);
    await expect(field(page, "Name")).toHaveValue("Keith Lim");
    await field(page, "Name").fill("Unsaved again");
    await reopen(page);
    await expect(field(page, "Name")).toHaveValue("Keith Lim");
    expect(await readProfile()).toEqual(FULL);
  });

  test("E2E-27: the form follows the light and dark theme tokens", async ({ browser }) => {
    for (const theme of ["light", "dark"] as const) {
      const context = await browser.newContext({ baseURL: "http://127.0.0.1:3100" });
      await context.addInitScript((t) => window.localStorage.setItem("theme", t), theme);
      const page = await context.newPage();
      await ownerSession(page);
      await openProfile(page);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      const bg = theme === "light" ? "rgb(249, 247, 245)" : "rgb(31, 31, 53)";
      const fg = theme === "light" ? "rgb(45, 45, 45)" : "rgb(228, 228, 236)";
      await expect(field(page, "Name")).toHaveCSS("background-color", bg);
      await expect(field(page, "Name")).toHaveCSS("color", fg);
      await expect(saveBtn(page)).toHaveCSS("background-color", bg);
      await context.close();
    }
  });

  test("E2E-28: the new files keep to tokens and never touch the account", () => {
    const editor = repoText("src/app/components/admin/ProfileEditor.tsx");
    for (const re of [/#[0-9a-fA-F]{3,8}\b/, /\brgba?\(/, /\bhsla?\(/, /dark:/, /console\./, /<img/, /@\/lib\/blog/, /dangerouslySetInnerHTML/, /process\.env/]) expect(editor).not.toMatch(re);
    expect(editor).toContain("var(--surface-alt)");
    expect(editor).toContain("var(--foreground)");
    const banned = ["firebase/auth", "getFirebaseAuth", "currentUser", "displayName", "photoURL", "watchAuth", "signInWithGoogle", "signOutUser", "onAuthStateChanged", "getAuth", "providerData", "getIdToken", "accessToken"];
    for (const f of ["src/lib/admin/profile.ts", "src/lib/firebase/profile.ts", "src/app/components/admin/ProfileEditor.tsx"]) {
      const text = repoText(f);
      for (const b of banned) expect(text, `${f} contains ${b}`).not.toContain(b);
      expect(text).not.toMatch(/from\s+["'][^"']*\/auth["']/);
      expect(text).not.toMatch(/console\./);
    }
  });

  test("E2E-29: public pages never carry the profile and the panel does", async ({ browser }) => {
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
      const text = await visit(path);
      for (const s of ["No profile has been saved yet.", "firestore.googleapis.com", "thegoldenpothos-5b3a1"]) expect(text, `${path} contains ${s}`).not.toContain(s);
    }
    expect(await visit(PANEL)).toContain("No profile has been saved yet.");
  });

  test("E2E-30: the Profile item shows the editor and the others keep their placeholders", async ({ page }) => {
    await ownerSession(page);
    await nav(page).getByRole("button", { name: "Tech stack", exact: true }).click();
    await expect(page.getByRole("heading", { level: 2, name: "Tech stack" })).toBeVisible();
    await openProfile(page);
    await expect(page.getByText("Tech stack editor is not available yet.")).toHaveCount(0);
    await expect(saveBtn(page)).toBeVisible();
    await nav(page).getByRole("button", { name: "Blog posts", exact: true }).click();
    await expect(page.getByRole("heading", { level: 2, name: "Blog posts" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Profile" })).toHaveCount(0);
  });

  test("E2E-31: an unreadable profile shows only the failure", async ({ page }) => {
    await ownerSession(page);
    await seedProfile(FULL);
    await RD();
    await nav(page).getByRole("button", { name: "Profile", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "The profile could not be loaded." })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Profile" })).toBeVisible();
    await expect(saveBtn(page)).toHaveCount(0);
    await expect(field(page, "Name")).toHaveCount(0);
    expect(await page.locator("body").innerText()).not.toContain("Keith Lim");
  });

  test("E2E-32: the first save creates the record and clears the empty note", async ({ page }) => {
    await ownerSession(page);
    await openProfile(page);
    await field(page, "Name").fill("Keith Lim");
    await field(page, "Headline").fill("Software Engineer");
    await save(page);
    await expect(saved(page)).toBeVisible();
    await expect(page.getByText("No profile has been saved yet.")).toHaveCount(0);
    const got = (await readProfile())!;
    expect(got).toEqual({ name: "Keith Lim", headline: "Software Engineer", about: [], photo: "", email: "", resumeLink: "", socialLinks: [], updatedAt: got.updatedAt });
    expect(got.updatedAt).toBeGreaterThan(BIG);
  });
});
