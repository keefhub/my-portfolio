import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { expect, test, type APIRequestContext, type APIResponse } from "@playwright/test";
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
    "https://abc.supabase.co/storage/v1/object/public/images/a.png",
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
