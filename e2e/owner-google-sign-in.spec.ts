import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";

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
