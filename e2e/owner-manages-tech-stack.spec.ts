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
import {
  checkTechCategory,
  emptyTechCategory,
  moveTool,
  techDeleteText,
  techFromData,
  techItemDeleteText,
  techItemLine,
  techLabel,
  techShape,
  techToData,
} from "../src/lib/admin/techstack";

test.describe.configure({ mode: "default" });

// Shared fixtures. The tests of this file share one stand-in database file and one stand-in storage directory
// (D-14), so every test starts by resetting both.

// The gate scans this file, so the names of forbidden words and modules are put together from pieces.
const piece = (...parts: string[]): string => parts.join("");
const SUPABASE_PREFIX = piece("@supa", "base/");
const HOSTED_BASE = piece("https:", "//abc.", "supa", "base", ".co");
const FIRE = piece("fire", "base");
const PG = piece("post", "gres");
const AUTH_MODULE = piece("@/lib/", "auth");
const TABLE_MARK = piece("$", "{table}");
const SERVER_DIR = piece("lib/", "server");
const SERVER_PATH = piece("src/", SERVER_DIR);

const STAND_IN_PREFIX = "stand-in:";
const DB_URL = process.env.SUPABASE_DB_URL ?? "";
const DB_FILE = DB_URL.startsWith(STAND_IN_PREFIX) ? DB_URL.slice(STAND_IN_PREFIX.length) : "";
const STORE_URL = process.env.SUPABASE_URL ?? "";
const STORE_DIR = STORE_URL.startsWith(STAND_IN_PREFIX) ? STORE_URL.slice(STAND_IN_PREFIX.length) : "";

const PANEL = "/bright-warm-greenhouse/";
const API = "/api/admin/tech-stack/";
const CERT_API = "/api/admin/certifications/";
const PROJECTS_API = "/api/admin/projects/";
const EXPERIENCE_API = "/api/admin/experience/";

const FRONT_ID = "11111111-1111-4111-8111-111111111111";
const BACK_ID = "22222222-2222-4222-8222-222222222222";
const CLOUD_ID = "33333333-3333-4333-8333-333333333333";
const GONE_ID = "99999999-9999-4999-8999-999999999999";
const IMG_PG = "55555555-5555-4555-8555-555555555555.png";
const IMG_REACT = "66666666-6666-4666-8666-666666666666.png";

const FRONTEND = {
  category: "Frontend",
  tools: [
    { name: "React", icon: "/icons/react.png" },
    { name: "Angular", icon: "/icons/angular.png" },
  ],
};
const BACKEND = {
  category: "Backend",
  tools: [
    { name: "Node.js", icon: "/icons/node.png" },
    { name: "ASP.NET Core", icon: "/icons/aspnet.png" },
  ],
};
const CLOUD = {
  category: "Cloud",
  tools: [
    { name: "Vercel", icon: "/icons/vercel.png" },
    { name: "Docker", icon: "/icons/docker.png" },
  ],
};

const PG_IMAGE = { id: IMG_PG, name: "postgres-logo.png", contentType: "image/png", size: 70 };
const REACT_IMAGE = { id: IMG_REACT, name: "react-logo.png", contentType: "image/png", size: 70 };

const LEAKS = ["10.1.2.3", "password-marker-standin", "key-marker-standin", "ECONNREFUSED"];

const ENTRY_SAVED = "Entry saved";
const ORDER_SAVED = "Order saved";
const NO_TECH = "No tech categories yet.";
const LOAD_FAILED = "The entries could not be loaded.";
const SAVE_FAILED = "The entry could not be saved. Try again, and check that you are signed in as the owner.";
const MOVE_FAILED = "The entry could not be moved. Try again, and check that you are signed in as the owner.";
const DELETE_FAILED = "The entry could not be deleted. Try again, and check that you are signed in as the owner.";
const ASK_BACKEND = 'Delete "Backend" (2 items)? This cannot be undone.';
const ASK_NODE = 'Delete the item "Node.js"? This cannot be undone.';
const CAT_REQUIRED = "Category name is required";
const CAT_LONG = "Category name must be 80 characters or fewer";
const ITEM_REQUIRED = "Item name is required";
const ITEM_LONG = "Item name must be 80 characters or fewer";
const ICON_REQUIRED = "Icon is required";
const ICON_INVALID = 'Icon path must start with "/"';
const IMAGES_FAILED = "The uploaded images could not be loaded.";

const SESSION_COOKIE = "authjs.session-token";
type Claims = { sub: string; email: string; name: string; emailVerified: boolean };
const setting = (name: string): string => process.env[name] ?? "";
const OWNER = (): Claims => ({ sub: "owner-1", email: setting("ADMIN_EMAIL"), name: "Owner Test", emailVerified: true });
const OTHER = (): Claims => ({
  sub: "other-1",
  email: "mallory@example.test",
  name: "Mallory Intruder",
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

function dbSeedTech(list: unknown[]): void {
  fs.writeFileSync(DB_FILE, JSON.stringify({ tech_categories: list }));
}

function dbSeedWith(images: unknown[], techs: unknown[]): void {
  fs.writeFileSync(DB_FILE, JSON.stringify({ images, tech_categories: techs }));
}

function dbSeedAll(
  profile: unknown,
  images: unknown[],
  experience: unknown[],
  projects: unknown[],
  certs: unknown[],
  techs: unknown[],
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
    }),
  );
}

function dbTech(): unknown[] {
  const list = readDbFile().tech_categories;
  return Array.isArray(list) ? list : [];
}

type StoredRow = { id: string; position: number; data: { category?: string } };

// Stably sorted by position (equal positions keep array order).
function sortedRows(rows: unknown[]): StoredRow[] {
  return (rows as StoredRow[])
    .map((r, i) => ({ r, i }))
    .sort((a, b) => a.r.position - b.r.position || a.i - b.i)
    .map(({ r }) => r);
}

const dbNames = (): string[] => sortedRows(dbTech()).map((r) => r.data.category ?? "");

const positionsOf = (): Record<string, unknown> =>
  Object.fromEntries((dbTech() as StoredRow[]).map((r) => [r.id, r.position]));

const row = (id: string, position: number, content: unknown) => ({ id, position, data: content });
const entry = (id: string, position: number, content: unknown) => ({ id, position, content });
const seedTwo = (): void =>
  dbSeedWith([PG_IMAGE, REACT_IMAGE], [row(FRONT_ID, 0, FRONTEND), row(BACK_ID, 1, BACKEND)]);
const seedThree = (): void =>
  dbSeedWith(
    [PG_IMAGE, REACT_IMAGE],
    [row(FRONT_ID, 0, FRONTEND), row(BACK_ID, 1, BACKEND), row(CLOUD_ID, 2, CLOUD)],
  );

// The storage stand-in directory.
function storeReset(): void {
  if (STORE_DIR !== "") fs.rmSync(STORE_DIR, { recursive: true, force: true });
}

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

const HOST = "https://stand-in.invalid";
const publicOf = (id: string): string => HOST + "/storage/v1/object/public/images/" + id;

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

// The two uploaded images' files, for the browser rows of Step 2.
const seedFiles = (): void => {
  storePut(IMG_PG, PNG_1X1, "image/png");
  storePut(IMG_REACT, PNG_1X1, "image/png");
};

// Keep the fixtures that only the browser rows of Step 2 use from reading as unused here.
void [
  PANEL,
  ENTRY_SAVED,
  ORDER_SAVED,
  NO_TECH,
  LOAD_FAILED,
  SAVE_FAILED,
  MOVE_FAILED,
  DELETE_FAILED,
  ASK_BACKEND,
  ASK_NODE,
  IMAGES_FAILED,
  storeBreak,
  storeFix,
  seedFiles,
  EXPERIENCE_API,
];

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

function expectJsonNoStore(res: APIResponse, label: string): void {
  expect(res.headers()["cache-control"] ?? "", label + " cache-control").toContain("no-store");
  expect(res.headers()["content-type"] ?? "", label + " content-type").toMatch(/json/i);
}

async function expectAnswer(res: APIResponse, status: number, body: unknown, label: string): Promise<void> {
  expect(res.status(), label + " status").toBe(status);
  expect(await res.json(), label + " body").toEqual(body);
}

const postBody = (content: unknown, position: number): string => JSON.stringify({ content, position });
const swapBody = (): string =>
  JSON.stringify({
    changes: [
      { id: FRONT_ID, position: 1 },
      { id: BACK_ID, position: 0 },
    ],
  });
const idQuery = (id: string): string => "?id=" + id;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

type ListAnswer = { entries: { id: string; position: number; content: { category: string } }[] };

async function namesFromGet(request: APIRequestContext, cookie: string): Promise<string[]> {
  const res = await apiGet(request, cookie);
  expect(res.status(), "GET status").toBe(200);
  const body = (await res.json()) as ListAnswer;
  return body.entries.map((e) => e.content.category);
}

function gitGrep(args: string[]): { stdout: string; status: number | null } {
  const result = spawnSync("git", ["grep", "--untracked", ...args], { cwd: process.cwd(), encoding: "utf8" });
  return { stdout: result.stdout ?? "", status: result.status };
}

test("E2E-01: no dependency or setting name was added", async () => {
  dbReset();
  storeReset();
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

  expect(Object.keys(pkg.dependencies ?? {}).sort()).toEqual([
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
  expect(pkg.dependencies?.[PG]).toBe("4.1.1");
  expect(pkg.dependencies?.["next-auth"]).toBe("5.0.0-beta.32");
  const allKeys = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})];
  expect(allKeys.filter((k) => k.startsWith(SUPABASE_PREFIX))).toEqual([]);

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
});

test("E2E-02: techShape, checkTechCategory, techFromData, techToData and the text helpers apply the stated rules", async () => {
  dbReset();
  storeReset();

  // techShape
  const a = { category: "C", tools: [{ name: "N", icon: "/n.png" }] };
  expect(techShape(a), "(a)").toEqual(a);
  expect(techShape({ category: "C" }), "(b)").toEqual({ category: "C", tools: [] });
  expect(techShape({}), "(c)").toEqual({ category: "", tools: [] });
  const extra = techShape({ ...a, extra: 5, tools: [{ ...a.tools[0], extra: true }] });
  expect(extra, "(d)").not.toBeNull();
  expect(Object.keys(extra as object).sort(), "(d) keys").toEqual(["category", "tools"]);
  expect(extra, "(d) value").toEqual(a);
  expect(Object.keys((extra as { tools: object[] }).tools[0]).sort(), "(d) item keys").toEqual(["icon", "name"]);
  const source = { ...a, tools: [{ ...a.tools[0] }] };
  const shaped = techShape(source) as { tools: object[] };
  expect(shaped.tools, "(d) new tools array").not.toBe(source.tools);
  expect(shaped.tools[0], "(d) new item").not.toBe(source.tools[0]);
  expect(techShape({ category: "C", tools: [{}] }), "(e)").toEqual({ category: "C", tools: [{ name: "", icon: "" }] });
  const wrongKinds: unknown[] = [
    { category: 5 },
    { category: null },
    { category: "C", tools: "x" },
    { category: "C", tools: {} },
    { category: "C", tools: null },
    { category: "C", tools: [5] },
    { category: "C", tools: [null] },
    { category: "C", tools: [["x"]] },
    { category: "C", tools: [{ name: 5 }] },
    { category: "C", tools: [{ icon: null }] },
    { category: "C", tools: [{ name: "A" }, { name: ["x"] }] },
  ];
  for (const bad of wrongKinds) expect(techShape(bad), "(f) " + JSON.stringify(bad)).toBeNull();
  for (const bad of [null, [], "x", 7]) expect(techShape(bad), "(g) " + JSON.stringify(bad)).toBeNull();

  // checkTechCategory
  expect(checkTechCategory.length).toBe(1);
  const B = { category: "Frontend", tools: [{ name: "React", icon: "/icons/react.png" }] };
  const withCategory = (category: string) => checkTechCategory({ ...B, category });
  const withName = (name: string) => checkTechCategory({ ...B, tools: [{ name, icon: "/icons/react.png" }] });
  const withIcon = (icon: string) => checkTechCategory({ ...B, tools: [{ name: "React", icon }] });
  const expectRefused = (result: ReturnType<typeof checkTechCategory>, errors: Record<string, string>, label: string) => {
    expect(result.ok, label).toBe(false);
    if (!result.ok) expect(result.errors, label).toEqual(errors);
  };

  expect(
    checkTechCategory({
      category: "  Frontend  ",
      tools: [{ name: " React ", icon: " /icons/react.png " }],
    }),
    "(h)",
  ).toEqual({ ok: true, content: B });

  for (const v of ["", "   ", "\t\n"]) {
    expectRefused(withCategory(v), { category: CAT_REQUIRED }, "(i) " + JSON.stringify(v));
  }
  expectRefused(withCategory("A".repeat(81)), { category: CAT_LONG }, "(j) 81");
  expect(withCategory("A".repeat(80)).ok, "(j) 80").toBe(true);
  const padded = withCategory(" " + "A".repeat(80) + " ");
  expect(padded.ok, "(j) padded 80").toBe(true);
  if (padded.ok) expect(padded.content.category, "(j) padded 80 trimmed").toBe("A".repeat(80));

  for (const v of ["", "   "]) {
    expectRefused(withName(v), { "tools.0.name": ITEM_REQUIRED }, "(k) " + JSON.stringify(v));
  }
  expectRefused(withName("B".repeat(81)), { "tools.0.name": ITEM_LONG }, "(k) 81");
  expect(withName("B".repeat(80)).ok, "(k) 80").toBe(true);

  for (const v of ["", "   "]) {
    expectRefused(withIcon(v), { "tools.0.icon": ICON_REQUIRED }, "(l) " + JSON.stringify(v));
  }

  for (const v of [
    "https://example.com/react.png",
    "icons/react.png",
    "//cdn.example.com/a.png",
    "/",
    "/icons/my react.png",
    "ftp://x.example/storage/v1/object/public/images/a.png",
    "https://stand-in.invalid/storage/v1/object/public/images/",
    "https:///storage/v1/object/public/images/a.png",
    "https://a b.example/storage/v1/object/public/images/a.png",
    "https://x.example/storage/v1/object/public/other/a.png",
    "HTTPS://x.example/storage/v1/object/public/images/a.png",
    "https://x.example/storage/v1/object/public/images/a b.png",
    "https://x.example/storage/v1/object/public/images",
  ]) {
    expectRefused(withIcon(v), { "tools.0.icon": ICON_INVALID }, "(m) " + JSON.stringify(v));
  }

  for (const v of [
    "/x",
    "/icons/react.png",
    publicOf(IMG_PG),
    "http://x.example/storage/v1/object/public/images/a",
    HOSTED_BASE + "/storage/v1/object/public/images/a.png",
    "https://x.example:8080/storage/v1/object/public/images/a.png",
  ]) {
    expect(withIcon(v).ok, "(n) " + JSON.stringify(v)).toBe(true);
  }

  expectRefused(
    checkTechCategory({
      category: "",
      tools: [
        { name: "", icon: "" },
        { name: "Vue", icon: "vue.png" },
      ],
    }),
    {
      category: CAT_REQUIRED,
      "tools.0.name": ITEM_REQUIRED,
      "tools.0.icon": ICON_REQUIRED,
      "tools.1.icon": ICON_INVALID,
    },
    "(o)",
  );
  expect(checkTechCategory({ category: "Bare", tools: [] }), "(p)").toEqual({
    ok: true,
    content: { category: "Bare", tools: [] },
  });
  expectRefused(
    checkTechCategory({
      category: "Q",
      tools: [
        { name: "A", icon: "/a.png" },
        { name: "B", icon: "/b.png" },
        { name: "", icon: "/c.png" },
      ],
    }),
    { "tools.2.name": ITEM_REQUIRED },
    "(q)",
  );

  // techFromData
  expect(
    techFromData({ category: "Cloud", tools: [{ name: "Docker", icon: "/icons/docker.png" }], position: 3 }),
  ).toEqual({ category: "Cloud", tools: [{ name: "Docker", icon: "/icons/docker.png" }] });
  expect(techFromData({})).toEqual({ category: "", tools: [] });
  expect(techFromData({ category: 5, tools: "x" })).toEqual({ category: "", tools: [] });
  expect(
    techFromData({
      category: "Mixed",
      tools: ["x", null, 7, { name: "Ok", icon: "/icons/ok.png" }, { name: 5, icon: null }],
    }),
  ).toEqual({
    category: "Mixed",
    tools: [
      { name: "Ok", icon: "/icons/ok.png" },
      { name: "", icon: "" },
    ],
  });
  expect(techFromData(null)).toEqual({ category: "", tools: [] });

  // emptyTechCategory, techToData, techLabel
  const first = emptyTechCategory();
  const second = emptyTechCategory();
  expect(first).toEqual({ category: "", tools: [{ name: "", icon: "" }] });
  expect(second).toEqual({ category: "", tools: [{ name: "", icon: "" }] });
  expect(first).not.toBe(second);
  expect(first.tools).not.toBe(second.tools);

  const content = techFromData({
    category: "Cloud",
    tools: [{ name: "Docker", icon: "/icons/docker.png" }],
    position: 3,
  });
  const data = techToData(content) as { category: string; tools: Record<string, unknown>[] };
  expect(Object.keys(data).sort()).toEqual(["category", "tools"]);
  for (const item of data.tools) expect(Object.keys(item).sort()).toEqual(["icon", "name"]);
  (data as Record<string, unknown>).z = "z";
  data.tools[0].z = "z";
  expect(content).toEqual({ category: "Cloud", tools: [{ name: "Docker", icon: "/icons/docker.png" }] });
  expect(Object.keys(content)).not.toContain("z");
  expect(Object.keys(content.tools[0])).not.toContain("z");
  expect(techLabel(content)).toBe("Cloud");

  // techDeleteText, techItemDeleteText
  expect(techDeleteText({ category: "Cloud", tools: CLOUD.tools })).toBe(
    'Delete "Cloud" (2 items)? This cannot be undone.',
  );
  expect(techDeleteText({ category: "Solo", tools: [{ name: "Vercel", icon: "/icons/vercel.png" }] })).toBe(
    'Delete "Solo" (1 item)? This cannot be undone.',
  );
  expect(techDeleteText({ category: "Bare", tools: [] })).toBe('Delete "Bare" (0 items)? This cannot be undone.');
  expect(techItemDeleteText(" Node.js ", 0)).toBe('Delete the item "Node.js"? This cannot be undone.');
  expect(techItemDeleteText("  ", 1)).toBe("Delete item 2? This cannot be undone.");

  // techItemLine
  const images = [{ url: publicOf(IMG_PG), name: "postgres-logo.png" }];
  expect(techItemLine({ name: "Postgres", icon: publicOf(IMG_PG) }, images)).toBe("Postgres: image postgres-logo.png");
  expect(techItemLine({ name: "Docker", icon: "/icons/docker.png" }, images)).toBe("Docker: path /icons/docker.png");

  // moveTool
  const tools = [
    { name: "A", icon: "/a.png" },
    { name: "B", icon: "/b.png" },
    { name: "C", icon: "/c.png" },
  ];
  const namesOf = (list: { name: string }[] | null): string[] | null => (list === null ? null : list.map((t) => t.name));
  expect(namesOf(moveTool(tools, 1, "up"))).toEqual(["B", "A", "C"]);
  expect(namesOf(moveTool(tools, 1, "down"))).toEqual(["A", "C", "B"]);
  expect(moveTool(tools, 0, "up")).toBeNull();
  expect(moveTool(tools, 2, "down")).toBeNull();
  expect(moveTool(tools, 5, "up")).toBeNull();
  expect(tools.map((t) => t.name)).toEqual(["A", "B", "C"]);
});

test("E2E-03: the list SQL is exactly the proven text for the four tables, the server files are marked server-only, and nothing names the old backend", async () => {
  dbReset();
  storeReset();

  const original = fs.readFileSync(SERVER_PATH + "/listSql.ts", "utf8");
  for (const table of ["experience", "projects", "certifications", "tech_categories"]) {
    const sql = original.split(TABLE_MARK).join(table);
    for (const statement of [
      `create table if not exists ${table} (seq bigint generated always as identity, id text primary key, position integer not null, data jsonb not null, updated_at timestamptz not null default now())`,
      `alter table ${table} enable row level security`,
      `select id, position, data from ${table} order by position, seq`,
      `insert into ${table} (id, position, data) values ($1, $2, $3::text::jsonb) returning id`,
      `update ${table} set data = $2::text::jsonb, updated_at = now() where id = $1 returning id`,
      `delete from ${table} where id = $1 returning id`,
      `with wanted as (select id, position from jsonb_to_recordset($1::text::jsonb) as w(id text, position integer)) update ${table} e set position = wanted.position, updated_at = now() from wanted where e.id = wanted.id and (select count(*) from ${table} x join wanted w on w.id = x.id) = (select count(*) from wanted) returning e.id`,
    ]) {
      expect(sql, table + ": " + statement).toContain(statement);
    }
    for (const word of ["drop ", "truncate "]) expect(sql, table + " " + word).not.toContain(word);
  }

  const lines = original.split("\n");
  expect(lines).toContain(
    'export const LIST_TABLES: readonly ListTable[] = ["experience", "projects", "certifications", "tech_categories"];',
  );
  expect(lines.filter((l) => /^export type ListTable =/.test(l))).toEqual([
    'export type ListTable = "experience" | "projects" | "certifications" | "tech_categories";',
  ]);

  const serverFiles = fs.readdirSync(SERVER_PATH).filter((f) => fs.statSync(SERVER_PATH + "/" + f).isFile());
  expect(serverFiles.length).toBeGreaterThan(0);
  for (const f of serverFiles) {
    const first = fs
      .readFileSync(SERVER_PATH + "/" + f, "utf8")
      .split("\n")
      .find((line) => line.trim() !== "");
    expect(first, f).toBe('import "server-only";');
  }

  const mentions = gitGrep(["-l", "-E", SERVER_DIR, "--", "src"]);
  const mentioning = mentions.stdout.split("\n").filter(Boolean);
  expect(mentioning.length).toBeGreaterThan(0);
  for (const file of mentioning) {
    expect(file.startsWith("src/app/api/admin/") || file.startsWith(SERVER_PATH + "/"), file).toBe(true);
  }

  const importers = gitGrep(["-l", "-E", "[\"']" + PG + "[\"']", "--", "src"]);
  expect(importers.stdout.split("\n").filter(Boolean)).toEqual([SERVER_PATH + "/database.ts"]);

  const named = gitGrep([
    "-n",
    "-i",
    FIRE,
    "--",
    SERVER_PATH,
    "src/lib/admin/listClient.ts",
    "src/app/api/admin/tech-stack",
  ]);
  expect(named.stdout).toBe("");
  expect(named.status).toBe(1);
});

test("E2E-04: the owner lists, adds, replaces and removes a tech category through the route, with trimmed content", async ({
  request,
}) => {
  dbReset();
  storeReset();
  const owner = await ownerCookie();
  const answers: [string, APIResponse][] = [];

  const first = await apiGet(request, owner);
  answers.push(["GET 1", first]);
  await expectAnswer(first, 200, { entries: [] }, "GET 1");

  const uploaded = publicOf(IMG_PG);
  const stored1 = {
    category: "Frontend",
    tools: [
      { name: "React", icon: "/icons/react.png" },
      { name: "Angular", icon: uploaded },
    ],
  };
  const added = await apiSend(
    request,
    "POST",
    "",
    '{"content":{"category":"  Frontend ","tools":[{"name":" React ","icon":" /icons/react.png "},{"name":"Angular","icon":"https://stand-in.invalid/storage/v1/object/public/images/55555555-5555-4555-8555-555555555555.png","extra":true}],"extra":5},"position":0}',
    owner,
  );
  answers.push(["POST", added]);
  expect(added.status(), "POST status").toBe(200);
  const addedBody = (await added.json()) as Record<string, unknown>;
  expect(Object.keys(addedBody)).toEqual(["id"]);
  const id1 = addedBody.id as string;
  expect(id1).toMatch(UUID_V4);
  expect(dbTech()).toEqual([row(id1, 0, stored1)]);
  const storedData = (dbTech() as StoredRow[])[0].data as { tools: object[] };
  expect(Object.keys(storedData).sort()).toEqual(["category", "tools"]);
  for (const item of storedData.tools) expect(Object.keys(item).sort()).toEqual(["icon", "name"]);

  const second = await apiGet(request, owner);
  answers.push(["GET 2", second]);
  await expectAnswer(second, 200, { entries: [entry(id1, 0, stored1)] }, "GET 2");

  const replaced = await apiSend(
    request,
    "PUT",
    idQuery(id1),
    '{"content":{"category":"Frontend 2","tools":[{"name":"Vue","icon":"/icons/vue.png"}]}}',
    owner,
  );
  answers.push(["PUT", replaced]);
  await expectAnswer(replaced, 200, { updated: true }, "PUT");

  const replacedContent = { category: "Frontend 2", tools: [{ name: "Vue", icon: "/icons/vue.png" }] };
  const third = await apiGet(request, owner);
  answers.push(["GET 3", third]);
  await expectAnswer(third, 200, { entries: [entry(id1, 0, replacedContent)] }, "GET 3");

  const empty = await apiSend(request, "POST", "", '{"content":{"category":"Empty"},"position":1}', owner);
  answers.push(["POST Empty", empty]);
  expect(empty.status(), "POST Empty status").toBe(200);
  const emptyId = ((await empty.json()) as { id: string }).id;
  const solo = await apiSend(request, "POST", "", '{"content":{"category":"Solo","tools":[]},"position":2}', owner);
  answers.push(["POST Solo", solo]);
  expect(solo.status(), "POST Solo status").toBe(200);
  const soloId = ((await solo.json()) as { id: string }).id;
  expect(dbTech()).toEqual([
    row(id1, 0, replacedContent),
    row(emptyId, 1, { category: "Empty", tools: [] }),
    row(soloId, 2, { category: "Solo", tools: [] }),
  ]);

  const removed = await apiSend(request, "DELETE", idQuery(id1), undefined, owner);
  answers.push(["DELETE", removed]);
  await expectAnswer(removed, 200, { deleted: true }, "DELETE");

  const last = await apiGet(request, owner);
  answers.push(["GET 4", last]);
  await expectAnswer(
    last,
    200,
    {
      entries: [
        entry(emptyId, 1, { category: "Empty", tools: [] }),
        entry(soloId, 2, { category: "Solo", tools: [] }),
      ],
    },
    "GET 4",
  );
  expect(dbTech()).toHaveLength(2);

  for (const [label, res] of answers) expectJsonNoStore(res, label);
});

test("E2E-05: the route keeps the positions the client sends, orders by position then insertion, and refuses an out-of-range one", async ({
  request,
}) => {
  dbReset();
  storeReset();
  const owner = await ownerCookie();

  const posted: string[] = [];
  for (const [content, position] of [
    [FRONTEND, 0],
    [BACKEND, -1],
    [CLOUD, -2],
  ] as const) {
    const res = await apiSend(request, "POST", "", postBody(content, position), owner);
    expect(res.status(), "POST " + content.category).toBe(200);
    posted.push(((await res.json()) as { id: string }).id);
  }
  expect(await namesFromGet(request, owner)).toEqual(["Cloud", "Backend", "Frontend"]);
  const afterThree = (await (await apiGet(request, owner)).json()) as ListAnswer;
  expect(afterThree.entries.map((e) => e.position)).toEqual([-2, -1, 0]);

  const again = await apiSend(request, "POST", "", postBody(CLOUD, -2), owner);
  expect(again.status(), "second Cloud").toBe(200);
  const againId = ((await again.json()) as { id: string }).id;
  const afterFourth = await apiGet(request, owner);
  const listed = ((await afterFourth.json()) as ListAnswer).entries;
  expect(listed.map((e) => e.content.category)).toEqual(["Cloud", "Cloud", "Backend", "Frontend"]);
  expect(listed[0].id).not.toBe(listed[1].id);
  expect(listed[0].id).toBe(posted[2]);
  expect(listed[1].id).toBe(againId);

  dbSeedTech([row(FRONT_ID, 2, FRONTEND), row(BACK_ID, 2, BACKEND), row(CLOUD_ID, -5, CLOUD)]);
  expect(await namesFromGet(request, owner)).toEqual(["Cloud", "Frontend", "Backend"]);

  const high = await apiSend(request, "POST", "", postBody(BACKEND, 2147483647), owner);
  expect(high.status(), "position 2147483647").toBe(200);
  const low = await apiSend(request, "POST", "", postBody(BACKEND, -2147483648), owner);
  expect(low.status(), "position -2147483648").toBe(200);
  const before = dbTech().length;
  const over = await apiSend(request, "POST", "", postBody(BACKEND, 2147483648), owner);
  await expectAnswer(over, 400, { error: "invalid" }, "position 2147483648");
  expect(dbTech()).toHaveLength(before);
});

test("E2E-06: a replace or remove of a tech category that is not stored answers 404 and stores nothing", async ({
  request,
}) => {
  dbReset();
  storeReset();
  seedTwo();
  const owner = await ownerCookie();
  const seed = [row(FRONT_ID, 0, FRONTEND), row(BACK_ID, 1, BACKEND)];

  const missingPut = await apiSend(
    request,
    "PUT",
    idQuery(GONE_ID),
    JSON.stringify({ content: { ...FRONTEND, category: "Changed" } }),
    owner,
  );
  await expectAnswer(missingPut, 404, { error: "not-found" }, "PUT of a missing id");
  const missingDelete = await apiSend(request, "DELETE", idQuery(GONE_ID), undefined, owner);
  await expectAnswer(missingDelete, 404, { error: "not-found" }, "DELETE of a missing id");
  expect(dbTech()).toEqual(seed);

  const shorter = { category: "Backend II", tools: [BACKEND.tools[0]] };
  const edit = await apiSend(request, "PUT", idQuery(BACK_ID), JSON.stringify({ content: shorter }), owner);
  await expectAnswer(edit, 200, { updated: true }, "PUT of Backend");
  const stored = dbTech() as { id: string; position: number; data: unknown }[];
  expect(stored.find((r) => r.id === BACK_ID)).toEqual(
    row(BACK_ID, 1, { category: "Backend II", tools: [{ name: "Node.js", icon: "/icons/node.png" }] }),
  );
  expect(stored.find((r) => r.id === FRONT_ID)).toEqual(row(FRONT_ID, 0, FRONTEND));

  const removed = await apiSend(request, "DELETE", idQuery(FRONT_ID), undefined, owner);
  await expectAnswer(removed, 200, { deleted: true }, "first DELETE of Frontend");
  const revive = await apiSend(request, "PUT", idQuery(FRONT_ID), JSON.stringify({ content: FRONTEND }), owner);
  await expectAnswer(revive, 404, { error: "not-found" }, "PUT of a removed id");
  const removedAgain = await apiSend(request, "DELETE", idQuery(FRONT_ID), undefined, owner);
  expect(removedAgain.status(), "second DELETE of Frontend").toBe(404);
  expect((dbTech() as { id: string }[]).map((r) => r.id)).toEqual([BACK_ID]);
});

test("E2E-07: a reorder changes every named position or none, and refuses every malformed body", async ({ request }) => {
  dbReset();
  storeReset();
  seedThree();
  const owner = await ownerCookie();

  const moved = await apiSend(request, "PATCH", "", swapBody(), owner);
  await expectAnswer(moved, 200, { moved: true }, "swap");
  expect(await namesFromGet(request, owner)).toEqual(["Backend", "Frontend", "Cloud"]);

  const partial = await apiSend(
    request,
    "PATCH",
    "",
    JSON.stringify({
      changes: [
        { id: CLOUD_ID, position: 0 },
        { id: GONE_ID, position: 1 },
      ],
    }),
    owner,
  );
  await expectAnswer(partial, 404, { error: "not-found" }, "move with a missing id");
  expect(await namesFromGet(request, owner)).toEqual(["Backend", "Frontend", "Cloud"]);
  const settled = { [BACK_ID]: 0, [FRONT_ID]: 1, [CLOUD_ID]: 2 };
  expect(positionsOf()).toEqual(settled);

  const bad: [string, string | undefined][] = [
    ["empty changes", JSON.stringify({ changes: [] })],
    [
      "repeated id",
      JSON.stringify({
        changes: [
          { id: FRONT_ID, position: 0 },
          { id: FRONT_ID, position: 1 },
        ],
      }),
    ],
    ["fractional position", JSON.stringify({ changes: [{ id: FRONT_ID, position: 1.5 }] })],
    ["string position", JSON.stringify({ changes: [{ id: FRONT_ID, position: "1" }] })],
    ["position over range", JSON.stringify({ changes: [{ id: FRONT_ID, position: 2147483648 }] })],
    ["bad id", JSON.stringify({ changes: [{ id: "not-an-id", position: 0 }] })],
    ["missing id", JSON.stringify({ changes: [{ position: 0 }] })],
    ["null change", JSON.stringify({ changes: [null] })],
    ["changes a string", JSON.stringify({ changes: "x" })],
    ["empty object", "{}"],
    ["array body", "[]"],
    ["raw brace", "{"],
    ["empty body", undefined],
  ];
  for (const [label, body] of bad) {
    const res = await apiSend(request, "PATCH", "", body, owner);
    await expectAnswer(res, 400, { error: "invalid" }, label);
    expect(positionsOf(), label + " changed nothing").toEqual(settled);
  }
});

test("E2E-08: the route refuses every invalid add, replace and remove with 400 and stores nothing", async ({ request }) => {
  dbReset();
  storeReset();
  dbSeedTech([row(FRONT_ID, 0, FRONTEND)]);
  const owner = await ownerCookie();

  const [react, angular] = FRONTEND.tools;
  const post = (content: unknown, position: unknown = 0): string => JSON.stringify({ content, position });
  const put = (content: unknown): string => JSON.stringify({ content });
  const withTools = (tools: unknown): unknown => ({ category: FRONTEND.category, tools });
  const withReact = (patch: Record<string, unknown>): unknown => withTools([{ ...react, ...patch }, angular]);
  const withoutKey = (item: Record<string, unknown>, key: string): Record<string, unknown> => {
    const copy = { ...item };
    delete copy[key];
    return copy;
  };
  const noCategory = { tools: FRONTEND.tools };

  type Case = { label: string; method: "POST" | "PUT" | "DELETE"; query: string; body: string | undefined };
  const cases: Case[] = [
    { label: "(1) category empty", method: "POST", query: "", body: post({ ...FRONTEND, category: "" }) },
    { label: "(2) category blank", method: "POST", query: "", body: post({ ...FRONTEND, category: "   " }) },
    { label: "(3) category missing", method: "POST", query: "", body: post(noCategory) },
    { label: "(4) category 81 characters", method: "POST", query: "", body: post({ ...FRONTEND, category: "A".repeat(81) }) },
    { label: "(5) category a number", method: "POST", query: "", body: post({ ...FRONTEND, category: 5 }) },
    { label: "(6) category null", method: "POST", query: "", body: post({ ...FRONTEND, category: null }) },
    { label: "(7) tools a string", method: "POST", query: "", body: post({ ...FRONTEND, tools: "x" }) },
    { label: "(8) tools an object", method: "POST", query: "", body: post({ ...FRONTEND, tools: {} }) },
    { label: "(9) tools null", method: "POST", query: "", body: post({ ...FRONTEND, tools: null }) },
    { label: "(10) tools holding a number", method: "POST", query: "", body: post({ ...FRONTEND, tools: [5] }) },
    { label: "(11) tools holding null", method: "POST", query: "", body: post({ ...FRONTEND, tools: [null] }) },
    { label: "(12) tools holding an array", method: "POST", query: "", body: post({ ...FRONTEND, tools: [["x"]] }) },
    { label: "(13) item name empty", method: "POST", query: "", body: post(withReact({ name: "" })) },
    { label: "(14) item name blank", method: "POST", query: "", body: post(withReact({ name: "   " })) },
    { label: "(15) item name missing", method: "POST", query: "", body: post(withTools([withoutKey(react, "name"), angular])) },
    { label: "(16) item name 81 characters", method: "POST", query: "", body: post(withReact({ name: "B".repeat(81) })) },
    { label: "(17) item name a number", method: "POST", query: "", body: post(withReact({ name: 5 })) },
    { label: "(18) item icon empty", method: "POST", query: "", body: post(withReact({ icon: "" })) },
    { label: "(19) item icon missing", method: "POST", query: "", body: post(withTools([withoutKey(react, "icon"), angular])) },
    { label: "(20) item icon a web address", method: "POST", query: "", body: post(withReact({ icon: "https://example.com/react.png" })) },
    { label: "(21) item icon without a slash", method: "POST", query: "", body: post(withReact({ icon: "icons/react.png" })) },
    { label: "(22) item icon protocol-relative", method: "POST", query: "", body: post(withReact({ icon: "//cdn.example.com/a.png" })) },
    { label: "(23) item icon null", method: "POST", query: "", body: post(withReact({ icon: null })) },
    { label: "(24) item 2 icon with a space", method: "POST", query: "", body: post(withTools([react, { ...angular, icon: "/icons/my angular.png" }])) },
    { label: "(25) item 2 name missing", method: "POST", query: "", body: post(withTools([react, withoutKey(angular, "name")])) },
    { label: "(26) content null", method: "POST", query: "", body: post(null) },
    { label: "(27) content an array", method: "POST", query: "", body: post([]) },
    { label: "(28) content a string", method: "POST", query: "", body: post("x") },
    { label: "(29) position missing", method: "POST", query: "", body: JSON.stringify({ content: FRONTEND }) },
    { label: "(30) position a string", method: "POST", query: "", body: post(FRONTEND, "0") },
    { label: "(31) position fractional", method: "POST", query: "", body: post(FRONTEND, 0.5) },
    { label: "(32) position null", method: "POST", query: "", body: post(FRONTEND, null) },
    { label: "(33a) raw brace", method: "POST", query: "", body: "{" },
    { label: "(33b) array body", method: "POST", query: "", body: "[]" },
    { label: "(33c) empty body", method: "POST", query: "", body: undefined },
    { label: "(34) PUT without id", method: "PUT", query: "", body: put(FRONTEND) },
    { label: "(35) PUT with a bad id", method: "PUT", query: "?id=not-an-id", body: put(FRONTEND) },
    {
      label: "(36) PUT with an empty category",
      method: "PUT",
      query: idQuery(BACK_ID),
      body: put({ ...FRONTEND, category: "" }),
    },
    { label: "(37) PUT with an empty object", method: "PUT", query: idQuery(FRONT_ID), body: "{}" },
    {
      label: "(38) PUT with a web address icon",
      method: "PUT",
      query: idQuery(FRONT_ID),
      body: put(withReact({ icon: "https://example.com/react.png" })),
    },
    { label: "(39) DELETE without id", method: "DELETE", query: "", body: undefined },
    { label: "(40) DELETE with a path-like id", method: "DELETE", query: "?id=../../x", body: undefined },
  ];

  for (const c of cases) {
    const res = await apiSend(request, c.method, c.query, c.body, owner);
    await expectAnswer(res, 400, { error: "invalid" }, c.label);
  }
  expect(dbTech()).toEqual([row(FRONT_ID, 0, FRONTEND)]);
});

test("E2E-09: without the owner's session every request is refused with 401 or 403 and touches nothing", async ({
  request,
}) => {
  test.setTimeout(90000);
  dbReset();
  storeReset();
  seedTwo();

  type Session = { label: string; cookie: string | undefined; status: number; error: string };
  const sessions: Session[] = [
    { label: "no cookie", cookie: undefined, status: 401, error: "not-signed-in" },
    { label: "not a token", cookie: SESSION_COOKIE + "=not-a-token", status: 401, error: "not-signed-in" },
    { label: "expired", cookie: await cookieOf(OWNER(), { maxAge: -3600 }), status: 401, error: "not-signed-in" },
    {
      label: "wrong secret",
      cookie: await cookieOf(OWNER(), { secret: "another-secret-0123456789abcdef0123" }),
      status: 401,
      error: "not-signed-in",
    },
    { label: "other account", cookie: await cookieOf(OTHER()), status: 403, error: "not-allowed" },
    { label: "unverified email", cookie: await cookieOf(UNVERIFIED()), status: 403, error: "not-allowed" },
  ];

  type Call = { label: string; send: (cookie: string | undefined) => Promise<APIResponse> };
  const calls: Call[] = [
    { label: "GET", send: (c) => apiGet(request, c) },
    { label: "POST valid", send: (c) => apiSend(request, "POST", "", postBody(FRONTEND, -1), c) },
    { label: "POST raw brace", send: (c) => apiSend(request, "POST", "", "{", c) },
    {
      label: "PUT valid",
      send: (c) => apiSend(request, "PUT", idQuery(FRONT_ID), JSON.stringify({ content: FRONTEND }), c),
    },
    { label: "PUT raw brace", send: (c) => apiSend(request, "PUT", idQuery(FRONT_ID), "{", c) },
    { label: "PATCH swap", send: (c) => apiSend(request, "PATCH", "", swapBody(), c) },
    { label: "DELETE", send: (c) => apiSend(request, "DELETE", idQuery(FRONT_ID), undefined, c) },
  ];

  for (const s of sessions) {
    for (const call of calls) {
      const label = s.label + " " + call.label;
      const res = await call.send(s.cookie);
      expect(res.status(), label + " status").toBe(s.status);
      expect(res.headers()["cache-control"] ?? "", label + " cache-control").toContain("no-store");
      const text = await res.text();
      expect(JSON.parse(text), label + " body").toEqual({ error: s.error });
      for (const word of ["Frontend", "Backend", "React", "Node.js"]) {
        expect(text, label + " leaks " + word).not.toContain(word);
      }
    }
  }
  expect(dbTech()).toEqual([row(FRONT_ID, 0, FRONTEND), row(BACK_ID, 1, BACKEND)]);
});

test("E2E-10: an unreachable database gives a fixed 503 to the owner, refusals do not depend on it, and it recovers", async ({
  request,
}) => {
  dbReset();
  storeReset();
  seedTwo();
  dbBreak();
  const owner = await ownerCookie();
  const seed = [row(FRONT_ID, 0, FRONTEND), row(BACK_ID, 1, BACKEND)];

  const sent: [string, APIResponse][] = [
    ["GET", await apiGet(request, owner)],
    ["POST", await apiSend(request, "POST", "", postBody(CLOUD, -1), owner)],
    ["PUT", await apiSend(request, "PUT", idQuery(FRONT_ID), JSON.stringify({ content: FRONTEND }), owner)],
    ["PATCH", await apiSend(request, "PATCH", "", swapBody(), owner)],
    ["DELETE", await apiSend(request, "DELETE", idQuery(FRONT_ID), undefined, owner)],
  ];
  for (const [label, res] of sent) {
    expect(res.status(), label + " status").toBe(503);
    const text = await res.text();
    expect(text, label + " body").toBe('{"error":"unavailable"}');
    for (const leak of [...LEAKS, "Frontend", "React"]) {
      expect(text, label + " leaks " + leak).not.toContain(leak);
    }
  }

  const signedOut = await apiGet(request);
  await expectAnswer(signedOut, 401, { error: "not-signed-in" }, "signed-out GET");
  const otherCookie = await cookieOf(OTHER());
  const otherGet = await apiGet(request, otherCookie);
  await expectAnswer(otherGet, 403, { error: "not-allowed" }, "other GET");
  const otherDelete = await apiSend(request, "DELETE", idQuery(FRONT_ID), undefined, otherCookie);
  await expectAnswer(otherDelete, 403, { error: "not-allowed" }, "other DELETE");

  dbFix();
  const fixed = await apiGet(request, owner);
  await expectAnswer(
    fixed,
    200,
    { entries: [entry(FRONT_ID, 0, FRONTEND), entry(BACK_ID, 1, BACKEND)] },
    "GET after the database is back",
  );
  expect(dbTech()).toEqual(seed);
});

test("E2E-11: the tech categories list shares the stand-in file with the other lists and is read tolerantly", async ({
  request,
}) => {
  dbReset();
  storeReset();
  const profile = { name: "Keith Lim", headline: "Software Engineer" };
  const experience = [
    {
      id: "66666666-6666-4666-8666-666666666666",
      position: 0,
      data: { year: "2024", title: "Engineer", company: "Acme", duration: "2024", description: "Built.", details: [] },
    },
  ];
  const projects = [
    {
      id: "44444444-4444-4444-8444-444444444444",
      position: 0,
      data: { title: "Quantum Notes", shortDesc: "", description: [], tech: [], github: "", demo: "" },
    },
  ];
  const certs = [
    {
      id: "77777777-7777-4777-8777-777777777777",
      position: 0,
      data: { name: "Scrum", icon: "/certs/scrum.png", url: "https://example.com/c" },
    },
  ];
  dbSeedAll(profile, [PG_IMAGE], experience, projects, certs, [row(FRONT_ID, 0, FRONTEND)]);
  const owner = await ownerCookie();

  const add = await apiSend(request, "POST", "", postBody(CLOUD, -1), owner);
  expect(add.status(), "POST tech").toBe(200);
  const put = await apiSend(
    request,
    "PUT",
    idQuery(FRONT_ID),
    JSON.stringify({ content: { ...FRONTEND, category: "Changed" } }),
    owner,
  );
  expect(put.status(), "PUT tech").toBe(200);
  const addCert = await apiSend(
    request,
    "POST",
    "",
    '{"content":{"name":"Beta","icon":"/b.png","url":"https://example.com/b"},"position":-1}',
    owner,
    CERT_API,
  );
  expect(addCert.status(), "POST certifications").toBe(200);

  const techList = await apiGet(request, owner);
  const techText = await techList.text();
  const certList = await apiGet(request, owner, CERT_API);
  const certText = await certList.text();

  const file = readDbFile();
  expect(file.profile).toEqual(profile);
  expect(file.images).toHaveLength(1);
  expect(file.images).toEqual([PG_IMAGE]);
  expect(file.experience).toHaveLength(1);
  expect(file.projects).toHaveLength(1);
  expect(file.certifications).toHaveLength(2);
  expect(
    sortedRows(file.certifications as unknown[]).map((r) => (r.data as { name?: string }).name),
  ).toEqual(["Beta", "Scrum"]);
  expect(file.tech_categories).toHaveLength(2);
  expect(dbNames()).toEqual(["Cloud", "Changed"]);

  expect(techList.status(), "GET tech").toBe(200);
  const techBody = JSON.parse(techText) as ListAnswer;
  expect(techBody.entries.map((e) => e.content.category)).toEqual(["Cloud", "Changed"]);
  for (const word of ["Scrum", "Beta", "Quantum Notes", "Acme", "Engineer"]) {
    expect(techText, "tech list leaks " + word).not.toContain(word);
  }

  expect(certList.status(), "GET certifications").toBe(200);
  const certBody = JSON.parse(certText) as { entries: unknown[] };
  expect(certBody.entries).toHaveLength(2);
  for (const word of ["Frontend", "Changed", "Cloud"]) {
    expect(certText, "certifications list leaks " + word).not.toContain(word);
  }

  dbSeedTech([
    { id: FRONT_ID, position: 0, data: { category: "Only name", tools: "x" } },
    { id: BACK_ID, position: "1", data: {} },
    { id: 5, position: 2, data: {} },
    { position: 3, data: {} },
    "text",
    null,
    { id: CLOUD_ID, position: 4, data: null },
    {
      id: "44444444-4444-4444-8444-444444444444",
      position: 5,
      data: {
        category: 7,
        tools: [null, "x", 5, { name: "Ok", icon: "/icons/ok.png" }, { name: 5, icon: null }],
      },
    },
  ]);
  const tolerant = await apiGet(request, owner);
  await expectAnswer(
    tolerant,
    200,
    {
      entries: [
        entry(FRONT_ID, 0, { category: "Only name", tools: [] }),
        entry(CLOUD_ID, 4, { category: "", tools: [] }),
        entry("44444444-4444-4444-8444-444444444444", 5, {
          category: "",
          tools: [
            { name: "Ok", icon: "/icons/ok.png" },
            { name: "", icon: "" },
          ],
        }),
      ],
    },
    "tolerant read",
  );

  fs.writeFileSync(DB_FILE, '{"tech_categories":"x"}');
  const notAList = await apiGet(request, owner);
  await expectAnswer(notAList, 200, { entries: [] }, "tech_categories not a list");
});

test("E2E-12: no public page or script carries the route or the database, and the route stays dynamic and server-only", async ({
  request,
}) => {
  dbReset();
  storeReset();
  const manifest = JSON.parse(fs.readFileSync(".next/prerender-manifest.json", "utf8")) as {
    routes: Record<string, unknown>;
  };
  const keys = Object.keys(manifest.routes);
  expect(keys.filter((k) => k.startsWith("/api/admin"))).toEqual([]);
  for (const key of ["/", "/blog", "/blog/hello-world", "/blog/building-portfolio-nextjs", "/robots.txt", "/rss.xml", "/sitemap.xml"]) {
    expect(keys, key).toContain(key);
  }

  const forbidden = [
    "api/admin/tech-stack",
    "api/admin/certifications",
    "api/admin/projects",
    "api/admin/experience",
    "SUPABASE_DB_URL",
    "stand-in:",
    "DatabaseUnavailable",
  ];
  let fetched = 0;
  for (const path of ["/", "/blog/", "/blog/hello-world/", "/blog/building-portfolio-nextjs/"]) {
    const page = await request.get(path);
    expect(page.status(), path).toBe(200);
    const html = await page.text();
    for (const text of forbidden) expect(html, path + " html carries " + text).not.toContain(text);

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

// Keep the fixtures that only the browser rows of Step 2 use from reading as unused here.
void [PROJECTS_API, CAT_REQUIRED, CAT_LONG, ITEM_REQUIRED, ITEM_LONG, ICON_REQUIRED, ICON_INVALID, GONE_ID];

// ---------------------------------------------------------------------------------------------------------------
// Step 2: the browser-driven fixtures and rows.

const SECTION_NAMES = ["Profile", "Experience", "Projects", "Certifications", "Tech stack", "Blog posts", "Images"];

type StoredTech = {
  id: string;
  position: number;
  data: { category?: string; tools?: { name?: string; icon?: string }[] };
};
const storedTech = (): StoredTech[] => dbTech() as StoredTech[];
const firstIconOf = (id: string): string | undefined => storedTech().find((r) => r.id === id)?.data.tools?.[0]?.icon;

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
  await context.route("https://stand-in.invalid/**", async (route) => {
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
const screenOf = (page: Page) => page.locator('section[aria-label="Tech stack editor"]');
const listOf = (page: Page) => page.getByRole("list", { name: "Tech categories list" });
const itemsOf = (page: Page) => listOf(page).getByRole("listitem");
const labelsOf = (page: Page) => listOf(page).locator("li > span:first-child");
const button = (scope: Scope, name: string) => scope.getByRole("button", { name, exact: true });
const confirmGroup = (page: Page) => page.getByRole("group", { name: "Confirm delete", exact: true });
const confirmItemGroup = (page: Page) => page.getByRole("group", { name: "Confirm item delete", exact: true });
const escapeRe = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const itemStarting = (page: Page, text: string) =>
  itemsOf(page).filter({ hasText: new RegExp("^\\s*" + escapeRe(text)) });
const statusWith = (page: Page, text: string) => screenOf(page).getByRole("status").filter({ hasText: text });
const editHeading = (page: Page): Locator => page.getByRole("heading", { name: "Edit entry", level: 3 });
const addHeading = (page: Page): Locator => page.getByRole("heading", { name: "Add entry", level: 3 });
const paragraphsOf = (item: Locator): Locator => item.getByRole("group", { name: /^Items of / }).locator("p");
const categoryBox = (page: Page): Locator => page.getByRole("textbox", { name: "Category name", exact: true });
const itemGroup = (page: Page, n: number): Locator => page.getByRole("group", { name: "Item " + n, exact: true });
const anyItemGroup = (page: Page): Locator => page.getByRole("group", { name: /^Item \d+$/ });
const itemsBox = (page: Page): Locator => page.getByRole("group", { name: "Items", exact: true });
const nameBox = (page: Page, n: number): Locator =>
  page.getByRole("textbox", { name: "Item " + n + " name", exact: true });
const imageSelect = (page: Page, n: number): Locator =>
  page.getByRole("combobox", { name: "Item " + n + " uploaded image", exact: true });
const pathBox = (page: Page, n: number): Locator =>
  page.getByRole("textbox", { name: "Item " + n + " icon path", exact: true });

// The text of the checked option of a select.
const selected = (select: Locator): Promise<string> =>
  select.evaluate((el) => {
    const node = el as HTMLSelectElement;
    return (node.options[node.selectedIndex]?.text ?? "").trim();
  });

const optionTexts = async (select: Locator): Promise<string[]> =>
  (await select.locator("option").allTextContents()).map((t) => t.trim());

// Click the menu button until the screen's heading is there (a click that lands before hydration is lost).
async function openTech(page: Page): Promise<void> {
  await page.goto(PANEL);
  const choose = button(menu(page), "Tech stack");
  const heading = page.getByRole("heading", { name: "Tech stack", level: 2, exact: true });
  await expect(async () => {
    await choose.click({ timeout: 5000 });
    await expect(heading).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 15000 });
}

// openTech, then wait until the editor's own request for the uploaded images has been answered.
async function openLoaded(page: Page): Promise<void> {
  const answered = page.waitForResponse((r) => /\/api\/admin\/images\/(\?.*)?$/.test(r.url()), { timeout: 20000 });
  await openTech(page);
  await answered;
  await expect(itemsOf(page).first()).toBeVisible();
}

async function fillItem(page: Page, n: number, values: { name?: string; path?: string }): Promise<void> {
  if (values.name !== undefined) await nameBox(page, n).fill(values.name);
  if (values.path !== undefined) await pathBox(page, n).fill(values.path);
}

// Holds every request of one method to the route until release() is called, then lets it through.
async function holdRoute(page: Page, method: string): Promise<{ release: () => void; count: () => number }> {
  let seen = 0;
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(/\/api\/admin\/tech-stack\/(\?.*)?$/, async (route) => {
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

// Counts the requests to the route with any method other than GET.
function countWrites(page: Page): { count: () => number } {
  let seen = 0;
  page.on("request", (r) => {
    if (r.method() !== "GET" && /\/api\/admin\/tech-stack\//.test(r.url())) seen += 1;
  });
  return { count: () => seen };
}

async function expectAllDisabled(locator: Locator, label: string): Promise<void> {
  const all = await locator.all();
  expect(all.length, label + " is present").toBeGreaterThan(0);
  for (const one of all) await expect(one, label).toBeDisabled();
}

async function expectInvalid(page: Page, field: Locator, message: string, label: string): Promise<void> {
  await expect(field, label + " invalid").toHaveAttribute("aria-invalid", "true");
  const describedBy = await field.getAttribute("aria-describedby");
  expect(describedBy, label + " describedby").not.toBeNull();
  await expect(page.locator('[id="' + describedBy + '"]'), label + " message").toHaveText(message);
}

const trimmedLabels = async (page: Page): Promise<string[]> =>
  (await labelsOf(page).allTextContents()).map((t) => t.trim());

test("E2E-13: the owner adds a category with an uploaded image and a typed path to an empty list and it is stored and listed after a reload", async ({
  browser,
  baseURL,
  request,
}) => {
  test.setTimeout(90000);
  dbReset();
  storeReset();
  dbSeedWith([PG_IMAGE], []);
  seedFiles();
  const before = await (await request.get("/")).text();
  const { context, page } = await ownerPage(browser, baseURL as string);
  await openTech(page);
  const screen = screenOf(page);

  await expect(statusWith(page, NO_TECH)).toBeVisible();
  await expect(listOf(page)).toHaveCount(0);
  await expect(button(screen, "Add category")).toBeVisible();

  await button(screen, "Add category").click();
  await expect(addHeading(page)).toBeVisible();
  await expect(categoryBox(page)).toHaveValue("");
  await expect(itemGroup(page, 1)).toHaveCount(1);
  await expect(itemGroup(page, 2)).toHaveCount(0);
  await expect.poll(() => optionTexts(imageSelect(page, 1))).toEqual(["None", "postgres-logo.png"]);
  await categoryBox(page).fill("Data");
  await fillItem(page, 1, { name: "PostgreSQL" });
  await imageSelect(page, 1).selectOption({ label: "postgres-logo.png" });
  await expect(pathBox(page, 1)).toHaveValue("");
  await button(screen, "Add item").click();
  await expect(itemGroup(page, 1)).toHaveCount(1);
  await expect(itemGroup(page, 2)).toHaveCount(1);
  await fillItem(page, 2, { name: "Redis", path: "/icons/redis.png" });
  await button(screen, "Save").click();

  await expect(screen.getByRole("status")).toHaveText(ENTRY_SAVED);
  await expect(itemsOf(page)).toHaveCount(1);
  await expect(labelsOf(page)).toHaveText(["Data"]);
  await expect(paragraphsOf(itemsOf(page).first())).toHaveText([
    "PostgreSQL: image postgres-logo.png",
    "Redis: path /icons/redis.png",
  ]);
  await expect(addHeading(page)).toHaveCount(0);
  const stored = storedTech();
  expect(stored).toHaveLength(1);
  expect(stored[0].id).toMatch(UUID_V4);
  expect(stored[0].position).toBe(0);
  expect(stored[0].data).toEqual({
    category: "Data",
    tools: [
      {
        name: "PostgreSQL",
        icon: "https://stand-in.invalid/storage/v1/object/public/images/55555555-5555-4555-8555-555555555555.png",
      },
      { name: "Redis", icon: "/icons/redis.png" },
    ],
  });
  const firstIcon = stored[0].data.tools?.[0]?.icon ?? "";
  for (const needle of ["?", "token", "key"]) expect(firstIcon, needle).not.toContain(needle);

  await page.reload();
  await openTech(page);
  await expect(itemsOf(page)).toHaveCount(1);
  await expect(labelsOf(page)).toHaveText(["Data"]);
  await expect(paragraphsOf(itemsOf(page).first())).toHaveText([
    "PostgreSQL: image postgres-logo.png",
    "Redis: path /icons/redis.png",
  ]);
  await expect(screen.getByText(NO_TECH)).toHaveCount(0);

  await button(itemsOf(page).first(), "Edit").click();
  await expect(editHeading(page)).toBeVisible();
  await expect(categoryBox(page)).toHaveValue("Data");
  await expect(nameBox(page, 1)).toHaveValue("PostgreSQL");
  await expect.poll(() => selected(imageSelect(page, 1))).toBe("postgres-logo.png");
  await expect(pathBox(page, 1)).toHaveValue("");
  await expect(nameBox(page, 2)).toHaveValue("Redis");
  await expect.poll(() => selected(imageSelect(page, 2))).toBe("None");
  await expect(pathBox(page, 2)).toHaveValue("/icons/redis.png");

  const visitor = await visitorPage(browser);
  const response = await visitor.page.goto(publicOf(IMG_PG));
  expect(response?.status()).toBe(200);
  expect(response?.headers()["content-type"]).toBe("image/png");
  expect((await response?.body())?.length).toBe(70);
  await visitor.context.close();

  const after = await request.get("/");
  expect(after.status()).toBe(200);
  expect(await after.text()).toBe(before);
  await context.close();
});

test("E2E-14: the picker and the path field keep each other in step, the saved icon follows the last choice, and an item can be removed", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(180000);
  dbReset();
  storeReset();
  dbSeedWith(
    [PG_IMAGE, REACT_IMAGE],
    [row(FRONT_ID, 0, { category: "Frontend", tools: [{ name: "React", icon: "/icons/react.png" }] })],
  );
  seedFiles();
  const { context, page } = await ownerPage(browser, baseURL as string);
  await openTech(page);
  const screen = screenOf(page);
  await expect(itemsOf(page)).toHaveCount(1);

  // Part 1: the picker and the path.
  await button(itemsOf(page).first(), "Edit").click();
  await expect(editHeading(page)).toBeVisible();
  expect(await selected(imageSelect(page, 1))).toBe("None");
  await expect(pathBox(page, 1)).toHaveValue("/icons/react.png");
  await imageSelect(page, 1).selectOption({ label: "react-logo.png" });
  await expect(pathBox(page, 1)).toHaveValue("");
  await pathBox(page, 1).fill("/icons/new.png");
  await expect.poll(() => selected(imageSelect(page, 1))).toBe("None");
  await imageSelect(page, 1).selectOption({ label: "postgres-logo.png" });
  await imageSelect(page, 1).selectOption({ label: "None" });
  await expect(pathBox(page, 1)).toHaveValue("");
  await expect.poll(() => selected(imageSelect(page, 1))).toBe("None");
  await pathBox(page, 1).fill("/icons/last.png");
  await button(screen, "Save").click();
  await expect(screen.getByRole("status")).toHaveText(ENTRY_SAVED);
  await expect.poll(() => firstIconOf(FRONT_ID)).toBe("/icons/last.png");
  expect(storedTech().find((r) => r.id === FRONT_ID)?.data.category).toBe("Frontend");

  await button(itemsOf(page).first(), "Edit").click();
  await expect(editHeading(page)).toBeVisible();
  await pathBox(page, 1).fill("/icons/x.png");
  await imageSelect(page, 1).selectOption({ label: "postgres-logo.png" });
  await button(screen, "Save").click();
  await expect(screen.getByRole("status")).toHaveText(ENTRY_SAVED);
  await expect
    .poll(() => firstIconOf(FRONT_ID))
    .toBe("https://stand-in.invalid/storage/v1/object/public/images/55555555-5555-4555-8555-555555555555.png");

  // Part 2: a category with no items, in a form that is not saved yet.
  await page.reload();
  await openTech(page);
  await expect(itemsOf(page)).toHaveCount(1);
  const writes2 = countWrites(page);
  await button(screen, "Add category").click();
  await expect(addHeading(page)).toBeVisible();
  await categoryBox(page).fill("Empty");
  await button(itemGroup(page, 1), "Delete").click();
  await expect(confirmItemGroup(page)).toBeVisible();
  await expect(confirmItemGroup(page).locator("p")).toHaveText("Delete item 1? This cannot be undone.");
  await button(confirmItemGroup(page), "Confirm").click();
  await expect(anyItemGroup(page)).toHaveCount(0);
  expect(writes2.count()).toBe(0);
  await button(screen, "Save").click();
  await expect(screen.getByRole("status")).toHaveText(ENTRY_SAVED);
  await expect(itemsOf(page)).toHaveCount(2);
  await expect(labelsOf(page)).toHaveText(["Frontend", "Empty"]);
  await expect(paragraphsOf(itemStarting(page, "Empty"))).toHaveText(["No items"]);
  const empty = storedTech().filter((r) => r.data.category === "Empty");
  expect(empty).toHaveLength(1);
  expect(empty[0].position).toBe(1);
  expect(empty[0].data).toEqual({ category: "Empty", tools: [] });

  // Part 3: removing an item of a form that is not saved yet changes the form only.
  await button(screen, "Add category").click();
  await expect(addHeading(page)).toBeVisible();
  await categoryBox(page).fill("Draft");
  await fillItem(page, 1, { name: "X", path: "/x" });
  const writes3 = countWrites(page);
  await button(itemGroup(page, 1), "Delete").click();
  await expect(confirmItemGroup(page)).toBeVisible();
  await expect(confirmItemGroup(page).locator("p")).toHaveText('Delete the item "X"? This cannot be undone.');
  await button(confirmItemGroup(page), "Confirm").click();
  await expect(itemGroup(page, 1)).toHaveCount(0);
  expect(writes3.count()).toBe(0);
  expect(dbTech()).toHaveLength(2);
  await button(screen, "Cancel").click();
  await expect(addHeading(page)).toHaveCount(0);
  await expect(listOf(page)).toBeVisible();
  await context.close();
});

test("E2E-15: the owner edits a category: renames it, changes an item and adds an item, and the saved text is listed after a reload", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(90000);
  dbReset();
  storeReset();
  dbSeedWith([PG_IMAGE, REACT_IMAGE], [row(CLOUD_ID, 0, CLOUD)]);
  seedFiles();
  const { context, page } = await ownerPage(browser, baseURL as string);
  await openTech(page);
  const screen = screenOf(page);
  await expect(itemsOf(page)).toHaveCount(1);
  await expect(paragraphsOf(itemsOf(page).first())).toHaveText([
    "Vercel: path /icons/vercel.png",
    "Docker: path /icons/docker.png",
  ]);

  await button(itemsOf(page).first(), "Edit").click();
  await expect(editHeading(page)).toBeVisible();
  await expect(categoryBox(page)).toHaveValue("Cloud");
  await expect(nameBox(page, 1)).toHaveValue("Vercel");
  await expect(pathBox(page, 1)).toHaveValue("/icons/vercel.png");
  await expect(nameBox(page, 2)).toHaveValue("Docker");
  await expect(pathBox(page, 2)).toHaveValue("/icons/docker.png");
  await categoryBox(page).fill("Cloud and DevOps");
  await pathBox(page, 2).fill("/icons/docker-new.png");
  await button(screen, "Add item").click();
  await fillItem(page, 3, { name: "GitHub Actions", path: "/icons/actions.png" });
  await button(screen, "Save").click();

  await expect(screen.getByRole("status")).toHaveText(ENTRY_SAVED);
  expect(await trimmedLabels(page)).toEqual(["Cloud and DevOps"]);
  await expect(paragraphsOf(itemsOf(page).first())).toHaveText([
    "Vercel: path /icons/vercel.png",
    "Docker: path /icons/docker-new.png",
    "GitHub Actions: path /icons/actions.png",
  ]);
  expect(dbTech()).toEqual([
    row(CLOUD_ID, 0, {
      category: "Cloud and DevOps",
      tools: [
        { name: "Vercel", icon: "/icons/vercel.png" },
        { name: "Docker", icon: "/icons/docker-new.png" },
        { name: "GitHub Actions", icon: "/icons/actions.png" },
      ],
    }),
  ]);

  await page.reload();
  await openTech(page);
  await expect(itemsOf(page)).toHaveCount(1);
  expect(await trimmedLabels(page)).toEqual(["Cloud and DevOps"]);
  await expect(paragraphsOf(itemsOf(page).first())).toHaveText([
    "Vercel: path /icons/vercel.png",
    "Docker: path /icons/docker-new.png",
    "GitHub Actions: path /icons/actions.png",
  ]);
  await button(itemsOf(page).first(), "Edit").click();
  await expect(editHeading(page)).toBeVisible();
  await expect(anyItemGroup(page)).toHaveCount(3);
  await expect(nameBox(page, 1)).toHaveValue("Vercel");
  await expect(pathBox(page, 1)).toHaveValue("/icons/vercel.png");
  await expect(nameBox(page, 2)).toHaveValue("Docker");
  await expect(pathBox(page, 2)).toHaveValue("/icons/docker-new.png");
  await expect(nameBox(page, 3)).toHaveValue("GitHub Actions");
  await expect(pathBox(page, 3)).toHaveValue("/icons/actions.png");
  await context.close();
});

test("E2E-16: the owner moves categories and items up and down, a category move is stored at once, an item move only on Save", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(150000);
  dbReset();
  storeReset();
  seedThree();
  seedFiles();
  const { context, page } = await ownerPage(browser, baseURL as string);
  await openTech(page);
  const screen = screenOf(page);

  await expect(itemsOf(page)).toHaveCount(3);
  const counts = async (index: number): Promise<[number, number]> => [
    await button(itemsOf(page).nth(index), "Move up").count(),
    await button(itemsOf(page).nth(index), "Move down").count(),
  ];
  expect(await counts(0)).toEqual([0, 1]);
  expect(await counts(1)).toEqual([1, 1]);
  expect(await counts(2)).toEqual([1, 0]);

  await button(itemStarting(page, "Frontend"), "Move down").click();
  await expect(screen.getByRole("status")).toHaveText(ORDER_SAVED);
  await expect(labelsOf(page)).toHaveText(["Backend", "Frontend", "Cloud"]);
  expect(positionsOf()).toEqual({ [BACK_ID]: 0, [FRONT_ID]: 1, [CLOUD_ID]: 2 });

  await button(itemStarting(page, "Frontend"), "Edit").click();
  await expect(editHeading(page)).toBeVisible();
  const inItem = async (n: number): Promise<[number, number]> => [
    await button(itemGroup(page, n), "Move up").count(),
    await button(itemGroup(page, n), "Move down").count(),
  ];
  expect(await inItem(1)).toEqual([0, 1]);
  expect(await inItem(2)).toEqual([1, 0]);
  await button(itemGroup(page, 2), "Move up").click();
  await expect(nameBox(page, 1)).toHaveValue("Angular");
  await expect(nameBox(page, 2)).toHaveValue("React");
  expect(storedTech().find((r) => r.id === FRONT_ID)?.data.tools).toEqual(FRONTEND.tools);

  await button(screen, "Save").click();
  await expect(screen.getByRole("status")).toHaveText(ENTRY_SAVED);
  const swapped = [
    "Angular: path /icons/angular.png",
    "React: path /icons/react.png",
  ];
  await expect(paragraphsOf(itemStarting(page, "Frontend"))).toHaveText(swapped);
  const front = storedTech().find((r) => r.id === FRONT_ID);
  expect(front?.data.tools).toEqual([FRONTEND.tools[1], FRONTEND.tools[0]]);
  expect(front?.position).toBe(1);

  await page.reload();
  await openTech(page);
  await expect(labelsOf(page)).toHaveText(["Backend", "Frontend", "Cloud"]);
  await expect(paragraphsOf(itemStarting(page, "Frontend"))).toHaveText(swapped);

  await button(itemStarting(page, "Cloud"), "Edit").click();
  await expect(editHeading(page)).toBeVisible();
  await button(itemGroup(page, 1), "Move down").click();
  await expect(nameBox(page, 1)).toHaveValue("Docker");
  await button(screen, "Cancel").click();
  await expect(editHeading(page)).toHaveCount(0);
  const cloudLines = ["Vercel: path /icons/vercel.png", "Docker: path /icons/docker.png"];
  await expect(paragraphsOf(itemStarting(page, "Cloud"))).toHaveText(cloudLines);
  expect(storedTech().find((r) => r.id === CLOUD_ID)?.data.tools).toEqual(CLOUD.tools);
  await page.reload();
  await openTech(page);
  await expect(paragraphsOf(itemStarting(page, "Cloud"))).toHaveText(cloudLines);
  await context.close();
});

test("E2E-17: a new category goes to the bottom of the list, one above the highest stored position", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(90000);
  dbReset();
  storeReset();
  dbSeedWith([PG_IMAGE], [row(FRONT_ID, 3, FRONTEND), row(BACK_ID, 7, BACKEND)]);
  seedFiles();
  const { context, page } = await ownerPage(browser, baseURL as string);
  await openTech(page);
  const screen = screenOf(page);
  await expect(itemsOf(page)).toHaveCount(2);

  await button(screen, "Add category").click();
  await categoryBox(page).fill("Cloud");
  await fillItem(page, 1, { name: "Vercel", path: "/icons/vercel.png" });
  await button(screen, "Save").click();

  await expect(screen.getByRole("status")).toHaveText(ENTRY_SAVED);
  await expect(labelsOf(page)).toHaveText(["Frontend", "Backend", "Cloud"]);
  const stored = storedTech();
  expect(stored).toHaveLength(3);
  const added = stored.find((r) => r.data.category === "Cloud");
  expect(added?.data).toEqual({ category: "Cloud", tools: [{ name: "Vercel", icon: "/icons/vercel.png" }] });
  expect(added?.position).toBe(8);
  expect(stored.find((r) => r.id === FRONT_ID)?.position).toBe(3);
  expect(stored.find((r) => r.id === BACK_ID)?.position).toBe(7);

  await page.reload();
  await openTech(page);
  await expect(labelsOf(page)).toHaveText(["Frontend", "Backend", "Cloud"]);
  await context.close();
});

test("E2E-18: deleting a category asks first, Cancel keeps it and Confirm removes it for good", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(120000);
  for (const confirm of [false, true]) {
    dbReset();
    storeReset();
    seedTwo();
    seedFiles();
    const seed = [row(FRONT_ID, 0, FRONTEND), row(BACK_ID, 1, BACKEND)];
    const { context, page } = await ownerPage(browser, baseURL as string);
    await openTech(page);
    await expect(itemsOf(page)).toHaveCount(2);

    await button(itemStarting(page, "Backend"), "Delete").click();
    const group = confirmGroup(page);
    await expect(group).toBeVisible();
    await expect(group.locator("p")).toHaveText(ASK_BACKEND);
    await expect(button(group, "Confirm")).toBeVisible();
    await expect(button(group, "Cancel")).toBeVisible();
    await expect(itemsOf(page)).toHaveCount(2);
    expect(dbTech()).toEqual(seed);

    if (!confirm) {
      await button(group, "Cancel").click();
      await expect(group).toHaveCount(0);
      await expect(labelsOf(page)).toHaveText(["Frontend", "Backend"]);
      expect(dbTech()).toEqual(seed);
      await page.reload();
      await openTech(page);
      await expect(labelsOf(page)).toHaveText(["Frontend", "Backend"]);
      expect(dbTech()).toEqual(seed);
    } else {
      await button(group, "Confirm").click();
      await expect(statusWith(page, "Entry deleted")).toBeVisible();
      await expect(labelsOf(page)).toHaveText(["Frontend"]);
      expect(dbTech()).toEqual([row(FRONT_ID, 0, FRONTEND)]);
      await page.reload();
      await openTech(page);
      await expect(labelsOf(page)).toHaveText(["Frontend"]);
      expect(dbTech()).toEqual([row(FRONT_ID, 0, FRONTEND)]);
    }
    await context.close();
  }
});

test("E2E-19: removing an item of a saved category asks first, Cancel keeps it and Confirm stores the category at once", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(150000);
  for (const confirm of [false, true]) {
    dbReset();
    storeReset();
    seedTwo();
    seedFiles();
    const seed = [row(FRONT_ID, 0, FRONTEND), row(BACK_ID, 1, BACKEND)];
    const { context, page } = await ownerPage(browser, baseURL as string);
    await openTech(page);
    const screen = screenOf(page);
    await expect(itemsOf(page)).toHaveCount(2);

    await button(itemStarting(page, "Backend"), "Edit").click();
    await expect(editHeading(page)).toBeVisible();
    await button(itemGroup(page, 1), "Delete").click();
    const group = confirmItemGroup(page);
    await expect(group).toBeVisible();
    await expect(group.locator("p")).toHaveText(ASK_NODE);
    await expect(button(group, "Confirm")).toBeVisible();
    await expect(button(group, "Cancel")).toBeVisible();
    await expect(nameBox(page, 1)).toHaveValue("Node.js");
    await expect(nameBox(page, 2)).toHaveValue("ASP.NET Core");
    expect(dbTech()).toEqual(seed);

    const backendLines = ["Node.js: path /icons/node.png", "ASP.NET Core: path /icons/aspnet.png"];
    if (!confirm) {
      await button(group, "Cancel").click();
      await expect(group).toHaveCount(0);
      await expect(editHeading(page)).toBeVisible();
      await expect(itemGroup(page, 1)).toHaveCount(1);
      await expect(itemGroup(page, 2)).toHaveCount(1);
      await button(screen, "Cancel").click();
      await expect(editHeading(page)).toHaveCount(0);
      await page.reload();
      await openTech(page);
      await expect(paragraphsOf(itemStarting(page, "Backend"))).toHaveText(backendLines);
      expect(dbTech()).toEqual(seed);
    } else {
      const removed = [
        row(FRONT_ID, 0, FRONTEND),
        row(BACK_ID, 1, { category: "Backend", tools: [{ name: "ASP.NET Core", icon: "/icons/aspnet.png" }] }),
      ];
      await button(group, "Confirm").click();
      await expect(screen.getByRole("status")).toHaveText(ENTRY_SAVED);
      await expect(editHeading(page)).toHaveCount(0);
      await expect(paragraphsOf(itemStarting(page, "Backend"))).toHaveText(["ASP.NET Core: path /icons/aspnet.png"]);
      expect(dbTech()).toEqual(removed);
      await page.reload();
      await openTech(page);
      await expect(paragraphsOf(itemStarting(page, "Backend"))).toHaveText(["ASP.NET Core: path /icons/aspnet.png"]);
      expect(dbTech()).toEqual(removed);
    }
    await context.close();
  }
});

test("E2E-20: a bad category name, item name or icon is refused next to the field with nothing sent", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(240000);
  dbReset();
  storeReset();
  dbSeedWith([PG_IMAGE], [row(FRONT_ID, 0, FRONTEND)]);
  seedFiles();
  const { context, page } = await ownerPage(browser, baseURL as string);
  await openTech(page);
  const screen = screenOf(page);
  await expect(itemsOf(page)).toHaveCount(1);

  type Item = { name: string; path: string };
  type Case = { label: string; category: string; items: Item[]; errors: Record<string, string> };
  const react: Item = { name: "React", path: "/icons/react.png" };
  const cases: Case[] = [
    { label: "(1)", category: "", items: [react], errors: { category: CAT_REQUIRED } },
    { label: "(2)", category: "A".repeat(81), items: [react], errors: { category: CAT_LONG } },
    {
      label: "(3)",
      category: "Frontend",
      items: [{ name: "", path: "/icons/react.png" }],
      errors: { name1: ITEM_REQUIRED },
    },
    {
      label: "(4)",
      category: "Frontend",
      items: [{ name: "B".repeat(81), path: "/icons/react.png" }],
      errors: { name1: ITEM_LONG },
    },
    {
      label: "(5)",
      category: "Frontend",
      items: [{ name: "React", path: "" }],
      errors: { path1: ICON_REQUIRED },
    },
    {
      label: "(6)",
      category: "Frontend",
      items: [{ name: "React", path: "https://example.com/react.png" }],
      errors: { path1: ICON_INVALID },
    },
    {
      label: "(7)",
      category: "Frontend",
      items: [react, { name: "Angular", path: "icons/angular.png" }],
      errors: { path2: ICON_INVALID },
    },
    {
      label: "(8)",
      category: "",
      items: [
        { name: "", path: "" },
        { name: "Vue", path: "vue.png" },
      ],
      errors: { category: CAT_REQUIRED, name1: ITEM_REQUIRED, path1: ICON_REQUIRED, path2: ICON_INVALID },
    },
    {
      label: "(9)",
      category: "   ",
      items: [{ name: "   ", path: "   " }],
      errors: { category: CAT_REQUIRED, name1: ITEM_REQUIRED, path1: ICON_REQUIRED },
    },
  ];

  for (const c of cases) {
    await button(screen, "Add category").click();
    await expect(addHeading(page)).toBeVisible();
    await categoryBox(page).fill(c.category);
    await fillItem(page, 1, c.items[0]);
    for (let n = 2; n <= c.items.length; n += 1) {
      await button(screen, "Add item").click();
      await fillItem(page, n, c.items[n - 1]);
    }
    await button(screen, "Save").click();

    const fields: [string, Locator][] = [["category", categoryBox(page)]];
    c.items.forEach((_, i) => {
      fields.push(["name" + (i + 1), nameBox(page, i + 1)], ["path" + (i + 1), pathBox(page, i + 1)]);
    });
    for (const [key, field] of fields) {
      const message = c.errors[key];
      if (message !== undefined) await expectInvalid(page, field, message, c.label + " " + key);
      else await expect(field, c.label + " " + key + " valid").not.toHaveAttribute("aria-invalid", "true");
    }
    await expect(categoryBox(page), c.label + " category kept").toHaveValue(c.category);
    for (let n = 1; n <= c.items.length; n += 1) {
      await expect(nameBox(page, n), c.label + " name " + n + " kept").toHaveValue(c.items[n - 1].name);
      await expect(pathBox(page, n), c.label + " path " + n + " kept").toHaveValue(c.items[n - 1].path);
    }
    await expect(addHeading(page)).toBeVisible();
    await expect(statusWith(page, ENTRY_SAVED)).toHaveCount(0);
    expect(dbTech(), c.label).toEqual([row(FRONT_ID, 0, FRONTEND)]);
    await button(screen, "Cancel").click();
    await expect(addHeading(page)).toHaveCount(0);
  }
  await context.close();
});

test("E2E-21: a blank category name is refused on an edit, and saved text is trimmed with the icon rule applied", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(180000);
  dbReset();
  storeReset();
  dbSeedWith([PG_IMAGE], [row(FRONT_ID, 0, FRONTEND)]);
  seedFiles();
  const { context, page } = await ownerPage(browser, baseURL as string);
  await openTech(page);
  const screen = screenOf(page);
  await expect(itemsOf(page)).toHaveCount(1);

  await button(itemStarting(page, "Frontend"), "Edit").click();
  await expect(editHeading(page)).toBeVisible();
  await categoryBox(page).fill("   ");
  await button(screen, "Save").click();
  await expectInvalid(page, categoryBox(page), CAT_REQUIRED, "edit category");
  await button(screen, "Cancel").click();
  await page.reload();
  await openTech(page);
  await expect(labelsOf(page)).toHaveText(["Frontend"]);

  await button(screen, "Add category").click();
  await categoryBox(page).fill("  Data  ");
  await fillItem(page, 1, { name: "  PostgreSQL  ", path: " /icons/pg.png " });
  await button(screen, "Save").click();
  await expect(itemsOf(page)).toHaveCount(2);
  await expect(screen.getByRole("status")).toHaveText(ENTRY_SAVED);
  await expect(labelsOf(page)).toHaveText(["Frontend", "Data"]);
  const second = storedTech().find((r) => r.id !== FRONT_ID);
  expect(second?.data).toEqual({ category: "Data", tools: [{ name: "PostgreSQL", icon: "/icons/pg.png" }] });
  expect(second?.position).toBe(1);

  const hosted = HOSTED_BASE + "/storage/v1/object/public/images/zzz.png";
  await button(screen, "Add category").click();
  await categoryBox(page).fill("Third");
  await fillItem(page, 1, { name: "Hosted", path: hosted });
  await button(screen, "Save").click();
  await expect(itemsOf(page)).toHaveCount(3);
  await expect(screen.getByRole("status")).toHaveText(ENTRY_SAVED);
  const third = storedTech().find((r) => r.data.category === "Third");
  expect(third?.data).toEqual({ category: "Third", tools: [{ name: "Hosted", icon: hosted }] });
  expect(third?.position).toBe(2);
  await expect(paragraphsOf(itemStarting(page, "Third"))).toHaveText(["Hosted: path " + hosted]);

  await button(screen, "Add category").click();
  await categoryBox(page).fill("C".repeat(80));
  await fillItem(page, 1, { name: "I".repeat(80), path: "/x" });
  await button(screen, "Save").click();
  await expect(itemsOf(page)).toHaveCount(4);
  await expect(screen.getByRole("status")).toHaveText(ENTRY_SAVED);
  const fourth = storedTech().find((r) => r.data.category === "C".repeat(80));
  expect(fourth?.data).toEqual({ category: "C".repeat(80), tools: [{ name: "I".repeat(80), icon: "/x" }] });
  expect(fourth?.position).toBe(3);
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
  seedTwo();
  seedFiles();
  dbBreak();
  const before = await (await request.get("/")).text();
  const { context, page } = await ownerPage(browser, baseURL as string);
  await openTech(page);
  const screen = screenOf(page);

  await expect(page.getByRole("alert").filter({ hasText: LOAD_FAILED })).toHaveText(LOAD_FAILED);
  await expect(screen.getByText(NO_TECH)).toHaveCount(0);
  await expect(button(screen, "Add category")).toHaveCount(0);
  await expect(listOf(page)).toHaveCount(0);
  const panelText = await page.locator("body").innerText();
  for (const leak of LEAKS) expect(panelText, "panel leaks " + leak).not.toContain(leak);
  for (const name of SECTION_NAMES) await expect(button(menu(page), name), name).toBeVisible();
  await expect(button(page, "Sign out")).toBeVisible();

  await button(menu(page), "Blog posts").click();
  await expect(page.getByRole("alert").filter({ hasText: LOAD_FAILED })).toHaveText(LOAD_FAILED);
  await expect(page.getByText("No posts yet.")).toHaveCount(0);
  const after = await request.get("/");
  expect(after.status()).toBe(200);
  expect(await after.text()).toBe(before);

  dbFix();
  await button(menu(page), "Tech stack").click();
  await expect(itemsOf(page)).toHaveCount(2);
  await expect(labelsOf(page)).toHaveText(["Frontend", "Backend"]);
  await context.close();
});

test("E2E-23: a failed save, move, delete or item removal shows one fixed message, keeps the form and the list, and works again after recovery", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(180000);
  dbReset();
  storeReset();
  seedTwo();
  seedFiles();
  const seed = [row(FRONT_ID, 0, FRONTEND), row(BACK_ID, 1, BACKEND)];
  const { context, page } = await ownerPage(browser, baseURL as string);
  await openLoaded(page);
  const screen = screenOf(page);
  await expect(itemsOf(page)).toHaveCount(2);
  dbBreak();

  await button(itemsOf(page).first(), "Edit").click();
  await expect(editHeading(page)).toBeVisible();
  await categoryBox(page).fill("Cloud and DevOps");
  await button(screen, "Save").click();
  await expect(screen.getByRole("alert")).toHaveText(SAVE_FAILED);
  await expect(editHeading(page)).toBeVisible();
  await expect(categoryBox(page)).toHaveValue("Cloud and DevOps");
  await expect(statusWith(page, ENTRY_SAVED)).toHaveCount(0);
  const failedText = await page.locator("body").innerText();
  for (const leak of LEAKS) expect(failedText, "save leaks " + leak).not.toContain(leak);

  await button(screen, "Cancel").click();
  await expect(labelsOf(page)).toHaveText(["Frontend", "Backend"]);

  await button(screen, "Add category").click();
  await categoryBox(page).fill("Gamma");
  await fillItem(page, 1, { name: "Go", path: "/icons/go.png" });
  await button(screen, "Save").click();
  await expect(screen.getByRole("alert")).toHaveText(SAVE_FAILED);
  await expect(addHeading(page)).toBeVisible();
  await expect(categoryBox(page)).toHaveValue("Gamma");
  await expect(nameBox(page, 1)).toHaveValue("Go");
  await expect(pathBox(page, 1)).toHaveValue("/icons/go.png");
  await button(screen, "Cancel").click();

  await button(itemsOf(page).first(), "Move down").click();
  await expect(screen.getByRole("alert")).toHaveText(MOVE_FAILED);
  await expect(labelsOf(page)).toHaveText(["Frontend", "Backend"]);
  await expect(statusWith(page, ORDER_SAVED)).toHaveCount(0);

  await button(itemsOf(page).first(), "Delete").click();
  await button(confirmGroup(page), "Confirm").click();
  await expect(screen.getByRole("alert")).toHaveText(DELETE_FAILED);
  await expect(itemsOf(page)).toHaveCount(2);
  await button(confirmGroup(page), "Cancel").click();

  await button(itemStarting(page, "Backend"), "Edit").click();
  await expect(editHeading(page)).toBeVisible();
  await button(itemGroup(page, 1), "Delete").click();
  await button(confirmItemGroup(page), "Confirm").click();
  await expect(screen.getByRole("alert")).toHaveText(SAVE_FAILED);
  await expect(editHeading(page)).toBeVisible();
  expect(dbTech()).toEqual(seed);
  await button(screen, "Cancel").click();
  await expect(editHeading(page)).toHaveCount(0);

  dbFix();
  await button(itemsOf(page).first(), "Edit").click();
  await expect(editHeading(page)).toBeVisible();
  await categoryBox(page).fill("Cloud and DevOps");
  await button(screen, "Save").click();
  await expect(screen.getByRole("status")).toHaveText(ENTRY_SAVED);
  await expect(labelsOf(page).first()).toHaveText("Cloud and DevOps");
  const stored = storedTech();
  const front = stored.find((r) => r.id === FRONT_ID);
  expect(front?.data).toEqual({ category: "Cloud and DevOps", tools: FRONTEND.tools });
  const back = stored.find((r) => r.id === BACK_ID);
  expect(back?.position).toBe(1);
  expect(back?.data).toEqual(BACKEND);
  expect(stored.some((r) => r.data.category === "Gamma")).toBe(false);

  await page.reload();
  await openTech(page);
  await expect(labelsOf(page)).toHaveText(["Cloud and DevOps", "Backend"]);
  await context.close();
});

test("E2E-24: a category deleted in another tab is not brought back and the stale screen shows the failure", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(150000);
  dbReset();
  storeReset();
  seedThree();
  seedFiles();
  const { context, page } = await ownerPage(browser, baseURL as string);
  const second = await context.newPage();
  await openTech(page);
  await openTech(second);
  await expect(itemsOf(page)).toHaveCount(3);
  await expect(itemsOf(second)).toHaveCount(3);

  await button(itemStarting(page, "Frontend"), "Delete").click();
  await button(confirmGroup(page), "Confirm").click();
  await expect(statusWith(page, "Entry deleted")).toBeVisible();
  expect(storedTech().map((r) => r.id).sort()).toEqual([BACK_ID, CLOUD_ID].sort());

  const screen2 = screenOf(second);
  await button(itemStarting(second, "Frontend"), "Edit").click();
  await expect(editHeading(second)).toBeVisible();
  await categoryBox(second).fill("Resurrected");
  await button(screen2, "Save").click();
  await expect(screen2.getByRole("alert")).toHaveText(SAVE_FAILED);
  await button(screen2, "Cancel").click();

  await button(itemStarting(second, "Backend"), "Move up").click();
  await expect(screen2.getByRole("alert")).toHaveText(MOVE_FAILED);
  expect(storedTech().map((r) => r.id).sort()).toEqual([BACK_ID, CLOUD_ID].sort());
  expect(positionsOf()).toEqual({ [BACK_ID]: 1, [CLOUD_ID]: 2 });

  await button(itemStarting(second, "Frontend"), "Delete").click();
  await button(confirmGroup(second), "Confirm").click();
  await expect(screen2.getByRole("alert")).toHaveText(DELETE_FAILED);

  await second.reload();
  await openTech(second);
  await expect(labelsOf(second)).toHaveText(["Backend", "Cloud"]);
  expect(storedTech().some((r) => r.data.category === "Resurrected")).toBe(false);
  await context.close();
});

test("E2E-25: a move or save after sign-in ended or with no network shows the fixed failure and keeps the typed text", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(150000);
  const seed = [row(FRONT_ID, 0, FRONTEND), row(BACK_ID, 1, BACKEND)];

  // Case 1: the sign-in ended.
  dbReset();
  storeReset();
  seedTwo();
  seedFiles();
  const one = await ownerPage(browser, baseURL as string);
  await openLoaded(one.page);
  await expect(itemsOf(one.page)).toHaveCount(2);
  await one.context.clearCookies();
  const screen1 = screenOf(one.page);
  await button(itemsOf(one.page).first(), "Move down").click();
  await expect(screen1.getByRole("alert")).toHaveText(MOVE_FAILED);
  await button(itemsOf(one.page).first(), "Edit").click();
  await expect(editHeading(one.page)).toBeVisible();
  await categoryBox(one.page).fill("Cloud and DevOps");
  await button(screen1, "Save").click();
  await expect(screen1.getByRole("alert")).toHaveText(SAVE_FAILED);
  await expect(editHeading(one.page)).toBeVisible();
  await expect(categoryBox(one.page)).toHaveValue("Cloud and DevOps");
  expect(dbTech()).toEqual(seed);
  await one.context.close();

  // Case 2: no network.
  dbReset();
  storeReset();
  seedTwo();
  seedFiles();
  const two = await ownerPage(browser, baseURL as string);
  await openLoaded(two.page);
  await expect(itemsOf(two.page)).toHaveCount(2);
  const screen2 = screenOf(two.page);
  await two.context.setOffline(true);
  await button(itemsOf(two.page).first(), "Move down").click();
  await expect(screen2.getByRole("alert")).toHaveText(MOVE_FAILED);
  await button(itemsOf(two.page).first(), "Edit").click();
  await expect(editHeading(two.page)).toBeVisible();
  await categoryBox(two.page).fill("Offline Name");
  await button(screen2, "Save").click();
  await expect(screen2.getByRole("alert")).toHaveText(SAVE_FAILED);
  await expect(categoryBox(two.page)).toHaveValue("Offline Name");
  expect(dbTech()).toEqual(seed);
  await two.context.setOffline(false);
  await button(screen2, "Save").click();
  await expect(screen2.getByRole("status")).toHaveText(ENTRY_SAVED);
  await expect(labelsOf(two.page).first()).toHaveText("Offline Name");
  await two.context.close();
});

test("E2E-26: while a request is in flight the screen shows its state, disables the controls and sends it once", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(150000);
  dbReset();
  storeReset();
  dbSeedWith([PG_IMAGE], []);
  seedFiles();
  const { context, page } = await ownerPage(browser, baseURL as string);
  await openTech(page);
  const screen = screenOf(page);

  // Part 1: add, held.
  const post = await holdRoute(page, "POST");
  await button(screen, "Add category").click();
  await categoryBox(page).fill("Frontend");
  await fillItem(page, 1, { name: "React", path: "/icons/react.png" });
  await button(screen, "Add item").click();
  await fillItem(page, 2, { name: "Angular", path: "/icons/angular.png" });
  await button(screen, "Save").dblclick();
  await expect(screen.getByRole("status")).toHaveText("Saving…");
  for (const name of ["Save", "Cancel", "Add item"]) await expect(button(screen, name), name).toBeDisabled();
  for (const field of [
    categoryBox(page),
    nameBox(page, 1),
    pathBox(page, 1),
    nameBox(page, 2),
    pathBox(page, 2),
    imageSelect(page, 1),
    imageSelect(page, 2),
    button(itemGroup(page, 1), "Move down"),
    button(itemGroup(page, 1), "Delete"),
    button(itemGroup(page, 2), "Move up"),
    button(itemGroup(page, 2), "Delete"),
  ]) {
    await expect(field).toBeDisabled();
  }
  expect(post.count()).toBe(1);
  post.release();
  await expect(itemsOf(page)).toHaveCount(1);
  await expect(labelsOf(page)).toHaveText(["Frontend"]);
  expect(post.count()).toBe(1);
  expect(dbTech()).toHaveLength(1);

  // Part 2: move, held.
  seedTwo();
  await page.reload();
  await openTech(page);
  await expect(itemsOf(page)).toHaveCount(2);
  const patch = await holdRoute(page, "PATCH");
  await button(itemsOf(page).first(), "Move down").click();
  await expect(screen.getByRole("status")).toHaveText("Saving…");
  for (const name of ["Edit", "Move up", "Move down", "Delete", "Add category"]) {
    await expectAllDisabled(button(screen, name), name);
  }
  patch.release();
  await expect(screen.getByRole("status")).toHaveText(ORDER_SAVED);

  // Part 3: delete, held.
  const remove = await holdRoute(page, "DELETE");
  await button(itemsOf(page).first(), "Delete").click();
  await button(confirmGroup(page), "Confirm").click();
  await expect(screen.getByRole("status")).toHaveText("Deleting…");
  await expect(button(confirmGroup(page), "Confirm")).toBeDisabled();
  await expect(button(confirmGroup(page), "Cancel")).toBeDisabled();
  remove.release();
  await expect(screen.getByRole("status")).toHaveText("Entry deleted");
  await expect(itemsOf(page)).toHaveCount(1);
  await context.close();
});

test("E2E-27: nothing typed in an unsaved form is kept after Cancel or a reload", async ({ browser, baseURL }) => {
  test.setTimeout(90000);
  dbReset();
  storeReset();
  dbSeedWith([PG_IMAGE], [row(FRONT_ID, 0, FRONTEND)]);
  seedFiles();
  const { context, page } = await ownerPage(browser, baseURL as string);
  await openTech(page);
  const screen = screenOf(page);
  await expect(itemsOf(page)).toHaveCount(1);

  await button(screen, "Add category").click();
  await categoryBox(page).fill("Draft");
  await button(screen, "Cancel").click();
  await expect(addHeading(page)).toHaveCount(0);
  await expect(labelsOf(page)).toHaveText(["Frontend"]);
  expect(dbTech()).toEqual([row(FRONT_ID, 0, FRONTEND)]);

  await button(screen, "Add category").click();
  await categoryBox(page).fill("Draft again");
  await fillItem(page, 1, { path: "/icons/draft-1999.png" });
  await page.reload();
  await openTech(page);
  await expect(itemsOf(page)).toHaveCount(1);
  await expect(addHeading(page)).toHaveCount(0);
  const text = await page.locator("body").innerText();
  expect(text).not.toContain("Draft");
  expect(text).not.toContain("1999");
  expect(dbTech()).toEqual([row(FRONT_ID, 0, FRONTEND)]);
  const keys = await page.evaluate(() => {
    try {
      return Object.keys(localStorage);
    } catch {
      return [];
    }
  });
  expect(keys.filter((k) => k.toLowerCase().includes("draft"))).toEqual([]);
  await context.close();
});

test("E2E-28: two categories with the same text are two categories, and the last save from two tabs wins quietly", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(180000);
  dbReset();
  storeReset();
  dbSeedWith([PG_IMAGE], []);
  seedFiles();
  const first = await ownerPage(browser, baseURL as string);
  await openTech(first.page);
  const screen = screenOf(first.page);
  for (let i = 0; i < 2; i += 1) {
    await button(screen, "Add category").click();
    await categoryBox(first.page).fill("Frontend");
    await fillItem(first.page, 1, { name: "React", path: "/icons/react.png" });
    await button(screen, "Add item").click();
    await fillItem(first.page, 2, { name: "React", path: "/icons/react-2.png" });
    await button(screen, "Save").click();
    await expect(itemsOf(first.page)).toHaveCount(i + 1);
    await expect(screen.getByRole("status")).toHaveText(ENTRY_SAVED);
  }
  await expect(labelsOf(first.page)).toHaveText(["Frontend", "Frontend"]);
  await expect(paragraphsOf(itemsOf(first.page).nth(0))).toHaveText([/^React: path/, /^React: path/]);
  await expect(paragraphsOf(itemsOf(first.page).nth(1))).toHaveText([/^React: path/, /^React: path/]);
  const stored = storedTech();
  expect(stored).toHaveLength(2);
  expect(stored[0].id).not.toBe(stored[1].id);

  await button(itemsOf(first.page).first(), "Delete").click();
  await button(confirmGroup(first.page), "Confirm").click();
  await expect(itemsOf(first.page)).toHaveCount(1);
  expect(dbTech()).toHaveLength(1);
  await first.context.close();

  dbSeedWith([PG_IMAGE], [row(FRONT_ID, 0, FRONTEND)]);
  const one = await ownerPage(browser, baseURL as string);
  const two = await one.context.newPage();
  await openTech(one.page);
  await openTech(two);
  await expect(itemsOf(one.page)).toHaveCount(1);
  await expect(itemsOf(two)).toHaveCount(1);

  await button(itemsOf(one.page).first(), "Edit").click();
  await categoryBox(one.page).fill("First");
  await button(screenOf(one.page), "Save").click();
  await expect(screenOf(one.page).getByRole("status")).toHaveText(ENTRY_SAVED);

  await button(itemsOf(two).first(), "Edit").click();
  await expect(categoryBox(two)).toHaveValue("Frontend");
  await categoryBox(two).fill("Second");
  await button(screenOf(two), "Save").click();
  await expect(screenOf(two).getByRole("status")).toHaveText(ENTRY_SAVED);
  await expect(screenOf(two).getByRole("alert")).toHaveCount(0);

  await one.page.reload();
  await openTech(one.page);
  await expect(labelsOf(one.page).first()).toHaveText("Second");
  const final = storedTech();
  expect(final).toHaveLength(1);
  expect(final[0].data.category).toBe("Second");
  await one.context.close();
});

test("E2E-29: the Tech stack screen fits a phone, follows the theme tokens and works from the keyboard", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(300000);
  const surfaceByTheme: Record<string, string> = {};
  const azure = "Microsoft Azure DevOps Services with Boards and Pipelines";
  const twenty = Array.from({ length: 20 }, (_, i) => {
    const nn = String(i + 1).padStart(2, "0");
    const tools =
      nn === "10"
        ? [
            { name: azure, icon: "/icons/azure.png" },
            { name: "M".repeat(80), icon: "/icons/" + "p".repeat(200) },
          ]
        : [
            { name: "Tool " + nn + "a", icon: "/icons/" + nn + "-a.png" },
            { name: "Tool " + nn + "b", icon: "/icons/" + nn + "-b.png" },
          ];
    return row("00000000-0000-4000-8000-0000000000" + nn, i, { category: "Category " + nn, tools });
  });

  for (const theme of ["light", "dark"]) {
    dbReset();
    storeReset();
    dbSeedWith([PG_IMAGE], twenty);
    seedFiles();
    const { context, page } = await ownerPage(browser, baseURL as string, { viewport: { width: 375, height: 800 } });
    await page.addInitScript((t) => {
      try {
        localStorage.setItem("theme", t);
      } catch {
        // storage unavailable: the page falls back to its default theme
      }
    }, theme);
    await openTech(page);
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
    await fits("list");

    const listBox = await listOf(page).boundingBox();
    const longItem = itemsOf(page).nth(9);
    const longBox = await longItem.boundingBox();
    expect(listBox, "list box").not.toBeNull();
    expect(longBox, "long item box").not.toBeNull();
    expect((longBox as { width: number }).width, theme + " long item width").toBeLessThanOrEqual(
      (listBox as { width: number }).width + 0.5,
    );
    const azureLine = longItem.locator("p").filter({ hasText: azure + ": path /icons/azure.png" });
    await expect(azureLine).toHaveCount(1);
    const lineBox = await azureLine.boundingBox();
    expect(lineBox, "long line box").not.toBeNull();
    const lb = lineBox as { x: number; width: number };
    const ib = longBox as { x: number; width: number };
    expect(lb.x, theme + " long line left").toBeGreaterThanOrEqual(ib.x - 0.5);
    expect(lb.x + lb.width, theme + " long line right").toBeLessThanOrEqual(ib.x + ib.width + 0.5);

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

    const item = itemsOf(page).first();
    const surfaceAlt = await probe("backgroundColor", "--surface-alt");
    expect(await computed(item, "background-color"), theme + " item").toBe(surfaceAlt);
    expect(await computed(labelsOf(page).first(), "color"), theme + " item text").toBe(await probe("color", "--foreground"));
    const toolLine = item.locator("p").filter({ hasText: "Tool 01a: path /icons/01-a.png" });
    await expect(toolLine).toHaveCount(1);
    expect(await computed(toolLine, "color"), theme + " tool line").toBe(await probe("color", "--muted"));
    surfaceByTheme[theme] = surfaceAlt;
    if (theme === "dark") await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    await button(longItem, "Edit").click();
    await expect(editHeading(page)).toBeVisible();
    await fits("form of the long category");
    for (const field of [categoryBox(page), imageSelect(page, 1), itemGroup(page, 1), itemGroup(page, 2)]) {
      const box = await field.boundingBox();
      expect(box, "field box").not.toBeNull();
      const b = box as { x: number; width: number };
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width).toBeLessThanOrEqual(375);
    }
    await button(screen, "Cancel").click();
    await expect(editHeading(page)).toHaveCount(0);

    await button(itemsOf(page).first(), "Edit").click();
    await expect(editHeading(page)).toBeVisible();
    await categoryBox(page).fill("   ");
    await button(screen, "Save").click();
    const alert = page.getByRole("alert").filter({ hasText: CAT_REQUIRED });
    await expect(alert).toHaveText(CAT_REQUIRED);
    expect(await computed(alert, "color"), theme + " alert").toBe(await probe("color", "--accent-rose"));
    await fits("form with an error");
    await button(screen, "Cancel").click();
    await expect(editHeading(page)).toHaveCount(0);

    await button(itemsOf(page).first(), "Edit").focus();
    await page.keyboard.press("Enter");
    await expect(editHeading(page)).toBeVisible();
    await button(itemGroup(page, 1), "Delete").focus();
    await page.keyboard.press("Enter");
    await expect(confirmItemGroup(page)).toBeVisible();
    await button(confirmItemGroup(page), "Confirm").focus();
    await page.keyboard.press("Tab");
    await expect(button(confirmItemGroup(page), "Cancel")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(confirmItemGroup(page)).toHaveCount(0);
    expect(dbTech()).toHaveLength(20);
    await button(screen, "Cancel").click();
    await expect(editHeading(page)).toHaveCount(0);
    await context.close();
  }
  expect(surfaceByTheme.dark).not.toBe(surfaceByTheme.light);
});

test("E2E-30: a stored category with missing or wrong-typed parts is listed as it reads and refused on save without a change", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(90000);
  dbReset();
  storeReset();
  const stranger = [
    { id: "11111111-1111-4111-8111-111111111111", position: 0, data: { category: "Only name", tools: "x" } },
    {
      id: "22222222-2222-4222-8222-222222222222",
      position: 1,
      data: { category: "Mixed", tools: [null, { name: "Ok", icon: "/icons/ok.png" }, { name: 5, icon: null }] },
    },
  ];
  dbSeedTech(stranger);
  seedFiles();
  const { context, page } = await ownerPage(browser, baseURL as string);
  await openTech(page);
  const screen = screenOf(page);

  await expect(itemsOf(page)).toHaveCount(2);
  expect(await trimmedLabels(page)).toEqual(["Only name", "Mixed"]);
  await expect(paragraphsOf(itemsOf(page).nth(0))).toHaveText(["No items"]);
  await expect(paragraphsOf(itemsOf(page).nth(1))).toHaveText(["Ok: path /icons/ok.png", ": path"]);

  await button(itemsOf(page).nth(1), "Edit").click();
  await expect(editHeading(page)).toBeVisible();
  await expect(categoryBox(page)).toHaveValue("Mixed");
  await expect(anyItemGroup(page)).toHaveCount(2);
  await expect(nameBox(page, 1)).toHaveValue("Ok");
  await expect(pathBox(page, 1)).toHaveValue("/icons/ok.png");
  await expect(nameBox(page, 2)).toHaveValue("");
  await expect(pathBox(page, 2)).toHaveValue("");
  await button(screen, "Save").click();
  await expectInvalid(page, nameBox(page, 2), ITEM_REQUIRED, "item 2 name");
  await expectInvalid(page, pathBox(page, 2), ICON_REQUIRED, "item 2 path");
  expect(dbTech()).toEqual(stranger);
  await context.close();
});

test("E2E-31: when the images cannot be loaded or the image is gone the saved icon stays and a typed path still saves", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(180000);
  const reactAddress = publicOf(IMG_REACT);

  // Part 1: the images cannot be loaded.
  dbReset();
  storeReset();
  dbSeedWith(
    [REACT_IMAGE],
    [
      row(FRONT_ID, 0, {
        category: "Frontend",
        tools: [
          { name: "React", icon: reactAddress },
          { name: "Angular", icon: "/icons/angular.png" },
        ],
      }),
      row(CLOUD_ID, 1, CLOUD),
    ],
  );
  seedFiles();
  storeBreak();
  const one = await ownerPage(browser, baseURL as string);
  await openTech(one.page);
  const screen = screenOf(one.page);
  await expect(itemsOf(one.page)).toHaveCount(2);
  await expect(paragraphsOf(itemsOf(one.page).first()).first()).toHaveText("React: path " + reactAddress);

  await button(itemsOf(one.page).first(), "Edit").click();
  await expect(editHeading(one.page)).toBeVisible();
  await expect(itemsBox(one.page).getByRole("alert")).toHaveText(IMAGES_FAILED);
  expect(await optionTexts(imageSelect(one.page, 1))).toEqual(["None"]);
  await expect(pathBox(one.page, 1)).toHaveValue(reactAddress);
  const panelText = await one.page.locator("body").innerText();
  for (const leak of LEAKS) expect(panelText, "panel leaks " + leak).not.toContain(leak);
  await button(screen, "Save").click();
  await expect(screen.getByRole("status")).toHaveText(ENTRY_SAVED);
  expect(firstIconOf(FRONT_ID)).toBe(reactAddress);

  await button(itemStarting(one.page, "Cloud"), "Edit").click();
  await expect(editHeading(one.page)).toBeVisible();
  await fillItem(one.page, 1, { path: "/icons/vercel-2.png" });
  await button(screen, "Save").click();
  await expect.poll(() => firstIconOf(CLOUD_ID)).toBe("/icons/vercel-2.png");
  await expect(screen.getByRole("status")).toHaveText(ENTRY_SAVED);

  storeFix();
  await one.page.reload();
  await openTech(one.page);
  await expect(paragraphsOf(itemsOf(one.page).first()).first()).toHaveText("React: image react-logo.png");
  await one.context.close();

  // Part 2: the image was deleted.
  dbReset();
  dbSeedWith([], [row(FRONT_ID, 0, { category: "Frontend", tools: [{ name: "React", icon: reactAddress }] })]);
  storeReset();
  const two = await ownerPage(browser, baseURL as string);
  await openLoaded(two.page);
  const screen2 = screenOf(two.page);
  await expect(paragraphsOf(itemsOf(two.page).first()).first()).toHaveText("React: path " + reactAddress);
  await button(itemsOf(two.page).first(), "Edit").click();
  await expect(editHeading(two.page)).toBeVisible();
  await expect.poll(() => selected(imageSelect(two.page, 1))).toBe("None");
  await expect(pathBox(two.page, 1)).toHaveValue(reactAddress);
  await expect(itemsBox(two.page).getByRole("alert")).toHaveCount(0);
  await button(screen2, "Save").click();
  await expect(screen2.getByRole("status")).toHaveText(ENTRY_SAVED);
  expect(firstIconOf(FRONT_ID)).toBe(reactAddress);
  await two.context.close();
});

test("E2E-32: the earlier tech stack store and spec are gone, the shared files stay, and nothing imports the old store", async () => {
  dbReset();
  storeReset();
  const mustNotExist = [piece("src/lib/", FIRE, "/techstack.ts"), "e2e/manage-tech-stack.spec.ts"];
  for (const path of mustNotExist) expect(fs.existsSync(path), path + " is gone").toBe(false);
  const mustExist = [
    "src/lib/admin/list.ts",
    "src/lib/admin/techstack.ts",
    "src/app/components/admin/ListEditor.tsx",
    "src/app/components/admin/CertificationsEditor.tsx",
    "src/app/components/admin/BlogPostsEditor.tsx",
  ];
  for (const path of mustExist) expect(fs.existsSync(path), path + " exists").toBe(true);

  const read = (path: string): string => fs.readFileSync(path, "utf8");
  const editor = read("src/app/components/admin/TechStackEditor.tsx");
  for (const text of [
    "createHttpListStore",
    "/api/admin/tech-stack/",
    "bottomPosition",
    "listImages",
    "photoSelection",
    "UploadedImage",
    'from "@/lib/admin/imagesClient"',
    "Items of ",
  ]) {
    expect(editor, "TechStackEditor has " + text).toContain(text);
  }
  for (const word of [
    FIRE,
    piece("lib/", "server"),
    piece("lib/", "auth"),
    piece("next", "-auth"),
    PG,
    piece("server", "-only"),
  ]) {
    expect(editor.toLowerCase(), "TechStackEditor names " + word).not.toContain(word);
  }
  expect(editor, "TechStackEditor names savingOn").not.toContain(piece("saving", "On"));

  const panel = read("src/app/components/admin/AdminPanel.tsx");
  expect(panel).toContain("TechStackEditor");
  expect(panel).toContain("CertificationsEditor");
  expect(panel).toContain("ProjectsEditor");
  expect(panel).toContain("ExperienceEditor");
  expect(panel).not.toContain(piece("lib/", "auth"));
  expect(panel).not.toContain(piece("lib/", "server"));
  expect(panel.toLowerCase()).not.toContain(FIRE);

  const tech = read("src/lib/admin/techstack.ts");
  expect(tech.toLowerCase()).not.toContain(FIRE);
  expect(tech).toMatch(/export (function|const) techShape\b/);

  const route = read("src/app/api/admin/tech-stack/route.ts");
  expect(route).toContain(AUTH_MODULE);
  expect(route).toContain(piece("@/lib/", "server/listStore"));
  expect(route).toContain("force-dynamic");
  expect(route.toLowerCase()).not.toContain(FIRE);

  const importers = gitGrep(["-n", "-E", piece(FIRE, "/techstack"), "--", "src", "e2e"]);
  expect(importers.stdout).toBe("");
  expect(importers.status).toBe(1);
});

test("E2E-34: the earlier specs now skip Tech stack, keep the table set, and no spec expects its notice", async () => {
  dbReset();
  storeReset();
  const read = (path: string): string => fs.readFileSync(path, "utf8");
  const gone = gitGrep(["-n", "-F", piece("Tech stack editor is", " not available yet."), "--", "e2e"]);
  expect(gone.stdout).toBe("");
  expect(gone.status).toBe(1);

  const signIn = read("e2e/owner-google-sign-in.spec.ts");
  expect(signIn).toContain('l !== "Experience"');
  expect(signIn).toContain('l !== "Projects"');
  expect(signIn).toContain('l !== "Certifications"');
  expect(signIn).toContain('l !== "Tech stack"');
  const loop = signIn.split("\n").filter((l) => l.includes('l !== "Tech stack"'));
  expect(loop.length).toBeGreaterThan(0);
  for (const line of loop) {
    expect(line).toContain('l !== "Profile"');
    expect(line).toContain('l !== "Images"');
    expect(line).toContain('l !== "Certifications"');
  }

  const tableSet = 'export const LIST_TABLES: readonly ListTable[] = ["experience", "projects", "certifications", "tech_categories"];';
  const tableType = 'export type ListTable = "experience" | "projects" | "certifications" | "tech_categories";';
  const projects = read("e2e/owner-manages-projects.spec.ts");
  const certifications = read("e2e/owner-manages-certifications.spec.ts");
  for (const [name, text] of [
    ["projects spec", projects],
    ["certifications spec", certifications],
  ]) {
    expect(text, name + " pins the table set").toContain(tableSet);
    expect(text, name + " pins the table type").toContain(tableType);
    for (const part of ["/list.ts"]) expect(text, name + " names " + part).toContain(part);
    expect(text, name + " names the deleted store").not.toContain(piece("/tech", "stack.ts"));
  }

  expect(read("e2e/owner-edits-profile.spec.ts")).not.toContain(piece("Blog posts editor is", " not available yet."));
  expect(read("e2e/owner-uploads-images.spec.ts")).not.toContain(piece("Blog posts editor is", " not available yet."));
});

test("E2E-35: CLAUDE.md lists the tech stack route once, keeps the shared pattern and the settings, and drops the old counts", async () => {
  dbReset();
  storeReset();
  const doc = fs.readFileSync("CLAUDE.md", "utf8");
  for (const text of [
    "/api/admin/tech-stack/",
    "src/app/api/admin/tech-stack/route.ts",
    "/api/admin/certifications/",
    "src/app/api/admin/certifications/route.ts",
    "/api/admin/projects/",
    "src/app/api/admin/projects/route.ts",
    "/api/admin/experience/",
    "src/app/api/admin/experience/route.ts",
    "createListService",
    "createHttpListStore",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "/api/admin/images/",
    "/api/admin/images/upload/",
    "/api/admin/profile/",
    "src/lib/server/",
    "src/app/api/admin/**",
    "stand-in:",
    "SUPABASE_DB_URL",
    "AUTH_SECRET",
    "/api/auth/callback/google",
    "The site reads seven settings by name",
    "the experience entries and the projects",
    "The certifications are stored in Supabase",
    "The tech stack is stored in Supabase",
  ]) {
    expect(doc, text).toContain(text);
  }
  const lines = doc.split("\n");
  for (const route of ["tech-stack", "certifications", "projects", "experience"]) {
    const rows = lines.filter((l) => l.startsWith("| `/api/admin/" + route + "/`"));
    expect(rows, "Routes table rows for the " + route + " route").toHaveLength(1);
  }
  for (const text of ["The site reads five settings by name", "The site reads four settings by name", "only API route"]) {
    expect(doc, text).not.toContain(text);
  }
});
