import { expect, test, type Page } from "@playwright/test";
import { execFileSync, spawnSync } from "node:child_process";
import { isEmulatorHost } from "../src/lib/firebase/config";
import { accessFor } from "../src/lib/admin/owner";

test("E2E-18: isEmulatorHost is true only for 127.0.0.1 and localhost", () => {
  expect(isEmulatorHost("127.0.0.1")).toBe(true);
  expect(isEmulatorHost("localhost")).toBe(true);
  expect(isEmulatorHost("admin.example.test")).toBe(false);
  expect(isEmulatorHost("thegoldenpothos.dev")).toBe(false);
  expect(isEmulatorHost("")).toBe(false);
});

test("E2E-19: accessFor decides unfilled, owner and not-allowed from user IDs", () => {
  expect(accessFor("a", "")).toBe("unfilled");
  expect(accessFor("a", "REPLACE_WITH_OWNER_UID")).toBe("unfilled");
  expect(accessFor("a", "a")).toBe("owner");
  expect(accessFor("a", "b")).toBe("not-allowed");
});

const PANEL = "/bright-warm-greenhouse/";
const SECTIONS = ["Profile", "Experience", "Projects", "Certifications", "Tech stack", "Blog posts", "Images"];
const NOT_ALLOWED = "This account is not allowed to use the admin panel.";
const FAILED = "Sign-in was not completed.";
const OTHER_UID = "not-this-account-0000000000";

async function signIn(page: Page): Promise<void> {
  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Sign in with Google" }).click();
  const popup = await popupPromise;
  await popup.waitForLoadState("load");
  await popup.locator("#add-account-button").click();
  await popup.locator("#autogen-button").click();
  await popup.locator("#sign-in").click();
}

async function setOwnerOverride(page: Page, value: string): Promise<void> {
  await page.addInitScript((v) => {
    window.localStorage.setItem("admin.ownerUid", v);
  }, value);
}

function collectDbRequests(page: Page): string[] {
  const hits: string[] = [];
  page.on("request", (r) => {
    if (new URL(r.url()).host.includes("firestore.googleapis.com")) hits.push(r.url());
  });
  return hits;
}

function alertWith(page: Page, text: string) {
  return page.getByRole("alert").filter({ hasText: text });
}

const nav = (page: Page) => page.getByRole("navigation", { name: "Admin sections" });
const btn = (page: Page, name: string) => page.getByRole("button", { name, exact: true });

test("E2E-01: signed-out visitor sees only the sign-in screen", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  const db = collectDbRequests(page);
  await page.goto(PANEL);
  await expect(page.getByRole("heading", { level: 1, name: "Admin" })).toBeVisible();
  await expect(btn(page, "Sign in with Google")).toBeVisible();
  await expect(btn(page, "Sign out")).toHaveCount(0);
  await expect(btn(page, "Profile")).toHaveCount(0);
  await expect(nav(page)).toHaveCount(0);
  expect(await page.locator("body").innerText()).not.toContain("Keith Lim");
  expect(db).toHaveLength(0);
  expect(errors).toEqual([]);
});

test("E2E-02: a signed-in account sees the menu while the owner ID is unfilled", async ({ page }) => {
  const db = collectDbRequests(page);
  await page.goto(PANEL);
  await signIn(page);
  await expect(nav(page).getByRole("button")).toHaveText(SECTIONS);
  await expect(btn(page, "Sign out")).toBeVisible();
  await expect(page.getByText(/^Your user ID: [A-Za-z0-9]{20,}$/)).toBeVisible();
  await expect(btn(page, "Sign in with Google")).toHaveCount(0);
  await expect(page.getByText("This account is not allowed")).toHaveCount(0);
  expect(db).toHaveLength(0);
});

test("E2E-03: the owner sees the menu without the user ID line", async ({ page }) => {
  await page.goto(PANEL);
  await signIn(page);
  const line = await page.getByText(/^Your user ID:/).innerText();
  const uid = line.replace("Your user ID: ", "");
  await page.evaluate((v) => window.localStorage.setItem("admin.ownerUid", v), uid);
  await page.reload();
  await expect(nav(page).getByRole("button")).toHaveText(SECTIONS);
  await expect(btn(page, "Sign out")).toBeVisible();
  await expect(page.getByText(/^Your user ID:/)).toHaveCount(0);
  await expect(btn(page, "Sign in with Google")).toHaveCount(0);
  await expect(page.getByText("This account is not allowed")).toHaveCount(0);
});

test("E2E-04: a different account is told it is not allowed", async ({ page }) => {
  await setOwnerOverride(page, OTHER_UID);
  const db = collectDbRequests(page);
  await page.goto(PANEL);
  await signIn(page);
  await expect(alertWith(page, NOT_ALLOWED)).toBeVisible();
  await expect(page.getByText(/^Your user ID: [A-Za-z0-9]{20,}$/)).toBeVisible();
  await expect(btn(page, "Sign out")).toBeVisible();
  await expect(nav(page)).toHaveCount(0);
  await expect(btn(page, "Profile")).toHaveCount(0);
  expect(db).toHaveLength(0);
});

test("E2E-05: a not-allowed account stays signed in after reload until it signs out", async ({ page }) => {
  await setOwnerOverride(page, OTHER_UID);
  await page.goto(PANEL);
  await signIn(page);
  await expect(page.getByText(NOT_ALLOWED)).toBeVisible();
  await page.reload();
  await expect(page.getByText(NOT_ALLOWED)).toBeVisible();
  await expect(btn(page, "Sign out")).toBeVisible();
  await expect(btn(page, "Sign in with Google")).toHaveCount(0);
  await btn(page, "Sign out").click();
  await expect(btn(page, "Sign in with Google")).toBeVisible();
  await expect(page.getByText(NOT_ALLOWED)).toHaveCount(0);
});

test("E2E-06: signing out returns to the sign-in screen and survives a reload", async ({ page }) => {
  await page.goto(PANEL);
  await signIn(page);
  await expect(nav(page)).toBeVisible();
  await btn(page, "Sign out").click();
  await expect(btn(page, "Sign in with Google")).toBeVisible();
  await expect(nav(page)).toHaveCount(0);
  await expect(btn(page, "Sign out")).toHaveCount(0);
  await page.reload();
  await expect(btn(page, "Sign in with Google")).toBeVisible();
  await expect(nav(page)).toHaveCount(0);
});

test("E2E-07: closing the sign-in window shows a failure and leaves the button usable", async ({ page }) => {
  await page.goto(PANEL);
  const popupPromise = page.waitForEvent("popup");
  await btn(page, "Sign in with Google").click();
  const popup = await popupPromise;
  await popup.close();
  await expect(alertWith(page, FAILED)).toBeVisible({ timeout: 15000 });
  await expect(btn(page, "Sign in with Google")).toBeVisible();
  await expect(btn(page, "Sign in with Google")).toBeEnabled();
  await expect(nav(page)).toHaveCount(0);
  await expect(btn(page, "Sign out")).toHaveCount(0);
});

test("E2E-08: a blocked sign-in window shows a failure and leaves the button usable", async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { open: () => null }).open = () => null;
  });
  await page.goto(PANEL);
  await btn(page, "Sign in with Google").click();
  await expect(alertWith(page, FAILED)).toBeVisible();
  await expect(btn(page, "Sign in with Google")).toBeVisible();
  await expect(btn(page, "Sign in with Google")).toBeEnabled();
  await expect(nav(page)).toHaveCount(0);
});

test("E2E-09: the menu fits a 375px phone", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto(PANEL);
  await signIn(page);
  const buttons = nav(page).getByRole("button");
  await expect(buttons).toHaveCount(7);
  for (let i = 0; i < 7; i++) {
    const b = buttons.nth(i);
    await expect(b).toBeVisible();
    const box = await b.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(375);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(sw).toBeLessThanOrEqual(375);
});

test("E2E-10: the sign-in screen fits a 375px phone", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto(PANEL);
  const b = btn(page, "Sign in with Google");
  await expect(b).toBeVisible();
  const box = await b.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(375);
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(sw).toBeLessThanOrEqual(375);
});

test("E2E-11: the panel follows the light and dark themes", async ({ browser }) => {
  const themes: [string, string, string][] = [
    ["light", "rgb(255, 255, 255)", "rgb(45, 45, 45)"],
    ["dark", "rgb(26, 26, 46)", "rgb(228, 228, 236)"],
  ];
  for (const [theme, surface, foreground] of themes) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.addInitScript((t) => {
      window.localStorage.setItem("theme", t);
    }, theme);
    await page.goto(PANEL);
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expect(page.getByRole("region", { name: "Admin" })).toHaveCSS("background-color", surface);
    await expect(page.getByRole("heading", { level: 1, name: "Admin" })).toHaveCSS("color", foreground);
    await context.close();
  }
});

test("E2E-12: the panel is noindex and absent from sitemap and robots", async ({ page, request }) => {
  await page.goto(PANEL);
  const contents = await page
    .locator('meta[name="robots"], meta[name="googlebot"]')
    .evaluateAll((els) => els.map((e) => e.getAttribute("content") ?? ""));
  expect(contents.length).toBeGreaterThan(0);
  for (const c of contents) expect(c).toContain("noindex");
  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  expect(await sitemap.text()).not.toContain("bright-warm-greenhouse");
  const robots = await request.get("/robots.txt");
  expect(robots.status()).toBe(200);
  expect(await robots.text()).not.toContain("bright-warm-greenhouse");
});

test("E2E-13: public pages are unchanged and ship no Firebase code", async ({ browser }) => {
  const visit = async (path: string) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const scripts: string[] = [];
    const pending: Promise<void>[] = [];
    page.on("response", (res) => {
      if (res.request().resourceType() === "script") {
        pending.push(res.text().then((t) => void scripts.push(t)).catch(() => undefined));
      }
    });
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await Promise.all(pending);
    const html = await page.content();
    return { page, context, scripts, html };
  };

  const home = await visit("/");
  await expect(home.page.getByRole("heading", { level: 1 })).toHaveText(/Keith Lim/);
  for (const t of home.scripts) {
    expect(t).not.toContain("thegoldenpothos-5b3a1");
    expect(t).not.toContain("identitytoolkit.googleapis.com");
  }
  expect(home.html).not.toContain("thegoldenpothos-5b3a1");
  expect(home.html).not.toContain("identitytoolkit.googleapis.com");
  await home.context.close();

  const post = await visit("/blog/hello-world/");
  await expect(post.page.getByRole("heading", { level: 1 })).toHaveText("Hello, World — Welcome to My Blog");
  for (const t of post.scripts) {
    expect(t).not.toContain("thegoldenpothos-5b3a1");
    expect(t).not.toContain("identitytoolkit.googleapis.com");
  }
  expect(post.html).not.toContain("thegoldenpothos-5b3a1");
  expect(post.html).not.toContain("identitytoolkit.googleapis.com");
  await post.context.close();

  const panel = await visit(PANEL);
  expect(panel.scripts.some((t) => t.includes("thegoldenpothos-5b3a1"))).toBe(true);
  await panel.context.close();
});

test("E2E-14: choosing a menu item shows its placeholder and replaces the previous one", async ({ page }) => {
  await page.goto(PANEL);
  await signIn(page);
  await btn(page, "Tech stack").click();
  await expect(page.getByText("Tech stack editor is not available yet.")).toBeVisible();
  await btn(page, "Blog posts").click();
  await expect(page.getByText("Blog posts editor is not available yet.")).toBeVisible();
  await expect(page.getByText("Tech stack editor is not available yet.")).toHaveCount(0);
  await expect(nav(page).getByRole("button")).toHaveText(SECTIONS);
});

// Playwright forbids launchOptions inside a describe group; the mapping is harmless for the other rows.
test.use({ launchOptions: { args: ["--host-resolver-rules=MAP admin.example.test 127.0.0.1"] } });

{
  test("E2E-17: a non-local host talks to Google, never to the emulator", async ({ page, context }) => {
    const hosts: string[] = [];
    await context.route(
      (url) => url.hostname !== "admin.example.test",
      async (route) => {
        hosts.push(new URL(route.request().url()).host);
        await route.abort();
      },
    );
    await page.goto(`http://admin.example.test:3100${PANEL}`);
    await btn(page, "Sign in with Google").click();
    await expect
      .poll(
        () =>
          hosts.some((h) =>
            ["thegoldenpothos-5b3a1.firebaseapp.com", "identitytoolkit.googleapis.com", "apis.google.com"].includes(h),
          ),
        { timeout: 10000 },
      )
      .toBe(true);
    expect(hosts).not.toContain("127.0.0.1:9099");
  });
}

const SRC_PATHS = ["src/lib/firebase", "src/lib/admin", "src/app/components/admin", "src/app/bright-warm-greenhouse"];

test("E2E-15: typecheck passes and no source mentions email", () => {
  test.setTimeout(180_000);
  expect(() => execFileSync("npm", ["run", "typecheck"], { cwd: process.cwd(), stdio: "pipe" })).not.toThrow();
  const grep = spawnSync("git", ["grep", "--untracked", "-n", "-i", "email", "--", ...SRC_PATHS, ":(exclude)src/lib/admin/profile.ts", ":(exclude)src/lib/firebase/profile.ts", ":(exclude)src/app/components/admin/ProfileEditor.tsx"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  expect(grep.stdout).toBe("");
  expect(grep.status).toBe(1);
});

test("E2E-16: no source reads process.env", () => {
  test.setTimeout(60_000);
  const grep = spawnSync("git", ["grep", "--untracked", "-n", "process.env", "--", ...SRC_PATHS], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  expect(grep.stdout).toBe("");
  expect(grep.status).toBe(1);
});
