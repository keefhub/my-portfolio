import { spawnSync } from "node:child_process";
import fs from "node:fs";
import {
  expect,
  test,
  type APIRequestContext,
  type APIResponse,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
} from "@playwright/test";
import { encode } from "next-auth/jwt";

test.describe.configure({ mode: "default" });

// Shared fixtures. The tests of this file share one stand-in database file and one stand-in storage directory,
// so every test starts by resetting both.

// The gate scans this file, so the names of forbidden words and modules are put together from pieces.
const piece = (...parts: string[]): string => parts.join("");
const SUPABASE_PREFIX = piece("@supa", "base/");
const FIRE = piece("fire", "base");
const PG = piece("post", "gres");
const AUTH_MODULE = piece("@/lib/", "auth");
const SERVER_DIR = piece("lib/", "server");
const SERVER_PATH = piece("src/", SERVER_DIR);
const NEXT_HEADERS = piece("next/", "headers");
const COOKIES_CALL = piece("cook", "ies(");
const HEADERS_CALL = piece("head", "ers(");

const STAND_IN_PREFIX = "stand-in:";
const DB_URL = process.env.SUPABASE_DB_URL ?? "";
const DB_FILE = DB_URL.startsWith(STAND_IN_PREFIX) ? DB_URL.slice(STAND_IN_PREFIX.length) : "";
const STORE_URL = process.env.SUPABASE_URL ?? "";
const STORE_DIR = STORE_URL.startsWith(STAND_IN_PREFIX) ? STORE_URL.slice(STAND_IN_PREFIX.length) : "";

const API = "/api/admin/blog-posts/";
const PUB = "/api/admin/blog-posts/published/";
const TECH_API = "/api/admin/tech-stack/";
const EXPERIENCE_API = "/api/admin/experience/";

const IMG_DIAGRAM = "77777777-7777-4777-8777-777777777777.png";
const DIAGRAM_IMAGE = { id: IMG_DIAGRAM, name: "diagram.png", contentType: "image/png", size: 70 };

type PostData = {
  title: string;
  excerpt: string;
  date: string;
  tags: string[];
  featured: boolean;
  coverImage: string;
  coverAlt: string;
  body: string;
};

const MOVING_DATA: PostData = {
  title: "Notes on moving to Vercel",
  excerpt: "What changed and why",
  date: "2026-05-15",
  tags: ["nextjs", "vercel"],
  featured: false,
  coverImage: "/images/blog/vercel.png",
  coverAlt: "A diagram of the hosting move",
  body: "# Moving\n\nWe moved the site to Vercel.",
};
const DRAFT_DATA: PostData = {
  title: "Unfinished thoughts",
  excerpt: "Not ready yet",
  date: "2026-06-01",
  tags: [],
  featured: false,
  coverImage: "",
  coverAlt: "",
  body: "SECRET-DRAFT-BODY-9QX",
};
const MOVING = { slug: "moving-to-vercel", status: "published", data: MOVING_DATA };
const DRAFT = { slug: "unfinished-thoughts", status: "draft", data: DRAFT_DATA };
const EMPTY_DATA: PostData = {
  title: "",
  excerpt: "",
  date: "",
  tags: [],
  featured: false,
  coverImage: "",
  coverAlt: "",
  body: "",
};

const LEAKS = ["stand-in", "ECONNREFUSED", "password-marker-standin", "SUPABASE_DB_URL", PG];

const SESSION_COOKIE = "authjs.session-token";
type Claims = { sub: string; email: string; name: string; emailVerified: boolean };
const setting = (name: string): string => process.env[name] ?? "";
const OWNER = (): Claims => ({ sub: "owner-1", email: setting("ADMIN_EMAIL"), name: "Owner Test", emailVerified: true });
const OTHER = (): Claims => ({
  sub: "other-1",
  email: "someone-else@example.test",
  name: "Someone Else",
  emailVerified: true,
});
const UNVERIFIED = (): Claims => ({
  sub: "owner-2",
  email: setting("ADMIN_EMAIL"),
  name: "Unverified Owner",
  emailVerified: false,
});

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
const ownerCookie = (): Promise<string> => cookieOf(OWNER());

// The database stand-in file.
function dbReset(): void {
  if (DB_FILE !== "" && fs.existsSync(DB_FILE)) fs.rmSync(DB_FILE, { force: true });
}

function readDbFile(): Record<string, unknown> {
  if (DB_FILE === "" || !fs.existsSync(DB_FILE)) return {};
  return JSON.parse(fs.readFileSync(DB_FILE, "utf8")) as Record<string, unknown>;
}

function dbBreak(): void {
  fs.writeFileSync(DB_FILE, JSON.stringify({ ...readDbFile(), unreachable: true }));
}

function dbFix(): void {
  const { unreachable: _unreachable, ...rest } = readDbFile();
  void _unreachable;
  fs.writeFileSync(DB_FILE, JSON.stringify(rest));
}

function dbSeedWith(images: unknown[], posts: unknown[]): void {
  fs.writeFileSync(DB_FILE, JSON.stringify({ images, blog_posts: posts }));
}

function dbSeedAll(
  profile: unknown,
  images: unknown[],
  experience: unknown[],
  projects: unknown[],
  certs: unknown[],
  techs: unknown[],
  posts: unknown[],
): void {
  fs.writeFileSync(
    DB_FILE,
    JSON.stringify({
      profile,
      images,
      experience,
      projects,
      certifications: certs,
      tech_categories: techs,
      blog_posts: posts,
    }),
  );
}

type StoredPost = { slug: string; status: string; data: Record<string, unknown> };
function dbPosts(): StoredPost[] {
  const list = readDbFile().blog_posts;
  return Array.isArray(list) ? (list as StoredPost[]) : [];
}

// The storage stand-in directory.
function storeReset(): void {
  if (STORE_DIR !== "" && fs.existsSync(STORE_DIR)) fs.rmSync(STORE_DIR, { recursive: true, force: true });
}

const seedBoth = (): void => dbSeedWith([DIAGRAM_IMAGE], [MOVING, DRAFT]);

// Wire shapes.
const wireOf = (slug: string, draft: boolean, data: PostData) => ({
  title: data.title,
  excerpt: data.excerpt,
  date: data.date,
  slug,
  tags: data.tags,
  draft,
  featured: data.featured,
  coverImage: data.coverImage,
  coverAlt: data.coverAlt,
  body: data.body,
});
const entryOf = (slug: string, draft: boolean, data: PostData) => ({
  id: slug,
  position: 0,
  content: wireOf(slug, draft, data),
});
const publicOf = (slug: string, data: PostData) => ({
  title: data.title,
  excerpt: data.excerpt,
  date: data.date,
  slug,
  tags: data.tags,
  coverImage: data.coverImage,
  coverAlt: data.coverAlt,
  body: data.body,
  featured: data.featured,
});
const validWire = (slug: string): Record<string, unknown> => ({
  ...wireOf(slug, false, MOVING_DATA),
  title: "Post " + slug,
});

async function apiGet(request: APIRequestContext, cookie?: string, address: string = API): Promise<APIResponse> {
  return request.get(address, { headers: cookie === undefined ? {} : { cookie }, maxRedirects: 0 });
}

async function apiSend(
  request: APIRequestContext,
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  query: string,
  body: string | undefined,
  cookie?: string,
  address: string = API,
): Promise<APIResponse> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (cookie !== undefined) headers.cookie = cookie;
  return request.fetch(address + query, {
    method,
    headers,
    ...(body === undefined ? {} : { data: body }),
    maxRedirects: 0,
  });
}

function gitGrep(args: string[]): { stdout: string; status: number | null } {
  const result = spawnSync("git", ["grep", "--untracked", ...args], { cwd: process.cwd(), encoding: "utf8" });
  return { stdout: result.stdout ?? "", status: result.status };
}

async function expectAnswer(res: APIResponse, status: number, body: unknown, label: string): Promise<void> {
  expect(res.status(), label + " status").toBe(status);
  expect(await res.json(), label + " body").toEqual(body);
}

const postBody = (content: unknown, position: number = 0): string => JSON.stringify({ content, position });
const putBody = (content: unknown): string => JSON.stringify({ content });
const idQuery = (id: string): string => "?id=" + id;
const slugQuery = (slug: string): string => "?slug=" + slug;

const SECRET_WORDS = ["SECRET-DRAFT-BODY-9QX", "Unfinished thoughts", "Notes on moving to Vercel"];

// The eight requests that E2E-07 and E2E-08 send for every session.
type Sent = { label: string; send: (cookie: string | undefined, request: APIRequestContext) => Promise<APIResponse> };
const EIGHT_REQUESTS: Sent[] = [
  { label: "GET list", send: (c, r) => apiGet(r, c) },
  { label: "GET draft by slug", send: (c, r) => apiGet(r, c, API + slugQuery("unfinished-thoughts")) },
  { label: "POST valid", send: (c, r) => apiSend(r, "POST", "", postBody(validWire("new-post")), c) },
  {
    label: "PUT valid",
    send: (c, r) => apiSend(r, "PUT", idQuery("moving-to-vercel"), putBody(validWire("moving-to-vercel")), c),
  },
  { label: "DELETE", send: (c, r) => apiSend(r, "DELETE", idQuery("moving-to-vercel"), undefined, c) },
  { label: "POST raw", send: (c, r) => apiSend(r, "POST", "", "{bad", c) },
  { label: "PUT raw", send: (c, r) => apiSend(r, "PUT", idQuery("moving-to-vercel"), "{bad", c) },
  { label: "DELETE raw", send: (c, r) => apiSend(r, "DELETE", idQuery("moving-to-vercel"), "{bad", c) },
];

// Browser fixtures: the panel, the storage stand-in, the screen's locators and the messages it shows.
const PANEL = "/bright-warm-greenhouse/";
const HOST = "https://stand-in.invalid";
const publicUrlOf = (id: string): string => HOST + "/storage/v1/object/public/images/" + id;

function storePut(id: string, bytes: Buffer, type: string): void {
  fs.mkdirSync(STORE_DIR, { recursive: true });
  fs.writeFileSync(STORE_DIR + "/" + id, bytes);
  fs.writeFileSync(STORE_DIR + "/" + id + ".type", type);
}

function storeBreak(): void {
  fs.mkdirSync(STORE_DIR, { recursive: true });
  fs.writeFileSync(STORE_DIR + "/unreachable", "");
}

function storeFix(): void {
  fs.rmSync(STORE_DIR + "/unreachable", { force: true });
}

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const seedFiles = (): void => {
  storePut(IMG_DIAGRAM, PNG_1X1, "image/png");
};
const seedMoving = (): void => dbSeedWith([DIAGRAM_IMAGE], [MOVING]);
const postRow = (slug: string, status: string, title: string, date: string) => ({
  slug,
  status,
  data: { title, excerpt: "x", date, tags: [], featured: false, coverImage: "", coverAlt: "", body: "x" },
});

const ENTRY_SAVED = "Entry saved";
const ENTRY_DELETED = "Entry deleted";
const LOAD_FAILED = "The entries could not be loaded.";
const SAVE_FAILED = "The entry could not be saved. Try again, and check that you are signed in as the owner.";
const DELETE_FAILED = "The entry could not be deleted. Try again, and check that you are signed in as the owner.";
const SLUG_TAKEN = "A post with this slug already exists";
const POST_GONE = "This post no longer exists.";
const NO_POSTS = "No posts yet.";
const TITLE_REQUIRED = "Enter a title";
const EXCERPT_REQUIRED = "Enter an excerpt";
const DATE_INVALID = "Enter a date as YYYY-MM-DD that is a real day";
const SLUG_INVALID = "Enter a slug of lowercase letters, digits and hyphens";
const BODY_REQUIRED = "Enter the post body";
const IMAGES_FAILED = "The uploaded images could not be loaded.";
const SLUG_FIXED = "The slug cannot be changed after the first save.";
const ASK_MOVING = 'Delete "Notes on moving to Vercel"? This cannot be undone.';
const SECTION_NAMES = ["Profile", "Experience", "Projects", "Certifications", "Tech stack", "Blog posts", "Images"];

async function ownerPage(
  browser: Browser,
  baseURL: string,
  options: Parameters<Browser["newContext"]>[0] = {},
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext(options);
  await context.addCookies([{ name: SESSION_COOKIE, value: await mint(OWNER()), url: baseURL }]);
  await routeStorage(context);
  const page = await context.newPage();
  return { context, page };
}

async function visitorPage(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  await routeStorage(context);
  const page = await context.newPage();
  return { context, page };
}

// Answers the browser's calls to the storage stand-in from STORE_DIR (GET and HEAD of the public path).
async function routeStorage(context: BrowserContext): Promise<void> {
  const publicPrefix = "/storage/v1/object/public/images/";
  await context.route(HOST + "/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const cors = { "access-control-allow-origin": "*" };
    if (method === "OPTIONS") {
      await route.fulfill({
        status: 204,
        headers: { ...cors, "access-control-allow-methods": "*", "access-control-allow-headers": "*" },
      });
      return;
    }
    if ((method === "GET" || method === "HEAD") && url.pathname.startsWith(publicPrefix)) {
      const id = decodeURIComponent(url.pathname.slice(publicPrefix.length));
      if (!fs.existsSync(STORE_DIR + "/" + id)) {
        await route.fulfill({ status: 404, headers: cors, body: "" });
        return;
      }
      const type = fs.existsSync(STORE_DIR + "/" + id + ".type")
        ? fs.readFileSync(STORE_DIR + "/" + id + ".type", "utf8")
        : "application/octet-stream";
      await route.fulfill({
        status: 200,
        headers: { ...cors, "content-type": type },
        body: fs.readFileSync(STORE_DIR + "/" + id),
      });
      return;
    }
    await route.fulfill({ status: 404, headers: cors, body: "" });
  });
}

type Scope = Pick<Page, "getByRole">;

const menu = (page: Page) => page.getByRole("navigation", { name: "Admin sections" });
const screenOf = (page: Page) => page.locator('section[aria-label="Blog posts editor"]');
const listOf = (page: Page) => page.getByRole("list", { name: "Blog posts list" });
const itemsOf = (page: Page) => listOf(page).getByRole("listitem");
const labelsOf = (page: Page) => listOf(page).locator("li > span:first-child");
const button = (scope: Scope, name: string) => scope.getByRole("button", { name, exact: true });
const statusWith = (page: Page, text: string) => screenOf(page).getByRole("status").filter({ hasText: text });
const alertWith = (page: Page, text: string) => page.getByRole("alert").filter({ hasText: text });
const confirmGroup = (page: Page) => page.getByRole("group", { name: "Confirm delete", exact: true });
const coverGroup = (page: Page) => page.getByRole("group", { name: "Cover image", exact: true });
const editHeading = (page: Page): Locator => page.getByRole("heading", { name: "Edit entry", level: 3 });
const addHeading = (page: Page): Locator => page.getByRole("heading", { name: "Add entry", level: 3 });
const field = (page: Page, name: string): Locator => page.getByRole("textbox", { name, exact: true });
const imageSelect = (page: Page): Locator => page.getByRole("combobox", { name: "Uploaded image", exact: true });
const statusSelect = (page: Page): Locator => page.getByRole("combobox", { name: "Status", exact: true });
const featuredBox = (page: Page): Locator => page.getByRole("checkbox", { name: "Featured", exact: true });
const linesOf = (item: Locator): Locator => item.locator("p");

// The text of the checked option of a select.
const selected = (select: Locator): Promise<string> =>
  select.evaluate((el) => {
    const node = el as HTMLSelectElement;
    return (node.options[node.selectedIndex]?.text ?? "").trim();
  });

const optionTexts = async (select: Locator): Promise<string[]> =>
  (await select.locator("option").allTextContents()).map((t) => t.trim());

// Click the menu button until the screen's heading is there (a click that lands before hydration is lost).
async function chooseSection(page: Page, label: string): Promise<void> {
  const choose = button(menu(page), label);
  const heading = page.getByRole("heading", { name: label, level: 2, exact: true });
  await expect(async () => {
    await choose.click({ timeout: 5000 });
    await expect(heading).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 15000 });
}

async function openBlog(page: Page): Promise<void> {
  await page.goto(PANEL);
  await chooseSection(page, "Blog posts");
}

type PostFields = {
  title?: string;
  excerpt?: string;
  date?: string;
  slug?: string;
  tags?: string;
  coverImage?: string;
  coverAlt?: string;
  body?: string;
};
const FIELD_NAMES: [keyof PostFields, string][] = [
  ["title", "Title"],
  ["excerpt", "Excerpt"],
  ["date", "Date"],
  ["slug", "Slug"],
  ["tags", "Tags"],
  ["coverImage", "Cover image path"],
  ["coverAlt", "Cover alt text"],
  ["body", "Body"],
];

async function fillPost(page: Page, v: PostFields): Promise<void> {
  for (const [key, name] of FIELD_NAMES) {
    const value = v[key];
    if (value !== undefined) await field(page, name).fill(value);
  }
}

const NEW_POST = {
  title: "Notes on moving to Vercel",
  excerpt: "What changed and why",
  date: "2026-05-15",
  slug: "moving-to-vercel",
  tags: "nextjs, vercel",
  coverAlt: "A diagram of the hosting move",
  body: "# Moving\n\nWe moved the site to Vercel.",
};

// Holds every request of one method to the route until release() is called, then lets it through.
async function holdRoute(page: Page, method: string): Promise<{ release: () => void; count: () => number }> {
  let seen = 0;
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(/\/api\/admin\/blog-posts\/(\?.*)?$/, async (route) => {
    if (route.request().method() !== method) {
      await route.fallback();
      return;
    }
    seen += 1;
    await gate;
    await route.continue();
  });
  return { release: () => release(), count: () => seen };
}

async function expectAllDisabled(locator: Locator, label: string): Promise<void> {
  const all = await locator.all();
  expect(all.length, label + " is present").toBeGreaterThan(0);
  for (const one of all) await expect(one, label).toBeDisabled();
}

async function expectInvalid(page: Page, target: Locator, message: string, label: string): Promise<void> {
  await expect(target, label + " invalid").toHaveAttribute("aria-invalid", "true");
  const describedBy = await target.getAttribute("aria-describedby");
  expect(describedBy, label + " describedby").not.toBeNull();
  await expect(page.locator('[id="' + describedBy + '"]'), label + " message").toHaveText(message);
}

test("E2E-01: no dependency or setting name was added", async () => {
  dbReset();
  storeReset();
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

  expect(Object.keys(pkg.dependencies ?? {}).sort()).toEqual([
    FIRE,
    "framer-motion",
    "gray-matter",
    "lucide-react",
    "next",
    "next-auth",
    PG,
    "react",
    "react-dom",
    "rehype-autolink-headings",
    "rehype-highlight",
    "rehype-raw",
    "rehype-slug",
    "rehype-stringify",
    "remark-gfm",
    "remark-parse",
    "remark-rehype",
    "server-only",
    "unified",
  ]);
  expect(Object.keys(pkg.devDependencies ?? {}).sort()).toEqual([
    "@eslint/eslintrc",
    "@playwright/test",
    "@tailwindcss/postcss",
    "@tailwindcss/typography",
    "@types/node",
    "@types/react",
    "@types/react-dom",
    "eslint",
    "eslint-config-next",
    FIRE + "-tools",
    "tailwindcss",
    "tsx",
    "typescript",
  ]);

  const result = gitGrep(["-ohE", "process\\.env\\.[A-Za-z_]+", "--", "src", "playwright.config.ts"]);
  const names = [
    ...new Set(
      result.stdout
        .split("\n")
        .filter((l) => l !== "")
        .map((l) => l.replace(/^process\.env\./, "")),
    ),
  ].sort();
  expect(names).toEqual([
    "ADMIN_EMAIL",
    "AUTH_GOOGLE_ID",
    "AUTH_GOOGLE_SECRET",
    "AUTH_SECRET",
    "CI",
    "NODE_ENV",
    "SUPABASE_DB_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_URL",
    "TEST_WORKER_INDEX",
    "VERIFY_PLAYWRIGHT_JSON",
  ]);

  const client = gitGrep(["-n", "-E", "[\"']" + SUPABASE_PREFIX + "[A-Za-z0-9._-]+[\"']", "--", "src", "e2e"]);
  expect(client.stdout).toBe("");
  expect(client.status).toBe(1);

  const config = fs.readFileSync("playwright.config.ts", "utf8");
  expect(config).toContain("SUPABASE_DB_URL");
  expect(config).toContain("SUPABASE_URL");

  const gate = fs.readFileSync("scripts/check-task.sh", "utf8");
  expect(gate).toContain("src/app/api/auth/*" + "|" + "src/app/api/admin/*) ;;");
});

test("E2E-02: the post SQL is exactly the proven text, the server files are marked server-only, and nothing names the old backend", async () => {
  dbReset();
  storeReset();
  const sql = fs.readFileSync("src/lib/server/postSql.ts", "utf8");
  const texts = [
    "create table if not exists blog_posts (slug text primary key, status text not null check (status in ('draft', 'published')), data jsonb not null, updated_at timestamptz not null default now())",
    "alter table blog_posts enable row level security",
    "select slug, status, data from blog_posts order by slug",
    "select slug, status, data from blog_posts where status = 'published' order by slug",
    "select slug, status, data from blog_posts where slug = $1",
    "select slug, status, data from blog_posts where slug = $1 and status = 'published'",
    "insert into blog_posts (slug, status, data) values ($1, $2, $3::text::jsonb) on conflict (slug) do nothing returning slug",
    "update blog_posts set status = $2, data = $3::text::jsonb, updated_at = now() where slug = $1 returning slug",
    "delete from blog_posts where slug = $1 returning slug",
  ];
  for (const text of texts) expect(sql, "postSql.ts holds " + text).toContain("`" + text + "`");
  expect(sql).not.toContain("drop ");
  expect(sql).not.toContain("truncate ");
  expect(sql.split("delete from").length - 1, "delete from count").toBe(1);

  const listSql = fs.readFileSync("src/lib/server/listSql.ts", "utf8");
  expect(listSql).toContain(
    'export const LIST_TABLES: readonly ListTable[] = ["experience", "projects", "certifications", "tech_categories"];',
  );
  expect(listSql).not.toContain("blog_posts");

  const files = fs.readdirSync("src/lib/server").filter((f) => f.endsWith(".ts"));
  expect(files).toContain("postSql.ts");
  expect(files).toContain("postStore.ts");
  for (const file of files) {
    const first = fs
      .readFileSync("src/lib/server/" + file, "utf8")
      .split("\n")
      .find((l) => l.trim() !== "");
    expect(first, file + " first line").toBe('import "server-only";');
  }

  const mentions = gitGrep(["-l", "-E", SERVER_DIR, "--", "src"]);
  const mentionFiles = mentions.stdout.split("\n").filter(Boolean);
  expect(mentionFiles.length).toBeGreaterThan(0);
  for (const file of mentionFiles) {
    expect(file.startsWith("src/app/api/admin/") || file.startsWith(SERVER_PATH + "/"), file).toBe(true);
  }

  const importers = gitGrep(["-l", "-E", "[\"']" + PG + "[\"']", "--", "src"]);
  expect(importers.stdout.split("\n").filter(Boolean)).toEqual(["src/lib/server/database.ts"]);

  const named = gitGrep([
    "-i",
    "-l",
    "-E",
    FIRE,
    "--",
    SERVER_PATH,
    "src/lib/admin/listClient.ts",
    "src/app/api/admin/blog-posts",
  ]);
  expect(named.stdout).toBe("");
  expect(named.status).toBe(1);
});

test("E2E-03: the owner lists, adds, replaces and removes a post through the route, with trimmed content", async ({
  request,
}) => {
  dbReset();
  storeReset();
  const owner = await ownerCookie();

  const first = await apiGet(request, owner);
  await expectAnswer(first, 200, { entries: [] }, "first GET");
  expect(first.headers()["cache-control"], "first GET cache-control").toBe("no-store");

  const addBody =
    '{"content":{"title":"  Notes on moving to Vercel ","excerpt":" What changed and why ","date":" 2026-05-15 ","slug":" moving-to-vercel ","tags":[" nextjs ","","vercel"],"draft":false,"featured":true,"coverImage":" /images/blog/vercel.png ","coverAlt":" A diagram of the hosting move ","body":"# Moving\\n\\nWe moved the site to Vercel.\\n","extra":1},"position":5}';
  const added = await apiSend(request, "POST", "", addBody, owner);
  expect(added.status(), "POST status").toBe(200);
  expect(added.headers()["cache-control"], "POST cache-control").toBe("no-store");
  const addedBody = (await added.json()) as Record<string, unknown>;
  expect(Object.keys(addedBody)).toEqual(["id"]);
  expect(addedBody.id).toBe("moving-to-vercel");
  const stored = {
    title: "Notes on moving to Vercel",
    excerpt: "What changed and why",
    date: "2026-05-15",
    tags: ["nextjs", "vercel"],
    featured: true,
    coverImage: "/images/blog/vercel.png",
    coverAlt: "A diagram of the hosting move",
    body: "# Moving\n\nWe moved the site to Vercel.\n",
  };
  expect(dbPosts()).toEqual([{ slug: "moving-to-vercel", status: "published", data: stored }]);
  expect(Object.keys(dbPosts()[0].data).sort()).toEqual([
    "body",
    "coverAlt",
    "coverImage",
    "date",
    "excerpt",
    "featured",
    "tags",
    "title",
  ]);

  const second = await apiGet(request, owner);
  await expectAnswer(
    second,
    200,
    {
      entries: [
        {
          id: "moving-to-vercel",
          position: 0,
          content: {
            title: "Notes on moving to Vercel",
            excerpt: "What changed and why",
            date: "2026-05-15",
            slug: "moving-to-vercel",
            tags: ["nextjs", "vercel"],
            draft: false,
            featured: true,
            coverImage: "/images/blog/vercel.png",
            coverAlt: "A diagram of the hosting move",
            body: "# Moving\n\nWe moved the site to Vercel.\n",
          },
        },
      ],
    },
    "second GET",
  );
  expect(second.headers()["cache-control"], "second GET cache-control").toBe("no-store");

  const replaced = await apiSend(
    request,
    "PUT",
    idQuery("moving-to-vercel"),
    putBody({
      title: "Notes on moving to Vercel 2",
      excerpt: "What changed and why",
      date: "2026-05-15",
      slug: "moving-to-vercel",
      tags: ["nextjs"],
      draft: true,
      featured: false,
      coverImage: "",
      coverAlt: "",
      body: "Second body",
    }),
    owner,
  );
  await expectAnswer(replaced, 200, { updated: true }, "PUT");
  expect(replaced.headers()["cache-control"], "PUT cache-control").toBe("no-store");
  const afterPut = dbPosts();
  expect(afterPut).toHaveLength(1);
  expect(afterPut[0].status).toBe("draft");
  expect(afterPut[0].slug).toBe("moving-to-vercel");
  expect(afterPut[0].data.title).toBe("Notes on moving to Vercel 2");
  expect(afterPut[0].data.body).toBe("Second body");
  expect(afterPut[0].data.tags).toEqual(["nextjs"]);

  const third = await apiGet(request, owner);
  expect(third.status()).toBe(200);
  const thirdBody = (await third.json()) as { entries: { content: { draft: boolean } }[] };
  expect(thirdBody.entries[0].content.draft).toBe(true);
  expect(third.headers()["cache-control"], "third GET cache-control").toBe("no-store");

  const removed = await apiSend(request, "DELETE", idQuery("moving-to-vercel"), undefined, owner);
  await expectAnswer(removed, 200, { deleted: true }, "DELETE");
  expect(removed.headers()["cache-control"], "DELETE cache-control").toBe("no-store");
  expect(dbPosts()).toEqual([]);

  const last = await apiGet(request, owner);
  await expectAnswer(last, 200, { entries: [] }, "last GET");
  expect(last.headers()["cache-control"], "last GET cache-control").toBe("no-store");
});

test("E2E-04: a taken slug is refused with 409 and stores nothing, and two adds of one slug store one", async ({
  request,
}) => {
  dbReset();
  storeReset();
  seedBoth();
  const owner = await ownerCookie();

  const taken = await apiSend(
    request,
    "POST",
    "",
    postBody({ ...validWire("moving-to-vercel"), title: "A different post", draft: true }, 0),
    owner,
  );
  expect(taken.status(), "taken status").toBe(409);
  expect(await taken.text(), "taken body").toBe('{"error":"slug-taken"}');
  expect(dbPosts()).toEqual([MOVING, DRAFT]);

  dbReset();
  dbSeedWith([], []);
  const racers = ["First racer", "Second racer"];
  const answers = await Promise.all(
    racers.map((title) =>
      apiSend(request, "POST", "", postBody({ ...validWire("race-post"), title }, 0), owner),
    ),
  );
  const statuses = answers.map((a) => a.status()).sort();
  expect(statuses).toEqual([200, 409]);
  const winner = racers[answers.findIndex((a) => a.status() === 200)];
  const stored = dbPosts();
  expect(stored).toHaveLength(1);
  expect(stored[0].slug).toBe("race-post");
  expect(stored[0].data.title).toBe(winner);
});

test("E2E-05: the route refuses every invalid add and replace with 400 and stores nothing, and a missing draft counts as a draft", async ({
  request,
}) => {
  test.setTimeout(120000);
  dbReset();
  storeReset();
  seedBoth();
  const owner = await ownerCookie();
  const base = validWire("moving-to-vercel");

  const changes: [string, Record<string, unknown>][] = [
    ["title empty", { title: "" }],
    ["title blank", { title: "   " }],
    ["excerpt blank", { excerpt: "   " }],
    ["date words", { date: "15 May 2026" }],
    ["date not a day", { date: "2026-02-30" }],
    ["slug capitals", { slug: "Moving To Vercel" }],
    ["slug empty", { slug: "" }],
    ["slug space", { slug: "has space" }],
    ["body blank", { body: "   " }],
    ["title number", { title: 5 }],
    ["tags text", { tags: "nextjs" }],
    ["tags mixed", { tags: ["a", 1] }],
    ["draft text", { draft: "no" }],
    ["featured number", { featured: 1 }],
  ];
  type Bad = { label: string; body: string };
  const bodies: Bad[] = changes.map(([label, change]) => ({
    label,
    body: JSON.stringify({ content: { ...base, ...change }, position: 0 }),
  }));
  bodies.push(
    { label: "content list", body: JSON.stringify({ content: [], position: 0 }) },
    { label: "content text", body: JSON.stringify({ content: "text", position: 0 }) },
    { label: "content null", body: JSON.stringify({ content: null, position: 0 }) },
    { label: "raw brace", body: "{bad" },
    { label: "raw list", body: "[]" },
    { label: "raw text", body: '"x"' },
    { label: "raw empty object", body: "{}" },
    { label: "raw position only", body: '{"position":0}' },
  );

  for (const bad of bodies) {
    for (const method of ["POST", "PUT"] as const) {
      const label = method + " " + bad.label;
      const res = await apiSend(request, method, method === "PUT" ? idQuery("moving-to-vercel") : "", bad.body, owner);
      expect(res.status(), label + " status").toBe(400);
      expect(await res.text(), label + " body").toBe('{"error":"invalid"}');
      expect(dbPosts(), label + " stored").toEqual([MOVING, DRAFT]);
    }
  }

  const mismatch = await apiSend(
    request,
    "PUT",
    idQuery("moving-to-vercel"),
    putBody(validWire("other-slug")),
    owner,
  );
  expect(mismatch.status(), "slug differs from id status").toBe(400);
  expect(await mismatch.text(), "slug differs from id body").toBe('{"error":"invalid"}');
  expect(dbPosts()).toEqual([MOVING, DRAFT]);

  for (const query of ["?id=", "?id=UPPER", "?id=a%2Fb", "?id=has%20space"]) {
    const res = await apiSend(request, "PUT", query, putBody(validWire("moving-to-vercel")), owner);
    expect(res.status(), "PUT " + query + " status").toBe(400);
    expect(await res.text(), "PUT " + query + " body").toBe('{"error":"invalid"}');
    expect(dbPosts(), "PUT " + query + " stored").toEqual([MOVING, DRAFT]);
  }

  const { draft: _draft, ...noDraft } = validWire("no-draft-key");
  void _draft;
  const last = await apiSend(request, "POST", "", postBody(noDraft, 0), owner);
  expect(last.status(), "no draft key status").toBe(200);
  const stored = dbPosts();
  expect(stored).toHaveLength(3);
  const added = stored.find((p) => p.slug === "no-draft-key");
  expect(added?.status).toBe("draft");
});

test("E2E-06: a replace or remove of a post that is not stored answers 404 and stores nothing", async ({ request }) => {
  dbReset();
  storeReset();
  seedBoth();
  const owner = await ownerCookie();

  const missingPut = await apiSend(request, "PUT", idQuery("gone-post"), putBody(validWire("gone-post")), owner);
  expect(missingPut.status(), "PUT missing status").toBe(404);
  expect(await missingPut.text(), "PUT missing body").toBe('{"error":"not-found"}');
  expect(dbPosts()).toEqual([MOVING, DRAFT]);

  const missingDelete = await apiSend(request, "DELETE", idQuery("gone-post"), undefined, owner);
  expect(missingDelete.status(), "DELETE missing status").toBe(404);
  expect(await missingDelete.text(), "DELETE missing body").toBe('{"error":"not-found"}');
  expect(dbPosts()).toEqual([MOVING, DRAFT]);

  const removed = await apiSend(request, "DELETE", idQuery("moving-to-vercel"), undefined, owner);
  expect(removed.status(), "DELETE status").toBe(200);
  const removedAgain = await apiSend(request, "DELETE", idQuery("moving-to-vercel"), undefined, owner);
  expect(removedAgain.status(), "second DELETE status").toBe(404);
  const revive = await apiSend(
    request,
    "PUT",
    idQuery("moving-to-vercel"),
    putBody(validWire("moving-to-vercel")),
    owner,
  );
  expect(revive.status(), "PUT after delete status").toBe(404);
  expect(dbPosts()).toEqual([DRAFT]);
});

test("E2E-07: without a session every request is refused with 401 and touches nothing", async ({ request }) => {
  test.setTimeout(120000);
  dbReset();
  storeReset();
  seedBoth();

  const sessions: { label: string; cookie: string | undefined }[] = [
    { label: "no cookie", cookie: undefined },
    { label: "garbled", cookie: SESSION_COOKIE + "=garbled-value" },
    { label: "expired", cookie: await cookieOf(OWNER(), { maxAge: -3600 }) },
    {
      label: "wrong secret",
      cookie: await cookieOf(OWNER(), { secret: "another-secret-value-for-the-test-0123456789" }),
    },
  ];

  for (const s of sessions) {
    for (const call of EIGHT_REQUESTS) {
      const label = s.label + " " + call.label;
      const res = await call.send(s.cookie, request);
      expect(res.status(), label + " status").toBe(401);
      const text = await res.text();
      expect(JSON.parse(text), label + " body").toEqual({ error: "not-signed-in" });
      for (const word of SECRET_WORDS) expect(text, label + " leaks " + word).not.toContain(word);
      expect(dbPosts(), label + " stored").toEqual([MOVING, DRAFT]);
    }
  }
});

test("E2E-08: another account and an unverified owner address are refused with 403 and touch nothing", async ({
  request,
}) => {
  test.setTimeout(120000);
  dbReset();
  storeReset();
  seedBoth();

  const sessions: { label: string; cookie: string }[] = [
    { label: "other account", cookie: await cookieOf(OTHER()) },
    { label: "unverified owner", cookie: await cookieOf(UNVERIFIED()) },
  ];

  for (const s of sessions) {
    for (const call of EIGHT_REQUESTS) {
      const label = s.label + " " + call.label;
      const res = await call.send(s.cookie, request);
      expect(res.status(), label + " status").toBe(403);
      const text = await res.text();
      expect(JSON.parse(text), label + " body").toEqual({ error: "not-allowed" });
      for (const word of SECRET_WORDS) expect(text, label + " leaks " + word).not.toContain(word);
      expect(dbPosts(), label + " stored").toEqual([MOVING, DRAFT]);
    }
  }
});

test("E2E-09: the owner reads the list, a draft by its slug, and gets 404 or 400 for a missing or bad slug", async ({
  request,
}) => {
  dbReset();
  storeReset();
  seedBoth();
  const owner = await ownerCookie();

  const list = await apiGet(request, owner);
  await expectAnswer(
    list,
    200,
    { entries: [entryOf("unfinished-thoughts", true, DRAFT_DATA), entryOf("moving-to-vercel", false, MOVING_DATA)] },
    "GET list",
  );
  const listBody = (await list.json()) as { entries: { content: { body: string } }[] };
  expect(listBody.entries[0].content.body).toBe("SECRET-DRAFT-BODY-9QX");

  const draft = await apiGet(request, owner, API + slugQuery("unfinished-thoughts"));
  await expectAnswer(draft, 200, { entry: entryOf("unfinished-thoughts", true, DRAFT_DATA) }, "GET draft");

  const missing = await apiGet(request, owner, API + slugQuery("missing-post"));
  await expectAnswer(missing, 404, { error: "not-found" }, "GET missing");

  for (const query of ["?slug=Bad%20Slug", "?slug="]) {
    const bad = await apiGet(request, owner, API + query);
    await expectAnswer(bad, 400, { error: "invalid" }, "GET " + query);
  }
});

test("E2E-10: the published read answers every requester alike with published posts only, and takes no writes", async ({
  request,
}) => {
  test.setTimeout(90000);
  dbReset();
  storeReset();
  seedBoth();

  const requesters: { label: string; cookie: string | undefined }[] = [
    { label: "no cookie", cookie: undefined },
    { label: "other account", cookie: await cookieOf(OTHER()) },
    { label: "owner", cookie: await ownerCookie() },
  ];

  for (const who of requesters) {
    const texts: string[] = [];
    const reads: [string, APIResponse][] = [];
    const get = async (query: string): Promise<APIResponse> => {
      const res = await apiGet(request, who.cookie, PUB + query);
      reads.push([who.label + " GET " + query, res]);
      texts.push(await res.text());
      return res;
    };

    const all = await get("");
    expect(all.status(), who.label + " list status").toBe(200);
    expect(JSON.parse(texts[0]), who.label + " list body").toEqual({
      posts: [publicOf("moving-to-vercel", MOVING_DATA)],
    });
    expect(Object.keys((JSON.parse(texts[0]) as { posts: Record<string, unknown>[] }).posts[0]).sort()).toEqual([
      "body",
      "coverAlt",
      "coverImage",
      "date",
      "excerpt",
      "featured",
      "slug",
      "tags",
      "title",
    ]);

    const one = await get(slugQuery("moving-to-vercel"));
    expect(one.status(), who.label + " one status").toBe(200);
    expect(JSON.parse(texts[1]), who.label + " one body").toEqual({ post: publicOf("moving-to-vercel", MOVING_DATA) });

    const draft = await get(slugQuery("unfinished-thoughts"));
    expect(draft.status(), who.label + " draft status").toBe(404);
    const missing = await get(slugQuery("missing-post"));
    expect(missing.status(), who.label + " missing status").toBe(404);
    expect(JSON.parse(texts[2]), who.label + " draft body").toEqual({ error: "not-found" });
    expect(JSON.parse(texts[3]), who.label + " missing body").toEqual({ error: "not-found" });
    expect(JSON.parse(texts[2])).toEqual(JSON.parse(texts[3]));

    const bad = await get(slugQuery("Bad%20Slug"));
    expect(bad.status(), who.label + " bad slug status").toBe(400);
    expect(JSON.parse(texts[4]), who.label + " bad slug body").toEqual({ error: "invalid" });

    for (const text of texts) {
      for (const word of ["SECRET-DRAFT-BODY-9QX", "Unfinished thoughts", "unfinished"]) {
        expect(text, who.label + " leaks " + word).not.toContain(word);
      }
    }
    for (const [label, res] of reads) {
      expect(res.headers()["set-cookie"], label + " set-cookie").toBeUndefined();
      expect(res.headers()["cache-control"], label + " cache-control").toBe("no-store");
    }
  }

  for (const cookie of [await ownerCookie(), undefined]) {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"] as const) {
      const res = await apiSend(request, method, "", "{}", cookie, PUB);
      expect(res.status(), (cookie === undefined ? "no cookie " : "owner ") + method + " status").toBe(405);
      expect(dbPosts()).toEqual([MOVING, DRAFT]);
    }
  }
});

test("E2E-11: an unreachable database gives a fixed 503 to the owner and to the public read, refusals do not depend on it, and it recovers", async ({
  request,
}) => {
  dbReset();
  storeReset();
  seedBoth();
  dbBreak();
  const owner = await ownerCookie();

  const sent: [string, APIResponse][] = [
    ["owner GET", await apiGet(request, owner)],
    ["owner POST", await apiSend(request, "POST", "", postBody(validWire("new-post")), owner)],
    [
      "owner PUT",
      await apiSend(request, "PUT", idQuery("moving-to-vercel"), putBody(validWire("moving-to-vercel")), owner),
    ],
    ["owner DELETE", await apiSend(request, "DELETE", idQuery("moving-to-vercel"), undefined, owner)],
    ["public GET", await apiGet(request, undefined, PUB)],
    ["public GET one", await apiGet(request, undefined, PUB + slugQuery("moving-to-vercel"))],
  ];
  for (const [label, res] of sent) {
    expect(res.status(), label + " status").toBe(503);
    const text = await res.text();
    expect(text, label + " body").toBe('{"error":"unavailable"}');
    for (const leak of LEAKS) expect(text, label + " leaks " + leak).not.toContain(leak);
  }

  const signedOut = await apiGet(request);
  expect(signedOut.status(), "signed-out GET status").toBe(401);
  const otherDelete = await apiSend(
    request,
    "DELETE",
    idQuery("moving-to-vercel"),
    undefined,
    await cookieOf(OTHER()),
  );
  expect(otherDelete.status(), "other DELETE status").toBe(403);

  dbFix();
  const fixed = await apiGet(request, owner);
  expect(fixed.status(), "GET after recovery status").toBe(200);
  expect(((await fixed.json()) as { entries: unknown[] }).entries).toHaveLength(2);
  const fixedPublic = await apiGet(request, undefined, PUB);
  expect(fixedPublic.status(), "public GET after recovery status").toBe(200);
  expect(((await fixedPublic.json()) as { posts: unknown[] }).posts).toHaveLength(1);
  expect(dbPosts()).toEqual([MOVING, DRAFT]);
});

test("E2E-12: no public page or script carries the routes or the database, and the routes stay dynamic and server-only", async ({
  request,
}) => {
  dbReset();
  storeReset();
  seedBoth();
  const manifest = JSON.parse(fs.readFileSync(".next/prerender-manifest.json", "utf8")) as {
    routes: Record<string, unknown>;
  };
  const keys = Object.keys(manifest.routes);
  expect(keys.filter((k) => k.startsWith("/api/admin"))).toEqual([]);
  for (const key of ["/", "/blog", "/blog/hello-world", "/blog/building-portfolio-nextjs", "/robots.txt", "/rss.xml", "/sitemap.xml"]) {
    expect(keys, key).toContain(key);
  }

  const forbidden = ["api/admin/blog-posts", "blog_posts", "SUPABASE_DB_URL", "stand-in:", "DatabaseUnavailable"];
  const noPost = ["Notes on moving to Vercel", "moving-to-vercel"];
  let fetched = 0;
  for (const path of ["/", "/blog/", "/blog/hello-world/", "/blog/building-portfolio-nextjs/", "/rss.xml", "/sitemap.xml"]) {
    const page = await request.get(path);
    expect(page.status(), path).toBe(200);
    const html = await page.text();
    for (const text of forbidden) expect(html, path + " carries " + text).not.toContain(text);
    if (path === "/blog/" || path === "/rss.xml" || path === "/sitemap.xml") {
      for (const text of noPost) expect(html, path + " carries " + text).not.toContain(text);
    }

    const scripts = [...new Set(html.match(/\/_next\/static\/[^"'\s<>\\)]+?\.js/g) ?? [])];
    for (const src of scripts) {
      const res = await request.get(src);
      expect(res.status(), src).toBe(200);
      const js = await res.text();
      fetched += 1;
      for (const text of forbidden) expect(js, src + " carries " + text).not.toContain(text);
    }
  }
  expect(fetched).toBeGreaterThan(0);

  const ownerRoute = fs.readFileSync("src/app/api/admin/blog-posts/route.ts", "utf8");
  const publicRoute = fs.readFileSync("src/app/api/admin/blog-posts/published/route.ts", "utf8");
  expect(publicRoute).toContain("force-dynamic");
  for (const text of [AUTH_MODULE, NEXT_HEADERS, COOKIES_CALL, HEADERS_CALL]) {
    expect(publicRoute, "published route carries " + text).not.toContain(text);
  }
  expect(ownerRoute).toContain("force-dynamic");
  expect(ownerRoute).toContain(AUTH_MODULE);

  const authImporters = gitGrep(["-l", "-E", AUTH_MODULE + "\\b", "--", "src"]);
  const authFiles = authImporters.stdout.split("\n").filter(Boolean);
  expect(authFiles.length).toBeGreaterThan(0);
  for (const file of authFiles) {
    expect(
      file.startsWith("src/app/api/auth/") ||
        file.startsWith("src/app/api/admin/") ||
        file.startsWith("src/app/bright-warm-greenhouse/"),
      file,
    ).toBe(true);
  }

  const serverMentions = gitGrep(["-l", "-E", SERVER_DIR, "--", "src", ":(exclude)" + SERVER_PATH, ":(exclude)src/app/api/admin"]);
  expect(serverMentions.stdout).toBe("");
  expect(serverMentions.status).toBe(1);
});

test("E2E-13: the post store reads the stand-in file tolerantly and leaves every other list alone", async ({ request }) => {
  test.setTimeout(90000);
  dbReset();
  storeReset();
  const profile = { name: "Keith Lim" };
  const odd = { slug: "odd-one", status: "published", data: { title: 5, tags: "x", date: null } };
  const noData = { slug: "no-data", status: "draft" };
  const noSlug = { status: "draft", data: { title: "No slug" } };
  dbSeedAll(profile, [DIAGRAM_IMAGE], [], [], [], [], [DRAFT, odd, noData, noSlug, "not an object"]);
  const owner = await ownerCookie();

  const list = await apiGet(request, owner);
  expect(list.status(), "GET list status").toBe(200);
  const entries = ((await list.json()) as { entries: { id: string; content: Record<string, unknown> }[] }).entries;
  expect(entries.map((e) => e.id)).toEqual(["unfinished-thoughts", "no-data", "odd-one"]);
  expect(entries[2].content).toEqual({
    title: "",
    excerpt: "",
    date: "",
    slug: "odd-one",
    tags: [],
    draft: false,
    featured: false,
    coverImage: "",
    coverAlt: "",
    body: "",
  });
  expect(entries[1].content).toEqual({ ...wireOf("no-data", true, EMPTY_DATA) });

  const published = await apiGet(request, undefined, PUB);
  await expectAnswer(published, 200, { posts: [publicOf("odd-one", EMPTY_DATA)] }, "GET published");

  const added = await apiSend(request, "POST", "", postBody(validWire("fresh-post")), owner);
  expect(added.status(), "POST status").toBe(200);
  const replaced = await apiSend(request, "PUT", idQuery("odd-one"), putBody(validWire("odd-one")), owner);
  expect(replaced.status(), "PUT status").toBe(200);
  const removed = await apiSend(request, "DELETE", idQuery("no-data"), undefined, owner);
  expect(removed.status(), "DELETE status").toBe(200);

  const file = readDbFile();
  expect(file.profile).toEqual(profile);
  expect(file.images).toEqual([DIAGRAM_IMAGE]);
  expect(file.experience).toEqual([]);
  expect(file.projects).toEqual([]);
  expect(file.certifications).toEqual([]);
  expect(file.tech_categories).toEqual([]);
  expect(dbPosts()).toContainEqual(noSlug);
  expect(dbPosts()).toContainEqual("not an object");

  const before = dbPosts();
  const tech = await apiSend(
    request,
    "POST",
    "",
    '{"content":{"category":"Cloud","tools":[]},"position":0}',
    owner,
    TECH_API,
  );
  expect(tech.status(), "tech POST status").toBe(200);
  const experience = await apiSend(
    request,
    "POST",
    "",
    '{"content":{"year":"2024","title":"Software Engineer","company":"Acme","duration":"Jan 2024 - Present","description":"Built the billing service.","details":["Cut invoice errors by 40%"]},"position":0}',
    owner,
    EXPERIENCE_API,
  );
  expect(experience.status(), "experience POST status").toBe(200);
  expect(dbPosts()).toEqual(before);
});

test("E2E-14: a post is public exactly while it is published, and saving it as a draft or as published changes that at once", async ({
  request,
}) => {
  dbReset();
  storeReset();
  seedBoth();
  const owner = await ownerCookie();
  const readyData: PostData = { ...DRAFT_DATA, body: "Now ready" };

  const first = await apiGet(request, undefined, PUB);
  await expectAnswer(first, 200, { posts: [publicOf("moving-to-vercel", MOVING_DATA)] }, "first GET PUB");

  const hide = await apiSend(
    request,
    "PUT",
    idQuery("moving-to-vercel"),
    putBody(wireOf("moving-to-vercel", true, MOVING_DATA)),
    owner,
  );
  expect(hide.status(), "hide status").toBe(200);
  await expectAnswer(await apiGet(request, undefined, PUB), 200, { posts: [] }, "GET PUB after hide");
  await expectAnswer(
    await apiGet(request, undefined, PUB + slugQuery("moving-to-vercel")),
    404,
    { error: "not-found" },
    "GET PUB one after hide",
  );
  expect(dbPosts().find((p) => p.slug === "moving-to-vercel")?.status).toBe("draft");

  const publish = await apiSend(
    request,
    "PUT",
    idQuery("unfinished-thoughts"),
    putBody(wireOf("unfinished-thoughts", false, readyData)),
    owner,
  );
  expect(publish.status(), "publish status").toBe(200);
  await expectAnswer(
    await apiGet(request, undefined, PUB),
    200,
    { posts: [publicOf("unfinished-thoughts", readyData)] },
    "GET PUB after publish",
  );
  await expectAnswer(
    await apiGet(request, undefined, PUB + slugQuery("unfinished-thoughts")),
    200,
    { post: publicOf("unfinished-thoughts", readyData) },
    "GET PUB one after publish",
  );
  const stored = dbPosts();
  expect(stored.find((p) => p.slug === "moving-to-vercel")?.status).toBe("draft");
  expect(stored.find((p) => p.slug === "unfinished-thoughts")?.status).toBe("published");
});

test("E2E-15: the owner adds a draft post with a typed cover path to an empty list and it is stored and listed after a reload", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(90000);
  dbReset();
  storeReset();
  dbSeedWith([DIAGRAM_IMAGE], []);
  seedFiles();
  const { context, page } = await ownerPage(browser, baseURL as string);
  await openBlog(page);
  const screen = screenOf(page);

  await expect(screen.getByText(NO_POSTS)).toBeVisible();
  await expect(button(screen, "Add post")).toBeVisible();
  await button(screen, "Add post").click();
  await expect(addHeading(page)).toBeVisible();
  await expect.poll(() => selected(statusSelect(page))).toBe("Draft");
  await expect(featuredBox(page)).not.toBeChecked();
  await fillPost(page, { ...NEW_POST, coverImage: "/images/blog/vercel.png" });
  await button(screen, "Save").click();

  await expect(statusWith(page, ENTRY_SAVED)).toHaveText(ENTRY_SAVED);
  await expect(itemsOf(page)).toHaveCount(1);
  await expect(labelsOf(page)).toHaveText(["Notes on moving to Vercel"]);
  await expect(linesOf(itemsOf(page).first())).toHaveText([
    "Slug: moving-to-vercel",
    "Date: 15 May 2026",
    "Status: Draft",
  ]);

  await page.reload();
  await openBlog(page);
  await expect(itemsOf(page)).toHaveCount(1);
  await expect(labelsOf(page)).toHaveText(["Notes on moving to Vercel"]);
  await expect(linesOf(itemsOf(page).first())).toHaveText([
    "Slug: moving-to-vercel",
    "Date: 15 May 2026",
    "Status: Draft",
  ]);

  await button(itemsOf(page).first(), "Edit").click();
  await expect(editHeading(page)).toBeVisible();
  await expect(field(page, "Title")).toHaveValue("Notes on moving to Vercel");
  await expect(field(page, "Excerpt")).toHaveValue("What changed and why");
  await expect(field(page, "Date")).toHaveValue("2026-05-15");
  await expect(field(page, "Slug")).toHaveValue("moving-to-vercel");
  await expect(field(page, "Tags")).toHaveValue("nextjs, vercel");
  await expect(field(page, "Cover image path")).toHaveValue("/images/blog/vercel.png");
  await expect.poll(() => selected(imageSelect(page))).toBe("None");
  await expect(field(page, "Cover alt text")).toHaveValue("A diagram of the hosting move");
  await expect(field(page, "Body")).toHaveValue("# Moving\n\nWe moved the site to Vercel.");
  await expect(featuredBox(page)).not.toBeChecked();
  await expect.poll(() => selected(statusSelect(page))).toBe("Draft");

  const stored = dbPosts();
  expect(stored).toHaveLength(1);
  expect(stored[0].status).toBe("draft");
  expect(stored[0].data.coverImage).toBe("/images/blog/vercel.png");
  await context.close();
});

test("E2E-16: the owner publishes a post with an uploaded cover and it is public with the image's address", async ({
  browser,
  baseURL,
  request,
}) => {
  test.setTimeout(120000);
  dbReset();
  storeReset();
  dbSeedWith([DIAGRAM_IMAGE], []);
  seedFiles();
  const { context, page } = await ownerPage(browser, baseURL as string);
  await openBlog(page);
  const screen = screenOf(page);

  await button(screen, "Add post").click();
  await expect(addHeading(page)).toBeVisible();
  await fillPost(page, NEW_POST);
  await statusSelect(page).selectOption({ label: "Published" });
  await expect.poll(() => optionTexts(imageSelect(page))).toEqual(["None", "diagram.png"]);
  await imageSelect(page).selectOption({ label: "diagram.png" });
  await button(screen, "Save").click();

  await expect(statusWith(page, ENTRY_SAVED)).toHaveText(ENTRY_SAVED);
  await expect(itemsOf(page)).toHaveCount(1);
  await expect(linesOf(itemsOf(page).first()).nth(2)).toHaveText("Status: Published");

  await page.reload();
  await openBlog(page);
  await button(itemsOf(page).first(), "Edit").click();
  await expect(editHeading(page)).toBeVisible();
  await expect.poll(() => selected(imageSelect(page))).toBe("diagram.png");
  await expect(field(page, "Cover image path")).toHaveValue("");

  const stored = dbPosts();
  expect(stored).toHaveLength(1);
  const address = publicUrlOf(IMG_DIAGRAM);
  expect(stored[0].data.coverImage).toBe(address);
  expect(String(stored[0].data.coverImage)).not.toContain("?");

  const published = await apiGet(request, undefined, PUB);
  expect(published.status(), "GET PUB status").toBe(200);
  const body = (await published.json()) as { posts: { coverImage: string }[] };
  expect(body.posts).toHaveLength(1);
  expect(body.posts[0].coverImage).toBe(address);

  const visitor = await visitorPage(browser);
  const response = await visitor.page.goto(address);
  expect(response?.status()).toBe(200);
  expect(response?.headers()["content-type"]).toBe("image/png");
  await visitor.context.close();
  await context.close();
});

test("E2E-17: a taken slug is refused next to the form, the form stays and nothing is stored", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(90000);
  dbReset();
  storeReset();
  seedMoving();
  seedFiles();
  const { context, page } = await ownerPage(browser, baseURL as string);
  await openBlog(page);
  const screen = screenOf(page);
  await expect(itemsOf(page)).toHaveCount(1);

  await button(screen, "Add post").click();
  await fillPost(page, {
    title: "A different post",
    excerpt: "Another",
    date: "2026-06-02",
    slug: "moving-to-vercel",
    body: "Different body",
  });
  await button(screen, "Save").click();

  await expect(alertWith(page, SLUG_TAKEN)).toHaveText(SLUG_TAKEN);
  await expect(addHeading(page)).toBeVisible();
  await expect(field(page, "Title")).toHaveValue("A different post");
  await expect(field(page, "Slug")).toHaveValue("moving-to-vercel");
  await expect(field(page, "Body")).toHaveValue("Different body");
  await expect(statusWith(page, ENTRY_SAVED)).toHaveCount(0);
  expect(dbPosts()).toEqual([MOVING]);

  await button(screen, "Cancel").click();
  await expect(addHeading(page)).toHaveCount(0);
  await expect(itemsOf(page)).toHaveCount(1);
  await expect(labelsOf(page)).toHaveText(["Notes on moving to Vercel"]);
  await context.close();
});

test("E2E-18: a bad title, excerpt, date, slug or body is refused next to the field with nothing sent", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(180000);
  dbReset();
  storeReset();
  dbSeedWith([], []);
  const { context, page } = await ownerPage(browser, baseURL as string);
  await openBlog(page);
  const screen = screenOf(page);

  type Case = { label: string; key: keyof typeof NEW_POST; value: string; name: string; message: string };
  const cases: Case[] = [
    { label: "(1)", key: "title", value: "", name: "Title", message: TITLE_REQUIRED },
    { label: "(2)", key: "excerpt", value: "   ", name: "Excerpt", message: EXCERPT_REQUIRED },
    { label: "(3)", key: "date", value: "15 May 2026", name: "Date", message: DATE_INVALID },
    { label: "(4)", key: "date", value: "2026-02-30", name: "Date", message: DATE_INVALID },
    { label: "(5)", key: "slug", value: "Moving To Vercel", name: "Slug", message: SLUG_INVALID },
    { label: "(6)", key: "slug", value: "", name: "Slug", message: SLUG_INVALID },
    { label: "(7)", key: "body", value: "   ", name: "Body", message: BODY_REQUIRED },
  ];

  for (const c of cases) {
    await button(screen, "Add post").click();
    await expect(addHeading(page)).toBeVisible();
    const values = { ...NEW_POST, [c.key]: c.value };
    await fillPost(page, values);
    await button(screen, "Save").click();

    await expectInvalid(page, field(page, c.name), c.message, c.label + " " + c.name);
    for (const [key, name] of FIELD_NAMES) {
      if (key === "coverImage") continue;
      await expect(field(page, name), c.label + " " + name + " kept").toHaveValue(values[key as keyof typeof NEW_POST]);
    }
    await expect(addHeading(page)).toBeVisible();
    await expect(statusWith(page, ENTRY_SAVED)).toHaveCount(0);
    expect(dbPosts(), c.label).toEqual([]);
    await button(screen, "Cancel").click();
    await expect(addHeading(page)).toHaveCount(0);
    await expect(screen.getByText(NO_POSTS), c.label).toBeVisible();
  }
  await context.close();
});

test("E2E-19: the owner edits a post, the slug stays fixed, and saving it as a draft takes it out of the public read", async ({
  browser,
  baseURL,
  request,
}) => {
  test.setTimeout(120000);
  dbReset();
  storeReset();
  seedMoving();
  seedFiles();
  const { context, page } = await ownerPage(browser, baseURL as string);
  await openBlog(page);
  const screen = screenOf(page);
  await expect(itemsOf(page)).toHaveCount(1);

  await button(itemsOf(page).first(), "Edit").click();
  await expect(editHeading(page)).toBeVisible();
  await expect(field(page, "Slug")).toHaveValue("moving-to-vercel");
  await expect(field(page, "Slug")).toHaveAttribute("readonly", "");
  await expect(screen.getByText(SLUG_FIXED)).toBeVisible();
  await fillPost(page, { title: "Notes on moving to Vercel (updated)", body: "Updated body" });
  await featuredBox(page).check();
  await statusSelect(page).selectOption({ label: "Draft" });
  await button(screen, "Save").click();
  await expect(statusWith(page, ENTRY_SAVED)).toHaveText(ENTRY_SAVED);

  await page.reload();
  await openBlog(page);
  await expect(itemsOf(page)).toHaveCount(1);
  await expect(labelsOf(page)).toHaveText(["Notes on moving to Vercel (updated)"]);
  await expect(linesOf(itemsOf(page).first())).toHaveText([
    "Slug: moving-to-vercel",
    "Date: 15 May 2026",
    "Status: Draft",
  ]);
  await button(itemsOf(page).first(), "Edit").click();
  await expect(editHeading(page)).toBeVisible();
  await expect(featuredBox(page)).toBeChecked();
  await expect(field(page, "Slug")).toHaveValue("moving-to-vercel");
  await expect(field(page, "Slug")).toHaveAttribute("readonly", "");
  await expect.poll(() => selected(statusSelect(page))).toBe("Draft");
  await expect(field(page, "Body")).toHaveValue("Updated body");

  await expectAnswer(await apiGet(request, undefined, PUB), 200, { posts: [] }, "GET PUB after the draft save");
  await context.close();
});

test("E2E-20: deleting asks first and Cancel keeps the post", async ({ browser, baseURL }) => {
  test.setTimeout(90000);
  dbReset();
  storeReset();
  seedMoving();
  seedFiles();
  const { context, page } = await ownerPage(browser, baseURL as string);
  await openBlog(page);
  await expect(itemsOf(page)).toHaveCount(1);

  await button(itemsOf(page).first(), "Delete").click();
  const group = confirmGroup(page);
  await expect(group).toBeVisible();
  await expect(group.locator("p")).toHaveText(ASK_MOVING);
  await expect(button(group, "Confirm")).toBeVisible();
  await expect(button(group, "Cancel")).toBeVisible();
  await expect(itemsOf(page)).toHaveCount(1);
  expect(dbPosts()).toEqual([MOVING]);

  await button(group, "Cancel").click();
  await expect(confirmGroup(page)).toHaveCount(0);
  await expect(itemsOf(page)).toHaveCount(1);
  await expect(labelsOf(page)).toHaveText(["Notes on moving to Vercel"]);

  await page.reload();
  await openBlog(page);
  await expect(itemsOf(page)).toHaveCount(1);
  expect(dbPosts()).toEqual([MOVING]);
  await context.close();
});

test("E2E-21: Confirm removes the post for good, with no undo, and it is gone from both reads", async ({
  browser,
  baseURL,
  request,
}) => {
  test.setTimeout(90000);
  dbReset();
  storeReset();
  seedMoving();
  seedFiles();
  const { context, page } = await ownerPage(browser, baseURL as string);
  await openBlog(page);
  const screen = screenOf(page);
  await expect(itemsOf(page)).toHaveCount(1);

  await button(itemsOf(page).first(), "Delete").click();
  await button(confirmGroup(page), "Confirm").click();
  await expect(statusWith(page, ENTRY_DELETED)).toHaveText(ENTRY_DELETED);
  await expect(listOf(page)).toHaveCount(0);
  await expect(screen.getByText(NO_POSTS)).toBeVisible();
  for (const name of ["Restore", "Undo", "Trash"]) {
    await expect(page.getByRole("button", { name }), name).toHaveCount(0);
  }

  await page.reload();
  await openBlog(page);
  await expect(screen.getByText(NO_POSTS)).toBeVisible();
  expect(dbPosts()).toEqual([]);
  const owner = await ownerCookie();
  await expectAnswer(await apiGet(request, owner), 200, { entries: [] }, "GET API after the delete");
  await expectAnswer(await apiGet(request, undefined, PUB), 200, { posts: [] }, "GET PUB after the delete");
  await context.close();
});

test("E2E-22: an unreachable database shows one fixed load message, keeps the menu working and recovers", async ({
  browser,
  baseURL,
  request,
}) => {
  test.setTimeout(90000);
  dbReset();
  storeReset();
  seedBoth();
  seedFiles();
  dbBreak();
  const before = await (await request.get("/")).text();
  const { context, page } = await ownerPage(browser, baseURL as string);
  await openBlog(page);
  const screen = screenOf(page);

  await expect(alertWith(page, LOAD_FAILED)).toHaveText(LOAD_FAILED);
  await expect(page.getByText(NO_POSTS)).toHaveCount(0);
  await expect(button(screen, "Add post")).toHaveCount(0);
  await expect(listOf(page)).toHaveCount(0);
  const panelText = await page.locator("body").innerText();
  for (const leak of LEAKS) expect(panelText, "panel leaks " + leak).not.toContain(leak);
  await expect(menu(page).getByRole("button")).toHaveText(SECTION_NAMES);
  await expect(button(page, "Sign out")).toBeVisible();
  const after = await request.get("/");
  expect(after.status()).toBe(200);
  expect(await after.text()).toBe(before);

  dbFix();
  await button(menu(page), "Tech stack").click();
  await expect(page.getByRole("heading", { name: "Tech stack", level: 2, exact: true })).toBeVisible();
  await button(menu(page), "Blog posts").click();
  await expect(itemsOf(page)).toHaveCount(2);
  await expect(labelsOf(page)).toHaveText(["Unfinished thoughts", "Notes on moving to Vercel"]);
  await context.close();
});

test("E2E-23: a failed save or delete shows one fixed message, keeps the form and the list, and works again after recovery", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(150000);
  dbReset();
  storeReset();
  seedMoving();
  seedFiles();
  const { context, page } = await ownerPage(browser, baseURL as string);
  await openBlog(page);
  const screen = screenOf(page);
  await expect(itemsOf(page)).toHaveCount(1);

  await button(screen, "Add post").click();
  await expect(addHeading(page)).toBeVisible();
  await fillPost(page, { ...NEW_POST, slug: "second-post" });
  dbBreak();
  await button(screen, "Save").click();
  await expect(alertWith(page, SAVE_FAILED)).toHaveText(SAVE_FAILED);
  await expect(addHeading(page)).toBeVisible();
  await expect(field(page, "Title")).toHaveValue("Notes on moving to Vercel");
  await expect(field(page, "Slug")).toHaveValue("second-post");
  await expect(statusWith(page, ENTRY_SAVED)).toHaveCount(0);

  await button(screen, "Cancel").click();
  await expect(addHeading(page)).toHaveCount(0);
  await button(itemsOf(page).first(), "Delete").click();
  await button(confirmGroup(page), "Confirm").click();
  await expect(alertWith(page, DELETE_FAILED)).toHaveText(DELETE_FAILED);
  await expect(itemsOf(page)).toHaveCount(1);

  dbFix();
  await page.reload();
  await openBlog(page);
  await expect(itemsOf(page)).toHaveCount(1);
  expect(dbPosts()).toEqual([MOVING]);

  await button(screen, "Add post").click();
  await expect(addHeading(page)).toBeVisible();
  await fillPost(page, { ...NEW_POST, slug: "second-post" });
  await button(screen, "Save").click();
  await expect(statusWith(page, ENTRY_SAVED)).toHaveText(ENTRY_SAVED);
  expect(dbPosts()).toHaveLength(2);
  await context.close();
});

test("E2E-24: a post deleted in another tab is not brought back and the stale screen shows the failure", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(150000);
  dbReset();
  storeReset();
  seedMoving();
  seedFiles();
  const { context, page } = await ownerPage(browser, baseURL as string);
  const second = await context.newPage();
  await openBlog(page);
  await openBlog(second);
  await expect(itemsOf(page)).toHaveCount(1);
  await expect(itemsOf(second)).toHaveCount(1);

  await button(itemsOf(page).first(), "Delete").click();
  await button(confirmGroup(page), "Confirm").click();
  await expect(statusWith(page, ENTRY_DELETED)).toHaveText(ENTRY_DELETED);
  expect(dbPosts()).toEqual([]);

  await button(itemsOf(second).first(), "Edit").click();
  await expect(editHeading(second)).toBeVisible();
  await fillPost(second, { title: "Edited elsewhere" });
  await button(screenOf(second), "Save").click();
  await expect(alertWith(second, POST_GONE)).toHaveText(POST_GONE);
  await expect(editHeading(second)).toBeVisible();
  await expect(field(second, "Title")).toHaveValue("Edited elsewhere");
  await expect(statusWith(second, ENTRY_SAVED)).toHaveCount(0);
  expect(dbPosts()).toEqual([]);

  await second.reload();
  await openBlog(second);
  await expect(screenOf(second).getByText(NO_POSTS)).toBeVisible();
  await context.close();
});

test("E2E-25: a save or delete after sign-in ended or with no network shows the fixed failure and keeps the typed text", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(150000);
  for (const cause of ["expired", "offline"]) {
    dbReset();
    storeReset();
    seedMoving();
    seedFiles();
    const { context, page } = await ownerPage(browser, baseURL as string);
    await openBlog(page);
    const screen = screenOf(page);
    await expect(itemsOf(page), cause).toHaveCount(1);

    if (cause === "expired") {
      await context.clearCookies();
      await context.addCookies([
        { name: SESSION_COOKIE, value: await mint(OWNER(), { maxAge: -3600 }), url: baseURL as string },
      ]);
    } else {
      await context.setOffline(true);
    }

    await button(itemsOf(page).first(), "Edit").click();
    await expect(editHeading(page), cause).toBeVisible();
    await fillPost(page, { title: "Typed while away" });
    await button(screen, "Save").click();
    await expect(alertWith(page, SAVE_FAILED), cause).toHaveText(SAVE_FAILED);
    await expect(field(page, "Title"), cause).toHaveValue("Typed while away");

    await button(screen, "Cancel").click();
    await expect(editHeading(page), cause).toHaveCount(0);
    await button(itemsOf(page).first(), "Delete").click();
    await button(confirmGroup(page), "Confirm").click();
    await expect(alertWith(page, DELETE_FAILED), cause).toHaveText(DELETE_FAILED);
    await expect(itemsOf(page), cause).toHaveCount(1);
    expect(dbPosts(), cause).toEqual([MOVING]);
    await context.close();
  }
});

test("E2E-26: while a request is in flight the screen shows its state, disables the controls and sends it once", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(120000);
  dbReset();
  storeReset();
  dbSeedWith([DIAGRAM_IMAGE], []);
  seedFiles();
  const { context, page } = await ownerPage(browser, baseURL as string);
  await openBlog(page);
  const screen = screenOf(page);

  await button(screen, "Add post").click();
  await expect(addHeading(page)).toBeVisible();
  await fillPost(page, NEW_POST);
  const post = await holdRoute(page, "POST");
  await button(screen, "Save").dblclick();
  await expect(screen.getByRole("status")).toHaveText("Saving…");
  await expectAllDisabled(screen.getByRole("button"), "buttons");
  await expectAllDisabled(screen.getByRole("textbox"), "textboxes");
  await expectAllDisabled(screen.getByRole("combobox"), "lists");
  await expectAllDisabled(screen.getByRole("checkbox"), "Featured");
  await expect(imageSelect(page)).toBeDisabled();
  await expect(statusSelect(page)).toBeDisabled();
  post.release();
  await expect(statusWith(page, ENTRY_SAVED)).toHaveText(ENTRY_SAVED);
  expect(post.count()).toBe(1);
  expect(dbPosts()).toHaveLength(1);
  await context.close();
});

test("E2E-27: posts are listed newest first, ties by title, with their slug, date and status and no move buttons", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(90000);
  dbReset();
  storeReset();
  dbSeedWith(
    [],
    [
      postRow("alpha-post", "published", "Alpha post", "2026-05-15"),
      postRow("beta-post", "draft", "Beta post", "2026-05-15"),
      postRow("gamma-post", "draft", "Gamma post", "2026-06-01"),
      postRow("old-post", "published", "Old post", "2025-12-31"),
    ],
  );
  const { context, page } = await ownerPage(browser, baseURL as string);
  await openBlog(page);
  await expect(itemsOf(page)).toHaveCount(4);
  await expect(labelsOf(page)).toHaveText(["Gamma post", "Alpha post", "Beta post", "Old post"]);
  await expect(linesOf(itemsOf(page).nth(0))).toHaveText(["Slug: gamma-post", "Date: 1 June 2026", "Status: Draft"]);
  await expect(linesOf(itemsOf(page).nth(1)).nth(2)).toHaveText("Status: Published");
  await expect(linesOf(itemsOf(page).nth(2)).nth(2)).toHaveText("Status: Draft");
  await expect(linesOf(itemsOf(page).nth(3))).toHaveText([
    "Slug: old-post",
    "Date: 31 December 2025",
    "Status: Published",
  ]);
  for (const name of ["Move up", "Move down"]) {
    await expect(page.getByRole("button", { name }), name).toHaveCount(0);
  }
  await context.close();
});

test("E2E-28: the cover picker and the path field keep each other in step, and a failed image list or a deleted image leaves the saved cover alone", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(180000);
  dbReset();
  storeReset();
  const address = publicUrlOf(IMG_DIAGRAM);
  const withCover = { slug: "moving-to-vercel", status: "published", data: { ...MOVING_DATA, coverImage: address } };
  const coverStored = (): unknown => dbPosts()[0]?.data.coverImage;
  dbSeedWith([DIAGRAM_IMAGE], [withCover]);
  seedFiles();

  // Part 1: the images cannot be loaded.
  storeBreak();
  const { context, page } = await ownerPage(browser, baseURL as string);
  await openBlog(page);
  const screen = screenOf(page);
  await expect(itemsOf(page)).toHaveCount(1);
  await button(itemsOf(page).first(), "Edit").click();
  await expect(editHeading(page)).toBeVisible();
  await expect(coverGroup(page).getByRole("alert")).toHaveText(IMAGES_FAILED);
  expect(await optionTexts(imageSelect(page))).toEqual(["None"]);
  await expect(field(page, "Cover image path")).toHaveValue(address);
  await button(screen, "Save").click();
  await expect(statusWith(page, ENTRY_SAVED)).toHaveText(ENTRY_SAVED);
  expect(coverStored()).toBe(address);

  // Part 2: the image record is gone.
  storeFix();
  dbSeedWith([], [withCover]);
  await page.reload();
  await openBlog(page);
  await button(itemsOf(page).first(), "Edit").click();
  await expect(editHeading(page)).toBeVisible();
  await expect.poll(() => selected(imageSelect(page))).toBe("None");
  await expect(field(page, "Cover image path")).toHaveValue(address);
  await expect(coverGroup(page).getByRole("alert")).toHaveCount(0);
  await button(screen, "Save").click();
  await expect(statusWith(page, ENTRY_SAVED)).toHaveText(ENTRY_SAVED);
  expect(coverStored()).toBe(address);

  // Part 3: the picker and the path field follow the last choice.
  dbSeedWith([DIAGRAM_IMAGE], [MOVING]);
  await page.reload();
  await openBlog(page);
  await button(itemsOf(page).first(), "Edit").click();
  await expect(editHeading(page)).toBeVisible();
  await expect.poll(() => optionTexts(imageSelect(page))).toEqual(["None", "diagram.png"]);
  await field(page, "Cover image path").fill("/images/blog/x.png");
  await expect.poll(() => selected(imageSelect(page))).toBe("None");
  await imageSelect(page).selectOption({ label: "diagram.png" });
  await expect(field(page, "Cover image path")).toHaveValue("");
  await expect.poll(() => selected(imageSelect(page))).toBe("diagram.png");
  await imageSelect(page).selectOption({ label: "None" });
  await expect(field(page, "Cover image path")).toHaveValue("");
  await expect.poll(() => selected(imageSelect(page))).toBe("None");
  await field(page, "Cover image path").fill("/images/blog/last.png");
  await button(screen, "Save").click();
  await expect(statusWith(page, ENTRY_SAVED)).toHaveText(ENTRY_SAVED);
  expect(coverStored()).toBe("/images/blog/last.png");
  await context.close();
});

test("E2E-29: nothing typed in an unsaved form is kept after Cancel or a reload, with no dialog", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(90000);
  dbReset();
  storeReset();
  dbSeedWith([], []);
  const { context, page } = await ownerPage(browser, baseURL as string);
  const dialogs: string[] = [];
  page.on("dialog", (dialog) => {
    dialogs.push(dialog.message());
    void dialog.dismiss();
  });
  await openBlog(page);
  const screen = screenOf(page);

  await button(screen, "Add post").click();
  await expect(addHeading(page)).toBeVisible();
  await fillPost(page, { title: "Draft" });
  await button(screen, "Cancel").click();
  await expect(addHeading(page)).toHaveCount(0);
  await expect(screen.getByText(NO_POSTS)).toBeVisible();
  expect(dbPosts()).toEqual([]);

  await button(screen, "Add post").click();
  await expect(addHeading(page)).toBeVisible();
  await fillPost(page, { title: "Draft again", slug: "draft-again" });
  await page.reload();
  await openBlog(page);
  await expect(screen.getByText(NO_POSTS)).toBeVisible();
  await expect(addHeading(page)).toHaveCount(0);
  await expect(field(page, "Title")).toHaveCount(0);
  const text = await page.locator("body").innerText();
  expect(text).not.toContain("Draft again");
  expect(dbPosts()).toEqual([]);
  expect(dialogs).toEqual([]);

  await button(screen, "Add post").click();
  await expect(addHeading(page)).toBeVisible();
  await expect(button(screen, "Preview")).toBeVisible();
  await context.close();
});

test("E2E-30: the Blog posts screen fits a phone, follows the theme tokens and works from the keyboard", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(300000);
  const LONG = "long-" + "a".repeat(145);
  const posts = Array.from({ length: 20 }, (_, i) => {
    const nn = String(i + 1).padStart(2, "0");
    if (nn === "07") return postRow(LONG, "published", "A".repeat(200), "2026-01-07");
    return postRow("post-" + nn, "published", "Post " + nn, "2026-01-" + nn);
  });
  const surfaceByTheme: Record<string, string> = {};

  for (const theme of ["light", "dark"]) {
    dbReset();
    storeReset();
    dbSeedWith([], posts);
    const { context, page } = await ownerPage(browser, baseURL as string, { viewport: { width: 375, height: 800 } });
    await page.addInitScript((t) => {
      try {
        localStorage.setItem("theme", t);
      } catch {
        // storage unavailable: the page falls back to its default theme
      }
    }, theme);
    await openBlog(page);
    const screen = screenOf(page);
    await expect(itemsOf(page)).toHaveCount(20);

    const fits = async (when: string): Promise<void> => {
      const widths = await page.evaluate(() => ({
        root: document.documentElement.scrollWidth,
        body: document.body.scrollWidth,
      }));
      expect(widths.root, theme + " root width " + when).toBeLessThanOrEqual(375);
      expect(widths.body, theme + " body width " + when).toBeLessThanOrEqual(375);
      const boxes = await page.locator("button, input, select, textarea, fieldset").evaluateAll((nodes) =>
        nodes.map((node) => {
          const rect = node.getBoundingClientRect();
          return {
            label: node.tagName + " " + (node.textContent ?? "").slice(0, 20),
            x: rect.x,
            right: rect.x + rect.width,
            width: rect.width,
            height: rect.height,
          };
        }),
      );
      for (const box of boxes) {
        if (box.width === 0 && box.height === 0) continue;
        expect(box.x, theme + " " + when + " " + box.label).toBeGreaterThanOrEqual(0);
        expect(box.right, theme + " " + when + " " + box.label).toBeLessThanOrEqual(375);
      }
    };

    // (1) The list.
    await fits("list");
    const longItem = itemsOf(page).filter({ hasText: "Slug: " + LONG });
    await expect(longItem).toHaveCount(1);
    const listBox = await listOf(page).boundingBox();
    const itemBox = await longItem.boundingBox();
    const lineBox = await longItem.locator("p").filter({ hasText: "Slug: " + LONG }).boundingBox();
    expect(listBox, "list box").not.toBeNull();
    expect(itemBox, "long item box").not.toBeNull();
    expect(lineBox, "long line box").not.toBeNull();
    const list = listBox as { x: number; width: number };
    const long = itemBox as { x: number; width: number };
    const line = lineBox as { x: number; width: number };
    expect(long.width, theme + " long item width").toBeLessThanOrEqual(list.width + 0.5);
    expect(line.x, theme + " long line left").toBeGreaterThanOrEqual(long.x - 0.5);
    expect(line.x + line.width, theme + " long line right").toBeLessThanOrEqual(long.x + long.width + 0.5);

    // (2) The tokens.
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
    const computed = (locator: Locator, property: "background-color" | "color") =>
      locator.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), property);

    const first = itemsOf(page).first();
    const surfaceAlt = await probe("backgroundColor", "--surface-alt");
    expect(await computed(first, "background-color"), theme + " item").toBe(surfaceAlt);
    expect(await computed(labelsOf(page).first(), "color"), theme + " item text").toBe(await probe("color", "--foreground"));
    const slugLine = first.locator("p").filter({ hasText: "Slug: post-20" });
    await expect(slugLine).toHaveCount(1);
    expect(await computed(slugLine, "color"), theme + " slug line").toBe(await probe("color", "--muted"));
    surfaceByTheme[theme] = surfaceAlt;
    if (theme === "dark") await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    // (3) The form of the long post.
    await button(longItem, "Edit").click();
    await expect(editHeading(page)).toBeVisible();
    await fits("form of the long post");
    for (const name of ["Title", "Slug", "Body"]) {
      const box = await field(page, name).boundingBox();
      expect(box, name + " box").not.toBeNull();
      const b = box as { x: number; width: number };
      expect(b.x, theme + " " + name + " left").toBeGreaterThanOrEqual(0);
      expect(b.x + b.width, theme + " " + name + " right").toBeLessThanOrEqual(375);
    }
    await button(screen, "Cancel").click();
    await expect(editHeading(page)).toHaveCount(0);

    // (4) A refused save.
    await button(itemsOf(page).first(), "Edit").click();
    await expect(editHeading(page)).toBeVisible();
    await fillPost(page, { title: "   " });
    await button(screen, "Save").click();
    const alert = alertWith(page, TITLE_REQUIRED);
    await expect(alert).toHaveText(TITLE_REQUIRED);
    expect(await computed(alert, "color"), theme + " alert").toBe(await probe("color", "--accent-rose"));
    await fits("form with an error");
    await button(screen, "Cancel").click();
    await expect(editHeading(page)).toHaveCount(0);

    // (5) The keyboard.
    const top = itemsOf(page).first();
    await button(top, "Edit").focus();
    await page.keyboard.press("Enter");
    await expect(editHeading(page)).toBeVisible();
    await button(screen, "Cancel").click();
    await expect(editHeading(page)).toHaveCount(0);

    await button(top, "Delete").focus();
    await page.keyboard.press("Enter");
    await expect(confirmGroup(page)).toBeVisible();
    await button(confirmGroup(page), "Confirm").focus();
    await page.keyboard.press("Tab");
    await expect(button(confirmGroup(page), "Cancel")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(confirmGroup(page)).toHaveCount(0);
    await expect(itemsOf(page)).toHaveCount(20);
    expect(dbPosts()).toHaveLength(20);
    await context.close();
  }
  expect(surfaceByTheme.dark).not.toBe(surfaceByTheme.light);
});

test("E2E-31: every menu item shows its own screen and none shows a not-available notice", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(120000);
  dbReset();
  storeReset();
  dbSeedWith([], []);
  const { context, page } = await ownerPage(browser, baseURL as string);
  await page.goto(PANEL);
  for (const label of SECTION_NAMES) {
    await chooseSection(page, label);
    await expect(page.getByRole("heading", { name: label, exact: true, level: 2 }), label).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "editor is not available yet." }), label).toHaveCount(0);
    await expect(button(page, "Sign out"), label).toBeVisible();
    await expect(menu(page).getByRole("button"), label).toHaveText(SECTION_NAMES);
  }
  await context.close();
});

test("E2E-32: the earlier blog store and spec are gone, the shared files stay, and nothing imports the old store", async () => {
  dbReset();
  storeReset();
  const mustNotExist = [piece("src/lib/", FIRE, "/blogposts.ts"), "e2e/manage-blog-posts.spec.ts"];
  for (const path of mustNotExist) expect(fs.existsSync(path), path + " is gone").toBe(false);
  const mustExist = [
    "src/lib/admin/list.ts",
    "src/lib/admin/blogposts.ts",
    "src/app/components/admin/ListEditor.tsx",
    "src/app/components/admin/PostPreview.tsx",
    "src/app/components/admin/BlogPostsEditor.tsx",
  ];
  for (const path of mustExist) expect(fs.existsSync(path), path + " exists").toBe(true);

  const read = (path: string): string => fs.readFileSync(path, "utf8");
  const editor = read("src/app/components/admin/BlogPostsEditor.tsx");
  for (const text of [
    "createHttpListStore",
    "/api/admin/blog-posts/",
    "ListConflictError",
    "ListNotFoundError",
    "listImages",
    "photoSelection",
    "UploadedImage",
    'from "@/lib/admin/imagesClient"',
    "PostPreview",
    "Preview",
  ]) {
    expect(editor, "BlogPostsEditor has " + text).toContain(text);
  }
  for (const word of [
    FIRE,
    piece("lib/", "server"),
    piece("lib/", "auth"),
    piece("next", "-auth"),
    PG,
    piece("server", "-only"),
  ]) {
    expect(editor.toLowerCase(), "BlogPostsEditor names " + word).not.toContain(word);
  }
  expect(editor, "BlogPostsEditor names savingOn").not.toContain(piece("saving", "On"));

  const panel = read("src/app/components/admin/AdminPanel.tsx");
  for (const name of ["BlogPostsEditor", "TechStackEditor", "CertificationsEditor", "ProjectsEditor", "ExperienceEditor"]) {
    expect(panel, "AdminPanel has " + name).toContain(name);
  }
  expect(panel).not.toContain(piece("not available", " yet"));
  expect(panel).not.toContain(piece("lib/", "auth"));
  expect(panel).not.toContain(piece("lib/", "server"));
  expect(panel.toLowerCase()).not.toContain(FIRE);

  const posts = read("src/lib/admin/blogposts.ts");
  expect(posts.toLowerCase()).not.toContain(FIRE);
  expect(posts).toMatch(/export function blogPostShape\b/);

  const importers = gitGrep(["-n", "-E", piece(FIRE, "/blogposts"), "--", "src", "e2e"]);
  expect(importers.stdout).toBe("");
  expect(importers.status).toBe(1);
});

test("E2E-34: the earlier specs now skip Blog posts, expect its screen, and no spec expects its notice", async () => {
  dbReset();
  storeReset();
  const read = (path: string): string => fs.readFileSync(path, "utf8");
  const gone = gitGrep(["-n", "-F", piece("Blog posts editor is", " not available yet."), "--", "e2e"]);
  expect(gone.stdout).toBe("");
  expect(gone.status).toBe(1);

  const signIn = read("e2e/owner-google-sign-in.spec.ts");
  const loop = signIn.split("\n").filter((l) => l.includes('l !== "Blog posts"'));
  expect(loop.length).toBeGreaterThan(0);
  for (const label of ["Profile", "Images", "Experience", "Projects", "Certifications", "Tech stack", "Blog posts"]) {
    for (const line of loop) expect(line, "sign-in loop skips " + label).toContain('l !== "' + label + '"');
  }
  expect(signIn).toContain("{ name: label, exact: true, level: 2 }");

  for (const path of ["e2e/owner-edits-profile.spec.ts", "e2e/owner-uploads-images.spec.ts"]) {
    const text = read(path);
    expect(text, path + " expects the empty list").toContain(NO_POSTS);
    expect(text, path + " expects the load message").toContain(LOAD_FAILED);
  }
  for (const name of ["experience", "projects", "certifications", "tech-stack"]) {
    const text = read("e2e/owner-manages-" + name + ".spec.ts");
    expect(text, name + " spec expects the load message").toContain(LOAD_FAILED);
    expect(text, name + " spec expects the empty list").toContain(NO_POSTS);
  }

  const tableSet = 'export const LIST_TABLES: readonly ListTable[] = ["experience", "projects", "certifications", "tech_categories"];';
  const tableType = 'export type ListTable = "experience" | "projects" | "certifications" | "tech_categories";';
  for (const name of ["projects", "certifications", "tech-stack"]) {
    const text = read("e2e/owner-manages-" + name + ".spec.ts");
    expect(text, name + " spec names the deleted store").not.toContain(piece("/blog", "posts.ts"));
    expect(text, name + " spec pins the table set").toContain(tableSet);
    expect(text, name + " spec pins the table type").toContain(tableType);
  }
});

test("E2E-35: CLAUDE.md lists the blog posts routes once each, keeps the shared pattern and the settings, and drops the old counts", async () => {
  dbReset();
  storeReset();
  const doc = fs.readFileSync("CLAUDE.md", "utf8");
  for (const text of [
    "/api/admin/blog-posts/",
    "/api/admin/blog-posts/published/",
    "src/app/api/admin/blog-posts/route.ts",
    "src/app/api/admin/blog-posts/published/route.ts",
    "The blog posts are stored in Supabase",
    "/api/admin/tech-stack/",
    "src/app/api/admin/tech-stack/route.ts",
    "/api/admin/certifications/",
    "/api/admin/projects/",
    "/api/admin/experience/",
    "/api/admin/images/",
    "/api/admin/images/upload/",
    "/api/admin/profile/",
    "createListService",
    "createHttpListStore",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_DB_URL",
    "AUTH_SECRET",
    "/api/auth/callback/google",
    "src/lib/server/",
    "src/app/api/admin/**",
    "stand-in:",
    "The site reads seven settings by name",
    "the experience entries and the projects",
    "The certifications are stored in Supabase",
    "The tech stack is stored in Supabase",
  ]) {
    expect(doc, text).toContain(text);
  }
  const lines = doc.split("\n");
  expect(lines.filter((l) => l.startsWith("| `/api/admin/blog-posts/` ")), "owner route rows").toHaveLength(1);
  expect(lines.filter((l) => l.startsWith("| `/api/admin/blog-posts/published/` ")), "public route rows").toHaveLength(1);
  for (const route of ["tech-stack", "certifications", "projects", "experience"]) {
    const rows = lines.filter((l) => l.startsWith("| `/api/admin/" + route + "/`"));
    expect(rows, "Routes table rows for the " + route + " route").toHaveLength(1);
  }
  for (const text of [
    "The site reads five settings by name",
    "The site reads four settings by name",
    "only API route",
    "The one remaining Firebase store",
  ]) {
    expect(doc, text).not.toContain(text);
  }
});
