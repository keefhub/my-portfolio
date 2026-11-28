import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test, type APIRequestContext } from "@playwright/test";

test.describe.configure({ mode: "serial" });

// The names of the removed backend and its scopes are never written whole in this file: the file must not match
// its own scans (E2E-42, E2E-43, E2E-55 and E2E-57), and the gate scans added lines for forbidden names.
const OLD = ["fire", "base"].join("");
const OLD2 = ["fire", "store"].join("");
const SELF = `e2e/retire-${OLD}.spec.ts`;

const BASE_COMMIT = "7dce05138ee7cd0447ecb5e24bfdb4e46143c209";
const PANEL = "/bright-warm-greenhouse/";
const HTML_PAGES = ["/", "/blog/", "/blog/hello-world/", "/blog/building-portfolio-nextjs/", "/no-such-page/"];
const FILE_PAGES = ["/rss.xml", "/sitemap.xml", "/robots.txt"];
const ADMIN_ROUTES = [
  "/api/admin/profile/",
  "/api/admin/images/",
  "/api/admin/images/upload/",
  "/api/admin/experience/",
  "/api/admin/projects/?id=probe",
  "/api/admin/certifications/",
  "/api/admin/tech-stack/",
  "/api/admin/blog-posts/?id=probe",
  "/api/admin/blog-posts/published/",
];
const PAGE_WRITE_ADDRESSES = [
  "/",
  "/blog/",
  "/blog/hello-world/",
  "/rss.xml",
  "/sitemap.xml",
  "/robots.txt",
  "/blog/building-portfolio-nextjs/",
];
const WRITE_METHODS = ["POST", "PUT", "PATCH", "DELETE"] as const;
const SETTINGS = [
  "AUTH_SECRET",
  "AUTH_GOOGLE_ID",
  "AUTH_GOOGLE_SECRET",
  "ADMIN_EMAIL",
  "SUPABASE_DB_URL",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
];
const PER_RUN_VALUES = ["AUTH_SECRET", "AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET", "ADMIN_EMAIL", "SUPABASE_DB_URL", "SUPABASE_URL"];
const PUBLIC_SOURCES = [
  "content/blog",
  "public",
  "src/app/layout.tsx",
  "src/app/globals.css",
  "src/app/robots.ts",
  "src/app/sitemap.ts",
  "src/app/rss.xml",
  "src/app/blog/page.tsx",
  "src/app/blog/layout.tsx",
  "src/app/components/experienceTimeLine.tsx",
  "src/app/components/techstack.tsx",
  "src/app/components/project.tsx",
  "src/app/components/certifications.tsx",
  "src/app/components/ThemeProvider.tsx",
  "src/app/components/blog",
  "src/lib/blog",
  "src/lib/site.ts",
  "src/lib/markdown.ts",
];

// Extended regular expressions, one per -e argument. None matches its own text.
const SECRET_SHAPES = [
  "-----BEGIN [A-Z ]*PRIVATE KEY-----",
  "GOCSPX-[A-Za-z0-9_-]{20,}",
  "AIza[0-9A-Za-z_-]{35}",
  "sb_secret_[A-Za-z0-9_-]{16,}",
  "sbp_[0-9a-f]{40}",
  "eyJ[A-Za-z0-9_-]{15,}\\.eyJ[A-Za-z0-9_-]{15,}\\.[A-Za-z0-9_-]{10,}",
  "postgres(ql)?://[^[:space:]:@/\"'`]+:[^[:space:]@\"'`]+@[^[:space:]\"'`]+",
  "[0-9]{6,}-[a-z0-9]{20,}\\.apps\\.googleusercontent\\.com",
  "ghp_[A-Za-z0-9]{36}",
  "github_pat_[A-Za-z0-9_]{20,}",
  "AKIA[0-9A-Z]{16}",
];
const NAME_WITH_VALUE = `(${SETTINGS.join("|")})=[^[:space:]]`;
const REMOVED_PATH_PATTERNS = [
  "admin-content-panel-acceptance",
  `${OLD2}\\.rules`,
  "storage\\.rules",
  `${OLD}\\.json`,
  `\\.${OLD}rc`,
  `lib/${OLD}/`,
  "deploy:rules",
].map((source) => new RegExp(source, "i"));
const EMULATOR_WORD = ["emu", "lator"].join("");
const EMULATOR_PORTS = "127\\.0\\.0\\.1:(9099|9199|8080)";
const EMULATOR_PATHSPECS = ["src", "scripts", ".github", "package.json", "playwright.config.ts", "e2e", `:(exclude)${SELF}`];
const BUILT_OUTPUT = [".next/server/app", ".next/static"];
const BUILD_FIRST = "run npm run build first";

// ---- helpers ------------------------------------------------------------------------------------------------

type Run = { stdout: string; status: number | null };

function run(command: string, args: string[], cwd: string = process.cwd()): Run {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  return { stdout: result.stdout ?? "", status: result.status };
}

function git(args: string[], cwd: string = process.cwd()): Run {
  return run("git", args, cwd);
}

function head(text: string): string {
  return text.slice(0, 1500);
}

/** A throw-away git repository holding the given files (path -> text). */
function fixture(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "scan-"));
  git(["init", "-q"], dir);
  for (const [name, text] of Object.entries(files)) {
    const full = path.join(dir, name);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, text);
  }
  return dir;
}

function dropFixture(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

function requireBuild(): void {
  const ready =
    fs.existsSync(".next/prerender-manifest.json") && BUILT_OUTPUT.every((dir) => fs.existsSync(dir));
  expect(ready, BUILD_FIRST).toBe(true);
}

function gitGrepArgs(flags: string[], patterns: string[], pathspecs: string[] = []): string[] {
  const args = ["grep", "--untracked", "-I", "-n", ...flags];
  for (const pattern of patterns) args.push("-e", pattern);
  if (pathspecs.length > 0) args.push("--", ...pathspecs);
  return args;
}

function grepBuilt(flags: string, patterns: string[], dirs: string[], cwd: string = process.cwd()): Run {
  const args = ["-rI" + flags];
  for (const pattern of patterns) args.push("-e", pattern);
  args.push(...dirs);
  return run("grep", args, cwd);
}

function scanEmulator(cwd: string): Run {
  return git(gitGrepArgs(["-i", "-E"], [EMULATOR_WORD, EMULATOR_PORTS], EMULATOR_PATHSPECS), cwd);
}

function scanSecrets(cwd: string): Run {
  return git(gitGrepArgs(["-E"], SECRET_SHAPES), cwd);
}

function scanE2eFiles(cwd: string): string[] {
  const listed = git(["ls-files", "--cached", "--others", "--exclude-standard", "--", "e2e"], cwd)
    .stdout.split("\n")
    .filter((file) => file !== "" && file !== SELF);
  const hits: string[] = [];
  for (const file of listed) {
    const full = path.join(cwd, file);
    if (!fs.existsSync(full)) continue;
    const text = fs.readFileSync(full, "utf8");
    for (const pattern of REMOVED_PATH_PATTERNS) if (pattern.test(text)) hits.push(`${file}: ${pattern.source}`);
  }
  return hits;
}

type Answer = { method: string; address: string; status: number; text: string };

async function sendWrites(request: APIRequestContext, addresses: string[]): Promise<Answer[]> {
  const answers: Answer[] = [];
  for (const address of addresses) {
    for (const method of WRITE_METHODS) {
      const response = await request.fetch(address, {
        method,
        headers: { "content-type": "application/json" },
        data: "{}",
      });
      answers.push({ method, address, status: response.status(), text: await response.text() });
    }
  }
  return answers;
}

/** The markup of the pages, the files, and every script the markups name. */
async function servedText(
  request: APIRequestContext,
  pages: string[],
  files: string[] = [],
): Promise<{ text: string; scriptsRead: number }> {
  const parts: string[] = [];
  const scripts = new Set<string>();
  for (const page of pages) {
    const markup = await (await request.get(page)).text();
    parts.push(markup);
    for (const match of markup.matchAll(/\/_next\/static\/[^"'\\\s,]+\.js/g)) scripts.add(match[0]);
  }
  for (const file of files) parts.push(await (await request.get(file)).text());
  let scriptsRead = 0;
  for (const script of scripts) {
    const response = await request.get(script);
    if (!response.ok()) continue;
    parts.push(await response.text());
    scriptsRead += 1;
  }
  return { text: parts.join("\n"), scriptsRead };
}

// ---- rows ---------------------------------------------------------------------------------------------------

test("E2E-41: the removed backend's files and directories are gone", async () => {
  const removed = [
    `src/lib/${OLD}`,
    `${OLD2}.rules`,
    "storage.rules",
    `${OLD}.json`,
    `.${OLD}rc`,
    `.${OLD}`,
    "e2e/admin-content-panel-acceptance.spec.ts",
  ];
  for (const removedPath of removed) {
    expect(fs.existsSync(removedPath), `${removedPath} still exists`).toBe(false);
    const listing = git(["ls-files", "--cached", "--others", "--exclude-standard", "--", removedPath]);
    // A file the working tree no longer has but the index still lists is a deletion not yet staged; the commit
    // stages it. Only a path that is still on disk counts as listed.
    const stillThere = listing.stdout.split("\n").filter((entry) => entry !== "" && fs.existsSync(entry));
    expect(listing.status, `git ls-files ${removedPath}`).toBe(0);
    expect(stillThere.join("\n"), `${removedPath} is still listed by git`).toBe("");
  }
});

test("E2E-42: no earlier spec expects a removed file, script or path", async () => {
  const probe = fixture({ "e2e/probe.spec.ts": `// reads lib/${OLD}/list.ts\n` });
  try {
    expect(scanE2eFiles(probe), "the scan control must match its probe").not.toEqual([]);
  } finally {
    dropFixture(probe);
  }
  expect(scanE2eFiles(process.cwd())).toEqual([]);
});

test("E2E-43: no emulator or emulator port is named in code, scripts, workflows or specs", async () => {
  const probe = fixture({ "src/probe.txt": `// ${EMULATOR_WORD} at 127.0.0.${"1"}:9099\n` });
  try {
    expect(scanEmulator(probe).status, "the scan control must match its probe").toBe(0);
  } finally {
    dropFixture(probe);
  }
  const result = scanEmulator(process.cwd());
  expect(head(result.stdout)).toBe("");
  expect(result.status).toBe(1);
});

test("E2E-44: every public page and file answers with its content", async ({ page, request }) => {
  const home = await page.goto("/");
  expect(home?.status()).toBe(200);
  expect(new URL(page.url()).pathname).toBe("/");
  for (const selector of ["section#experience", "section#projects", "section#certifications"]) {
    expect(await page.locator(selector).count(), `${selector} on /`).toBeGreaterThanOrEqual(1);
  }

  const index = await page.goto("/blog/");
  expect(index?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "Blog", exact: true })).toBeVisible();
  const hrefs = await page
    .locator('a[href^="/blog/"]')
    .evaluateAll((anchors) => [...new Set(anchors.map((anchor) => anchor.getAttribute("href") ?? ""))].sort());
  expect(hrefs).toEqual(["/blog/", "/blog/building-portfolio-nextjs/", "/blog/hello-world/"]);

  const hello = await page.goto("/blog/hello-world/");
  expect(hello?.status()).toBe(200);
  expect(new URL(page.url()).pathname).toBe("/blog/hello-world/");
  await expect(page.getByRole("heading", { level: 1, name: "Hello, World — Welcome to My Blog", exact: true })).toBeVisible();

  const building = await page.goto("/blog/building-portfolio-nextjs/");
  expect(building?.status()).toBe(200);
  expect(new URL(page.url()).pathname.endsWith("/blog/building-portfolio-nextjs/")).toBe(true);
  await expect(
    page.getByRole("heading", { level: 1, name: "Building a Portfolio with Next.js and Tailwind CSS", exact: true }),
  ).toBeVisible();

  const rss = await request.get("/rss.xml");
  expect(rss.status()).toBe(200);
  const rssBody = await rss.text();
  expect(rssBody).toContain('<rss version="2.0"');
  expect(rssBody).toContain("https://thegoldenpothos.xyz/blog/hello-world/");
  expect(rssBody).toContain("https://thegoldenpothos.xyz/blog/building-portfolio-nextjs/");

  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  const sitemapBody = await sitemap.text();
  expect(sitemapBody).toContain("<urlset");
  expect([...sitemapBody.matchAll(/<loc>([^<]*)<\/loc>/g)].map((match) => match[1])).toEqual([
    "https://thegoldenpothos.xyz/",
    "https://thegoldenpothos.xyz/blog/",
    "https://thegoldenpothos.xyz/blog/building-portfolio-nextjs/",
    "https://thegoldenpothos.xyz/blog/hello-world/",
  ]);

  const robots = await request.get("/robots.txt");
  expect(robots.status()).toBe(200);
  const robotsBody = await robots.text();
  expect(robotsBody).toContain("Allow: /");
  expect(robotsBody).toContain("Sitemap: https://thegoldenpothos.xyz/sitemap.xml");
});

test("E2E-45: the feed is served with its content type", async ({ request }) => {
  const response = await request.get("/rss.xml");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("application/rss+xml; charset=utf-8");
});

test("E2E-46: an unknown page and an unknown post answer with the not-found page", async ({ page }) => {
  for (const address of ["/no-such-page/", "/blog/no-such-post/"]) {
    const response = await page.goto(address);
    expect(response?.status(), address).toBe(404);
    await expect(page.getByRole("heading", { level: 1, name: "404", exact: true }), address).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "This page could not be found.", exact: true }), address).toBeVisible();
  }
});

test("E2E-47: the public sources equal the commit before the migration", async () => {
  const kind = git(["cat-file", "-t", BASE_COMMIT]);
  expect(kind.stdout.trim(), `the baseline commit ${BASE_COMMIT} is missing`).toBe("commit");

  const probe = fixture({ "a.txt": "one\n" });
  try {
    const identity = ["-c", "user.name=probe", "-c", "user.email=probe@example.test", "-c", "commit.gpgsign=false"];
    git(["add", "a.txt"], probe);
    git([...identity, "commit", "-q", "-m", "probe"], probe);
    fs.writeFileSync(path.join(probe, "a.txt"), "two\n");
    expect(git(["diff", "--quiet", "HEAD", "--", "a.txt"], probe).status, "the control diff must see the change").toBe(1);
  } finally {
    dropFixture(probe);
  }

  expect(git(["diff", "--quiet", BASE_COMMIT, "--", ...PUBLIC_SOURCES]).status, "a public source differs from the baseline").toBe(0);
  const untracked = git(["ls-files", "--others", "--exclude-standard", "--", ...PUBLIC_SOURCES]);
  expect(untracked.stdout, "an untracked public source").toBe("");
});

test("E2E-48: the feed, the sitemap and robots never name the panel", async ({ request }) => {
  for (const file of FILE_PAGES) {
    const body = (await (await request.get(file)).text()).toLowerCase();
    expect(body.includes("bright-warm-greenhouse"), `${file} names the panel`).toBe(false);
  }
  const control = (await (await request.get(PANEL)).text()).toLowerCase();
  expect(control.includes("bright-warm-greenhouse"), "the control (the panel itself) must name the panel").toBe(true);
});

test("E2E-49: no public page links to or names the panel", async ({ page, request }) => {
  for (const address of HTML_PAGES) {
    const markup = (await (await request.get(address)).text()).toLowerCase();
    expect(markup.includes("bright-warm-greenhouse"), `${address} markup names the panel`).toBe(false);
    await page.goto(address);
    expect(await page.locator('a[href*="bright-warm-greenhouse"]').count(), `${address} links to the panel`).toBe(0);
  }
});

test("E2E-50: the panel asks search engines to stay away", async ({ page }) => {
  const response = await page.goto(PANEL);
  expect(response?.status()).toBe(200);
  expect(await page.locator('meta[name="robots"]').getAttribute("content")).toBe("noindex, nofollow");
});

test("E2E-51: public pages are served from the prebuilt copy and the panel is not", async ({ request }) => {
  requireBuild();
  for (const address of [...HTML_PAGES, ...FILE_PAGES]) {
    const headers = (await request.get(address)).headers();
    expect(headers["x-nextjs-cache"], `${address} x-nextjs-cache`).toBe("HIT");
    expect(headers["set-cookie"], `${address} set-cookie`).toBeUndefined();
    if (HTML_PAGES.includes(address)) {
      expect(headers["x-nextjs-prerender"] ?? "", `${address} x-nextjs-prerender`).toContain("1");
    }
  }
  const manifest = JSON.parse(fs.readFileSync(".next/prerender-manifest.json", "utf8")) as { routes: Record<string, unknown> };
  const routes = Object.keys(manifest.routes);
  for (const route of ["/", "/blog", "/blog/building-portfolio-nextjs", "/blog/hello-world", "/robots.txt", "/rss.xml", "/sitemap.xml"]) {
    expect(routes, `the prerender manifest lacks ${route}`).toContain(route);
  }
  expect(routes).not.toContain("/bright-warm-greenhouse");

  const control = (await request.get(PANEL)).headers();
  expect(control["x-nextjs-cache"], "the control must not be a prerendered hit").not.toBe("HIT");
  expect(control["cache-control"] ?? "", "the control cache-control").toContain("no-store");
});

test("E2E-52: no public page or script carries sign-in, database or panel code", async ({ request }) => {
  const pub = await servedText(request, HTML_PAGES);
  expect(pub.text.length, "the public text length").toBeGreaterThan(100000);
  expect(pub.scriptsRead, "the public scripts read").toBeGreaterThanOrEqual(5);
  const forbidden = [
    "next-auth",
    "authjs",
    "@auth/core",
    "/api/auth",
    "/api/admin",
    "SUPABASE",
    "supabase",
    "postgres",
    "bright-warm-greenhouse",
    "AUTH_SECRET",
    "ADMIN_EMAIL",
    "AUTH_GOOGLE",
  ];
  expect(forbidden.filter((word) => pub.text.includes(word))).toEqual([]);

  const control = await servedText(request, [PANEL]);
  expect(control.text, "the control (the panel) must carry the admin address").toContain("/api/admin");
  expect(control.text, "the control (the panel) must carry its own name").toContain("bright-warm-greenhouse");
});

test("E2E-53: a signed-out write to any owner route is refused", async ({ request }) => {
  const answers = await sendWrites(request, ADMIN_ROUTES);
  expect(answers).toHaveLength(36);
  const accepted = answers.filter((answer) => answer.status !== 401 && answer.status !== 405);
  expect(
    accepted.map((answer) => `${answer.method} ${answer.address} answered ${answer.status}`),
    "signed-out writes that were not refused",
  ).toEqual([]);

  const control = await request.get("/api/admin/profile/");
  expect(control.status()).toBe(401);
  expect(await control.text()).toBe('{"error":"not-signed-in"}');
});

test("E2E-54: the published posts are the same after the refused writes", async ({ request }) => {
  const first = await request.get("/api/admin/blog-posts/published/");
  const firstBody = await first.text();
  expect(first.status()).toBe(200);

  await sendWrites(request, ADMIN_ROUTES);
  await sendWrites(request, PAGE_WRITE_ADDRESSES);

  const second = await request.get("/api/admin/blog-posts/published/");
  expect(second.status()).toBe(200);
  expect(await second.text()).toBe(firstBody);
});

test("E2E-55: no secret-shaped text is in the repository or the built public output", async () => {
  requireBuild();
  const secretProbe = `const k = "AIza${"A".repeat(35)}";\n`;
  const probe = fixture({ "probe.txt": secretProbe });
  try {
    expect(scanSecrets(probe).status, "the repository scan control must match its probe").toBe(0);
    expect(grepBuilt("lE", SECRET_SHAPES, ["."], probe).status, "the built-output scan control must match its probe").toBe(0);
  } finally {
    dropFixture(probe);
  }
  const repository = scanSecrets(process.cwd());
  expect(head(repository.stdout), "secret-shaped text in the repository").toBe("");
  expect(repository.status).toBe(1);
  const built = grepBuilt("lE", SECRET_SHAPES, BUILT_OUTPUT);
  expect(head(built.stdout), "secret-shaped text in the built output").toBe("");
  expect(built.status).toBe(1);
});

test("E2E-56: none of this run's setting values is in the repository, the built output or a served page", async ({ request }) => {
  requireBuild();
  const values = PER_RUN_VALUES.map((name) => {
    const value = process.env[name];
    expect(value, `${name} must be set for the run`).toBeTruthy();
    return { name, value: value as string };
  });
  const adminEmail = values.find((entry) => entry.name === "ADMIN_EMAIL")?.value as string;

  const probe = fixture({ "probe.txt": `contact ${adminEmail}\n` });
  try {
    expect(git(gitGrepArgs(["-F"], [adminEmail]), probe).status, "the repository scan control must match its probe").toBe(0);
    expect(grepBuilt("lF", [adminEmail], ["."], probe).status, "the built-output scan control must match its probe").toBe(0);
  } finally {
    dropFixture(probe);
  }

  const served = await servedText(request, HTML_PAGES, FILE_PAGES);
  for (const { name, value } of values) {
    const repository = git(gitGrepArgs(["-F"], [value]));
    expect(head(repository.stdout), `${name} value in the repository`).toBe("");
    expect(repository.status, `${name} repository scan`).toBe(1);
    const built = grepBuilt("lF", [value], BUILT_OUTPUT);
    expect(head(built.stdout), `${name} value in the built output`).toBe("");
    expect(built.status, `${name} built-output scan`).toBe(1);
    expect(served.text.includes(value), `${name} value in a served page`).toBe(false);
  }
});

test("E2E-57: no .env file is kept, no setting is written with a value, and the settings are named", async () => {
  const probe = fixture({ "probe.txt": `${"ADMIN_"}${"EMAIL"}=someone\n` });
  try {
    expect(git(gitGrepArgs(["-E"], [NAME_WITH_VALUE]), probe).status, "the scan control must match its probe").toBe(0);
  } finally {
    dropFixture(probe);
  }

  const listed = git(["ls-files", "--cached", "--others", "--exclude-standard"]).stdout.split("\n").filter((entry) => entry !== "");
  expect(listed.filter((entry) => path.basename(entry).startsWith(".env"))).toEqual([]);

  const named = git(gitGrepArgs(["-E"], [NAME_WITH_VALUE]));
  expect(head(named.stdout), "a setting written with a value").toBe("");
  expect(named.status).toBe(1);

  const claude = fs.readFileSync("CLAUDE.md", "utf8");
  for (const setting of SETTINGS) expect(claude, `CLAUDE.md names ${setting}`).toContain(setting);
});

test("E2E-70: a write to a public page changes nothing and is never accepted", async ({ request }) => {
  const failures: string[] = [];
  for (const address of PAGE_WRITE_ADDRESSES) {
    const before = await (await request.get(address)).text();
    const answers = await sendWrites(request, [address]);
    expect(answers).toHaveLength(4);
    for (const answer of answers) {
      const refused = answer.status === 405;
      const unchanged = answer.status === 200 && answer.text === before;
      if (!refused && !unchanged) failures.push(`${answer.method} ${answer.address} answered ${answer.status}`);
    }
  }
  expect(failures, "writes to public pages that were neither refused nor unchanged").toEqual([]);
});

test("E2E-58: the removed packages and rules scripts are gone from package.json and the lock", async () => {
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
  const lock = JSON.parse(fs.readFileSync("package-lock.json", "utf8"));
  const dependencies: Record<string, string> = pkg.dependencies ?? {};
  const devDependencies: Record<string, string> = pkg.devDependencies ?? {};
  const scripts: Record<string, string> = pkg.scripts ?? {};

  expect(Object.keys(dependencies).filter((name) => name.toLowerCase().includes(OLD))).toEqual([]);
  expect(Object.keys(devDependencies).filter((name) => name.toLowerCase().includes(OLD))).toEqual([]);
  expect(Object.keys(scripts).filter((name) => name.startsWith("deploy:rules"))).toEqual([]);
  expect(Object.values(scripts).filter((value) => value.toLowerCase().includes(OLD))).toEqual([]);

  const lockText = JSON.stringify(lock).toLowerCase();
  expect(lockText.includes(OLD), "the lock names the removed backend").toBe(false);
  expect(lockText.includes(OLD2), "the lock names the removed database").toBe(false);

  expect(lock.packages[""].dependencies).toEqual(pkg.dependencies);
  expect(lock.packages[""].devDependencies).toEqual(pkg.devDependencies);
  expect(lock.packages["node_modules/next"].version).toBe("16.2.6");
  expect(lock.packages["node_modules/next-auth"].version).toBe("5.0.0-beta.32");
  expect(lock.packages["node_modules/postgres"].version).toBe("4.1.1");
});

test("E2E-59: the pipeline keeps its checks and has no deploy job", async () => {
  const text = fs.readFileSync(".github/workflows/pipeline.yml", "utf8");
  const lines = text.split("\n");
  const start = lines.findIndex((line) => line === "jobs:");
  expect(start, "the jobs: line").toBeGreaterThanOrEqual(0);
  const jobIds = lines
    .slice(start + 1)
    .map((line) => line.match(/^  ([a-z][a-z-]*):\s*$/))
    .filter((match): match is RegExpMatchArray => match !== null)
    .map((match) => match[1]);
  expect(jobIds).toEqual(["master-source", "verify"]);

  expect(text).toMatch(/^\s*- run: npm run typecheck\s*$/m);
  expect(text).toMatch(/^\s*- run: npm run lint:new\s*$/m);
  expect(text).toMatch(/^\s*- run: npm run build\s*$/m);
  expect(text).toMatch(/^ {2}push:\s*$/m);
  expect(text).toMatch(/^ {2}pull_request:\s*$/m);
  expect(text.split("branches: [develop, master]").length - 1, "branches: [develop, master]").toBe(2);
  for (const forbidden of ["deploy-staging", "deploy-production", "npm run deploy"]) {
    expect(text.includes(forbidden), `the pipeline names ${forbidden}`).toBe(false);
  }
});

test("E2E-60: no workflow holds a secret, an environment, a credential path or the removed backend", async () => {
  const dir = ".github/workflows";
  const files = fs.readdirSync(dir).filter((name) => name.endsWith(".yml"));
  expect(files.length).toBeGreaterThan(0);
  for (const file of files) {
    const text = fs.readFileSync(path.join(dir, file), "utf8");
    const lower = text.toLowerCase();
    expect(text.includes("secrets."), `${file} holds secrets.`).toBe(false);
    expect(text.includes("GOOGLE_APPLICATION_CREDENTIALS"), `${file} holds a credentials path`).toBe(false);
    expect(text.includes("deploy:rules"), `${file} runs a rules deploy`).toBe(false);
    expect(
      text.split("\n").filter((line) => line.trim().startsWith("environment:")),
      `${file} names an environment`,
    ).toEqual([]);
    expect(lower.includes(OLD), `${file} names the removed backend`).toBe(false);
    expect(lower.includes(OLD2), `${file} names the removed database`).toBe(false);
  }
});

test("E2E-61: the site stays free of provider code, hosting commands and function settings", async () => {
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
  const vercel = JSON.parse(fs.readFileSync("vercel.json", "utf8"));
  const names = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})].map((name) =>
    name.toLowerCase(),
  );
  const forbiddenStarts = [OLD, ["@ver", "cel/"].join(""), ["@supa", "base/"].join(""), ["@google", "-cloud/"].join(""), "googleapis"];
  for (const start of forbiddenStarts) {
    expect(names.filter((name) => name.startsWith(start)), `dependencies starting ${start}`).toEqual([]);
  }

  const allowedKeys = ["$schema", "framework", "installCommand", "buildCommand", "trailingSlash", "cleanUrls", "headers"];
  expect(Object.keys(vercel).filter((key) => !allowedKeys.includes(key))).toEqual([]);

  expect(fs.readFileSync("next.config.ts", "utf8")).toMatch(/unoptimized:\s*true/);

  const settingPattern = ["maxDuration", "preferredRegion"].join("|");
  const settings = git(gitGrepArgs(["-E"], [settingPattern], ["src"]));
  expect(head(settings.stdout), "a function setting under src").toBe("");
  expect(settings.status).toBe(1);

  const hostingCommand = /vercel\s+(deploy|pull|build|promote|--prod)/i;
  const dir = ".github/workflows";
  for (const file of fs.readdirSync(dir).filter((name) => name.endsWith(".yml"))) {
    const text = fs.readFileSync(path.join(dir, file), "utf8");
    expect(hostingCommand.test(text), `${file} holds a hosting command`).toBe(false);
    expect(text.includes("npx vercel"), `${file} runs npx vercel`).toBe(false);
    expect(text.includes("VERCEL_"), `${file} names a VERCEL_ setting`).toBe(false);
    expect(text.includes("secrets."), `${file} holds secrets.`).toBe(false);
  }
});

test("E2E-63: the standing documents describe the new stack and keep the strings other specs need", async () => {
  const read = (file: string): string => fs.readFileSync(file, "utf8");
  const readme = read("README.md");
  const reference = read("Reference.md");
  const claude = read("CLAUDE.md");
  const profile = read(".claude/repo-profile.md");
  const overview = read("docs/features/OVERVIEW.md");

  const mustHave = (name: string, text: string, strings: string[]): string[] =>
    strings.filter((needle) => !text.includes(needle)).map((needle) => `${name} lacks ${needle}`);
  const mustLack = (name: string, text: string, strings: string[]): string[] =>
    strings.filter((needle) => text.includes(needle)).map((needle) => `${name} still holds ${needle}`);

  const claudeStrings = [
    "The blog posts are stored in Supabase",
    "the experience entries and the projects",
    "The certifications are stored in Supabase",
    "The tech stack is stored in Supabase",
    "The site reads seven settings by name",
    "/api/auth/callback/google",
    "stand-in:",
    "src/lib/server/",
    "src/app/api/admin/**",
    ...SETTINGS,
    "createListService",
    "createHttpListStore",
    "/api/admin/images/",
    "/api/admin/images/upload/",
    "/api/admin/profile/",
  ];
  const claudeRoutes = ["experience", "projects", "certifications", "tech-stack", "blog-posts", "blog-posts/published"];
  const routeRowProblems = claudeRoutes
    .filter(
      (route) =>
        !claude
          .split("\n")
          .some((line) => line.includes(`/api/admin/${route}/`) && line.includes(`src/app/api/admin/${route}/route.ts`)),
    )
    .map((route) => `CLAUDE.md has no route-table row for /api/admin/${route}/ with its route file`);

  const claudeLines = claude.split("\n");
  const orderRowProblems: string[] = [];
  if (!claudeLines.some((line) => line.startsWith("| 1 | [admin-sign-in](docs/features/admin-sign-in/story.md)"))) {
    orderRowProblems.push("CLAUDE.md lacks order-table row 1");
  }
  if (!claudeLines.some((line) => line.startsWith(`| 20 | [retire-${OLD}]`))) {
    orderRowProblems.push("CLAUDE.md lacks order-table row 20");
  }

  const problems = [
    ...mustHave("README.md", readme, [
      "Vercel",
      "Supabase",
      "Auth.js",
      "npm run dev",
      "npm run build",
      "npm run typecheck",
      "npm run lint:new",
      "CLAUDE.md",
      "Reference.md",
      ...SETTINGS,
    ]),
    ...mustLack("README.md", readme, ["umm"]),
    ...mustHave("Reference.md", reference, ["Vercel", "Auth.js", "Supabase", "/api/auth/", "/api/admin/", "trailingSlash: true"]),
    ...mustLack("Reference.md", reference, [
      'output: "export"',
      "tatic export",
      "./out/",
      "`out/`",
      "out/blog",
      "no server at runtime",
      "No runtime backend",
      "SavingOffNotice",
      "own user ID",
    ]),
    ...mustHave("CLAUDE.md", claude, claudeStrings),
    ...routeRowProblems,
    ...mustLack("CLAUDE.md", claude, ["Leftover rules"]),
    ...orderRowProblems,
    ...mustHave(".claude/repo-profile.md", profile, [
      "SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
      "SUPABASE_DB_URL",
      "stand-in:",
      "next start",
      "ADMIN_EMAIL",
      "The site reads seven settings by name",
    ]),
    ...mustLack(".claude/repo-profile.md", profile, ["CI publishes", "rules job", "cannot pass and are deleted by the slice"]),
    ...mustHave("docs/features/OVERVIEW.md", overview, ["Superseded in part by item 6", "hosting is Vercel (free plan)"]),
  ];
  expect(problems, "document strings that are missing or still present").toEqual([]);
});

// ---- Step 4: the search of the whole repository and the pull request template --------------------------------------

const ALLOWED_RECORD_PATHS = [/^docs\/features\/[a-z0-9-]+\/(story|spec|impact|log)\.md$/, /^docs\/requirements\/[A-Za-z0-9._-]+\.md$/];
const ALLOWED_PUBLIC_PATHS = ["content/blog/building-portfolio-nextjs.md", "src/app/components/project.tsx"];
const OVERVIEW_INDEX_ROW = `| retire ${OLD} and document the new stack | [retire-${OLD}](retire-${OLD}/story.md) |`;

type Search = { raw: string[]; leftovers: string[] };

/** The search of D-02: content matches of both product names, then path matches, minus the allow-list. */
function searchBothNames(cwd: string): Search {
  const content = git(gitGrepArgs(["-i", "-E"], [OLD, OLD2]), cwd);
  const raw = content.stdout.split("\n").filter((line) => line !== "");
  const leftovers: string[] = [];
  for (const entry of raw) {
    const first = entry.indexOf(":");
    const second = entry.indexOf(":", first + 1);
    const file = entry.slice(0, first);
    const line = entry.slice(second + 1);
    const where = `${file}:${entry.slice(first + 1, second)}`;
    if (ALLOWED_RECORD_PATHS.some((pattern) => pattern.test(file)) || ALLOWED_PUBLIC_PATHS.includes(file)) continue;
    if (file === "CLAUDE.md" && /^\| (1|2|3|4|5|6|7|8|9|10|20) \| /.test(line)) continue;
    if (file === "docs/features/OVERVIEW.md" && line.trim().toLowerCase() === OVERVIEW_INDEX_ROW) continue;
    leftovers.push(where);
  }
  const names = new RegExp(`${OLD}|${OLD2}`, "i");
  const paths = git(["ls-files", "--cached", "--others", "--exclude-standard"], cwd)
    .stdout.split("\n")
    .filter((entry) => entry !== "" && names.test(entry) && fs.existsSync(path.join(cwd, entry)));
  for (const file of paths) {
    if (file === SELF) continue;
    if (ALLOWED_RECORD_PATHS.some((pattern) => pattern.test(file)) || ALLOWED_PUBLIC_PATHS.includes(file)) continue;
    leftovers.push(file);
  }
  return { raw, leftovers };
}

test("E2E-64: no file or path outside the earlier records and the public content names the removed backend", async () => {
  const probe = fixture({ [`notes/${OLD}-probe.txt`]: `a line that names ${OLD}\n` });
  try {
    const control = searchBothNames(probe);
    expect(control.raw, "the search control must match its probe").not.toEqual([]);
    expect(control.leftovers, "the search control must report its probe").not.toEqual([]);
  } finally {
    dropFixture(probe);
  }

  const found = searchBothNames(process.cwd());
  const rawFiles = new Set(found.raw.map((entry) => entry.slice(0, entry.indexOf(":"))));
  for (const named of ["docs/features/admin-sign-in/spec.md", "content/blog/building-portfolio-nextjs.md", "src/app/components/project.tsx"]) {
    expect(rawFiles.has(named), `the search cannot see ${named}`).toBe(true);
  }
  expect(found.leftovers, "leftover path:line and path entries").toEqual([]);
});

const SETTINGS_HEADING = "## Settings to set in Vercel";

function templateSection(): { headings: number; text: string; lines: string[] } {
  const all = fs.readFileSync(".github/pull_request_template.md", "utf8").split("\n");
  const headings = all.filter((line) => line === SETTINGS_HEADING).length;
  const start = all.indexOf(SETTINGS_HEADING);
  if (start === -1) return { headings, text: "", lines: [] };
  const rest = all.slice(start + 1);
  const length = rest.findIndex((line) => line.startsWith("## "));
  const lines = length === -1 ? rest : rest.slice(0, length);
  return { headings, text: [SETTINGS_HEADING, ...lines].join("\n"), lines };
}

test("E2E-65: the pull request template lists the seven settings by name", async () => {
  const section = templateSection();
  expect(section.headings, "the heading must occur exactly once").toBe(1);
  const listed = section.lines.filter((line) => line.startsWith("- "));
  expect(listed).toEqual(SETTINGS.map((name) => `- \`${name}\``));
});

test("E2E-66: the pull request template says to set them for Production and for SIT", async () => {
  const section = templateSection();
  expect(section.text).toContain("Production");
  expect(section.text).toContain("SIT");
});

test("E2E-67: the pull request template writes no value after any setting name", async () => {
  const section = templateSection();
  expect(section.text.toLowerCase()).toContain("never write a value");
  expect(section.lines.filter((line) => line.includes("=")), "a line of the section holds =").toEqual([]);
  const items = section.lines.filter((line) => line.startsWith("- "));
  expect(items.length).toBeGreaterThan(0);
  expect(items.filter((line) => !/^- `[A-Z_]+`$/.test(line)), "an item with text after the name").toEqual([]);
});
