import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  expect,
  test,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
} from "@playwright/test";
import { encode } from "next-auth/jwt";
import { authLogLine } from "../src/lib/admin/access";
import { databaseLogLine } from "../src/lib/admin/dblog";
import { storageLogLine } from "../src/lib/admin/storagelog";

// Intent acceptance for hosting-and-backend-migration (docs/requirements/hosting-and-backend-migration-intent.md).
// Every test goes through the running site (`next start`): the panel in a browser, the owner-only entry points
// with direct requests, the public pages as a visitor. Google, the database and file storage are the stand-ins the
// slices built into the test run (a minted session cookie, `stand-in:` settings, a routed storage host).
//
// The name of the removed backend and its scopes are never written whole in this file: the file is itself scanned.

test.describe.configure({ mode: "default" });

const OLD = ["fire", "base"].join("");
const OLD2 = ["fire", "store"].join("");
const EMU = ["emu", "lator"].join("");

const PANEL = "/bright-warm-greenhouse/";
const SESSION_COOKIE = "authjs.session-token";
const STAND_IN = "stand-in:";
const HOST = "https://stand-in.invalid";
const BASE_COMMIT = "7dce05138ee7cd0447ecb5e24bfdb4e46143c209";

const DB_URL = process.env.SUPABASE_DB_URL ?? "";
const DB_FILE = DB_URL.startsWith(STAND_IN) ? DB_URL.slice(STAND_IN.length) : "";
const STORE_URL = process.env.SUPABASE_URL ?? "";
const STORE_DIR = STORE_URL.startsWith(STAND_IN) ? STORE_URL.slice(STAND_IN.length) : "";

const SETTINGS = [
  "AUTH_SECRET",
  "AUTH_GOOGLE_ID",
  "AUTH_GOOGLE_SECRET",
  "ADMIN_EMAIL",
  "SUPABASE_DB_URL",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
];
const PER_RUN = ["AUTH_SECRET", "AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET", "ADMIN_EMAIL", "SUPABASE_DB_URL", "SUPABASE_URL"];
const LABELS = ["Profile", "Experience", "Projects", "Certifications", "Tech stack", "Blog posts", "Images"];
const T_OUT = "Admin Sign in with Google";
const T_DENY = "Admin This account is not allowed to use the admin panel. Sign out";
const T_OWNER = "Admin Profile Experience Projects Certifications Tech stack Blog posts Images Sign out";
const DENY_TEXT = "This account is not allowed to use the admin panel.";

// ---- state: the database stand-in file and the storage stand-in directory ---------------------------------------

function reset(): void {
  if (DB_FILE !== "") {
    fs.rmSync(DB_FILE, { force: true });
    fs.rmSync(DB_FILE + ".tmp", { force: true });
  }
  if (STORE_DIR !== "") fs.rmSync(STORE_DIR, { recursive: true, force: true });
}

function storePut(id: string, bytes: Buffer, type: string): void {
  fs.mkdirSync(STORE_DIR, { recursive: true });
  fs.writeFileSync(path.join(STORE_DIR, id), bytes);
  fs.writeFileSync(path.join(STORE_DIR, id + ".type"), type);
}

function storeIds(): string[] {
  if (!fs.existsSync(STORE_DIR)) return [];
  return fs
    .readdirSync(STORE_DIR)
    .filter((name) => name !== "unreachable" && !name.endsWith(".type"))
    .sort();
}

// Everything the stand-ins hold, as one comparable string.
function snapshot(): string {
  const db = DB_FILE !== "" && fs.existsSync(DB_FILE) ? fs.readFileSync(DB_FILE, "utf8") : "";
  const files = fs.existsSync(STORE_DIR)
    ? fs
        .readdirSync(STORE_DIR)
        .sort()
        .map((name) => name + ":" + createHash("sha1").update(fs.readFileSync(path.join(STORE_DIR, name))).digest("hex"))
    : [];
  return JSON.stringify({ db, files });
}

function dbBreak(): void {
  const current = DB_FILE !== "" && fs.existsSync(DB_FILE) ? (JSON.parse(fs.readFileSync(DB_FILE, "utf8")) as object) : {};
  fs.writeFileSync(DB_FILE, JSON.stringify({ ...current, unreachable: true }));
}

function dbFix(): void {
  const current = JSON.parse(fs.readFileSync(DB_FILE, "utf8")) as Record<string, unknown>;
  delete current.unreachable;
  fs.writeFileSync(DB_FILE, JSON.stringify(current));
}

function storeBreak(): void {
  fs.mkdirSync(STORE_DIR, { recursive: true });
  fs.writeFileSync(path.join(STORE_DIR, "unreachable"), "");
}

function storeFix(): void {
  fs.rmSync(path.join(STORE_DIR, "unreachable"), { force: true });
}

test.beforeEach(() => {
  expect(DB_FILE, "the run must carry a database stand-in").not.toBe("");
  expect(STORE_DIR, "the run must carry a storage stand-in").not.toBe("");
  reset();
});

// ---- identities --------------------------------------------------------------------------------------------------

type Claims = { sub: string; email: string; name: string; emailVerified: boolean };
const setting = (name: string): string => process.env[name] ?? "";
const OWNER = (): Claims => ({ sub: "owner-1", email: setting("ADMIN_EMAIL"), name: "Owner Test", emailVerified: true });
const OTHER = (): Claims => ({ sub: "other-1", email: "mallory@example.test", name: "Mallory Intruder", emailVerified: true });
const UNVERIFIED = (): Claims => ({ sub: "owner-2", email: setting("ADMIN_EMAIL"), name: "Unverified Owner", emailVerified: false });
const LOOKALIKE = (): Claims => {
  const [local, domain] = setting("ADMIN_EMAIL").split("@");
  return { sub: "look-1", email: `${local}+extra@${domain}`, name: "Look Alike", emailVerified: true };
};

async function mint(claims: Claims, options: { secret?: string; maxAge?: number } = {}): Promise<string> {
  return encode({
    token: { ...claims },
    secret: options.secret ?? setting("AUTH_SECRET"),
    salt: SESSION_COOKIE,
    maxAge: options.maxAge ?? 3600,
  });
}

const cookieOf = async (claims: Claims, options: { secret?: string; maxAge?: number } = {}): Promise<string> =>
  SESSION_COOKIE + "=" + (await mint(claims, options));

type Outsider = { label: string; cookie: () => Promise<string | undefined>; status: number };
const OUTSIDERS: Outsider[] = [
  { label: "signed out", cookie: async () => undefined, status: 401 },
  { label: "another verified Google account", cookie: () => cookieOf(OTHER()), status: 403 },
  { label: "the owner's address, not verified", cookie: () => cookieOf(UNVERIFIED()), status: 403 },
  { label: "a look-alike of the owner's address", cookie: () => cookieOf(LOOKALIKE()), status: 403 },
  { label: "a session signed with another secret", cookie: () => cookieOf(OWNER(), { secret: "another-secret-0123456789abcdef0123" }), status: 401 },
  { label: "an expired session", cookie: () => cookieOf(OWNER(), { maxAge: -3600 }), status: 401 },
  { label: "a garbled session", cookie: async () => SESSION_COOKIE + "=not-a-token", status: 401 },
];

// ---- direct requests ---------------------------------------------------------------------------------------------

type Reply = { status: number; text: string; json: unknown; headers: Record<string, string> };

async function call(
  request: APIRequestContext,
  method: string,
  url: string,
  options: { cookie?: string; body?: unknown } = {},
): Promise<Reply> {
  const headers: Record<string, string> = {};
  if (options.cookie !== undefined) headers.cookie = options.cookie;
  if (options.body !== undefined) headers["content-type"] = "application/json";
  const response = await request.fetch(url, {
    method,
    headers,
    data: options.body === undefined ? undefined : JSON.stringify(options.body),
    maxRedirects: 0,
  });
  const text = await response.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  return { status: response.status(), text, json, headers: response.headers() };
}

const field = (json: unknown, key: string): unknown =>
  typeof json === "object" && json !== null ? (json as Record<string, unknown>)[key] : undefined;

// ---- content ----------------------------------------------------------------------------------------------------

const STORED = ["Zed Marker Person", "Billing Console", "Cloud Practitioner", "Acme", "seed-post"];
const PROFILE = {
  name: "Zed Marker Person",
  headline: "Software Engineer",
  about: ["First paragraph.", "Second paragraph."],
  photo: "",
  email: "hello@example.com",
  resumeLink: "/resume.pdf",
  socialLinks: [{ label: "GitHub", url: "https://github.com/example" }],
};
const EXPERIENCE = {
  year: "2024",
  title: "Software Engineer",
  company: "Acme",
  duration: "Jan 2024 - Present",
  description: "Built the billing service.",
  details: ["Cut invoice errors by 40%"],
};
const PROJECT = {
  title: "Billing Console",
  shortDesc: "An internal tool",
  description: ["First paragraph"],
  tech: ["TypeScript"],
  github: "https://github.com/example/billing",
  demo: "https://example.com/billing",
};
const CERTIFICATION = { name: "Cloud Practitioner", icon: "/images/certs/cloud.png", url: "https://example.com/credential/1" };
const TECH = { category: "Frontend", tools: [{ name: "React", icon: "/images/tech/react.png" }] };
const postWire = (slug: string, draft: boolean, marker = "body marker") => ({
  title: "Post " + slug,
  excerpt: "An excerpt for " + slug,
  date: "2026-05-15",
  slug,
  tags: ["nextjs", "vercel"],
  draft,
  featured: false,
  coverImage: "",
  coverAlt: "",
  body: "# Heading\n\n" + marker,
});

const FAMILIES = [
  { name: "experience", url: "/api/admin/experience/", content: EXPERIENCE },
  { name: "projects", url: "/api/admin/projects/", content: PROJECT },
  { name: "certifications", url: "/api/admin/certifications/", content: CERTIFICATION },
  { name: "tech-stack", url: "/api/admin/tech-stack/", content: TECH },
] as const;

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
// The bytes of a 1x1 PNG followed by zero bytes up to exactly n bytes.
function png(n: number): Buffer {
  const out = Buffer.alloc(n);
  PNG_1X1.copy(out, 0, 0, Math.min(PNG_1X1.length, n));
  return out;
}
// The svg text followed by spaces up to exactly n bytes.
function svg(n: number): Buffer {
  const head = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>';
  return Buffer.from(head + " ".repeat(Math.max(0, n - head.length)));
}
type UploadFile = { name: string; mimeType: string; buffer: Buffer };
const publicOf = (id: string): string => HOST + "/storage/v1/object/public/images/" + id;

type Seed = { experience: string; project: string; certification: string; tech: string; post: string; image: string; pending: string };

// Put one record in every family through the owner-only entry points, plus an image in the library and an upload
// that was sent to storage but never registered.
async function seedEverything(request: APIRequestContext): Promise<Seed> {
  const cookie = await cookieOf(OWNER());
  const id = async (url: string, content: unknown): Promise<string> => {
    const reply = await call(request, "POST", url, { cookie, body: { position: 0, content } });
    expect(reply.status, "seed " + url).toBe(200);
    return field(reply.json, "id") as string;
  };
  expect((await call(request, "PUT", "/api/admin/profile/", { cookie, body: PROFILE })).status).toBe(200);
  const experience = await id("/api/admin/experience/", EXPERIENCE);
  const project = await id("/api/admin/projects/", PROJECT);
  const certification = await id("/api/admin/certifications/", CERTIFICATION);
  const tech = await id("/api/admin/tech-stack/", TECH);
  const posted = await call(request, "POST", "/api/admin/blog-posts/", { cookie, body: { content: postWire("seed-post", false) } });
  expect(posted.status, "seed post").toBe(200);

  const issue = async (name: string, size: number): Promise<string> => {
    const reply = await call(request, "POST", "/api/admin/images/upload/", { cookie, body: { name, type: "image/png", size } });
    expect(reply.status, "seed upload address").toBe(200);
    const imageId = field(reply.json, "id") as string;
    storePut(imageId, png(size), "image/png");
    return imageId;
  };
  const image = await issue("seed.png", 300);
  const registered = await call(request, "POST", "/api/admin/images/", { cookie, body: { id: image, name: "seed.png", type: "image/png", size: 300 } });
  expect(registered.status, "seed register").toBe(200);
  const pending = await issue("pending.png", 400);
  return { experience, project, certification, tech, post: "seed-post", image, pending };
}

type Attempt = { label: string; method: string; url: string; body?: unknown };

// Every request that creates, changes or deletes content, or uploads or deletes an image, each one valid on its own
// so that only the access rule can stop it. Run in this order by the owner, each one succeeds.
function attempts(s: Seed): Attempt[] {
  const list: Attempt[] = [{ label: "profile save", method: "PUT", url: "/api/admin/profile/", body: { ...PROFILE, name: "Defaced Name" } }];
  for (const family of FAMILIES) {
    const content = { ...family.content };
    const id = { experience: s.experience, projects: s.project, certifications: s.certification, "tech-stack": s.tech }[family.name];
    list.push(
      { label: family.name + " create", method: "POST", url: family.url, body: { position: 9, content } },
      { label: family.name + " change", method: "PUT", url: family.url + "?id=" + id, body: { content } },
      { label: family.name + " reorder", method: "PATCH", url: family.url, body: { changes: [{ id, position: 7 }] } },
      { label: family.name + " delete", method: "DELETE", url: family.url + "?id=" + id },
    );
  }
  list.push(
    { label: "post create", method: "POST", url: "/api/admin/blog-posts/", body: { content: postWire("attempt-post", false) } },
    { label: "post change", method: "PUT", url: "/api/admin/blog-posts/?id=" + s.post, body: { content: postWire(s.post, true, "changed body") } },
    { label: "post delete", method: "DELETE", url: "/api/admin/blog-posts/?id=" + s.post },
    { label: "image upload address", method: "POST", url: "/api/admin/images/upload/", body: { name: "evil.png", type: "image/png", size: 100 } },
    { label: "image register", method: "POST", url: "/api/admin/images/", body: { id: s.pending, name: "pending.png", type: "image/png", size: 400 } },
    { label: "image delete", method: "DELETE", url: "/api/admin/images/?id=" + s.image },
  );
  return list;
}

async function runAttempts(request: APIRequestContext, list: Attempt[], cookie: string | undefined): Promise<(Attempt & Reply)[]> {
  const out: (Attempt & Reply)[] = [];
  for (const attempt of list) {
    out.push({ ...attempt, ...(await call(request, attempt.method, attempt.url, { cookie, body: attempt.body })) });
  }
  return out;
}

// ---- browser helpers ---------------------------------------------------------------------------------------------

async function routeStorage(context: BrowserContext): Promise<void> {
  const uploadPrefix = "/storage/v1/object/upload/sign/images/";
  const publicPrefix = "/storage/v1/object/public/images/";
  await context.route(HOST + "/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const cors = { "access-control-allow-origin": "*" };
    if (method === "OPTIONS") {
      await route.fulfill({ status: 204, headers: { ...cors, "access-control-allow-methods": "*", "access-control-allow-headers": "*" } });
      return;
    }
    if (method === "PUT" && url.pathname.startsWith(uploadPrefix)) {
      const id = decodeURIComponent(url.pathname.slice(uploadPrefix.length));
      if (url.searchParams.get("token") !== "stand-in-token") {
        await route.fulfill({ status: 403, headers: { ...cors, "content-type": "application/json" }, body: '{"error":"forbidden"}' });
        return;
      }
      storePut(id, request.postDataBuffer() ?? Buffer.alloc(0), request.headers()["content-type"] ?? "");
      await route.fulfill({ status: 200, headers: { ...cors, "content-type": "application/json" }, body: JSON.stringify({ Key: "images/" + id }) });
      return;
    }
    if ((method === "GET" || method === "HEAD") && url.pathname.startsWith(publicPrefix)) {
      const id = decodeURIComponent(url.pathname.slice(publicPrefix.length));
      const file = path.join(STORE_DIR, id);
      if (!fs.existsSync(file)) {
        await route.fulfill({ status: 404, headers: cors, body: "" });
        return;
      }
      const typeFile = file + ".type";
      const type = fs.existsSync(typeFile) ? fs.readFileSync(typeFile, "utf8") : "application/octet-stream";
      await route.fulfill({ status: 200, headers: { ...cors, "content-type": type }, body: fs.readFileSync(file) });
      return;
    }
    await route.fulfill({ status: 404, headers: cors, body: "" });
  });
}

async function newContext(
  browser: Browser,
  base: string,
  claims?: Claims,
  options: Parameters<Browser["newContext"]>[0] = {},
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext(options);
  if (claims) await context.addCookies([{ name: SESSION_COOKIE, value: await mint(claims), url: base }]);
  await routeStorage(context);
  const page = await context.newPage();
  return { context, page };
}

type GoogleMode = { kind: "approve"; claims: Claims } | { kind: "leave" };

// The stand-in for Google at the browser boundary: approve as an account, or send the visitor back unfinished.
async function googleStandIn(context: BrowserContext, base: string, start: GoogleMode) {
  let mode: GoogleMode = start;
  let calls = 0;
  await context.route("https://accounts.google.com/**", async (route) => {
    calls += 1;
    if (mode.kind === "approve") {
      await context.addCookies([{ name: SESSION_COOKIE, value: await mint(mode.claims), url: base }]);
      await route.fulfill({ status: 302, headers: { location: base + PANEL } });
    } else {
      await route.fulfill({
        status: 302,
        headers: {
          location: base + "/api/auth/callback/google?error=access_denied&iss=" + encodeURIComponent("https://accounts.google.com"),
        },
      });
    }
  });
  return {
    set(next: GoogleMode) {
      mode = next;
    },
    calls: () => calls,
  };
}

const region = (page: Page) => page.getByRole("region", { name: "Admin" });
const menu = (page: Page) => page.getByRole("navigation", { name: "Admin sections" });
const signInButton = (page: Page) => page.getByRole("button", { name: "Sign in with Google", exact: true });
const signOutButton = (page: Page) => page.getByRole("button", { name: "Sign out", exact: true });

// Click a menu button until its screen is there (a click that lands before hydration is lost).
async function openScreen(page: Page, label: string, shown: Locator): Promise<void> {
  const button = menu(page).getByRole("button", { name: label, exact: true });
  await expect(async () => {
    await button.click({ timeout: 5000 });
    await expect(shown).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 20000 });
}

const headingOf = (page: Page, name: string) => page.getByRole("heading", { name, level: 2, exact: true });
const section = (page: Page, name: string) => page.locator(`section[aria-label="${name}"]`);

async function openList(page: Page, heading: string): Promise<void> {
  await openScreen(page, heading, headingOf(page, heading));
}

async function openProfile(page: Page): Promise<void> {
  await openScreen(page, "Profile", page.getByLabel("Name", { exact: true }));
}

async function openImages(page: Page): Promise<void> {
  await openScreen(page, "Images", headingOf(page, "Images"));
}

const READY: Record<string, string> = {
  Profile: "No profile has been saved yet.",
  Experience: "No entries yet.",
  Projects: "No projects yet.",
  Certifications: "No certifications yet.",
  "Tech stack": "No tech categories yet.",
  "Blog posts": "No posts yet.",
  Images: "No images uploaded yet",
};

function recordRequests(page: Page): { urls: string[]; methods: { method: string; url: string }[] } {
  const record = { urls: [] as string[], methods: [] as { method: string; url: string }[] };
  page.on("request", (r) => {
    record.urls.push(r.url());
    record.methods.push({ method: r.method(), url: r.url() });
  });
  return record;
}

// ---- repository helpers -------------------------------------------------------------------------------------------

type Run = { stdout: string; status: number | null };

function run(command: string, args: string[], cwd: string = process.cwd()): Run {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  return { stdout: result.stdout ?? "", status: result.status };
}

function git(args: string[], cwd: string = process.cwd()): Run {
  return run("git", args, cwd);
}

function gitGrep(flags: string[], patterns: string[], pathspecs: string[] = [], cwd: string = process.cwd()): Run {
  const args = ["grep", "--untracked", "-I", "-n", ...flags];
  for (const pattern of patterns) args.push("-e", pattern);
  if (pathspecs.length > 0) args.push("--", ...pathspecs);
  return git(args, cwd);
}

function grepBuilt(flags: string, patterns: string[], dirs: string[]): Run {
  const args = ["-rI" + flags];
  for (const pattern of patterns) args.push("-e", pattern);
  args.push(...dirs);
  return run("grep", args);
}

const head = (text: string): string => text.slice(0, 1500);

/** A throw-away git repository holding the given files, to prove a search can find what it looks for. */
function fixture(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "acc-scan-"));
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

const BUILT_OUTPUT = [".next/server/app", ".next/static"];

function requireBuild(): void {
  expect(
    fs.existsSync(".next/prerender-manifest.json") && BUILT_OUTPUT.every((dir) => fs.existsSync(dir)),
    "run npm run build first",
  ).toBe(true);
}

type RepoPost = { slug: string; title: string; draft: boolean };

function repoPosts(): RepoPost[] {
  const dir = "content/blog";
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".md"))
    .map((name) => {
      const text = fs.readFileSync(path.join(dir, name), "utf8");
      const front = text.split(/^---\s*$/m)[1] ?? "";
      const get = (key: string): string => {
        const match = front.match(new RegExp("^" + key + ":\\s*(.*)$", "m"));
        return match ? match[1].trim().replace(/^["']|["']$/g, "") : "";
      };
      return { slug: get("slug"), title: get("title"), draft: get("draft") === "true" };
    });
}

const xml = (text: string): string => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const PUBLISHED = (): RepoPost[] => repoPosts().filter((post) => !post.draft);
const HTML_PAGES = (): string[] => ["/", "/blog/", ...PUBLISHED().map((post) => `/blog/${post.slug}/`)];
const FILE_PAGES = ["/rss.xml", "/sitemap.xml", "/robots.txt"];

/** The markup of the pages, the files, and every script the markups name. */
async function servedText(request: APIRequestContext, pages: string[], files: string[] = []): Promise<{ text: string; scripts: number }> {
  const parts: string[] = [];
  const scripts = new Set<string>();
  for (const address of pages) {
    const markup = await (await request.get(address)).text();
    parts.push(markup);
    for (const match of markup.matchAll(/\/_next\/static\/[^"'\\\s,]+\.js/g)) scripts.add(match[0]);
  }
  for (const address of files) parts.push(await (await request.get(address)).text());
  let read = 0;
  for (const script of scripts) {
    const response = await request.get(script);
    if (!response.ok()) continue;
    parts.push(await response.text());
    read += 1;
  }
  return { text: parts.join("\n"), scripts: read };
}

// =====================================================================================================================
// §6.1 to §6.4: signing in and out
// =====================================================================================================================

test("E2E-ACC-01: opening the panel signed out shows only a Sign in with Google control and no content (§6.1)", async ({
  browser,
  baseURL,
  request,
}) => {
  const base = baseURL as string;
  // There is stored content that must stay hidden.
  await seedEverything(request);
  const { context, page } = await newContext(browser, base);
  const seen = recordRequests(page);

  const response = await page.goto(PANEL);
  expect(response?.status()).toBe(200);
  await expect(region(page)).toHaveText(T_OUT, { useInnerText: true });
  await expect(signInButton(page)).toBeEnabled();
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await expect(signOutButton(page)).toHaveCount(0);
  await expect(region(page).getByRole("alert")).toHaveCount(0);

  const markup = await page.content();
  for (const stored of STORED) {
    expect(markup.includes(stored), `the signed-out panel shows ${stored}`).toBe(false);
  }
  expect(seen.urls.filter((url) => url.includes("/api/admin/")), "the signed-out panel asked for content").toEqual([]);
  expect(await context.cookies(), "the signed-out panel set a cookie").toEqual([]);
  await context.close();
});

test("E2E-ACC-02: signed in as the owner the panel shows the menu with all seven screens, and each opens (§6.2)", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(120000);
  const base = baseURL as string;
  const { context, page } = await newContext(browser, base);
  const google = await googleStandIn(context, base, { kind: "approve", claims: OWNER() });

  await page.goto(PANEL);
  await expect(region(page)).toHaveText(T_OUT, { useInnerText: true });
  await signInButton(page).click();
  await expect(page).toHaveURL(base + PANEL);
  await expect(region(page)).toHaveText(T_OWNER, { useInnerText: true });
  await expect(menu(page).getByRole("button")).toHaveText(LABELS);
  await expect(signOutButton(page)).toBeVisible();
  expect(google.calls()).toBe(1);

  for (const label of LABELS) {
    await openScreen(page, label, headingOf(page, label));
    await expect(page.getByText(READY[label], { exact: true }), `${label} is loaded from the empty database`).toBeVisible();
    await expect(menu(page).getByRole("button")).toHaveText(LABELS);
  }
  await context.close();
});

test("E2E-ACC-03: signed in as another Google account the panel says it is not allowed, shows no content, and every change is refused (§6.3)", async ({
  browser,
  baseURL,
  request,
}) => {
  test.setTimeout(120000);
  const base = baseURL as string;
  const seed = await seedEverything(request);
  const before = snapshot();

  const { context, page } = await newContext(browser, base);
  await googleStandIn(context, base, { kind: "approve", claims: OTHER() });
  await page.goto(PANEL);
  await signInButton(page).click();
  await expect(region(page)).toHaveText(T_DENY, { useInnerText: true });
  await expect(region(page).getByRole("alert")).toHaveText(DENY_TEXT);
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await expect(signInButton(page)).toHaveCount(0);
  await expect(signOutButton(page)).toBeVisible();

  const markup = await page.content();
  for (const stored of [...STORED, setting("ADMIN_EMAIL")]) {
    expect(markup.includes(stored), `the not-allowed panel shows ${stored}`).toBe(false);
  }

  // Every attempt to change something, sent from this signed-in browser session, is refused.
  const refused = await runAttempts(context.request, attempts(seed), undefined);
  expect(
    refused.filter((r) => r.status !== 403).map((r) => `${r.label} answered ${r.status}`),
    "attempts that were not refused",
  ).toEqual([]);
  // Reading is refused too, and nothing of the content comes back.
  for (const family of FAMILIES) {
    const read = await call(context.request, "GET", family.url);
    expect(read.status, family.name).toBe(403);
    expect(read.text.includes("Acme") || read.text.includes("Billing"), family.name + " leaked").toBe(false);
  }
  expect((await call(context.request, "GET", "/api/admin/profile/")).status).toBe(403);
  expect(snapshot(), "something changed").toBe(before);
  await context.close();
});

test("E2E-ACC-04: after signing out and reloading the panel shows the sign-in screen again, and signing in again works (§6.4)", async ({
  browser,
  baseURL,
}) => {
  const base = baseURL as string;
  const { context, page } = await newContext(browser, base);
  const google = await googleStandIn(context, base, { kind: "approve", claims: OWNER() });

  await page.goto(PANEL);
  await signInButton(page).click();
  await expect(region(page)).toHaveText(T_OWNER, { useInnerText: true });
  expect((await call(context.request, "GET", "/api/admin/profile/")).status, "signed in").toBe(200);

  await signOutButton(page).click();
  await expect(region(page)).toHaveText(T_OUT, { useInnerText: true });
  await page.reload();
  await expect(region(page)).toHaveText(T_OUT, { useInnerText: true });
  await expect(page.getByRole("navigation")).toHaveCount(0);
  expect((await context.cookies()).map((c) => c.name)).not.toContain(SESSION_COOKIE);
  expect((await call(context.request, "GET", "/api/admin/profile/")).status, "signed out").toBe(401);

  await signInButton(page).click();
  await expect(region(page)).toHaveText(T_OWNER, { useInnerText: true });
  expect((await call(context.request, "GET", "/api/admin/profile/")).status, "signed in again").toBe(200);
  expect(google.calls()).toBe(2);
  await context.close();
});

// =====================================================================================================================
// §6.5: create, edit and (after confirming) delete on each of the seven screens
// =====================================================================================================================

const saveButton = (screen: Locator) => screen.getByRole("button", { name: "Save", exact: true });

test("E2E-ACC-05: on Profile the owner edits the one profile and the change is still there after a reload (§6.5)", async ({
  browser,
  baseURL,
  request,
}) => {
  test.setTimeout(120000);
  const { context, page } = await newContext(browser, baseURL as string, OWNER());
  const screen = section(page, "Profile editor");

  await page.goto(PANEL);
  await openProfile(page);
  await expect(page.getByText("No profile has been saved yet.", { exact: true })).toBeVisible();
  await page.getByLabel("Name", { exact: true }).fill("Keith Lim");
  await page.getByLabel("Headline", { exact: true }).fill("Software Engineer");
  await screen.getByRole("button", { name: "Add paragraph", exact: true }).click();
  await page.getByLabel("About paragraph 1", { exact: true }).fill("I build things for the web.");
  await page.getByLabel("Email", { exact: true }).fill("hello@example.com");
  await page.getByLabel("Resume link", { exact: true }).fill("/resume.pdf");
  await screen.getByRole("button", { name: "Add social link", exact: true }).click();
  await page.getByLabel("Social link 1 label", { exact: true }).fill("GitHub");
  await page.getByLabel("Social link 1 address", { exact: true }).fill("https://github.com/example");
  await saveButton(screen).click();
  await expect(screen.getByRole("status").filter({ hasText: "Profile saved" })).toBeVisible();

  await page.reload();
  await openProfile(page);
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Keith Lim");
  await expect(page.getByLabel("Headline", { exact: true })).toHaveValue("Software Engineer");
  await expect(page.getByLabel("About paragraph 1", { exact: true })).toHaveValue("I build things for the web.");
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue("hello@example.com");
  await expect(page.getByLabel("Resume link", { exact: true })).toHaveValue("/resume.pdf");
  await expect(page.getByLabel("Social link 1 address", { exact: true })).toHaveValue("https://github.com/example");

  await page.getByLabel("Headline", { exact: true }).fill("Staff Engineer");
  await saveButton(screen).click();
  await expect(screen.getByRole("status").filter({ hasText: "Profile saved" })).toBeVisible();
  await page.reload();
  await openProfile(page);
  await expect(page.getByLabel("Headline", { exact: true })).toHaveValue("Staff Engineer");
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Keith Lim");

  // It is the one profile: a fresh request sees the same record.
  const stored = await call(request, "GET", "/api/admin/profile/", { cookie: await cookieOf(OWNER()) });
  expect(field(field(stored.json, "profile"), "headline")).toBe("Staff Engineer");
  await context.close();
});

type Flow = {
  heading: string;
  list: string;
  addButton: string;
  fill: (page: Page) => Promise<void>;
  created: string;
  verifyCreated: (page: Page) => Promise<void>;
  change: (page: Page) => Promise<void>;
  changed: string;
  verifyChanged?: (page: Page) => Promise<void>;
};

const byLabel = (page: Page, label: string) => page.getByLabel(label, { exact: true });

const FLOWS: Record<string, Flow> = {
  experience: {
    heading: "Experience",
    list: "Experience entries",
    addButton: "Add entry",
    fill: async (page) => {
      await byLabel(page, "Year").fill("2024");
      await byLabel(page, "Title").fill("Software Engineer");
      await byLabel(page, "Company").fill("Acme");
      await byLabel(page, "Duration").fill("Jan 2024 - Present");
      await byLabel(page, "Description").fill("Built the billing service.");
      await page.getByRole("button", { name: "Add detail line", exact: true }).click();
      await page.getByRole("textbox", { name: "Detail line 1", exact: true }).fill("Cut invoice errors by 40%");
    },
    created: "Software Engineer at Acme",
    verifyCreated: async (page) => {
      await expect(byLabel(page, "Year")).toHaveValue("2024");
      await expect(byLabel(page, "Company")).toHaveValue("Acme");
      await expect(byLabel(page, "Duration")).toHaveValue("Jan 2024 - Present");
      await expect(byLabel(page, "Description")).toHaveValue("Built the billing service.");
      await expect(page.getByRole("textbox", { name: "Detail line 1", exact: true })).toHaveValue("Cut invoice errors by 40%");
    },
    change: async (page) => {
      await byLabel(page, "Title").fill("Staff Engineer");
    },
    changed: "Staff Engineer at Acme",
  },
  projects: {
    heading: "Projects",
    list: "Projects list",
    addButton: "Add entry",
    fill: async (page) => {
      await byLabel(page, "Title").fill("Billing Console");
      await byLabel(page, "Short description").fill("An internal tool");
      await byLabel(page, "GitHub link").fill("https://github.com/example/billing");
      await byLabel(page, "Demo link").fill("https://example.com/billing");
      await page.getByRole("button", { name: "Add paragraph", exact: true }).click();
      await byLabel(page, "Paragraph 1").fill("It issues invoices.");
      await page.getByRole("button", { name: "Add tech name", exact: true }).click();
      await byLabel(page, "Tech name 1").fill("TypeScript");
    },
    created: "Billing Console",
    verifyCreated: async (page) => {
      await expect(byLabel(page, "Short description")).toHaveValue("An internal tool");
      await expect(byLabel(page, "GitHub link")).toHaveValue("https://github.com/example/billing");
      await expect(byLabel(page, "Demo link")).toHaveValue("https://example.com/billing");
      await expect(byLabel(page, "Paragraph 1")).toHaveValue("It issues invoices.");
      await expect(byLabel(page, "Tech name 1")).toHaveValue("TypeScript");
    },
    change: async (page) => {
      await byLabel(page, "Title").fill("Billing Console 2");
    },
    changed: "Billing Console 2",
  },
  certifications: {
    heading: "Certifications",
    list: "Certifications list",
    addButton: "Add certification",
    fill: async (page) => {
      await byLabel(page, "Name").fill("Cloud Practitioner");
      await byLabel(page, "Badge image path").fill("/images/certs/cloud.png");
      await byLabel(page, "Credential link").fill("https://example.com/credential/1");
    },
    created: "Cloud Practitioner",
    verifyCreated: async (page) => {
      await expect(byLabel(page, "Badge image path")).toHaveValue("/images/certs/cloud.png");
      await expect(byLabel(page, "Credential link")).toHaveValue("https://example.com/credential/1");
    },
    change: async (page) => {
      await byLabel(page, "Name").fill("Cloud Architect");
    },
    changed: "Cloud Architect",
  },
  "tech-stack": {
    heading: "Tech stack",
    list: "Tech categories list",
    addButton: "Add category",
    fill: async (page) => {
      await byLabel(page, "Category name").fill("Frontend");
      await byLabel(page, "Item 1 name").fill("React");
      await byLabel(page, "Item 1 icon path").fill("/images/tech/react.png");
    },
    created: "Frontend",
    verifyCreated: async (page) => {
      await expect(byLabel(page, "Item 1 name")).toHaveValue("React");
      await expect(byLabel(page, "Item 1 icon path")).toHaveValue("/images/tech/react.png");
    },
    change: async (page) => {
      await byLabel(page, "Category name").fill("Frontend and UI");
    },
    changed: "Frontend and UI",
  },
  "blog-posts": {
    heading: "Blog posts",
    list: "Blog posts list",
    addButton: "Add post",
    fill: async (page) => {
      await byLabel(page, "Title").fill("Notes on moving to Vercel");
      await byLabel(page, "Excerpt").fill("What changed and why");
      await byLabel(page, "Date").fill("2026-05-15");
      await byLabel(page, "Slug").fill("moving-to-vercel");
      await byLabel(page, "Tags").fill("nextjs, vercel");
      await byLabel(page, "Body").fill("# Heading\n\nThe body of the post.");
    },
    created: "Notes on moving to Vercel",
    verifyCreated: async (page) => {
      await expect(byLabel(page, "Excerpt")).toHaveValue("What changed and why");
      await expect(byLabel(page, "Date")).toHaveValue("2026-05-15");
      await expect(byLabel(page, "Slug")).toHaveValue("moving-to-vercel");
      await expect(byLabel(page, "Tags")).toHaveValue("nextjs, vercel");
      await expect(byLabel(page, "Body")).toHaveValue("# Heading\n\nThe body of the post.");
      await expect(byLabel(page, "Status")).toHaveValue("Draft");
    },
    change: async (page) => {
      await byLabel(page, "Title").fill("Notes on moving hosts");
      await byLabel(page, "Status").selectOption("Published");
    },
    changed: "Notes on moving hosts",
    verifyChanged: async (page) => {
      await expect(page.getByRole("list", { name: "Blog posts list" })).toContainText("Status: Published");
    },
  },
};

async function runFlow(page: Page, flow: Flow): Promise<void> {
  const screen = section(page, `${flow.heading} editor`);
  const items = page.getByRole("list", { name: flow.list }).getByRole("listitem");
  const saved = screen.getByRole("status").filter({ hasText: "Entry saved" });

  await page.goto(PANEL);
  await openList(page, flow.heading);
  await expect(page.getByText(READY[flow.heading], { exact: true })).toBeVisible();

  // create
  await screen.getByRole("button", { name: flow.addButton, exact: true }).click();
  await flow.fill(page);
  await saveButton(screen).click();
  await expect(saved).toBeVisible();
  await expect(items).toHaveCount(1);
  await expect(items.first()).toContainText(flow.created);

  // still there after a reload, with every value
  await page.reload();
  await openList(page, flow.heading);
  await expect(items).toHaveCount(1);
  await expect(items.first()).toContainText(flow.created);
  await items.first().getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Edit entry" })).toBeVisible();
  await flow.verifyCreated(page);

  // edit
  await flow.change(page);
  await saveButton(screen).click();
  await expect(saved).toBeVisible();
  await expect(items).toHaveCount(1);
  await expect(items.first()).toContainText(flow.changed);
  await page.reload();
  await openList(page, flow.heading);
  await expect(items).toHaveCount(1);
  await expect(items.first()).toContainText(flow.changed);
  if (flow.verifyChanged) await flow.verifyChanged(page);

  // delete, after confirming
  await items.first().getByRole("button", { name: "Delete", exact: true }).click();
  const confirm = page.getByRole("group", { name: "Confirm delete" });
  await expect(confirm).toBeVisible();
  await expect(items, "nothing is deleted before the confirmation").toHaveCount(1);
  await confirm.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(screen.getByRole("status").filter({ hasText: "Entry deleted" })).toBeVisible();
  await expect(items).toHaveCount(0);
  await expect(page.getByText(READY[flow.heading], { exact: true })).toBeVisible();
  await page.reload();
  await openList(page, flow.heading);
  await expect(page.getByText(READY[flow.heading], { exact: true })).toBeVisible();
  await expect(items).toHaveCount(0);
}

const FLOW_TESTS: [string, string][] = [
  ["E2E-ACC-06", "experience"],
  ["E2E-ACC-07", "projects"],
  ["E2E-ACC-08", "certifications"],
  ["E2E-ACC-09", "tech-stack"],
  ["E2E-ACC-10", "blog-posts"],
];

for (const [id, key] of FLOW_TESTS) {
  const flow = FLOWS[key];
  test(`${id}: on ${flow.heading} the owner creates, edits and, after confirming, deletes an entry, and each step survives a reload (§6.5)`, async ({
    browser,
    baseURL,
  }) => {
    test.setTimeout(150000);
    const { context, page } = await newContext(browser, baseURL as string, OWNER());
    await runFlow(page, flow);
    await context.close();
  });
}

test("E2E-ACC-11: on Images the owner uploads an image and, after confirming, deletes it, and both survive a reload (§6.5)", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(120000);
  const { context, page } = await newContext(browser, baseURL as string, OWNER());
  const library = section(page, "Image library");
  const items = page.getByRole("list", { name: "Uploaded images" }).getByRole("listitem");
  const file: UploadFile = { name: "headshot.png", mimeType: "image/png", buffer: png(307200) };

  await page.goto(PANEL);
  await openImages(page);
  await expect(page.getByText(READY.Images, { exact: true })).toBeVisible();
  await page.getByLabel("Image file", { exact: true }).setInputFiles(file);
  await library.getByRole("button", { name: "Upload", exact: true }).click();
  await expect(items).toHaveCount(1);
  await expect(items.first()).toContainText("headshot.png");
  await expect(items.first()).toContainText("300 KB");
  expect(storeIds()).toHaveLength(1);

  await page.reload();
  await openImages(page);
  await expect(items).toHaveCount(1);
  await expect(items.first()).toContainText("headshot.png");

  await items.first().getByRole("button", { name: "Delete", exact: true }).click();
  const confirm = page.getByRole("group", { name: "Confirm delete" });
  await expect(confirm).toBeVisible();
  expect(storeIds(), "nothing is deleted before the confirmation").toHaveLength(1);
  await confirm.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(items).toHaveCount(0);
  await expect(page.getByText(READY.Images, { exact: true })).toBeVisible();
  expect(storeIds(), "the file is gone from storage").toEqual([]);

  await page.reload();
  await openImages(page);
  await expect(page.getByText(READY.Images, { exact: true })).toBeVisible();
  await expect(items).toHaveCount(0);
  await context.close();
});

// =====================================================================================================================
// §6.6: drafts and published posts
// =====================================================================================================================

test("E2E-ACC-12: a post saved as a draft is readable by the owner and refused to a signed-out request, and once published anyone can read it (§6.6)", async ({
  browser,
  baseURL,
  request,
}) => {
  test.setTimeout(150000);
  const MARK = "DRAFT-MARKER-7f3a91";
  const { context, page } = await newContext(browser, baseURL as string, OWNER());
  const screen = section(page, "Blog posts editor");

  await page.goto(PANEL);
  await openList(page, "Blog posts");
  await screen.getByRole("button", { name: "Add post", exact: true }).click();
  await byLabel(page, "Title").fill("A careful draft");
  await byLabel(page, "Excerpt").fill("Not ready yet");
  await byLabel(page, "Date").fill("2026-06-01");
  await byLabel(page, "Slug").fill("a-careful-draft");
  await byLabel(page, "Body").fill("Body " + MARK);
  await expect(byLabel(page, "Status")).toHaveValue("Draft");
  await saveButton(screen).click();
  await expect(screen.getByRole("status").filter({ hasText: "Entry saved" })).toBeVisible();

  // the owner can read it; a signed-out request is refused and gets nothing of it
  const owner = await call(context.request, "GET", "/api/admin/blog-posts/?slug=a-careful-draft");
  expect(owner.status).toBe(200);
  expect(owner.text).toContain(MARK);
  const anonymous = await call(request, "GET", "/api/admin/blog-posts/?slug=a-careful-draft");
  expect(anonymous.status).toBe(401);
  expect(anonymous.text).not.toContain(MARK);
  const listed = await call(request, "GET", "/api/admin/blog-posts/published/");
  expect(listed.status).toBe(200);
  expect(listed.text).not.toContain(MARK);
  const direct = await call(request, "GET", "/api/admin/blog-posts/published/?slug=a-careful-draft");
  expect(direct.status).toBe(404);
  expect(direct.text).not.toContain(MARK);

  // publish it from the panel
  await page.reload();
  await openList(page, "Blog posts");
  await page.getByRole("list", { name: "Blog posts list" }).getByRole("listitem").first().getByRole("button", { name: "Edit", exact: true }).click();
  await byLabel(page, "Status").selectOption("Published");
  await saveButton(screen).click();
  await expect(screen.getByRole("status").filter({ hasText: "Entry saved" })).toBeVisible();

  const published = await call(request, "GET", "/api/admin/blog-posts/published/");
  expect(published.status).toBe(200);
  const posts = field(published.json, "posts") as { slug: string; body: string }[];
  expect(posts.map((p) => p.slug)).toEqual(["a-careful-draft"]);
  expect(posts[0].body).toContain(MARK);
  const one = await call(request, "GET", "/api/admin/blog-posts/published/?slug=a-careful-draft");
  expect(one.status).toBe(200);
  expect(one.text).toContain(MARK);
  await context.close();
});

// =====================================================================================================================
// §6.7: images
// =====================================================================================================================

test("E2E-ACC-13: the owner uploads a PNG, JPEG, WebP and SVG of at most 5 MB, picks one on a record, and opens its address signed out (§6.7)", async ({
  browser,
  baseURL,
  request,
}) => {
  test.setTimeout(240000);
  const base = baseURL as string;
  const { context, page } = await newContext(browser, base, OWNER());
  const library = section(page, "Image library");
  const items = page.getByRole("list", { name: "Uploaded images" }).getByRole("listitem");
  const files: (UploadFile & { size: string })[] = [
    { name: "headshot.png", mimeType: "image/png", buffer: png(307200), size: "300 KB" },
    { name: "photo.jpg", mimeType: "image/jpeg", buffer: png(1572864), size: "1.5 MB" },
    { name: "banner.webp", mimeType: "image/webp", buffer: png(204800), size: "200 KB" },
    { name: "logo.svg", mimeType: "image/svg+xml", buffer: svg(2048), size: "2 KB" },
    { name: "limit.png", mimeType: "image/png", buffer: png(5242880), size: "5 MB" },
  ];

  await page.goto(PANEL);
  await openImages(page);
  for (const [index, file] of files.entries()) {
    await page.getByLabel("Image file", { exact: true }).setInputFiles({ name: file.name, mimeType: file.mimeType, buffer: file.buffer });
    await library.getByRole("button", { name: "Upload", exact: true }).click();
    await expect(items).toHaveCount(index + 1);
    const row = items.filter({ hasText: file.name });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(file.size);
  }
  expect(storeIds().map((id) => id.split(".").pop()).sort()).toEqual(["jpg", "png", "png", "svg", "webp"]);

  // it is still listed after a reload, and the browser can render the PNG
  await page.reload();
  await openImages(page);
  await expect(items).toHaveCount(files.length);
  const picture = items.filter({ hasText: "headshot.png" }).locator("img");
  await expect
    .poll(() => picture.evaluate((el) => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0), { message: "the uploaded PNG is shown" })
    .toBe(true);

  // anyone can open every uploaded image by its address, with no session
  const owner = await cookieOf(OWNER());
  const listing = await call(request, "GET", "/api/admin/images/", { cookie: owner });
  const images = field(listing.json, "images") as { id: string; name: string; url: string; contentType: string }[];
  expect(images).toHaveLength(files.length);
  const visitor = await newContext(browser, base);
  for (const file of files) {
    const image = images.find((i) => i.name === file.name);
    expect(image, file.name).toBeDefined();
    expect(image!.url, "the address carries no token and no key").toBe(publicOf(image!.id));
    const response = await visitor.page.goto(image!.url);
    expect(response?.status(), file.name).toBe(200);
    expect(response?.headers()["content-type"], file.name).toBe(file.mimeType);
    expect((await response!.body()).equals(file.buffer), file.name + " bytes").toBe(true);
  }
  expect(await visitor.context.cookies(), "the visitor has no session").toEqual([]);
  await visitor.context.close();
  const headshot = images.find((i) => i.name === "headshot.png")!;

  // pick it on a profile photo
  await page.goto(PANEL);
  await openProfile(page);
  await byLabel(page, "Name").fill("Keith Lim");
  await byLabel(page, "Headline").fill("Engineer");
  await byLabel(page, "Uploaded image").selectOption({ label: "headshot.png" });
  await saveButton(section(page, "Profile editor")).click();
  await expect(section(page, "Profile editor").getByRole("status").filter({ hasText: "Profile saved" })).toBeVisible();
  await page.reload();
  await openProfile(page);
  await expect(byLabel(page, "Uploaded image")).toHaveValue(headshot.id);
  expect(field(field((await call(request, "GET", "/api/admin/profile/", { cookie: owner })).json, "profile"), "photo")).toBe(headshot.url);

  // pick it as a certification badge
  const certs = section(page, "Certifications editor");
  await openList(page, "Certifications");
  await certs.getByRole("button", { name: "Add certification", exact: true }).click();
  await byLabel(page, "Name").fill("Cloud Practitioner");
  await byLabel(page, "Uploaded image").selectOption({ label: "headshot.png" });
  await byLabel(page, "Credential link").fill("https://example.com/credential/1");
  await saveButton(certs).click();
  await expect(certs.getByRole("status").filter({ hasText: "Entry saved" })).toBeVisible();
  await page.reload();
  await openList(page, "Certifications");
  await expect(page.getByRole("list", { name: "Certifications list" })).toContainText("Badge image: headshot.png");
  const certList = await call(request, "GET", "/api/admin/certifications/", { cookie: owner });
  expect(JSON.stringify(certList.json)).toContain(headshot.url);

  // pick it as a tech item icon
  const tech = section(page, "Tech stack editor");
  await openList(page, "Tech stack");
  await tech.getByRole("button", { name: "Add category", exact: true }).click();
  await byLabel(page, "Category name").fill("Frontend");
  await byLabel(page, "Item 1 name").fill("React");
  await byLabel(page, "Item 1 uploaded image").selectOption({ label: "headshot.png" });
  await saveButton(tech).click();
  await expect(tech.getByRole("status").filter({ hasText: "Entry saved" })).toBeVisible();
  await page.reload();
  await openList(page, "Tech stack");
  await expect(page.getByRole("list", { name: "Tech categories list" })).toContainText("React: image headshot.png");
  expect(JSON.stringify((await call(request, "GET", "/api/admin/tech-stack/", { cookie: owner })).json)).toContain(headshot.url);

  // pick it as a blog cover
  const blog = section(page, "Blog posts editor");
  await openList(page, "Blog posts");
  await blog.getByRole("button", { name: "Add post", exact: true }).click();
  await byLabel(page, "Title").fill("With a cover");
  await byLabel(page, "Excerpt").fill("Has a cover");
  await byLabel(page, "Date").fill("2026-06-01");
  await byLabel(page, "Slug").fill("with-a-cover");
  await byLabel(page, "Body").fill("Body text");
  await byLabel(page, "Uploaded image").selectOption({ label: "headshot.png" });
  await saveButton(blog).click();
  await expect(blog.getByRole("status").filter({ hasText: "Entry saved" })).toBeVisible();
  const cover = await call(request, "GET", "/api/admin/blog-posts/?slug=with-a-cover", { cookie: owner });
  expect(field(field(field(cover.json, "entry"), "content"), "coverImage")).toBe(headshot.url);
  await context.close();
});

test("E2E-ACC-14: a 6 MB file and a non-image file are each refused with a message and nothing is stored (§6.7)", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(120000);
  const { context, page } = await newContext(browser, baseURL as string, OWNER());
  const library = section(page, "Image library");
  const seen = recordRequests(page);

  await page.goto(PANEL);
  await openImages(page);
  const refuse = async (file: UploadFile, message: string): Promise<void> => {
    await page.getByLabel("Image file", { exact: true }).setInputFiles(file);
    await library.getByRole("button", { name: "Upload", exact: true }).click();
    await expect(library.getByRole("alert")).toHaveText(message);
    await expect(page.getByText(READY.Images, { exact: true })).toBeVisible();
  };
  await refuse({ name: "big.png", mimeType: "image/png", buffer: png(6 * 1024 * 1024) }, "That image is over 5 MB");
  await refuse({ name: "notes.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 not an image") }, "Only PNG, JPEG, WebP or SVG images can be uploaded");
  await refuse({ name: "page.html", mimeType: "text/html", buffer: Buffer.from("<script>1</script>") }, "Only PNG, JPEG, WebP or SVG images can be uploaded");
  await refuse({ name: "photo.gif", mimeType: "image/gif", buffer: Buffer.from("GIF89a") }, "Only PNG, JPEG, WebP or SVG images can be uploaded");

  expect(storeIds(), "nothing was stored").toEqual([]);
  expect(seen.urls.filter((url) => url.includes("/storage/v1/object/upload")), "nothing was sent to storage").toEqual([]);
  await page.reload();
  await openImages(page);
  await expect(page.getByText(READY.Images, { exact: true })).toBeVisible();
  await context.close();
});

// =====================================================================================================================
// §6.8 and §5.2: requests that change content, or upload and delete images, without being the owner
// =====================================================================================================================

test("E2E-ACC-15: a signed-out request to create, change or delete content, or to upload or delete an image, is refused (§6.8)", async ({
  request,
  browser,
  baseURL,
}) => {
  const seed = await seedEverything(request);
  const before = snapshot();

  const refused = await runAttempts(request, attempts(seed), undefined);
  expect(refused).toHaveLength(attempts(seed).length);
  expect(
    refused.filter((r) => r.status !== 401).map((r) => `${r.method} ${r.url} answered ${r.status}`),
    "signed-out requests that were not refused",
  ).toEqual([]);
  for (const r of refused) expect(r.text, r.label + " body").toBe('{"error":"not-signed-in"}');
  expect(snapshot(), "something was stored or removed").toBe(before);

  // the panel gives a signed-out visitor no editor to use either
  const { context, page } = await newContext(browser, baseURL as string);
  await page.goto(PANEL);
  await expect(page.getByRole("button", { name: "Save", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Upload", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Delete", exact: true })).toHaveCount(0);
  await context.close();

  // control: the same requests, as the owner, succeed and do change what is stored
  const owner = await runAttempts(request, attempts(seed), await cookieOf(OWNER()));
  expect(
    owner.filter((r) => r.status !== 200).map((r) => `${r.method} ${r.url} answered ${r.status}`),
    "the owner's own requests",
  ).toEqual([]);
  expect(snapshot(), "the control must change something").not.toBe(before);
});

// =====================================================================================================================
// §6.9, §6.10: the public site
// =====================================================================================================================

test("E2E-ACC-16: every public address loads at the same address with the content the repository holds (§6.9)", async ({
  page,
  request,
}) => {
  test.setTimeout(120000);
  const posts = PUBLISHED();

  const home = await page.goto("/");
  expect(home?.status()).toBe(200);
  expect(new URL(page.url()).pathname).toBe("/");

  const index = await page.goto("/blog/");
  expect(index?.status()).toBe(200);
  expect(new URL(page.url()).pathname).toBe("/blog/");
  await expect(page.getByRole("heading", { level: 1, name: "Blog", exact: true })).toBeVisible();
  const hrefs = await page
    .locator('a[href^="/blog/"]')
    .evaluateAll((anchors) => [...new Set(anchors.map((a) => a.getAttribute("href") ?? ""))].sort());
  expect(hrefs).toEqual(["/blog/", ...posts.map((p) => `/blog/${p.slug}/`)].sort());

  for (const post of posts) {
    const address = `/blog/${post.slug}/`;
    const response = await page.goto(address);
    expect(response?.status(), address).toBe(200);
    expect(new URL(page.url()).pathname, address).toBe(address);
    await expect(page.getByRole("heading", { level: 1, name: post.title, exact: true }), address).toBeVisible();
    // the unslashed form goes to the slashed address, never anywhere else
    const bare = await request.get(address.slice(0, -1), { maxRedirects: 0 });
    expect([307, 308], address.slice(0, -1)).toContain(bare.status());
    expect(new URL(bare.headers().location, "http://x").pathname, address.slice(0, -1)).toBe(address);
  }
  const bareIndex = await request.get("/blog", { maxRedirects: 0 });
  expect(new URL(bareIndex.headers().location, "http://x").pathname).toBe("/blog/");

  for (const file of FILE_PAGES) {
    const response = await request.get(file, { maxRedirects: 0 });
    expect(response.status(), file).toBe(200);
  }
  const sitemap = await (await request.get("/sitemap.xml")).text();
  const sitemapLocs = [...sitemap.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
  expect(sitemapLocs).toContain("https://thegoldenpothos.xyz/");
  expect(sitemapLocs).toContain("https://thegoldenpothos.xyz/blog/");
  for (const loc of sitemapLocs.filter((value) => value !== "https://thegoldenpothos.xyz/" && value !== "https://thegoldenpothos.xyz/blog/")) {
    expect(loc.startsWith("https://thegoldenpothos.xyz/blog/"), loc).toBe(true);
  }
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("Allow: /");
  expect(robots).toContain("Sitemap: https://thegoldenpothos.xyz/sitemap.xml");

  // "the same content as before the move": the public sources equal the commit before the migration
  expect(git(["cat-file", "-t", BASE_COMMIT]).stdout.trim(), "the baseline commit is missing").toBe("commit");
  const sources = [
    "public",
    "src/app/layout.tsx",
    "src/app/globals.css",
    "src/app/robots.ts",
    "src/app/blog/layout.tsx",
    "src/app/components/ThemeProvider.tsx",
    "src/lib/site.ts",
    "src/lib/markdown.ts",
  ];
  expect(git(["diff", "--quiet", BASE_COMMIT, "--", ...sources]).status, "a public source differs from the baseline").toBe(0);
  expect(git(["ls-files", "--others", "--exclude-standard", "--", ...sources]).stdout, "an untracked public source").toBe("");
});

test("E2E-ACC-17: /rss.xml is served as an RSS feed with the repository's posts (§6.9)", async ({ request }) => {
  const posts = PUBLISHED();
  const response = await request.get("/rss.xml", { maxRedirects: 0 });
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("application/rss+xml; charset=utf-8");
  const body = await response.text();
  expect(body).toContain('<rss version="2.0"');
  const items = [...body.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);
  for (const post of posts) {
    const item = items.find((i) => i.includes(`https://thegoldenpothos.xyz/blog/${post.slug}/`));
    expect(item, post.slug).toBeDefined();
    expect(item!.includes(xml(post.title)) || item!.includes(post.title), post.slug + " title").toBe(true);
  }
});

test("E2E-ACC-18: an unknown address shows the site's 404 page and does not redirect anywhere (§6.9)", async ({ page, request }) => {
  for (const address of ["/no-such-page/", "/blog/no-such-post/", "/blog/hello-world/extra/", `${PANEL}nope/`, "/admin/"]) {
    const response = await page.goto(address);
    expect(response?.status(), address).toBe(404);
    expect(new URL(page.url()).pathname, address + " stayed put").toBe(address);
    await expect(page.getByRole("heading", { level: 1, name: "404", exact: true }), address).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "This page could not be found.", exact: true }), address).toBeVisible();
  }
  for (const address of ["/api/nothing/", "/api/admin/"]) {
    const response = await request.get(address, { maxRedirects: 0 });
    expect(response.status(), address).toBe(404);
  }
});

test("E2E-ACC-19: the panel address is absent from the sitemap, robots.txt, the feed and every public page's links, and the panel asks search engines not to index it (§6.10)", async ({
  browser,
  baseURL,
  request,
}) => {
  test.setTimeout(120000);
  const base = baseURL as string;
  for (const file of FILE_PAGES) {
    const body = (await (await request.get(file)).text()).toLowerCase();
    expect(body.includes("bright-warm-greenhouse"), `${file} names the panel`).toBe(false);
  }
  const { context, page } = await newContext(browser, base);
  for (const address of HTML_PAGES()) {
    const markup = (await (await request.get(address)).text()).toLowerCase();
    expect(markup.includes("bright-warm-greenhouse"), `${address} markup names the panel`).toBe(false);
    await page.goto(address);
    expect(await page.locator('a[href*="bright-warm-greenhouse"]').count(), `${address} links to the panel`).toBe(0);
  }
  await context.close();

  // the control: the panel itself does name its address
  expect((await (await request.get(PANEL)).text()).toLowerCase()).toContain("bright-warm-greenhouse");

  // the panel asks not to be indexed in every state
  const states: { label: string; claims?: Claims; path: string }[] = [
    { label: "signed out", path: PANEL },
    { label: "after a failed sign-in", path: PANEL + "?error=Configuration" },
    { label: "another account", claims: OTHER(), path: PANEL },
    { label: "the owner", claims: OWNER(), path: PANEL },
  ];
  for (const state of states) {
    const visit = await newContext(browser, base, state.claims);
    await visit.page.goto(state.path);
    await expect(visit.page.locator('meta[name="robots"]'), state.label).toHaveAttribute("content", "noindex, nofollow");
    await visit.context.close();
  }
});

// =====================================================================================================================
// §6.11, §6.12, §6.13: the repository
// =====================================================================================================================

const ALLOWED_RECORD_PATHS = [/^docs\/features\/[a-z0-9-]+\/(story|spec|impact|log)\.md$/, /^docs\/requirements\/[A-Za-z0-9._-]+\.md$/];
const ALLOWED_PUBLIC_PATHS = ["e2e/owner-publishes-experience.spec.ts", "e2e/owner-publishes-profile.spec.ts", "e2e/owner-publishes-projects.spec.ts", "e2e/owner-publishes-tech-stack.spec.ts"];

// Content matches of either product name, minus the earlier pipeline records and the public content (decomposition
// decision 12), plus any file whose path names them.
function namesLeft(cwd: string): { raw: string[]; leftovers: string[] } {
  const raw = gitGrep(["-i", "-E"], [OLD, OLD2], [], cwd).stdout.split("\n").filter((line) => line !== "");
  const leftovers: string[] = [];
  for (const entry of raw) {
    const first = entry.indexOf(":");
    const second = entry.indexOf(":", first + 1);
    const file = entry.slice(0, first);
    const line = entry.slice(second + 1);
    if (ALLOWED_RECORD_PATHS.some((p) => p.test(file)) || ALLOWED_PUBLIC_PATHS.includes(file)) continue;
    // the standing order tables still list the earlier slices by name
    if (file === "CLAUDE.md" && /^\| \d+ \| /.test(line)) continue;
    if (file === "docs/features/OVERVIEW.md" && /^\| .*\]\([a-z-]+\/story\.md\) \|$/i.test(line.trim())) continue;
    leftovers.push(`${file}:${entry.slice(first + 1, second)}`);
  }
  const names = new RegExp(`${OLD}|${OLD2}`, "i");
  const listed = git(["ls-files", "--cached", "--others", "--exclude-standard"], cwd)
    .stdout.split("\n")
    .filter((entry) => entry !== "" && names.test(entry) && fs.existsSync(path.join(cwd, entry)));
  for (const file of listed) {
    if (ALLOWED_RECORD_PATHS.some((p) => p.test(file)) || ALLOWED_PUBLIC_PATHS.includes(file)) continue;
    if (/^e2e\/[a-z0-9-]+\.spec\.ts$/.test(file) && file.includes("retire-" + OLD)) continue;
    leftovers.push(file);
  }
  return { raw, leftovers };
}

test("E2E-ACC-20: a search of the repository finds no old-backend library, configuration, rules, test-service set-up, deploy step or secret name (§6.11)", async () => {
  const probe = fixture({ [`notes/${OLD}-probe.txt`]: `a line that names ${OLD}\n` });
  try {
    const control = namesLeft(probe);
    expect(control.raw, "the control search must match its probe").not.toEqual([]);
    expect(control.leftovers, "the control search must report its probe").not.toEqual([]);
  } finally {
    dropFixture(probe);
  }
  const found = namesLeft(process.cwd());
  const seen = new Set(found.raw.map((entry) => entry.slice(0, entry.indexOf(":"))));
  for (const named of ["e2e/owner-publishes-profile.spec.ts"]) {
    expect(seen.has(named), `the search cannot see ${named}`).toBe(true);
  }
  expect(found.leftovers, "files or lines outside the earlier records and the public content").toEqual([]);

  // the pieces by name
  for (const gone of [`src/lib/${OLD}`, `${OLD}.json`, `.${OLD}rc`, `.${OLD}`, `${OLD2}.rules`, "storage" + ".rules"]) {
    expect(fs.existsSync(gone), `${gone} still exists`).toBe(false);
  }
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8")) as { dependencies?: object; devDependencies?: object; scripts?: Record<string, string> };
  const names = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})];
  expect(names.filter((n) => n.toLowerCase().includes(OLD))).toEqual([]);
  expect(Object.entries(pkg.scripts ?? {}).filter(([k, v]) => k.startsWith("deploy:") || v.toLowerCase().includes(OLD))).toEqual([]);
  expect(JSON.stringify(JSON.parse(fs.readFileSync("package-lock.json", "utf8"))).toLowerCase().includes(OLD)).toBe(false);

  // secret names, the old deploy step, hosting settings and the test-service set-up
  const forbidden = [
    OLD.toUpperCase() + "_SERVICE_ACCOUNT",
    OLD.toUpperCase() + "_TOKEN",
    "GOOGLE_APPLICATION_" + "CREDENTIALS",
    "deploy:" + "rules",
    `127\\.0\\.0\\.1:(9099|9199|8080)`,
    EMU,
  ];
  const hits = gitGrep(["-i", "-E"], forbidden, [
    "src",
    "scripts",
    ".github",
    "package.json",
    "playwright.config.ts",
    "vercel.json",
    "next.config.ts",
    "e2e",
    // that earlier spec holds the words only as the definitions of its own scans
    `:(exclude)e2e/retire-${OLD}.spec.ts`,
  ]);
  expect(head(hits.stdout), "an old deploy step, secret name or test-service set-up").toBe("");
  expect(hits.status).toBe(1);
  expect(JSON.stringify(JSON.parse(fs.readFileSync("vercel.json", "utf8"))).toLowerCase()).not.toContain("hosting");
});

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

test("E2E-ACC-21: no secret value and not the owner's email is in the repository, the built pages, a served page or a test file (§6.12)", async ({
  request,
}) => {
  test.setTimeout(120000);
  requireBuild();
  const values = PER_RUN.map((name) => {
    expect(process.env[name], `${name} must be set for the run`).toBeTruthy();
    return { name, value: process.env[name] as string };
  });
  const email = values.find((v) => v.name === "ADMIN_EMAIL")!.value;

  // the scans find what they look for
  const probe = fixture({ "probe.txt": `contact ${email}\nconst k = "AIza${"A".repeat(35)}";\n${"ADMIN_"}${"EMAIL"}=someone\n` });
  try {
    expect(gitGrep(["-F"], [email], [], probe).status, "the email scan control").toBe(0);
    expect(gitGrep(["-E"], SECRET_SHAPES, [], probe).status, "the secret scan control").toBe(0);
    expect(gitGrep(["-E"], [NAME_WITH_VALUE], [], probe).status, "the setting-with-value control").toBe(0);
  } finally {
    dropFixture(probe);
  }

  // the repository, which includes every test file
  const shapes = gitGrep(["-E"], SECRET_SHAPES);
  expect(head(shapes.stdout), "secret-shaped text in the repository").toBe("");
  expect(shapes.status).toBe(1);
  for (const { name, value } of values) {
    const found = gitGrep(["-F"], [value]);
    expect(head(found.stdout), `${name} value in the repository`).toBe("");
    expect(found.status, `${name} repository scan`).toBe(1);
  }
  const named = gitGrep(["-E"], [NAME_WITH_VALUE]);
  expect(head(named.stdout), "a setting written with a value").toBe("");
  expect(named.status).toBe(1);
  const tracked = git(["ls-files", "--cached", "--others", "--exclude-standard"]).stdout.split("\n").filter((f) => f !== "");
  expect(tracked.filter((f) => path.basename(f).startsWith(".env")), "an .env file").toEqual([]);
  expect(tracked.filter((f) => /^e2e\/.*\.spec\.ts$/.test(f)).length, "test files are scanned").toBeGreaterThan(5);

  // the built pages
  const builtShapes = grepBuilt("lE", SECRET_SHAPES, BUILT_OUTPUT);
  expect(head(builtShapes.stdout), "secret-shaped text in the built output").toBe("");
  expect(builtShapes.status).toBe(1);
  for (const { name, value } of values) {
    const built = grepBuilt("lF", [value], BUILT_OUTPUT);
    expect(head(built.stdout), `${name} value in the built output`).toBe("");
    expect(built.status, `${name} built-output scan`).toBe(1);
  }
  const clientNames = grepBuilt("lE", SETTINGS, [".next/static"]);
  expect(head(clientNames.stdout), "a setting name in a script sent to the browser").toBe("");
  expect(clientNames.status).toBe(1);

  // every page the site serves at run time, public and panel, signed out and signed in
  const served = (await servedText(request, [...HTML_PAGES(), "/no-such-page/"], FILE_PAGES)).text;
  const panels: string[] = [];
  for (const cookie of [undefined, await cookieOf(OWNER()), await cookieOf(OTHER())]) {
    const reply = await call(request, "GET", PANEL, { cookie });
    expect(reply.status).toBe(200);
    panels.push(reply.text);
  }
  const errors = [
    await call(request, "GET", "/api/admin/profile/"),
    await call(request, "GET", "/api/admin/profile/", { cookie: await cookieOf(OTHER()) }),
  ];
  for (const { name, value } of values) {
    expect(served.includes(value), `${name} value in a public page`).toBe(false);
    for (const [index, text] of [...panels, ...errors.map((e) => e.text)].entries()) {
      expect(text.includes(value), `${name} value in panel or error response ${index}`).toBe(false);
    }
  }
});

test("E2E-ACC-22: the pull request template lists every setting name, and the pipeline runs the type check, lint and build with no hosting-backend service-account secret (§6.13)", async () => {
  const lines = fs.readFileSync(".github/pull_request_template.md", "utf8").split("\n");
  const heading = "## Settings to set in Vercel";
  expect(lines.filter((l) => l === heading)).toHaveLength(1);
  const rest = lines.slice(lines.indexOf(heading) + 1);
  const end = rest.findIndex((l) => l.startsWith("## "));
  const block = end === -1 ? rest : rest.slice(0, end);
  expect(block.filter((l) => l.startsWith("- "))).toEqual(SETTINGS.map((name) => `- \`${name}\``));
  expect(block.join("\n")).toContain("Production");
  expect(block.join("\n")).toContain("SIT");
  expect(block.filter((l) => l.includes("=")), "a value after a setting name").toEqual([]);
  // every setting name the code reads is in the list
  const read = new Set<string>();
  for (const match of gitGrep(["-o", "-E"], ["process\\.env\\.[A-Z_]+"], ["src"]).stdout.matchAll(/process\.env\.([A-Z_]+)/g)) read.add(match[1]);
  read.delete("NODE_ENV");
  for (const name of read) expect(SETTINGS, `${name} is read by the site but not listed`).toContain(name);

  const workflow = fs.readFileSync(".github/workflows/pipeline.yml", "utf8");
  expect(workflow).toMatch(/^\s*- run: npm run typecheck\s*$/m);
  expect(workflow).toMatch(/^\s*- run: npm run lint:new\s*$/m);
  expect(workflow).toMatch(/^\s*- run: npm run build\s*$/m);
  expect(workflow).toMatch(/^ {2}pull_request:\s*$/m);
  const jobs = workflow.split("\n").slice(workflow.split("\n").indexOf("jobs:") + 1).map((l) => l.match(/^ {2}([a-z][a-z-]*):\s*$/)).filter((m): m is RegExpMatchArray => m !== null).map((m) => m[1]);
  expect(jobs).toEqual(["master-source", "verify"]);
  for (const file of fs.readdirSync(".github/workflows").filter((n) => n.endsWith(".yml"))) {
    const text = fs.readFileSync(path.join(".github/workflows", file), "utf8");
    expect(text.includes("secrets."), `${file} reads a secret`).toBe(false);
    expect(text.split("\n").filter((l) => l.trim().startsWith("environment:")), `${file} names an environment`).toEqual([]);
    expect(text.toLowerCase().includes(OLD), `${file} names the old backend`).toBe(false);
  }
});

// =====================================================================================================================
// §5 hard constraints, each one attempted
// =====================================================================================================================

test("E2E-ACC-23: only a verified Google account that matches the owner's setting gets in; every other account, address variant and forged session is turned away (§5.1)", async ({
  browser,
  baseURL,
  request,
}) => {
  test.setTimeout(120000);
  const base = baseURL as string;
  await seedEverything(request);
  const stored = STORED;

  // the owner is let in (control)
  const owner = await call(request, "GET", PANEL, { cookie: await cookieOf(OWNER()) });
  expect(owner.text).toContain('aria-label="Admin sections"');
  expect((await call(request, "GET", "/api/admin/profile/", { cookie: await cookieOf(OWNER()) })).status).toBe(200);

  for (const who of OUTSIDERS) {
    const cookie = await who.cookie();
    const page = await call(request, "GET", PANEL, { cookie });
    expect(page.status, who.label).toBe(200);
    expect(page.text.includes('aria-label="Admin sections"'), `${who.label}: the menu is shown`).toBe(false);
    expect(page.text.includes(who.status === 401 ? "Sign in with Google" : DENY_TEXT), `${who.label}: the wrong screen`).toBe(true);
    for (const s of stored) expect(page.text.includes(s), `${who.label}: ${s} shown`).toBe(false);
    expect(page.text.includes(setting("ADMIN_EMAIL")), `${who.label}: the owner's email shown`).toBe(false);
    for (const url of ["/api/admin/profile/", "/api/admin/experience/", "/api/admin/projects/", "/api/admin/certifications/", "/api/admin/tech-stack/", "/api/admin/blog-posts/", "/api/admin/images/"]) {
      const read = await call(request, "GET", url, { cookie });
      expect(read.status, `${who.label}: ${url}`).toBe(who.status);
      for (const s of stored) expect(read.text.includes(s), `${who.label}: ${url} returned ${s}`).toBe(false);
    }
  }

  // a verified account of another address, in a real browser sign-in
  const { context, page } = await newContext(browser, base);
  await googleStandIn(context, base, { kind: "approve", claims: UNVERIFIED() });
  await page.goto(PANEL);
  await signInButton(page).click();
  await expect(region(page)).toHaveText(T_DENY, { useInnerText: true });
  await context.close();

});

test("E2E-ACC-24: every request that creates, changes or deletes content, or uploads or deletes an image, is refused for every non-owner session, sent directly without the panel (§5.2)", async ({
  request,
}) => {
  test.setTimeout(120000);
  const seed = await seedEverything(request);
  const list = attempts(seed);
  const before = snapshot();
  expect(list.length, "every owner-only write is attempted").toBeGreaterThanOrEqual(22);

  for (const who of OUTSIDERS) {
    const results = await runAttempts(request, list, await who.cookie());
    expect(
      results.filter((r) => r.status !== who.status).map((r) => `${who.label}: ${r.method} ${r.url} answered ${r.status}`),
      `${who.label}: requests that were not refused`,
    ).toEqual([]);
    for (const r of results) {
      expect(r.text.includes("uploadUrl"), `${who.label}: ${r.label} issued an upload address`).toBe(false);
    }
    expect(snapshot(), `${who.label}: something changed`).toBe(before);
  }

  // control: the owner's own run of the same list succeeds, and the stores change
  const owner = await runAttempts(request, list, await cookieOf(OWNER()));
  expect(owner.filter((r) => r.status !== 200).map((r) => `${r.method} ${r.url} answered ${r.status}`)).toEqual([]);
  expect(snapshot()).not.toBe(before);
});

test("E2E-ACC-25: a draft post cannot be read by a signed-out request or by another account, through any way to ask for it (§5.3)", async ({
  request,
}) => {
  const owner = await cookieOf(OWNER());
  const DRAFT = "DRAFT-MARKER-4d21c0";
  const LIVE = "LIVE-MARKER-0be7a9";
  expect((await call(request, "POST", "/api/admin/blog-posts/", { cookie: owner, body: { content: postWire("secret-draft", true, DRAFT) } })).status).toBe(200);
  expect((await call(request, "POST", "/api/admin/blog-posts/", { cookie: owner, body: { content: postWire("live-post", false, LIVE) } })).status).toBe(200);

  // the owner reads both (control)
  const all = await call(request, "GET", "/api/admin/blog-posts/", { cookie: owner });
  expect(all.status).toBe(200);
  expect(all.text).toContain(DRAFT);
  expect(all.text).toContain(LIVE);
  const mine = await call(request, "GET", "/api/admin/blog-posts/?slug=secret-draft", { cookie: owner });
  expect(mine.status).toBe(200);
  expect(mine.text).toContain(DRAFT);

  const questions = [
    "/api/admin/blog-posts/",
    "/api/admin/blog-posts/?slug=secret-draft",
    "/api/admin/blog-posts/?slug=secret-draft&slug=live-post",
    "/api/admin/blog-posts/?id=secret-draft",
    "/api/admin/blog-posts/published/",
    "/api/admin/blog-posts/published/?slug=secret-draft",
    "/api/admin/blog-posts/published/?slug=SECRET-DRAFT",
    "/api/admin/blog-posts/published/?slug=secret-draft%00",
    "/api/admin/blog-posts/published/?slug=secret-draft&slug=live-post",
    "/api/admin/blog-posts/published/?id=secret-draft",
    "/api/admin/blog-posts/published/?slug=",
  ];
  for (const who of OUTSIDERS) {
    const cookie = await who.cookie();
    for (const url of questions) {
      const reply = await call(request, "GET", url, { cookie });
      expect(reply.text.includes(DRAFT), `${who.label}: ${url} returned the draft`).toBe(false);
      expect(reply.text.includes("secret-draft"), `${who.label}: ${url} named the draft`).toBe(false);
      if (url.startsWith("/api/admin/blog-posts/published/")) {
        expect(reply.status, `${who.label}: ${url}`).not.toBe(500);
      } else {
        expect(reply.status, `${who.label}: ${url}`).toBe(who.status);
      }
    }
  }
  // the one public read returns the published post and only that
  const published = await call(request, "GET", "/api/admin/blog-posts/published/");
  expect(published.status).toBe(200);
  expect((field(published.json, "posts") as { slug: string }[]).map((p) => p.slug)).toEqual(["live-post"]);
  expect((await call(request, "GET", "/api/admin/blog-posts/published/?slug=live-post")).text).toContain(LIVE);
  expect((await call(request, "GET", "/api/admin/blog-posts/published/?slug=secret-draft")).status).toBe(404);

  // a published post turned back into a draft stops being public
  const back = await call(request, "PUT", "/api/admin/blog-posts/?id=live-post", { cookie: owner, body: { content: postWire("live-post", true, LIVE) } });
  expect(back.status).toBe(200);
  expect((await call(request, "GET", "/api/admin/blog-posts/published/")).text).not.toContain(LIVE);
  expect((await call(request, "GET", "/api/admin/blog-posts/published/?slug=live-post")).status).toBe(404);

  // the public pages, the feed and the sitemap never carry a stored draft
  for (const address of ["/", "/blog/"]) {
    const text = await (await request.get(address)).text();
    expect(text.includes(DRAFT) || text.includes("secret-draft") || text.includes(LIVE), `${address} carries a stored post`).toBe(false);
  }
  for (const address of ["/rss.xml", "/sitemap.xml"]) {
    const text = await (await request.get(address)).text();
    expect(text.includes(DRAFT) || text.includes("secret-draft"), `${address} carries a stored draft`).toBe(false);
  }
  expect((await request.get("/blog/secret-draft/")).status()).toBe(404);
});

test("E2E-ACC-26: no delete happens until the owner accepts the confirmation, on every list and on the image library (§5.4)", async ({
  browser,
  baseURL,
  request,
}) => {
  test.setTimeout(240000);
  const seed = await seedEverything(request);
  const { context, page } = await newContext(browser, baseURL as string, OWNER());
  const seen = recordRequests(page);
  const writes = () => seen.methods.filter((m) => m.method !== "GET" && m.method !== "HEAD" && m.method !== "OPTIONS" && m.url.includes("/api/admin/"));
  const confirm = page.getByRole("group", { name: "Confirm delete" });

  const lists: { heading: string; list: string; label: string }[] = [
    { heading: "Experience", list: "Experience entries", label: "Software Engineer at Acme" },
    { heading: "Projects", list: "Projects list", label: "Billing Console" },
    { heading: "Certifications", list: "Certifications list", label: "Cloud Practitioner" },
    { heading: "Tech stack", list: "Tech categories list", label: "Frontend" },
    { heading: "Blog posts", list: "Blog posts list", label: "Post seed-post" },
  ];
  await page.goto(PANEL);
  for (const entry of lists) {
    await openList(page, entry.heading);
    const items = page.getByRole("list", { name: entry.list }).getByRole("listitem");
    await expect(items, entry.heading).toHaveCount(1);
    const del = items.first().getByRole("button", { name: "Delete", exact: true });

    // one click on Delete only asks
    await del.click();
    await expect(confirm, entry.heading).toBeVisible();
    await expect(confirm, entry.heading).toContainText("This cannot be undone.");
    expect(writes(), `${entry.heading}: a request went out before the confirmation`).toEqual([]);
    await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(confirm, entry.heading).toHaveCount(0);
    await expect(items, entry.heading).toHaveCount(1);

    // asking and then leaving the page deletes nothing
    await del.click();
    await expect(confirm, entry.heading).toBeVisible();
    await page.reload();
    await openList(page, entry.heading);
    await expect(items, entry.heading + " after leaving").toHaveCount(1);
    expect(writes(), `${entry.heading}: a request went out`).toEqual([]);
  }

  // an item inside a tech category asks too, and saves nothing until confirmed
  await openList(page, "Tech stack");
  await page.getByRole("list", { name: "Tech categories list" }).getByRole("listitem").first().getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  await byLabel(page, "Item 2 name").fill("Vue");
  await byLabel(page, "Item 2 icon path").fill("/images/tech/vue.png");
  await saveButton(section(page, "Tech stack editor")).click();
  await expect(section(page, "Tech stack editor").getByRole("status").filter({ hasText: "Entry saved" })).toBeVisible();
  const afterSave = writes().length;
  await page.getByRole("list", { name: "Tech categories list" }).getByRole("listitem").first().getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).first().click();
  await expect(page.getByRole("group", { name: "Confirm item delete" })).toBeVisible();
  expect(writes().length, "an item was removed before the confirmation").toBe(afterSave);
  await page.getByRole("group", { name: "Confirm item delete" }).getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(byLabel(page, "Item 2 name")).toHaveValue("Vue");
  await page.getByRole("button", { name: "Cancel", exact: true }).first().click();

  // images
  await openImages(page);
  const pictures = page.getByRole("list", { name: "Uploaded images" }).getByRole("listitem");
  await expect(pictures).toHaveCount(1);
  const before = writes().length;
  await pictures.first().getByRole("button", { name: "Delete", exact: true }).click();
  await expect(confirm).toBeVisible();
  expect(storeIds(), "an image was removed before the confirmation").toContain(seed.image);
  expect(writes().length).toBe(before);
  await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.reload();
  await openImages(page);
  await expect(pictures).toHaveCount(1);
  expect(storeIds()).toContain(seed.image);

  // control: a confirmed delete does go out, once, and removes the record
  await openList(page, "Experience");
  const experience = page.getByRole("list", { name: "Experience entries" }).getByRole("listitem");
  const sent = writes().length;
  await experience.first().getByRole("button", { name: "Delete", exact: true }).click();
  await confirm.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(experience).toHaveCount(0);
  const newest = writes().slice(sent);
  expect(newest.map((w) => w.method)).toEqual(["DELETE"]);
  await context.close();
});

test("E2E-ACC-27: an image over 5 MB or of another type is refused by the server too, only the owner can upload or delete, and anyone can open an uploaded image (§5.5)", async ({
  request,
  browser,
  baseURL,
}) => {
  test.setTimeout(120000);
  const owner = await cookieOf(OWNER());
  const askAs = (cookie: string | undefined, body: unknown) => call(request, "POST", "/api/admin/images/upload/", { cookie, body });
  const ask = (body: unknown) => askAs(owner, body);

  // too big, wrong type, empty, malformed: each refused with no upload address
  const refusals: [string, unknown][] = [
    ["5 MB and one byte", { name: "big.png", type: "image/png", size: 5242881 }],
    ["6 MB", { name: "big.png", type: "image/png", size: 6 * 1024 * 1024 }],
    ["a PDF", { name: "a.pdf", type: "application/pdf", size: 1000 }],
    ["HTML", { name: "a.html", type: "text/html", size: 100 }],
    ["a GIF", { name: "a.gif", type: "image/gif", size: 100 }],
    ["an upper-case type", { name: "a.png", type: "IMAGE/PNG", size: 100 }],
    ["an empty file", { name: "a.png", type: "image/png", size: 0 }],
    ["a size that is text", { name: "a.png", type: "image/png", size: "100" }],
    ["no name", { type: "image/png", size: 100 }],
  ];
  for (const [label, body] of refusals) {
    const reply = await ask(body);
    expect(reply.status, label).toBe(400);
    expect(reply.text.includes("uploadUrl"), label + " got an upload address").toBe(false);
  }
  // exactly 5 MB, each of the four types: allowed
  for (const type of ["image/png", "image/jpeg", "image/webp", "image/svg+xml"]) {
    const reply = await ask({ name: "ok", type, size: 5242880 });
    expect(reply.status, type).toBe(200);
    expect(String(field(reply.json, "uploadUrl")), type).toContain("/storage/v1/object/upload/sign/images/");
  }

  // a file that is bigger than it said, or of another type than it said, never becomes an image
  const register = (body: unknown) => call(request, "POST", "/api/admin/images/", { cookie: owner, body });
  const oversize = field((await ask({ name: "small.png", type: "image/png", size: 1000 })).json, "id") as string;
  storePut(oversize, png(6 * 1024 * 1024), "image/png");
  expect((await register({ id: oversize, name: "small.png", type: "image/png", size: 1000 })).status).toBe(400);
  expect(storeIds(), "the oversized file is removed").not.toContain(oversize);
  const mislabelled = field((await ask({ name: "page.png", type: "image/png", size: 500 })).json, "id") as string;
  storePut(mislabelled, Buffer.from("<script>alert(1)</script>"), "text/html");
  expect((await register({ id: mislabelled, name: "page.png", type: "image/png", size: 500 })).status).toBe(400);
  expect(storeIds(), "the mislabelled file is removed").not.toContain(mislabelled);
  expect((await register({ id: "11111111-1111-4111-8111-111111111111.png", name: "ghost.png", type: "image/png", size: 10 })).status, "a file that was never sent").toBe(400);
  expect((await register({ id: "../../etc/passwd", name: "x.png", type: "image/png", size: 10 })).status).toBe(400);
  const listed = await call(request, "GET", "/api/admin/images/", { cookie: owner });
  expect(field(listed.json, "images")).toEqual([]);

  // a real image, then: anyone may open it, only the owner may add or delete
  const good = field((await ask({ name: "good.png", type: "image/png", size: 2048 })).json, "id") as string;
  storePut(good, png(2048), "image/png");
  const registered = await register({ id: good, name: "good.png", type: "image/png", size: 2048 });
  expect(registered.status).toBe(200);
  const url = field(field(registered.json, "image"), "url") as string;
  const visitor = await newContext(browser, baseURL as string);
  const response = await visitor.page.goto(url);
  expect(response?.status()).toBe(200);
  expect(response?.headers()["content-type"]).toBe("image/png");
  expect(await visitor.context.cookies()).toEqual([]);

  const before = snapshot();
  for (const who of OUTSIDERS) {
    const cookie = await who.cookie();
    const upload = await askAs(cookie, { name: "x.png", type: "image/png", size: 100 });
    expect(upload.status, `${who.label}: upload`).toBe(who.status);
    expect(upload.text.includes("uploadUrl"), `${who.label}: upload address`).toBe(false);
    const removal = await call(request, "DELETE", "/api/admin/images/?id=" + good, { cookie });
    expect(removal.status, `${who.label}: delete`).toBe(who.status);
    expect((await call(request, "GET", "/api/admin/images/", { cookie })).status, `${who.label}: list`).toBe(who.status);
  }
  expect(snapshot(), "an outsider changed the images").toBe(before);
  const again = await visitor.page.goto(url);
  expect(again?.status(), "the image is still open to anyone").toBe(200);
  await visitor.context.close();

  const removed = await call(request, "DELETE", "/api/admin/images/?id=" + good, { cookie: owner });
  expect(removed.status).toBe(200);
  expect(storeIds()).not.toContain(good);
});

test("E2E-ACC-28: nothing public leads to the panel: a crawl of the public site, the feed, the sitemap and robots.txt never meets its address, and obvious admin addresses are not it (§5.6)", async ({
  request,
}) => {
  test.setTimeout(120000);
  const seen = new Set<string>();
  const queue = ["/"];
  const links: { from: string; href: string }[] = [];
  while (queue.length > 0 && seen.size < 60) {
    const address = queue.shift() as string;
    if (seen.has(address)) continue;
    seen.add(address);
    const response = await request.get(address);
    if (!(response.headers()["content-type"] ?? "").includes("html")) continue;
    const markup = await response.text();
    expect(markup.toLowerCase().includes("bright-warm-greenhouse"), `${address} names the panel`).toBe(false);
    for (const match of markup.matchAll(/href="([^"#]+)[^"]*"/g)) {
      const href = match[1];
      links.push({ from: address, href });
      if (href.startsWith("/") && !href.startsWith("//") && !href.startsWith("/_next/") && !/\.[a-z0-9]+$/i.test(href) && !seen.has(href)) queue.push(href);
    }
  }
  expect(seen.size, "the crawl reached the blog posts").toBeGreaterThanOrEqual(2 + PUBLISHED().length);
  expect(links.filter((l) => /greenhouse|\/api\/admin|\/api\/auth/i.test(l.href)), "links into the panel or its entry points").toEqual([]);
  for (const file of FILE_PAGES) {
    const body = (await (await request.get(file)).text()).toLowerCase();
    expect(body.includes("greenhouse"), `${file} names the panel`).toBe(false);
    expect(/disallow:\s*\/(admin|bright)/i.test(body), `${file} advertises a private path`).toBe(false);
  }
  // the obvious places to look are not the panel
  for (const guess of ["/admin/", "/login/", "/dashboard/", "/panel/", "/wp-admin/", "/greenhouse/"]) {
    expect((await request.get(guess, { maxRedirects: 0 })).status(), guess).toBe(404);
  }
  // the control: the panel is where it says
  expect((await request.get(PANEL)).status()).toBe(200);
});

test("E2E-ACC-29: a visitor can store nothing: browsing sends no write and sets no cookie, and every write sent to the site while signed out changes nothing (§5.7)", async ({
  browser,
  baseURL,
  request,
}) => {
  test.setTimeout(150000);
  const seed = await seedEverything(request);
  const before = snapshot();

  // browsing as a visitor
  const { context, page } = await newContext(browser, baseURL as string);
  const seen = recordRequests(page);
  for (const address of HTML_PAGES()) {
    await page.goto(address);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  }
  expect(seen.methods.filter((m) => m.method !== "GET" && m.method !== "HEAD" && m.method !== "OPTIONS"), "a write from a public page").toEqual([]);
  expect(seen.urls.filter((u) => u.includes("/api/")), "an API call from a public page").toEqual([]);
  expect(await context.cookies(), "a cookie set for a visitor").toEqual([]);
  await context.close();

  // writes sent to every public address, every owner entry point, and addresses a form or a comment box would use
  const addresses = [...HTML_PAGES(), ...FILE_PAGES, "/api/contact/", "/api/comments/", "/api/subscribe/", "/api/likes/"];
  for (const address of addresses) {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      const reply = await call(request, method, address, { body: { name: "Visitor", comment: "hello", email: "v@example.test" } });
      expect([404, 405, 200], `${method} ${address}`).toContain(reply.status);
      if (reply.status === 200) {
        expect(reply.text, `${method} ${address} returned something other than the page`).toBe(await (await request.get(address)).text());
      }
    }
  }
  const refused = await runAttempts(request, attempts(seed), undefined);
  expect(refused.filter((r) => r.status !== 401).map((r) => `${r.method} ${r.url} answered ${r.status}`)).toEqual([]);
  expect(snapshot(), "a visitor changed what is stored").toBe(before);
});

test("E2E-ACC-30: what the owner saves in the panel does not change a public page, which keeps showing what was last published (§5.8)", async ({
  request,
}) => {
  const owner = await cookieOf(OWNER());
  // a Publish from another spec file running in parallel can renew the blog pages, so they are not compared
  const addresses = [...HTML_PAGES().filter((address) => !address.startsWith("/blog/")), ...FILE_PAGES];
  const original = new Map<string, string>();
  for (const address of addresses) original.set(address, await (await request.get(address)).text());

  const markers = ["Changed Name Marker", "Marker Role", "db-only-post", "Marker Project"];
  expect((await call(request, "PUT", "/api/admin/profile/", { cookie: owner, body: { ...PROFILE, name: markers[0] } })).status).toBe(200);
  expect((await call(request, "POST", "/api/admin/experience/", { cookie: owner, body: { position: 0, content: { ...EXPERIENCE, title: markers[1] } } })).status).toBe(200);
  expect((await call(request, "POST", "/api/admin/projects/", { cookie: owner, body: { position: 0, content: { ...PROJECT, title: markers[3] } } })).status).toBe(200);
  expect((await call(request, "POST", "/api/admin/blog-posts/", { cookie: owner, body: { content: postWire("db-only-post", false) } })).status).toBe(200);

  for (const address of addresses) {
    const text = await (await request.get(address)).text();
    if (address !== "/rss.xml" && address !== "/sitemap.xml") expect(text, `${address} changed`).toBe(original.get(address));
    for (const marker of markers) expect(text.includes(marker), `${address} shows ${marker}`).toBe(false);
  }
  expect((await request.get("/blog/db-only-post/")).status(), "a database post is not a public page").toBe(404);
});

test("E2E-ACC-31: the public pages are prebuilt and static, run no sign-in or database code, and ship none of it to the visitor (§5.9)", async ({
  request,
}) => {
  test.setTimeout(120000);
  requireBuild();
  const owner = await cookieOf(OWNER());
  for (const address of [...HTML_PAGES(), ...FILE_PAGES]) {
    const anonymous = await request.get(address);
    const withSession = await request.get(address, { headers: { cookie: owner } });
    for (const reply of [anonymous, withSession]) {
      const headers = reply.headers();
      expect(headers["x-nextjs-cache"], `${address} x-nextjs-cache`).toBe("HIT");
      expect(headers["set-cookie"], `${address} set-cookie`).toBeUndefined();
    }
    expect(await withSession.text(), `${address} differs when a session is sent`).toBe(await anonymous.text());
  }
  const manifest = JSON.parse(fs.readFileSync(".next/prerender-manifest.json", "utf8")) as { routes: Record<string, unknown> };
  const routes = Object.keys(manifest.routes);
  for (const route of ["/", "/blog", "/robots.txt", "/rss.xml", "/sitemap.xml", ...PUBLISHED().map((p) => `/blog/${p.slug}`)]) {
    expect(routes, `the prerender manifest lacks ${route}`).toContain(route);
  }
  expect(routes).not.toContain("/bright-warm-greenhouse");
  const control = (await request.get(PANEL)).headers();
  expect(control["x-nextjs-cache"], "the panel must not be a prerendered hit").not.toBe("HIT");
  expect(control["cache-control"] ?? "").toContain("no-store");

  // nothing the visitor receives carries sign-in, database or panel code
  const pub = await servedText(request, HTML_PAGES());
  expect(pub.scripts, "scripts were read").toBeGreaterThanOrEqual(5);
  const words = ["next-auth", "authjs", "@auth/core", "/api/auth", "/api/admin", "SUPABASE", "supabase", "postgres", "bright-warm-greenhouse", "AUTH_SECRET", "ADMIN_EMAIL", "AUTH_GOOGLE"];
  expect(words.filter((word) => pub.text.includes(word))).toEqual([]);
  const panel = await servedText(request, [PANEL]);
  expect(panel.text, "the control (the panel) must carry its entry points").toContain("/api/admin");

  // and in the source: only the panel and the server entry points import the sign-in code or the server modules
  const importers = (pattern: string): string[] =>
    gitGrep(["-l", "-E"], [pattern], ["src"]).stdout.split("\n").filter((l) => l !== "");
  for (const file of importers("@/lib/auth")) {
    expect(file.startsWith("src/app/bright-warm-greenhouse/") || file.startsWith("src/app/api/") || file === "src/lib/auth.ts", `${file} imports the sign-in code`).toBe(true);
  }
  for (const file of importers("lib/server")) {
    expect(file.startsWith("src/app/api/admin/") || file.startsWith("src/lib/server/") || file === "src/app/page.tsx" || file === "src/app/blog/page.tsx" || file === "src/app/blog/[slug]/page.tsx" || file === "src/app/rss.xml/route.ts" || file === "src/app/sitemap.ts", `${file} imports a server module`).toBe(true);
  }
});

test("E2E-ACC-32: an unreachable database or storage shows a safe message, and no response, page or log line carries a secret or the owner's email (§5.10)", async ({
  browser,
  baseURL,
  request,
}) => {
  test.setTimeout(120000);
  const owner = await cookieOf(OWNER());
  const secrets = ["10.1.2.3", "password-marker-standin", "key-marker-standin", setting("AUTH_SECRET"), setting("ADMIN_EMAIL")];
  const leaks = [...secrets, "ECONNREFUSED"];
  await seedEverything(request);
  dbBreak();
  storeBreak();

  const { context, page } = await newContext(browser, baseURL as string, OWNER());
  await page.goto(PANEL);
  await expect(async () => {
    await menu(page).getByRole("button", { name: "Profile", exact: true }).click({ timeout: 5000 });
    await expect(page.getByText("The profile could not be loaded.", { exact: true })).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 20000 });
  const markup = await page.content();
  for (const leak of leaks) expect(markup.includes(leak), `the panel shows ${leak}`).toBe(false);
  await context.close();

  for (const url of ["/api/admin/profile/", "/api/admin/experience/", "/api/admin/images/", "/api/admin/blog-posts/"]) {
    const reply = await call(request, "GET", url, { cookie: owner });
    expect(reply.status, url).toBe(503);
    expect(reply.text, url).toBe('{"error":"unavailable"}');
    for (const leak of leaks) expect(reply.text.includes(leak), `${url} returned ${leak}`).toBe(false);
  }
  dbFix();
  storeFix();
  expect((await call(request, "GET", "/api/admin/profile/", { cookie: owner })).status, "the site recovers").toBe(200);

  // what the server writes to its log: only these three call sites exist, each through a helper that keeps the text out
  const consoleCalls = gitGrep(["-E"], ["console\\."], ["src"]).stdout.split("\n").filter((l) => l !== "");
  expect(consoleCalls).toHaveLength(3);
  for (const line of consoleCalls) expect(line, "a log call that is not a fixed-format line").toMatch(/console\.error\((databaseLogLine|storageLogLine|authLogLine|line|problem)/);
  const hostile = Object.assign(new Error(`connect ECONNREFUSED 10.1.2.3:5432 ${setting("AUTH_SECRET")} ${setting("ADMIN_EMAIL")} password-marker-standin`), {
    code: "ECONNREFUSED",
    status: 503,
    type: "Callback",
  });
  const lines = [
    databaseLogLine("read", hostile),
    databaseLogLine("schema", { code: setting("AUTH_SECRET") }),
    storageLogLine("sign", hostile),
    storageLogLine("stat", { code: setting("ADMIN_EMAIL") }),
    authLogLine({ name: "Error", message: hostile.message }),
    authLogLine(hostile),
  ];
  for (const line of lines) {
    for (const leak of secrets) expect(line.includes(leak), `the log line "${line}" carries ${leak}`).toBe(false);
    expect(line, "a log line is one short line").toMatch(/^\[(database|storage|auth)\] [A-Za-z0-9_ ]{1,60}$/);
  }
});

test("E2E-ACC-33: no old-backend service is contacted or shipped: browsing the public site and every panel screen reaches only this site and the storage host, and the panel's scripts carry no old-backend code (§5.11)", async ({
  browser,
  baseURL,
  request,
}) => {
  test.setTimeout(180000);
  const base = baseURL as string;
  await seedEverything(request);
  const { context, page } = await newContext(browser, base, OWNER());
  const seen = recordRequests(page);
  const scripts: string[] = [];
  page.on("response", (response) => {
    if (response.url().includes("/_next/static/") && response.url().endsWith(".js")) scripts.push(response.url());
  });

  await page.goto(PANEL);
  for (const label of LABELS) {
    await openScreen(page, label, headingOf(page, label));
    await page.waitForLoadState("networkidle");
  }
  expect(scripts.length, "the panel loaded scripts").toBeGreaterThan(3);
  let panelText = "";
  for (const script of new Set(scripts)) panelText += await (await request.get(script)).text();
  for (const word of [OLD, OLD2, "identitytoolkit", "securetoken", "gstatic.com/" + OLD + "js"]) {
    expect(panelText.toLowerCase().includes(word), `the panel's scripts name ${word}`).toBe(false);
  }
  for (const address of HTML_PAGES()) await page.goto(address);

  const hosts = new Set(seen.urls.map((u) => new URL(u).host));
  const allowed = new Set([new URL(base).host, new URL(HOST).host, "fonts.googleapis.com", "fonts.gstatic.com"]);
  const strangers = [...hosts].filter((h) => h !== "" && !allowed.has(h));
  expect(strangers, "hosts contacted that are not this site or its storage").toEqual([]);
  expect([...hosts].filter((h) => new RegExp(`${OLD}|${OLD2}|identitytoolkit|securetoken`).test(h))).toEqual([]);
  await context.close();
});

test("E2E-ACC-34: nothing in the repository or the pipeline selects or requires a paid plan or paid feature of the hosting, database or sign-in providers (§5.12)", async () => {
  const vercel = JSON.parse(fs.readFileSync("vercel.json", "utf8")) as Record<string, unknown>;
  const allowedKeys = ["$schema", "framework", "installCommand", "buildCommand", "trailingSlash", "cleanUrls", "headers"];
  expect(Object.keys(vercel).filter((key) => !allowedKeys.includes(key)), "a vercel.json setting beyond the free defaults").toEqual([]);
  expect(fs.readFileSync("next.config.ts", "utf8")).toMatch(/unoptimized:\s*true/);

  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8")) as { dependencies?: object; devDependencies?: object };
  const names = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})].map((n) => n.toLowerCase());
  const providers = ["@vercel/", "@supa" + "base/", "@sentry/", "@datadog/", "posthog", "mixpanel", "stripe", "@clerk/", "@upstash/", "@google-cloud/", "googleapis", OLD];
  for (const start of providers) expect(names.filter((n) => n.startsWith(start)), `dependencies starting ${start}`).toEqual([]);

  const settings = gitGrep(["-E"], ["maxDuration", "preferredRegion", "runtime *= *[\"']edge", "export const revalidate", "unstable_cache"], ["src"]);
  expect(head(settings.stdout), "a function, edge or caching setting under src").toBe("");
  expect(settings.status).toBe(1);

  const paid = gitGrep(
    ["-i", "-E"],
    ["pay[- ]as[- ]you[- ]go", "pro plan", "team plan", "enterprise plan", "spend management", "speed insights", "web analytics", "vercel (pro|enterprise)"],
    ["src", "scripts", ".github", "package.json", "vercel.json", "next.config.ts", "playwright.config.ts"],
  );
  expect(head(paid.stdout), "a paid plan or feature named in code or configuration").toBe("");
  expect(paid.status).toBe(1);

  for (const file of fs.readdirSync(".github/workflows").filter((n) => n.endsWith(".yml"))) {
    const text = fs.readFileSync(path.join(".github/workflows", file), "utf8");
    expect(/vercel\s+(deploy|pull|build|promote|--prod)|npx vercel|VERCEL_/i.test(text), `${file} drives a hosting command`).toBe(false);
  }
  // the file store is created with the 5 MB cap and is public-read only for the images bucket
  const storage = fs.readFileSync("src/lib/server/storage.ts", "utf8");
  expect(storage).toContain('"file_size_limit":5242880');
  expect(storage).toContain('"public":true');
});

test("E2E-ACC-35: a sign-in Google does not complete shows a message and leaves the Sign in with Google button usable, so the owner can try again and get in (§5.13)", async ({
  browser,
  baseURL,
}) => {
  const base = baseURL as string;
  const { context, page } = await newContext(browser, base);
  const google = await googleStandIn(context, base, { kind: "leave" });

  await page.goto(PANEL);
  await signInButton(page).click();
  await expect(page).toHaveURL(/\/bright-warm-greenhouse\/\?error=/);
  await expect(region(page)).toHaveText("Admin Sign in with Google Sign-in was not completed.", { useInnerText: true });
  await expect(region(page).getByRole("alert")).toHaveText("Sign-in was not completed.");
  await expect(signInButton(page)).toBeEnabled();
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await expect(signOutButton(page)).toHaveCount(0);
  await signInButton(page).click();
  await expect.poll(() => google.calls()).toBe(2);
  await expect(region(page)).toHaveText("Admin Sign in with Google Sign-in was not completed.", { useInnerText: true });

  // the owner is never stuck: the next attempt that Google completes gets in
  google.set({ kind: "approve", claims: OWNER() });
  await signInButton(page).click();
  await expect(region(page)).toHaveText(T_OWNER, { useInnerText: true });
  await context.close();
});

test("E2E-ACC-36: after signing out the owner can sign in again with the same Google account, over and over, with nothing to reset first (§5.14)", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(120000);
  const base = baseURL as string;
  const { context, page } = await newContext(browser, base);
  const google = await googleStandIn(context, base, { kind: "approve", claims: OWNER() });
  await page.goto(PANEL);

  for (let round = 1; round <= 3; round++) {
    await signInButton(page).click();
    await expect(region(page), `sign-in ${round}`).toHaveText(T_OWNER, { useInnerText: true });
    await signOutButton(page).click();
    await expect(region(page), `sign-out ${round}`).toHaveText(T_OUT, { useInnerText: true });
    // let the sign-out finish its own navigation before the next sign-in starts
    await page.reload();
    await expect(region(page), `after reload ${round}`).toHaveText(T_OUT, { useInnerText: true });
  }
  expect(google.calls()).toBe(3);

  // another account in between does not lock the owner out
  google.set({ kind: "approve", claims: OTHER() });
  await signInButton(page).click();
  await expect(region(page)).toHaveText(T_DENY, { useInnerText: true });
  await signOutButton(page).click();
  await expect(region(page)).toHaveText(T_OUT, { useInnerText: true });
  await page.reload();
  await expect(region(page)).toHaveText(T_OUT, { useInnerText: true });
  google.set({ kind: "approve", claims: OWNER() });
  await signInButton(page).click();
  await expect(region(page)).toHaveText(T_OWNER, { useInnerText: true });
  await context.close();

  // a brand new browser, with no state at all, signs the owner in too
  const fresh = await newContext(browser, base);
  await googleStandIn(fresh.context, base, { kind: "approve", claims: OWNER() });
  await fresh.page.goto(PANEL);
  await signInButton(fresh.page).click();
  await expect(region(fresh.page)).toHaveText(T_OWNER, { useInnerText: true });
  await fresh.context.close();
});

test("E2E-ACC-37: the panel is painted from the site's colour tokens in the light and the dark theme, with no raw colour or dark: variant in its source (§5.15)", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(180000);
  const base = baseURL as string;

  type Paint = {
    surface: string;
    background: string;
    foreground: string;
    rose: string;
    altSurface: string;
    section: string;
    main: string;
    h1: string;
    alert: string | null;
    button: string | null;
  };
  const paint = (page: Page): Promise<Paint> =>
    page.evaluate(() => {
      const resolved = (css: string, prop: "backgroundColor" | "color"): string => {
        const el = document.createElement("div");
        el.style.cssText = css;
        document.body.append(el);
        const value = getComputedStyle(el)[prop];
        el.remove();
        return value;
      };
      const box = document.querySelector('section[aria-label="Admin"]') as HTMLElement;
      const alert = box.querySelector('[role="alert"]');
      const button = box.querySelector("button");
      return {
        surface: resolved("background-color:var(--surface)", "backgroundColor"),
        background: resolved("background-color:var(--background)", "backgroundColor"),
        foreground: resolved("color:var(--foreground)", "color"),
        rose: resolved("color:var(--accent-rose)", "color"),
        altSurface: resolved("background-color:var(--surface-alt)", "backgroundColor"),
        section: getComputedStyle(box).backgroundColor,
        main: getComputedStyle(document.querySelector("main") as HTMLElement).backgroundColor,
        h1: getComputedStyle(box.querySelector("h1") as HTMLElement).color,
        alert: alert ? getComputedStyle(alert).color : null,
        button: button ? getComputedStyle(button).backgroundColor : null,
      };
    });

  const painted: Record<string, Paint> = {};
  for (const theme of ["light", "dark"]) {
    for (const state of ["signed-out", "not-allowed", "owner"]) {
      const claims = state === "owner" ? OWNER() : state === "not-allowed" ? OTHER() : undefined;
      const visit = await newContext(browser, base, claims);
      await visit.context.addInitScript((value) => {
        try {
          localStorage.setItem("theme", value);
        } catch {
          // the theme falls back to the system setting
        }
      }, theme);
      await visit.page.goto(PANEL);
      await expect(visit.page.locator("html")).toHaveAttribute("data-theme", theme);
      if (state === "owner") {
        await openProfile(visit.page);
        await expect(visit.page.getByText("No profile has been saved yet.", { exact: true })).toBeVisible();
      }
      const p = await paint(visit.page);
      const key = `${theme}/${state}`;
      painted[key] = p;
      expect(p.section, `${key}: the panel box is not --surface`).toBe(p.surface);
      expect(p.main, `${key}: the page behind the panel is not --background`).toBe(p.background);
      expect(p.h1, `${key}: the title is not --foreground`).toBe(p.foreground);
      if (p.alert !== null) expect(p.alert, `${key}: the alert is not --accent-rose`).toBe(p.rose);
      if (p.button !== null) expect(p.button, `${key}: a button is not --surface-alt`).toBe(p.altSurface);
      await visit.context.close();
    }
  }
  // the two themes really differ, so the checks above could fail if the panel used fixed colours
  expect(painted["light/signed-out"].surface).not.toBe(painted["dark/signed-out"].surface);
  expect(painted["light/signed-out"].section).not.toBe(painted["dark/signed-out"].section);
  expect(painted["light/owner"].h1).not.toBe(painted["dark/owner"].h1);

  // the source: no raw colour, no dark: variant, in the panel or its screens
  const raw = gitGrep(
    ["-E"],
    ["#[0-9a-fA-F]{3,8}\\b", "\\brgba?\\(", "\\bhsla?\\(", "\\boklch\\(", "\\bdark:"],
    ["src/app/components/admin", "src/app/bright-warm-greenhouse"],
  );
  expect(head(raw.stdout), "a raw colour or a dark: variant in the panel").toBe("");
  expect(raw.status).toBe(1);
});
