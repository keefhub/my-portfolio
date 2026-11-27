import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test, type BrowserContext } from "@playwright/test";
import { encode } from "next-auth/jwt";

// Public-site checks that must still hold once the static export is lifted and the
// site is served by `next start` (Step 1 of owner-google-sign-in).

test("E2E-20: landing page, blog index and a blog post render with their titles and headings, without console errors", async ({
  browser,
}) => {
  const cases = [
    {
      path: "/",
      title: "thegoldenpothos — Keith Lim | Software Engineer & Portfolio",
      heading: "Keith Lim",
    },
    {
      path: "/blog/",
      title: "Blog | thegoldenpothos",
      heading: "Blog",
    },
    {
      path: "/blog/hello-world/",
      title: "Hello, World — Welcome to My Blog | thegoldenpothos",
      heading: "Hello, World — Welcome to My Blog",
    },
  ];

  for (const c of cases) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(e.message));

    const response = await page.goto(c.path);
    expect(response?.status(), c.path).toBe(200);
    await expect(page, c.path).toHaveTitle(c.title);
    await expect(page.getByRole("heading", { level: 1 }).first(), c.path).toHaveText(c.heading);
    expect(errors, c.path).toEqual([]);

    await context.close();
  }
});

test("E2E-21: rss.xml, sitemap.xml and robots.txt are served with the expected content", async ({ request }) => {
  const rss = await request.get("/rss.xml");
  expect(rss.status()).toBe(200);
  expect(rss.headers()["content-type"]).toBe("application/rss+xml; charset=utf-8");
  const rssBody = await rss.text();
  expect(rssBody).toContain('<rss version="2.0"');
  expect(rssBody).toContain("<link>https://thegoldenpothos.xyz/blog/hello-world/</link>");
  expect(rssBody).toContain("<link>https://thegoldenpothos.xyz/blog/building-portfolio-nextjs/</link>");

  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  const sitemapBody = await sitemap.text();
  expect(sitemapBody).toContain("<urlset");
  for (const loc of [
    "https://thegoldenpothos.xyz/",
    "https://thegoldenpothos.xyz/blog/",
    "https://thegoldenpothos.xyz/blog/building-portfolio-nextjs/",
    "https://thegoldenpothos.xyz/blog/hello-world/",
  ]) {
    expect(sitemapBody).toContain(`<loc>${loc}</loc>`);
  }

  const robots = await request.get("/robots.txt");
  expect(robots.status()).toBe(200);
  expect((await robots.text()).trim()).toBe(
    "User-Agent: *\nAllow: /\n\nSitemap: https://thegoldenpothos.xyz/sitemap.xml",
  );
});

test("E2E-22: an unknown page and an unknown blog post answer 404 with the built-in 404 page", async ({ page }) => {
  for (const path of ["/no-such-page/", "/blog/no-such-post/"]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(404);
    await expect(page.getByRole("heading", { level: 1, name: "404", exact: true }), path).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "This page could not be found.", exact: true }),
      path,
    ).toBeVisible();
  }
});

test("E2E-26: vercel.json and next.config.ts no longer declare a static export", async () => {
  const vercel = JSON.parse(fs.readFileSync("vercel.json", "utf8")) as Record<string, unknown>;
  expect(vercel.outputDirectory).toBeUndefined();
  expect(vercel.trailingSlash).toBe(true);
  expect(vercel.buildCommand).toBe("npm run build");
  expect(vercel.installCommand).toBe("npm ci");
  expect(vercel.framework).toBe("nextjs");

  const allowed = ["$schema", "framework", "installCommand", "buildCommand", "trailingSlash", "cleanUrls", "headers"];
  for (const key of Object.keys(vercel)) {
    expect(allowed, `unexpected vercel.json key ${key}`).toContain(key);
  }

  const nextConfig = fs.readFileSync("next.config.ts", "utf8");
  expect(nextConfig).not.toMatch(/\boutput\s*:/);
  expect(nextConfig).toMatch(/trailingSlash:\s*true/);
  expect(nextConfig).toMatch(/unoptimized:\s*true/);
});

test("E2E-27: next-auth is pinned exactly, http-server is gone and the Firebase packages stay", async () => {
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  expect(pkg.dependencies?.["next-auth"]).toBe("5.0.0-beta.32");
  expect(pkg.dependencies?.["http-server"]).toBeUndefined();
  expect(pkg.devDependencies?.["http-server"]).toBeUndefined();
  expect(pkg.dependencies?.firebase).toBeDefined();
  expect(pkg.devDependencies?.["firebase-tools"]).toBeDefined();
});

// E2E-35 builds a throw-away git repository and runs the mechanical gate in it. This file is itself scanned by the
// gate, so the quote characters and the module names are put together from pieces.
const Q = String.fromCharCode(34);
const DIRECTIVE = Q + "use " + "server" + Q + ";";
const BODY = "export const f = 1;";
const importLine = (name: string, mod: string) => "import " + name + " fr" + "om " + Q + mod + Q + ";";

type GateRun = { lines: string[]; status: number | null };

function runGate(files: { file: string; content: string }[]): GateRun {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gate-"));
  try {
    const sh = (cmd: string, args: string[], env: Record<string, string> = {}) =>
      spawnSync(cmd, args, { cwd: dir, encoding: "utf8", env: { ...process.env, ...env } });

    sh("git", ["init", "-q"]);
    fs.mkdirSync(path.join(dir, "docs/features/fixture"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, "docs/features/fixture/spec.md"),
      [
        "## 8. Implementation plan",
        "",
        "## Phase A " + String.fromCharCode(8212) + " Fixture",
        "",
        "### Step 1 " + String.fromCharCode(8212) + " Fixture",
        "",
        "- **Files:**",
        ...files.map((f) => "  - add `" + f.file + "`"),
        "- **Risk:** low " + String.fromCharCode(8212) + " fixture",
        "- **Verify:**",
        "  - `npm run typecheck`",
        "",
      ].join("\n"),
    );
    fs.mkdirSync(path.join(dir, "scripts"), { recursive: true });
    fs.copyFileSync(path.join(process.cwd(), "scripts/check-task.sh"), path.join(dir, "scripts/check-task.sh"));
    sh("git", ["add", "docs/features/fixture/spec.md", "scripts/check-task.sh"]);
    sh("git", [
      "-c",
      "user.email=fixture@example.test",
      "-c",
      "user.name=fixture",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "-q",
      "-m",
      "init",
    ]);

    for (const f of files) {
      fs.mkdirSync(path.dirname(path.join(dir, f.file)), { recursive: true });
      fs.writeFileSync(path.join(dir, f.file), f.content);
    }

    const result = sh("bash", ["scripts/check-task.sh", "fixture", "1"], { CHECK_SKIP_RUN: "1" });
    return { lines: (result.stdout ?? "").split("\n"), status: result.status };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const starts = (run: GateRun, prefix: string) => run.lines.filter((l) => l.startsWith(prefix));
const startsWithPath = (run: GateRun, prefix: string, p: string) =>
  run.lines.filter((l) => l.startsWith(prefix) && l.includes(p));

test("E2E-35: the mechanical gate accepts this feature's server pieces and still rejects the neighbouring cases", async () => {
  test.setTimeout(120000);
  const withDirective = [DIRECTIVE, BODY].join("\n");

  // (a) a Server Action file at the one allowed path
  const a = runGate([{ file: "src/app/bright-warm-greenhouse/actions.ts", content: withDirective }]);
  expect(starts(a, "PASS STATIC"), "(a) PASS STATIC").not.toEqual([]);
  expect(starts(a, "FAIL STATIC"), "(a) FAIL STATIC").toEqual([]);

  // (b) the same directive in any other file
  const bPath = "src/app/bright-warm-greenhouse/other.ts";
  const b = runGate([{ file: bPath, content: withDirective }]);
  expect(startsWithPath(b, "FAIL STATIC", bPath), "(b) FAIL STATIC names the path").not.toEqual([]);
  expect(starts(b, "PASS STATIC"), "(b) PASS STATIC").toEqual([]);
  expect(b.status, "(b) exit status").toBe(1);

  // (c) the Auth.js handler path
  const c = runGate([{ file: "src/app/api/auth/[...nextauth]/route.ts", content: BODY }]);
  expect(starts(c, "PASS STATIC"), "(c) PASS STATIC").not.toEqual([]);
  expect(starts(c, "FAIL STATIC"), "(c) FAIL STATIC").toEqual([]);

  // (d) any other API route
  const dPath = "src/app/api/other/route.ts";
  const d = runGate([{ file: dPath, content: BODY }]);
  expect(startsWithPath(d, "FAIL STATIC", dPath), "(d) FAIL STATIC names the path").not.toEqual([]);
  expect(d.status, "(d) exit status").toBe(1);

  // (e) middleware and proxy files
  for (const p of ["middleware.ts", "src/middleware.ts", "proxy.ts", "src/proxy.ts"]) {
    const e = runGate([{ file: p, content: BODY }]);
    expect(startsWithPath(e, "FAIL STATIC", p), "(e) FAIL STATIC names " + p).not.toEqual([]);
    expect(e.status, "(e) exit status for " + p).toBe(1);
  }

  // (f) next-auth is no longer a forbidden import
  const f = runGate([{ file: "src/lib/auth.ts", content: importLine("NextAuth", ["next", "auth"].join("-")) + "\n" }]);
  expect(starts(f, "PASS IMPORTS"), "(f) PASS IMPORTS").not.toEqual([]);
  expect(starts(f, "FAIL IMPORTS"), "(f) FAIL IMPORTS").toEqual([]);

  // (g) and (h) other forbidden imports still fail
  const gPath = "src/lib/x.ts";
  const g = runGate([{ file: gPath, content: importLine("x", "je" + "st") + "\n" }]);
  expect(startsWithPath(g, "FAIL IMPORTS", gPath), "(g) FAIL IMPORTS names the path").not.toEqual([]);
  expect(g.status, "(g) exit status").toBe(1);

  const hPath = "src/lib/y.ts";
  const h = runGate([{ file: hPath, content: importLine("y", "@supabase/" + "supabase-js") + "\n" }]);
  expect(startsWithPath(h, "FAIL IMPORTS", hPath), "(h) FAIL IMPORTS names the path").not.toEqual([]);
  expect(h.status, "(h) exit status").toBe(1);
});

// Step 3: owner decision, Auth.js configuration and handler.

test("E2E-10: the Google return route reaches the handler with and without a trailing slash and lists the provider", async ({
  request,
  baseURL,
}) => {
  const cleanCookie = (headers: Record<string, string>) => {
    expect(headers["set-cookie"] ?? "").not.toContain("authjs.session-token");
  };

  const first = await request.get("/api/auth/callback/google?error=access_denied", { maxRedirects: 0 });
  expect(first.status()).toBe(308);
  expect(first.headers()["location"]).toBe("/api/auth/callback/google/?error=access_denied");
  cleanCookie(first.headers());

  const second = await request.get("/api/auth/callback/google/?error=access_denied", { maxRedirects: 0 });
  expect(second.status()).toBe(302);
  const secondUrl = new URL(second.headers()["location"], baseURL);
  expect(secondUrl.pathname).toBe("/bright-warm-greenhouse/");
  expect(secondUrl.searchParams.has("error")).toBe(true);
  cleanCookie(second.headers());

  const third = await request.get(
    "/api/auth/callback/google/?error=access_denied&iss=https%3A%2F%2Faccounts.google.com",
    { maxRedirects: 0 },
  );
  expect(third.status()).toBe(302);
  const thirdUrl = new URL(third.headers()["location"], baseURL);
  expect(thirdUrl.pathname).toBe("/bright-warm-greenhouse/");
  expect(thirdUrl.searchParams.has("error")).toBe(true);
  cleanCookie(third.headers());

  const providers = await request.get("/api/auth/providers/", { maxRedirects: 0 });
  expect(providers.status()).toBe(200);
  const json = (await providers.json()) as { google: { callbackUrl: string } };
  expect(json.google.callbackUrl.endsWith("/api/auth/callback/google")).toBe(true);
});

test("E2E-14: accessFor recognises the owner only by a verified, matching, non-blank email", async () => {
  const { accessFor } = await import("../src/lib/admin/access");
  const rows: [string | null | undefined, boolean | undefined, string | undefined][] = [
    ["owner@example.test", true, "owner@example.test"],
    ["Owner@Example.TEST", true, "owner@example.test"],
    ["owner@example.test", true, "  OWNER@example.test  "],
    ["  owner@example.test ", true, "owner@example.test"],
    ["owner@example.test", false, "owner@example.test"],
    ["owner@example.test", undefined, "owner@example.test"],
    ["other@example.test", true, "owner@example.test"],
    ["owner@example.test.evil.test", true, "owner@example.test"],
    ["xowner@example.test", true, "owner@example.test"],
    [null, true, "owner@example.test"],
    [undefined, true, undefined],
    ["owner@example.test", true, undefined],
    ["owner@example.test", true, ""],
    ["owner@example.test", true, "   "],
    ["", true, ""],
    ["  ", true, "  "],
  ];
  expect(rows).toHaveLength(16);
  const results = rows.map(([email, verified, admin]) => accessFor(email, verified, admin));
  expect(results).toEqual([
    "owner",
    "owner",
    "owner",
    "owner",
    ...Array.from({ length: 12 }, () => "not-allowed"),
  ]);
});

test("E2E-15: verifiedClaim is true only for email_verified exactly true", async () => {
  const { verifiedClaim } = await import("../src/lib/admin/access");
  expect(verifiedClaim({ email_verified: true })).toBe(true);
  expect(verifiedClaim({ email_verified: false })).toBe(false);
  expect(verifiedClaim({ email_verified: "true" })).toBe(false);
  expect(verifiedClaim({ email_verified: 1 })).toBe(false);
  expect(verifiedClaim({})).toBe(false);
  expect(verifiedClaim(undefined)).toBe(false);
  expect(verifiedClaim(null)).toBe(false);
});

test("E2E-16: authLogLine prints only the error type and never any detail", async () => {
  const { authLogLine } = await import("../src/lib/admin/access");

  const detailed = authLogLine({
    type: "OAuthCallbackError",
    name: "AuthError",
    message: "boom owner@example.test code=4/abc",
    cause: { err: new Error("tok-123"), parameters: { code: "4/abc" } },
    stack: "stack-line-xyz",
  });
  expect(detailed).toBe("[auth] OAuthCallbackError");
  for (const secret of ["owner@example.test", "4/abc", "tok-123", "stack-line-xyz"]) {
    expect(detailed).not.toContain(secret);
  }

  expect(authLogLine(new Error("secret detail"))).toBe("[auth] Error");
  expect(authLogLine(new TypeError("x"))).toBe("[auth] TypeError");
  expect(authLogLine({ type: "", name: "JWTSessionError", message: "m" })).toBe("[auth] JWTSessionError");
  expect(authLogLine("boom")).toBe("[auth] Error");
  expect(authLogLine(undefined)).toBe("[auth] Error");
});

// Step 4: the dynamic panel page, the sign-in and sign-out actions and the three screens.

const PANEL = "/bright-warm-greenhouse/";
const LABELS = ["Profile", "Experience", "Projects", "Certifications", "Tech stack", "Blog posts", "Images"];
const T_OUT = "Admin Sign in with Google";
const T_FAIL = "Admin Sign in with Google Sign-in was not completed.";
const T_DENY = "Admin This account is not allowed to use the admin panel. Sign out";
const T_OWNER = "Admin Profile Experience Projects Certifications Tech stack Blog posts Images Sign out";
const DENY_TEXT = "This account is not allowed to use the admin panel.";
const SESSION_COOKIE = "authjs.session-token";

type Claims = { sub: string; email: string; name: string; emailVerified: boolean };

const setting = (name: string): string => process.env[name] ?? "";
const OWNER = (): Claims => ({ sub: "owner-1", email: setting("ADMIN_EMAIL"), name: "Owner Test", emailVerified: true });
const UNVERIFIED = (): Claims => ({
  sub: "owner-2",
  email: setting("ADMIN_EMAIL"),
  name: "Unverified Owner",
  emailVerified: false,
});
const OTHER = (): Claims => ({
  sub: "other-1",
  email: "mallory@example.test",
  name: "Mallory Intruder",
  emailVerified: true,
});

async function mint(claims: Claims, options: { secret?: string; maxAge?: number } = {}): Promise<string> {
  return encode({
    token: { ...claims },
    secret: options.secret ?? setting("AUTH_SECRET"),
    salt: SESSION_COOKIE,
    maxAge: options.maxAge ?? 3600,
  });
}

async function addSession(context: BrowserContext, baseURL: string, claims: Claims): Promise<void> {
  await context.addCookies([{ name: SESSION_COOKIE, value: await mint(claims), url: baseURL }]);
}

type Google = { readonly calls: number; readonly urls: string[] };

// The stand-in for Google at the browser boundary: approve as an account, leave, or hold.
async function standIn(
  context: BrowserContext,
  baseURL: string,
  mode: { kind: "approve"; claims: Claims } | { kind: "leave" } | { kind: "hold" },
): Promise<Google> {
  const urls: string[] = [];
  const value = mode.kind === "approve" ? await mint(mode.claims) : "";
  await context.route("https://accounts.google.com/**", async (route) => {
    urls.push(route.request().url());
    if (mode.kind === "approve") {
      await context.addCookies([{ name: SESSION_COOKIE, value, url: baseURL }]);
      await route.fulfill({ status: 302, headers: { location: baseURL + PANEL } });
    } else if (mode.kind === "leave") {
      await route.fulfill({
        status: 302,
        headers: {
          location:
            baseURL + "/api/auth/callback/google?error=access_denied&iss=" + encodeURIComponent("https://accounts.google.com"),
        },
      });
    } else {
      await route.fulfill({ status: 200, contentType: "text/html", body: "stand-in" });
    }
  });
  return {
    get calls() {
      return urls.length;
    },
    urls,
  };
}

const cookieHeader = async (claims: Claims): Promise<Record<string, string>> => ({
  cookie: SESSION_COOKIE + "=" + (await mint(claims)),
});

const runValues = (): string[] =>
  ["AUTH_SECRET", "AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET", "ADMIN_EMAIL"].map(setting);

function gitGrep(args: string[]): { status: number | null; stdout: string } {
  const result = spawnSync("git", ["grep", "--untracked", ...args], { cwd: process.cwd(), encoding: "utf8" });
  return { status: result.status, stdout: result.stdout ?? "" };
}

test("E2E-01: the owner signs in with Google and sees the seven-section menu, which survives a reload", async ({
  page,
  baseURL,
}) => {
  const base = baseURL as string;
  await page.setViewportSize({ width: 1280, height: 720 });
  const google = await standIn(page.context(), base, { kind: "approve", claims: OWNER() });
  await page.goto(PANEL);
  const region = page.getByRole("region", { name: "Admin" });
  await expect(region).toHaveText(T_OUT, { useInnerText: true });

  await page.getByRole("button", { name: "Sign in with Google", exact: true }).click();
  await expect(page).toHaveURL(base + PANEL);
  await expect(region).toHaveText(T_OWNER, { useInnerText: true });

  const menu = page.getByRole("navigation", { name: "Admin sections" }).getByRole("button");
  await expect(menu).toHaveText(LABELS);
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in with Google", exact: true })).toHaveCount(0);
  for (let i = 0; i < LABELS.length; i++) {
    const box = await menu.nth(i).boundingBox();
    expect(box, LABELS[i]).not.toBeNull();
    expect(box!.x, LABELS[i]).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width, LABELS[i]).toBeLessThanOrEqual(1280);
  }

  await page.reload();
  await expect(region).toHaveText(T_OWNER, { useInnerText: true });
  expect(google.calls).toBe(1);
});

test("E2E-02: on a 375 px screen the owner's menu and Sign out fit without sideways scrolling", async ({
  page,
  baseURL,
}) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await standIn(page.context(), baseURL as string, { kind: "approve", claims: OWNER() });
  await page.goto(PANEL);
  await page.getByRole("button", { name: "Sign in with Google", exact: true }).click();

  const region = page.getByRole("region", { name: "Admin" });
  await expect(region).toHaveText(T_OWNER, { useInnerText: true });
  const menu = page.getByRole("navigation", { name: "Admin sections" }).getByRole("button");
  await expect(menu).toHaveText(LABELS);

  const targets = [
    ...LABELS.map((label, i) => ({ label, locator: menu.nth(i) })),
    { label: "Sign out", locator: page.getByRole("button", { name: "Sign out", exact: true }) },
  ];
  for (const t of targets) {
    const box = await t.locator.boundingBox();
    expect(box, t.label).not.toBeNull();
    expect(box!.x, t.label).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width, t.label).toBeLessThanOrEqual(375);
  }
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(375);
});

test("E2E-03: a visitor with no session sees only the sign-in screen and no cookie is set", async ({ page, context }) => {
  await page.goto(PANEL);
  await expect(page.getByRole("region", { name: "Admin" })).toHaveText(T_OUT, { useInnerText: true });
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toHaveCount(0);
  expect(await context.cookies()).toEqual([]);
  await expect(page).toHaveTitle("Admin | thegoldenpothos");
});

test("E2E-04: a verified account that is not the owner's is told it is not allowed and can sign out", async ({
  page,
  baseURL,
}) => {
  await standIn(page.context(), baseURL as string, { kind: "approve", claims: OTHER() });
  await page.goto(PANEL);
  await page.getByRole("button", { name: "Sign in with Google", exact: true }).click();

  const region = page.getByRole("region", { name: "Admin" });
  await expect(region).toHaveText(T_DENY, { useInnerText: true });
  await expect(region.getByRole("alert")).toHaveText(DENY_TEXT);
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Sign in with Google", exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(region).toHaveText(T_OUT, { useInnerText: true });
});

test("E2E-05: the owner's address with an unverified email is not allowed", async ({ page, baseURL }) => {
  await standIn(page.context(), baseURL as string, { kind: "approve", claims: UNVERIFIED() });
  await page.goto(PANEL);
  await page.getByRole("button", { name: "Sign in with Google", exact: true }).click();

  await expect(page.getByRole("region", { name: "Admin" })).toHaveText(T_DENY, { useInnerText: true });
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeVisible();
});

test("E2E-06: the not-allowed screen shows and sends nothing about the account", async ({
  page,
  context,
  request,
  baseURL,
}) => {
  const secrets = ["mallory@example.test", "Mallory Intruder", "other-1"];
  await addSession(context, baseURL as string, OTHER());
  const region = page.getByRole("region", { name: "Admin" });

  await page.goto(PANEL);
  await expect(region).toHaveText(T_DENY, { useInnerText: true });
  const first = await page.content();
  for (const s of secrets) expect(first, s).not.toContain(s);

  await page.reload();
  await expect(region).toHaveText(T_DENY, { useInnerText: true });
  const second = await page.content();
  for (const s of secrets) expect(second, s).not.toContain(s);

  const raw = await request.get(PANEL, { headers: await cookieHeader(OTHER()) });
  const body = await raw.text();
  for (const s of secrets) expect(body, s).not.toContain(s);
});

test("E2E-07: signing out ends the session, and the owner can sign in again", async ({ page, context, baseURL }) => {
  const google = await standIn(context, baseURL as string, { kind: "approve", claims: OWNER() });
  const region = page.getByRole("region", { name: "Admin" });
  const signIn = page.getByRole("button", { name: "Sign in with Google", exact: true });

  await page.goto(PANEL);
  await signIn.click();
  await expect(region).toHaveText(T_OWNER, { useInnerText: true });

  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(region).toHaveText(T_OUT, { useInnerText: true });
  await page.reload();
  await expect(region).toHaveText(T_OUT, { useInnerText: true });
  await expect(page.getByRole("navigation")).toHaveCount(0);
  expect((await context.cookies()).map((c) => c.name)).not.toContain(SESSION_COOKIE);

  await signIn.click();
  await expect(region).toHaveText(T_OWNER, { useInnerText: true });
  expect(google.calls).toBe(2);
});

test("E2E-08: signing out in one tab shows signed out in another tab after it reloads", async ({ context, baseURL }) => {
  await addSession(context, baseURL as string, OWNER());
  const tab1 = await context.newPage();
  const tab2 = await context.newPage();
  await tab1.goto(PANEL);
  await tab2.goto(PANEL);
  const region1 = tab1.getByRole("region", { name: "Admin" });
  const region2 = tab2.getByRole("region", { name: "Admin" });
  await expect(region1).toHaveText(T_OWNER, { useInnerText: true });
  await expect(region2).toHaveText(T_OWNER, { useInnerText: true });

  await tab1.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(region1).toHaveText(T_OUT, { useInnerText: true });
  await expect(region2).toHaveText(T_OWNER, { useInnerText: true });

  await tab2.reload();
  await expect(region2).toHaveText(T_OUT, { useInnerText: true });
});

test("E2E-09: a sign-in that Google does not complete shows the failure message and can be retried", async ({
  page,
  baseURL,
}) => {
  const google = await standIn(page.context(), baseURL as string, { kind: "leave" });
  const region = page.getByRole("region", { name: "Admin" });
  const signIn = page.getByRole("button", { name: "Sign in with Google", exact: true });

  await page.goto(PANEL);
  await signIn.click();
  await expect(page).toHaveURL(/\/bright-warm-greenhouse\/\?error=/);
  await expect(region).toHaveText(T_FAIL, { useInnerText: true });
  await expect(region.getByRole("alert")).toHaveText("Sign-in was not completed.");
  await expect(signIn).toBeEnabled();
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toHaveCount(0);

  await signIn.click();
  await expect.poll(() => google.calls).toBe(2);
  await page.waitForURL(/error=/);
  await expect(region).toHaveText(T_FAIL, { useInnerText: true });
});

test("E2E-11: a double click on Sign in with Google starts only one sign-in", async ({ page, baseURL }) => {
  const google = await standIn(page.context(), baseURL as string, { kind: "leave" });
  await page.goto(PANEL);
  await page.getByRole("button", { name: "Sign in with Google", exact: true }).dblclick();
  await page.waitForURL(/error=/);
  await expect(page.getByRole("region", { name: "Admin" })).toHaveText(T_FAIL, { useInnerText: true });
  expect(google.calls).toBe(1);
});

test("E2E-12: a garbled, expired or wrongly signed session cookie is treated as signed out", async ({
  browser,
  baseURL,
}) => {
  const cookies = [
    "not-a-token",
    await mint(OWNER(), { maxAge: -3600 }),
    await mint(OWNER(), { secret: "another-secret-0123456789abcdef0123" }),
  ];
  for (const [i, value] of cookies.entries()) {
    const context = await browser.newContext();
    await context.addCookies([{ name: SESSION_COOKIE, value, url: baseURL as string }]);
    const page = await context.newPage();
    await page.goto(PANEL);
    await expect(page.getByRole("region", { name: "Admin" }), "cookie " + i).toHaveText(T_OUT, { useInnerText: true });
    await expect(page.getByRole("navigation"), "cookie " + i).toHaveCount(0);
    await context.close();
  }
});

test("E2E-13: each menu item shows its own not-available notice and the menu stays", async ({
  page,
  context,
  baseURL,
}) => {
  await addSession(context, baseURL as string, OWNER());
  await page.goto(PANEL);
  const region = page.getByRole("region", { name: "Admin" });
  await expect(region).toHaveText(T_OWNER, { useInnerText: true });
  const menu = page.getByRole("navigation", { name: "Admin sections" }).getByRole("button");

  for (const label of LABELS) {
    await menu.filter({ hasText: label }).first().click();
    const status = region.getByRole("status");
    await expect(status, label).toHaveCount(1);
    await expect(status, label).toHaveText(label + " editor is not available yet.");
    await expect(page.getByRole("button", { name: "Sign out", exact: true }), label).toBeVisible();
    await expect(menu, label).toHaveText(LABELS);
  }
});

test("E2E-17: the panel page is never cached, with or without a session", async ({ request }) => {
  const anonymous = await request.get(PANEL);
  expect(anonymous.status()).toBe(200);
  expect(anonymous.headers()["cache-control"] ?? "").toContain("no-store");

  const owner = await request.get(PANEL, { headers: await cookieHeader(OWNER()) });
  expect(owner.status()).toBe(200);
  expect(owner.headers()["cache-control"] ?? "").toContain("no-store");
});

test("E2E-18: every panel screen asks search engines not to index it", async ({ browser, baseURL }) => {
  const base = baseURL as string;
  const cases: { path: string; claims?: Claims }[] = [
    { path: PANEL },
    { path: PANEL + "?error=Configuration" },
    { path: PANEL, claims: OWNER() },
    { path: PANEL, claims: OTHER() },
  ];
  for (const c of cases) {
    const context = await browser.newContext();
    if (c.claims) await addSession(context, base, c.claims);
    const page = await context.newPage();
    await page.goto(c.path);
    await expect(page.locator('meta[name="robots"]'), c.path + " " + (c.claims?.sub ?? "")).toHaveAttribute(
      "content",
      "noindex, nofollow",
    );
    await context.close();
  }
});

test("E2E-19: no public file or page mentions the panel's address", async ({ request }) => {
  for (const path of ["/sitemap.xml", "/robots.txt", "/rss.xml", "/", "/blog/", "/blog/hello-world/"]) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    expect((await response.text()).toLowerCase(), path).not.toContain("bright-warm-greenhouse");
  }
});

test("E2E-23: the public pages carry no sign-in code, settings, cookies or auth requests", async ({
  browser,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const bodies: { url: string; text: string }[] = [];
  const setCookies: string[] = [];
  const requestUrls: string[] = [];
  const pending: Promise<void>[] = [];

  page.on("request", (r) => requestUrls.push(r.url()));
  page.on("response", (r) => {
    pending.push(
      (async () => {
        try {
          const headers = await r.allHeaders();
          if (headers["set-cookie"]) setCookies.push(r.url());
          const url = r.url();
          const type = r.request().resourceType();
          if (type === "document" || new URL(url).pathname.endsWith(".js")) {
            bodies.push({ url, text: await r.text() });
          }
        } catch {
          // a response without a body (a redirect) has nothing to read
        }
      })(),
    );
  });

  for (const path of ["/", "/blog/hello-world/"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    bodies.push({ url: path + " (page content)", text: await page.content() });
  }
  await Promise.all(pending);
  expect(bodies.length).toBeGreaterThan(2);

  const forbidden = ["next-auth", "authjs", "/api/auth", "accounts.google.com"];
  const names = ["AUTH_SECRET", "AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET", "ADMIN_EMAIL", ...runValues()];
  for (const b of bodies) {
    const lower = b.text.toLowerCase();
    for (const f of forbidden) expect(lower, b.url + " contains " + f).not.toContain(f);
    for (const n of names) expect(b.text, b.url + " contains a setting").not.toContain(n);
  }
  expect(setCookies).toEqual([]);
  expect(requestUrls.filter((u) => u.includes("/api/auth"))).toEqual([]);
  expect(await context.cookies()).toEqual([]);
  await context.close();
});

test("E2E-24: the panel page never contains a setting value", async ({ request }) => {
  const requests = [
    { path: PANEL, headers: {} },
    { path: PANEL, headers: await cookieHeader(OWNER()) },
    { path: PANEL, headers: await cookieHeader(OTHER()) },
    { path: PANEL + "?error=Configuration", headers: {} },
  ];
  for (const r of requests) {
    const response = await request.get(r.path, { headers: r.headers });
    expect(response.status(), r.path).toBe(200);
    const body = await response.text();
    for (const value of runValues()) {
      expect(value, "a setting has a run value").not.toBe("");
      expect(body, r.path).not.toContain(value);
    }
  }
});

test("E2E-25: no setting name is written next to a quoted value anywhere in the repository", async () => {
  const pattern =
    "(AUTH_SECRET|AUTH_GOOGLE_ID|AUTH_GOOGLE_SECRET|ADMIN_EMAIL)[\"']?[[:space:]]*[:=][[:space:]]*[\"'][^\"']+[\"']";
  const result = gitGrep(["-n", "-E", pattern, "--", ".", ":(exclude)docs", ":(exclude)package-lock.json"]);
  expect(result.stdout).toBe("");
  expect(result.status).toBe(1);
});

test("E2E-28: the panel and the auth routes are server-rendered, the public routes stay prerendered, and only three files import the auth module", async () => {
  const manifest = JSON.parse(fs.readFileSync(".next/prerender-manifest.json", "utf8")) as {
    routes: Record<string, unknown>;
    dynamicRoutes: Record<string, { fallback: unknown }>;
  };
  const keys = Object.keys(manifest.routes);
  for (const key of [
    "/",
    "/blog",
    "/blog/hello-world",
    "/blog/building-portfolio-nextjs",
    "/robots.txt",
    "/rss.xml",
    "/sitemap.xml",
  ]) {
    expect(keys, key).toContain(key);
  }
  expect(keys).not.toContain("/bright-warm-greenhouse");
  expect(keys.filter((k) => k.startsWith("/api/auth"))).toEqual([]);
  expect(manifest.dynamicRoutes["/blog/[slug]"].fallback).toBe(false);

  const result = gitGrep(["-l", "-E", "@/lib/auth\\b", "--", "src"]);
  expect(result.stdout.split("\n").filter(Boolean).sort()).toEqual([
    "src/app/api/auth/[...nextauth]/route.ts",
    "src/app/bright-warm-greenhouse/actions.ts",
    "src/app/bright-warm-greenhouse/page.tsx",
  ]);
});

test("E2E-29: signing in sends the browser to Google's sign-in page with the right request", async ({
  page,
  baseURL,
}) => {
  const google = await standIn(page.context(), baseURL as string, { kind: "hold" });
  await page.goto(PANEL);
  await page.getByRole("button", { name: "Sign in with Google", exact: true }).click();
  await expect.poll(() => google.calls).toBeGreaterThan(0);

  const url = new URL(google.urls[0]);
  expect(url.origin).toBe("https://accounts.google.com");
  expect(url.pathname).toBe("/o/oauth2/v2/auth");
  expect(url.searchParams.get("client_id")).toBe(setting("AUTH_GOOGLE_ID"));
  expect(url.searchParams.get("response_type")).toBe("code");
  expect(url.searchParams.get("scope")).toBe("openid profile email");
  expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  expect(url.searchParams.get("redirect_uri")).toBe((baseURL as string) + "/api/auth/callback/google");
});

test("E2E-30: the panel is styled from the theme tokens in light and dark", async ({ browser, baseURL }) => {
  const base = baseURL as string;
  const surfaceByTheme: Record<string, string> = {};

  for (const theme of ["light", "dark"]) {
    for (const signedIn of [false, true]) {
      const label = theme + (signedIn ? " owner" : " signed out");
      const context = await browser.newContext();
      if (signedIn) await addSession(context, base, OWNER());
      const page = await context.newPage();
      await page.addInitScript((t) => {
        try {
          localStorage.setItem("theme", t);
        } catch {
          // storage unavailable: the page falls back to its default theme
        }
      }, theme);
      await page.goto(PANEL);
      const region = page.getByRole("region", { name: "Admin" });
      await expect(region, label).toHaveText(signedIn ? T_OWNER : T_OUT, { useInnerText: true });

      const probe = (property: "backgroundColor" | "color", token: string) =>
        page.evaluate(
          ([prop, value]) => {
            const div = document.createElement("div");
            (div.style as unknown as Record<string, string>)[prop] = value;
            document.body.appendChild(div);
            const computed = (getComputedStyle(div) as unknown as Record<string, string>)[prop];
            div.remove();
            return computed;
          },
          [property, "var(" + token + ")"] as const,
        );
      const computed = (locator: ReturnType<typeof page.locator>, property: "background-color" | "color") =>
        locator.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), property);

      const surface = await probe("backgroundColor", "--surface");
      expect(await computed(region, "background-color"), label + " card").toBe(surface);
      expect(await computed(region.getByRole("heading", { level: 1 }), "color"), label + " heading").toBe(
        await probe("color", "--foreground"),
      );
      expect(await computed(region.getByRole("button").first(), "background-color"), label + " button").toBe(
        await probe("backgroundColor", "--surface-alt"),
      );
      if (theme === "dark") {
        await expect(page.locator("html"), label).toHaveAttribute("data-theme", "dark");
      }
      surfaceByTheme[theme] = surface;
      await context.close();
    }
  }
  expect(surfaceByTheme.dark).not.toBe(surfaceByTheme.light);
});

test("E2E-34: the earlier Firebase sign-in files are gone and the panel code names neither Firebase nor an owner ID", async () => {
  for (const p of [
    "src/lib/firebase/auth.ts",
    "src/lib/admin/owner.ts",
    "src/app/components/admin/SavingOffNotice.tsx",
    "e2e/admin-sign-in.spec.ts",
    "e2e/admin-owner-only-access.spec.ts",
  ]) {
    expect(fs.existsSync(p), p + " still exists").toBe(false);
  }

  const ids = gitGrep(["-n", "-E", "OWNER_UID|getOwnerUid|SIT_OWNER_UID", "--", "src"]);
  expect(ids.stdout).toBe("");
  expect(ids.status).toBe(1);

  const named = gitGrep([
    "-n",
    "-i",
    "firebase",
    "--",
    "src/app/bright-warm-greenhouse",
    "src/app/components/admin/AdminPanel.tsx",
    "src/lib/auth.ts",
    "src/lib/admin/access.ts",
    "src/app/api",
  ]);
  expect(named.stdout).toBe("");
  expect(named.status).toBe(1);
});

test("E2E-31: the standing docs no longer describe a static export or Firebase sign-in and name the new settings", async () => {
  const docs: { file: string; absent: string[]; present: string[] }[] = [
    {
      file: "CLAUDE.md",
      absent: [
        "**statically exported** to `out/`",
        "Production build **and static export**",
        "**1. Static export. No server exists at runtime.**",
        "Every route is prerendered at build time. There is no server at runtime.",
        "is required by static export",
        "**Never write or read a secret.** The site has none.",
        "REPLACE_WITH_OWNER_UID",
      ],
      present: ["AUTH_SECRET", "AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET", "ADMIN_EMAIL", "/api/auth/callback/google"],
    },
    {
      file: "docs/features/OVERVIEW.md",
      absent: [
        "no feature may require a server",
        "`firebase.json` and `absoluteUrl()`",
        "The panel stays a static page",
        "served by Firebase Hosting",
      ],
      present: ["Superseded in part by item 6"],
    },
    {
      file: ".claude/repo-profile.md",
      absent: [
        "The site has no environment variables.",
        "serves `out/` with `http-server`",
        "Needs a current `out/`",
        "firebase emulators:start",
        "It is the static export",
        "writes `.next/` and `out/`",
      ],
      present: ["next start", "ADMIN_EMAIL"],
    },
  ];

  for (const doc of docs) {
    const text = fs.readFileSync(doc.file, "utf8");
    for (const s of doc.absent) {
      expect(text.includes(s), doc.file + " still contains: " + s).toBe(false);
    }
    for (const s of doc.present) {
      expect(text.includes(s), doc.file + " is missing: " + s).toBe(true);
    }
  }
});
