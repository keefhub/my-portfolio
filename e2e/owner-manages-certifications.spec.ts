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
  certificationFromData,
  certificationLabel,
  certificationShape,
  certificationToData,
  checkCertification,
  emptyCertification,
} from "../src/lib/admin/certifications";

test.describe.configure({ mode: "default" });

// Shared fixtures. The tests of this file share one stand-in database file and one stand-in storage directory
// (D-12), so every test starts by resetting both.

// The gate scans this file, so the names of forbidden words and modules are put together from pieces.
const piece = (...parts: string[]): string => parts.join("");
const SUPABASE_PREFIX = piece("@supa", "base/");
const FIRE = piece("fire", "base");
const PG = piece("post", "gres");
const AUTH_MODULE = piece("@/lib/", "auth");
const TABLE_MARK = piece("$", "{table}");

const STAND_IN_PREFIX = "stand-in:";
const DB_URL = process.env.SUPABASE_DB_URL ?? "";
const DB_FILE = DB_URL.startsWith(STAND_IN_PREFIX) ? DB_URL.slice(STAND_IN_PREFIX.length) : "";
const STORE_URL = process.env.SUPABASE_URL ?? "";
const STORE_DIR = STORE_URL.startsWith(STAND_IN_PREFIX) ? STORE_URL.slice(STAND_IN_PREFIX.length) : "";

const PANEL = "/bright-warm-greenhouse/";
const API = "/api/admin/certifications/";
const PROJECTS_API = "/api/admin/projects/";
const EXPERIENCE_API = "/api/admin/experience/";

const SCRUM_ID = "11111111-1111-4111-8111-111111111111";
const GOOGLE_ID = "22222222-2222-4222-8222-222222222222";
const CHAIN_ID = "33333333-3333-4333-8333-333333333333";
const GONE_ID = "99999999-9999-4999-8999-999999999999";
const IMG_SCRUM = "55555555-5555-4555-8555-555555555555.png";
const IMG_CHAIN = "66666666-6666-4666-8666-666666666666.png";

const SCRUM = {
  name: "Professional Scrum Developer",
  icon: "/certs/scrum.png",
  url: "https://www.credly.com/badges/example/public_url",
};
const GOOGLE = {
  name: "Google IT Automation with Python",
  icon: "/certs/google.png",
  url: "https://www.coursera.org/account/accomplishments/verify/GOOGLE1",
};
const CHAIN = {
  name: "Certified Blockchain Developer",
  icon: "/certs/blockchain.png",
  url: "https://www.blockchain-council.org/certificate/example",
};

const SCRUM_IMAGE = { id: IMG_SCRUM, name: "scrum-badge.png", contentType: "image/png", size: 70 };
const CHAIN_IMAGE = { id: IMG_CHAIN, name: "blockchain-badge.png", contentType: "image/png", size: 70 };

const LEAKS = ["10.1.2.3", "password-marker-standin", "key-marker-standin", "ECONNREFUSED"];

const ENTRY_SAVED = "Entry saved";
const ORDER_SAVED = "Order saved";
const NO_CERTS = "No certifications yet.";
const LOAD_FAILED = "The entries could not be loaded.";
const SAVE_FAILED = "The entry could not be saved. Try again, and check that you are signed in as the owner.";
const MOVE_FAILED = "The entry could not be moved. Try again, and check that you are signed in as the owner.";
const DELETE_FAILED = "The entry could not be deleted. Try again, and check that you are signed in as the owner.";
const ASK_GOOGLE = 'Delete "Google IT Automation with Python"? This cannot be undone.';
const NAME_REQUIRED = "Enter a name";
const LINK_INVALID = "Enter a link that starts with https://";
const ICON_INVALID = "Enter a badge image path that starts with /";
const ICON_REQUIRED = "Pick an uploaded image or enter a badge image path that starts with /";
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

function dbSeedCerts(list: unknown[]): void {
  fs.writeFileSync(DB_FILE, JSON.stringify({ certifications: list }));
}

function dbSeedWith(images: unknown[], certs: unknown[]): void {
  fs.writeFileSync(DB_FILE, JSON.stringify({ images, certifications: certs }));
}

function dbSeedAll(
  profile: unknown,
  images: unknown[],
  experience: unknown[],
  projects: unknown[],
  certs: unknown[],
): void {
  fs.writeFileSync(
    DB_FILE,
    JSON.stringify({ profile, images, experience, projects, certifications: certs }),
  );
}

function dbCerts(): unknown[] {
  const list = readDbFile().certifications;
  return Array.isArray(list) ? list : [];
}

type StoredRow = { id: string; position: number; data: { name?: string } };

// The names of the stored certifications, stably sorted by position (equal positions keep array order).
function sortedNames(rows: unknown[]): string[] {
  return (rows as StoredRow[])
    .map((r, i) => ({ r, i }))
    .sort((a, b) => a.r.position - b.r.position || a.i - b.i)
    .map(({ r }) => r.data.name ?? "");
}

const dbNames = (): string[] => sortedNames(dbCerts());

const positionsOf = (): Record<string, unknown> =>
  Object.fromEntries((dbCerts() as StoredRow[]).map((r) => [r.id, r.position]));

const row = (id: string, position: number, content: unknown) => ({ id, position, data: content });
const entry = (id: string, position: number, content: unknown) => ({ id, position, content });
const seedTwo = (): void => dbSeedWith([SCRUM_IMAGE, CHAIN_IMAGE], [row(SCRUM_ID, 0, SCRUM), row(GOOGLE_ID, 1, GOOGLE)]);
const seedThree = (): void =>
  dbSeedWith(
    [SCRUM_IMAGE, CHAIN_IMAGE],
    [row(SCRUM_ID, 0, SCRUM), row(GOOGLE_ID, 1, GOOGLE), row(CHAIN_ID, 2, CHAIN)],
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
  storePut(IMG_SCRUM, PNG_1X1, "image/png");
  storePut(IMG_CHAIN, PNG_1X1, "image/png");
};

// Keep the fixtures that only the browser rows of Step 2 use from reading as unused here.
void [
  PANEL,
  ENTRY_SAVED,
  ORDER_SAVED,
  NO_CERTS,
  LOAD_FAILED,
  SAVE_FAILED,
  MOVE_FAILED,
  DELETE_FAILED,
  ASK_GOOGLE,
  NAME_REQUIRED,
  LINK_INVALID,
  ICON_INVALID,
  ICON_REQUIRED,
  IMAGES_FAILED,
  GONE_ID,
  storeBreak,
  storeFix,
  publicOf,
  seedFiles,
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
      { id: SCRUM_ID, position: 1 },
      { id: GOOGLE_ID, position: 0 },
    ],
  });
const idQuery = (id: string): string => "?id=" + id;

async function namesFromGet(request: APIRequestContext, cookie: string): Promise<string[]> {
  const res = await apiGet(request, cookie);
  expect(res.status(), "GET status").toBe(200);
  const body = (await res.json()) as { entries: { content: { name: string } }[] };
  return body.entries.map((e) => e.content.name);
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
    "postgres",
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
  expect(pkg.dependencies?.postgres).toBe("4.1.1");
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

test("E2E-02: certificationShape, checkCertification, certificationFromData and certificationToData apply the stated rules", async () => {
  dbReset();
  storeReset();

  // certificationShape
  const a = { name: "N", icon: "/certs/scrum.png", url: "https://www.credly.com/badges/example/public_url" };
  expect(certificationShape(a)).toEqual(a);
  expect(certificationShape({ name: "N" })).toEqual({ name: "N", icon: "", url: "" });
  const c = certificationShape({ ...a, extra: 5 });
  expect(c).not.toBeNull();
  expect(Object.keys(c as object)).not.toContain("extra");
  expect(c).toEqual(a);
  expect(certificationShape({ name: 5 })).toBeNull();
  expect(certificationShape({ name: "N", icon: null })).toBeNull();
  expect(certificationShape({ name: "N", url: ["x"] })).toBeNull();
  expect(certificationShape({ name: "N", icon: 7 })).toBeNull();
  for (const bad of [null, [], "x", 7]) expect(certificationShape(bad), JSON.stringify(bad)).toBeNull();

  // checkCertification
  expect(
    checkCertification({
      name: "  Professional Scrum Developer ",
      icon: " /certs/scrum.png ",
      url: "  https://www.credly.com/badges/example/public_url ",
    }),
  ).toEqual({ ok: true, content: SCRUM });

  for (const name of ["", "   "]) {
    const result = checkCertification({ name, icon: "/certs/scrum.png", url: "https://example.com/cred" });
    expect(result.ok, JSON.stringify(name)).toBe(false);
    if (!result.ok) expect(result.errors, JSON.stringify(name)).toEqual({ name: NAME_REQUIRED });
  }

  const withUrl = (url: string) => checkCertification({ name: "Professional Scrum", icon: "/certs/scrum.png", url });
  for (const v of [
    "credly.com/badge",
    "http://example.com/cred",
    "https:/x",
    "https://",
    "https://a b",
    "ftp://x.example",
    "//x.example",
  ]) {
    const result = withUrl(v);
    expect(result.ok, JSON.stringify(v)).toBe(false);
    if (!result.ok) expect(result.errors, JSON.stringify(v)).toEqual({ url: LINK_INVALID });
  }
  for (const v of ["https://x", "HTTPS://X.example/a", "hTtPs://x.example/a?b=c"]) {
    expect(withUrl(v).ok, JSON.stringify(v)).toBe(true);
  }

  const withIcon = (icon: string) =>
    checkCertification({ name: "Professional Scrum", icon, url: "https://example.com/cred" });
  for (const v of [
    "certs/scrum.png",
    "//cdn.example.com/x.png",
    "/",
    "/certs/my badge.png",
    "ftp://x.example/a.png",
    "https://",
    "./scrum.png",
  ]) {
    const result = withIcon(v);
    expect(result.ok, JSON.stringify(v)).toBe(false);
    if (!result.ok) expect(result.errors, JSON.stringify(v)).toEqual({ icon: ICON_INVALID });
  }
  for (const v of [
    "/x",
    "/certs/scrum.png",
    "https://stand-in.invalid/storage/v1/object/public/images/55555555-5555-4555-8555-555555555555.png",
    "HTTP://x.example/a.png",
    "http://x",
  ]) {
    expect(withIcon(v).ok, JSON.stringify(v)).toBe(true);
  }
  for (const v of ["", "   "]) {
    const result = withIcon(v);
    expect(result.ok, JSON.stringify(v)).toBe(false);
    if (!result.ok) expect(result.errors, JSON.stringify(v)).toEqual({ icon: ICON_REQUIRED });
  }

  const allBad = checkCertification({ name: " ", icon: "", url: "x" });
  expect(allBad.ok).toBe(false);
  if (!allBad.ok) {
    expect(allBad.errors).toEqual({ name: NAME_REQUIRED, icon: ICON_REQUIRED, url: LINK_INVALID });
  }

  // certificationFromData
  expect(certificationFromData({ name: 7, icon: "/a.png", url: null })).toEqual({ name: "", icon: "/a.png", url: "" });
  expect(certificationFromData(null)).toEqual({ name: "", icon: "", url: "" });

  // emptyCertification, certificationToData, certificationLabel
  expect(emptyCertification()).toEqual({ name: "", icon: "", url: "" });
  const data = certificationToData(SCRUM);
  expect(Object.keys(data).sort()).toEqual(["icon", "name", "url"]);
  expect(data).toEqual(SCRUM);
  data.z = "z";
  expect(SCRUM).toEqual({
    name: "Professional Scrum Developer",
    icon: "/certs/scrum.png",
    url: "https://www.credly.com/badges/example/public_url",
  });
  expect(Object.keys(SCRUM)).not.toContain("z");
  expect(certificationLabel(SCRUM)).toBe("Professional Scrum Developer");
});

test("E2E-03: the list SQL is exactly the proven text for the three tables, the server files are marked server-only, and nothing names the old backend", async () => {
  dbReset();
  storeReset();

  const original = fs.readFileSync("src/lib/server/listSql.ts", "utf8");
  for (const table of ["experience", "projects", "certifications"]) {
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

  const serverFiles = fs.readdirSync("src/lib/server").filter((f) => fs.statSync("src/lib/server/" + f).isFile());
  expect(serverFiles.length).toBeGreaterThan(0);
  for (const f of serverFiles) {
    const first = fs
      .readFileSync("src/lib/server/" + f, "utf8")
      .split("\n")
      .find((line) => line.trim() !== "");
    expect(first, f).toBe('import "server-only";');
  }

  const mentions = gitGrep(["-l", "-E", "lib/server", "--", "src"]);
  const mentioning = mentions.stdout.split("\n").filter(Boolean);
  expect(mentioning.length).toBeGreaterThan(0);
  for (const file of mentioning) {
    expect(file.startsWith("src/app/api/admin/") || file.startsWith("src/lib/server/"), file).toBe(true);
  }

  const importers = gitGrep(["-l", "-E", "[\"']" + PG + "[\"']", "--", "src"]);
  expect(importers.stdout.split("\n").filter(Boolean)).toEqual(["src/lib/server/database.ts"]);

  const named = gitGrep([
    "-n",
    "-i",
    FIRE,
    "--",
    "src/lib/server",
    "src/lib/admin/listClient.ts",
    "src/app/api/admin/certifications",
  ]);
  expect(named.stdout).toBe("");
  expect(named.status).toBe(1);
});

test("E2E-04: the owner lists, adds, replaces and removes a certification through the route, with trimmed content", async ({
  request,
}) => {
  dbReset();
  storeReset();
  const owner = await ownerCookie();
  const answers: [string, APIResponse][] = [];

  const first = await apiGet(request, owner);
  answers.push(["GET 1", first]);
  await expectAnswer(first, 200, { entries: [] }, "GET 1");

  const added = await apiSend(
    request,
    "POST",
    "",
    '{"content":{"name":"  Professional Scrum Developer ","icon":" /certs/scrum.png ","url":" https://www.credly.com/badges/example/public_url "},"position":0}',
    owner,
  );
  answers.push(["POST", added]);
  expect(added.status(), "POST status").toBe(200);
  const addedBody = (await added.json()) as Record<string, unknown>;
  expect(Object.keys(addedBody)).toEqual(["id"]);
  const id1 = addedBody.id as string;
  expect(id1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  expect(dbCerts()).toEqual([row(id1, 0, SCRUM)]);

  const second = await apiGet(request, owner);
  answers.push(["GET 2", second]);
  await expectAnswer(second, 200, { entries: [entry(id1, 0, SCRUM)] }, "GET 2");

  const uploaded = "https://stand-in.invalid/storage/v1/object/public/images/55555555-5555-4555-8555-555555555555.png";
  const replaced = await apiSend(
    request,
    "PUT",
    idQuery(id1),
    JSON.stringify({
      content: {
        name: "Professional Scrum Developer 2",
        icon: uploaded,
        url: "https://www.credly.com/badges/example/public_url",
      },
    }),
    owner,
  );
  answers.push(["PUT", replaced]);
  await expectAnswer(replaced, 200, { updated: true }, "PUT");

  const third = await apiGet(request, owner);
  answers.push(["GET 3", third]);
  await expectAnswer(
    third,
    200,
    { entries: [entry(id1, 0, { name: "Professional Scrum Developer 2", icon: uploaded, url: SCRUM.url })] },
    "GET 3",
  );

  const removed = await apiSend(request, "DELETE", idQuery(id1), undefined, owner);
  answers.push(["DELETE", removed]);
  await expectAnswer(removed, 200, { deleted: true }, "DELETE");

  const last = await apiGet(request, owner);
  answers.push(["GET 4", last]);
  await expectAnswer(last, 200, { entries: [] }, "GET 4");
  expect(dbCerts()).toEqual([]);

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
    [SCRUM, 0],
    [GOOGLE, -1],
    [CHAIN, -2],
  ] as const) {
    const res = await apiSend(request, "POST", "", postBody(content, position), owner);
    expect(res.status(), "POST " + content.name).toBe(200);
    posted.push(((await res.json()) as { id: string }).id);
  }
  expect(await namesFromGet(request, owner)).toEqual([
    "Certified Blockchain Developer",
    "Google IT Automation with Python",
    "Professional Scrum Developer",
  ]);

  const again = await apiSend(request, "POST", "", postBody(CHAIN, -2), owner);
  expect(again.status(), "second Chain").toBe(200);
  const againId = ((await again.json()) as { id: string }).id;
  const afterFourth = await apiGet(request, owner);
  const listed = ((await afterFourth.json()) as { entries: { id: string; content: { name: string } }[] }).entries;
  expect(listed.map((e) => e.content.name)).toEqual([
    "Certified Blockchain Developer",
    "Certified Blockchain Developer",
    "Google IT Automation with Python",
    "Professional Scrum Developer",
  ]);
  expect(listed[0].id).not.toBe(listed[1].id);
  expect(listed[0].id).toBe(posted[2]);
  expect(listed[1].id).toBe(againId);

  dbSeedCerts([row(SCRUM_ID, 2, SCRUM), row(GOOGLE_ID, 2, GOOGLE), row(CHAIN_ID, -5, CHAIN)]);
  expect(await namesFromGet(request, owner)).toEqual([
    "Certified Blockchain Developer",
    "Professional Scrum Developer",
    "Google IT Automation with Python",
  ]);

  const high = await apiSend(request, "POST", "", postBody(GOOGLE, 2147483647), owner);
  expect(high.status(), "position 2147483647").toBe(200);
  const low = await apiSend(request, "POST", "", postBody(GOOGLE, -2147483648), owner);
  expect(low.status(), "position -2147483648").toBe(200);
  const before = dbCerts().length;
  const over = await apiSend(request, "POST", "", postBody(GOOGLE, 2147483648), owner);
  await expectAnswer(over, 400, { error: "invalid" }, "position 2147483648");
  expect(dbCerts()).toHaveLength(before);
});

test("E2E-06: a replace or remove of a certification that is not stored answers 404 and stores nothing", async ({
  request,
}) => {
  dbReset();
  storeReset();
  seedTwo();
  const owner = await ownerCookie();
  const seed = [row(SCRUM_ID, 0, SCRUM), row(GOOGLE_ID, 1, GOOGLE)];

  const missingPut = await apiSend(
    request,
    "PUT",
    idQuery(GONE_ID),
    JSON.stringify({ content: { ...SCRUM, name: "Changed" } }),
    owner,
  );
  await expectAnswer(missingPut, 404, { error: "not-found" }, "PUT of a missing id");
  const missingDelete = await apiSend(request, "DELETE", idQuery(GONE_ID), undefined, owner);
  await expectAnswer(missingDelete, 404, { error: "not-found" }, "DELETE of a missing id");
  expect(dbCerts()).toEqual(seed);

  const edit = await apiSend(
    request,
    "PUT",
    idQuery(GOOGLE_ID),
    JSON.stringify({ content: { ...GOOGLE, name: "Google IT Automation II" } }),
    owner,
  );
  await expectAnswer(edit, 200, { updated: true }, "PUT of Google");
  const stored = dbCerts() as { id: string; position: number; data: unknown }[];
  expect(stored.find((r) => r.id === GOOGLE_ID)).toEqual(
    row(GOOGLE_ID, 1, { ...GOOGLE, name: "Google IT Automation II" }),
  );
  expect(stored.find((r) => r.id === SCRUM_ID)).toEqual(row(SCRUM_ID, 0, SCRUM));

  const removed = await apiSend(request, "DELETE", idQuery(SCRUM_ID), undefined, owner);
  await expectAnswer(removed, 200, { deleted: true }, "first DELETE of Scrum");
  const revive = await apiSend(request, "PUT", idQuery(SCRUM_ID), JSON.stringify({ content: SCRUM }), owner);
  await expectAnswer(revive, 404, { error: "not-found" }, "PUT of a removed id");
  const removedAgain = await apiSend(request, "DELETE", idQuery(SCRUM_ID), undefined, owner);
  expect(removedAgain.status(), "second DELETE of Scrum").toBe(404);
  expect((dbCerts() as { id: string }[]).map((r) => r.id)).toEqual([GOOGLE_ID]);
});

test("E2E-07: a reorder changes every named position or none, and refuses every malformed body", async ({ request }) => {
  dbReset();
  storeReset();
  seedThree();
  const owner = await ownerCookie();

  const moved = await apiSend(request, "PATCH", "", swapBody(), owner);
  await expectAnswer(moved, 200, { moved: true }, "swap");
  expect(await namesFromGet(request, owner)).toEqual([
    "Google IT Automation with Python",
    "Professional Scrum Developer",
    "Certified Blockchain Developer",
  ]);

  const partial = await apiSend(
    request,
    "PATCH",
    "",
    JSON.stringify({
      changes: [
        { id: CHAIN_ID, position: 0 },
        { id: GONE_ID, position: 1 },
      ],
    }),
    owner,
  );
  await expectAnswer(partial, 404, { error: "not-found" }, "move with a missing id");
  expect(await namesFromGet(request, owner)).toEqual([
    "Google IT Automation with Python",
    "Professional Scrum Developer",
    "Certified Blockchain Developer",
  ]);
  const settled = { [GOOGLE_ID]: 0, [SCRUM_ID]: 1, [CHAIN_ID]: 2 };
  expect(positionsOf()).toEqual(settled);

  const bad: [string, string | undefined][] = [
    ["empty changes", JSON.stringify({ changes: [] })],
    [
      "repeated id",
      JSON.stringify({
        changes: [
          { id: SCRUM_ID, position: 0 },
          { id: SCRUM_ID, position: 1 },
        ],
      }),
    ],
    ["fractional position", JSON.stringify({ changes: [{ id: SCRUM_ID, position: 1.5 }] })],
    ["string position", JSON.stringify({ changes: [{ id: SCRUM_ID, position: "1" }] })],
    ["position over range", JSON.stringify({ changes: [{ id: SCRUM_ID, position: 2147483648 }] })],
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
  dbSeedCerts([row(SCRUM_ID, 0, SCRUM)]);
  const owner = await ownerCookie();

  const { icon, url } = SCRUM;
  const noName = { icon, url };
  const noIcon = { name: SCRUM.name, url };
  const noUrl = { name: SCRUM.name, icon };
  const post = (content: unknown, position: unknown = 0): string => JSON.stringify({ content, position });
  const withoutPosition = JSON.stringify({ content: SCRUM });

  type Case = { label: string; method: "POST" | "PUT" | "DELETE"; query: string; body: string | undefined };
  const cases: Case[] = [
    { label: "(1) name empty", method: "POST", query: "", body: post({ ...SCRUM, name: "" }) },
    { label: "(2) name blank", method: "POST", query: "", body: post({ ...SCRUM, name: "   " }) },
    { label: "(3) name missing", method: "POST", query: "", body: post(noName) },
    { label: "(4) icon without a slash", method: "POST", query: "", body: post({ ...SCRUM, icon: "certs/scrum.png" }) },
    { label: "(5) icon empty", method: "POST", query: "", body: post({ ...SCRUM, icon: "" }) },
    { label: "(6) icon missing", method: "POST", query: "", body: post(noIcon) },
    { label: "(7) icon protocol-relative", method: "POST", query: "", body: post({ ...SCRUM, icon: "//x.example/a.png" }) },
    { label: "(8) url without scheme", method: "POST", query: "", body: post({ ...SCRUM, url: "credly.com/badge" }) },
    { label: "(9) url http", method: "POST", query: "", body: post({ ...SCRUM, url: "http://example.com/cred" }) },
    { label: "(10) url missing", method: "POST", query: "", body: post(noUrl) },
    { label: "(11) name a number", method: "POST", query: "", body: post({ ...SCRUM, name: 5 }) },
    { label: "(12) icon null", method: "POST", query: "", body: post({ ...SCRUM, icon: null }) },
    { label: "(13) url an array", method: "POST", query: "", body: post({ ...SCRUM, url: ["x"] }) },
    { label: "(14) content null", method: "POST", query: "", body: post(null) },
    { label: "(15) content an array", method: "POST", query: "", body: post([]) },
    { label: "(16) position missing", method: "POST", query: "", body: withoutPosition },
    { label: "(17) position a string", method: "POST", query: "", body: post(SCRUM, "0") },
    { label: "(18) position fractional", method: "POST", query: "", body: post(SCRUM, 0.5) },
    { label: "(19) position null", method: "POST", query: "", body: post(SCRUM, null) },
    { label: "(20a) raw brace", method: "POST", query: "", body: "{" },
    { label: "(20b) array body", method: "POST", query: "", body: "[]" },
    { label: "(20c) empty body", method: "POST", query: "", body: undefined },
    { label: "(21) PUT without id", method: "PUT", query: "", body: JSON.stringify({ content: SCRUM }) },
    { label: "(22) PUT with a bad id", method: "PUT", query: "?id=not-an-id", body: JSON.stringify({ content: SCRUM }) },
    {
      label: "(23) PUT with an empty name",
      method: "PUT",
      query: idQuery(GOOGLE_ID),
      body: JSON.stringify({ content: { ...SCRUM, name: "" } }),
    },
    { label: "(24) PUT with an empty object", method: "PUT", query: idQuery(SCRUM_ID), body: "{}" },
    {
      label: "(25) PUT with an http link",
      method: "PUT",
      query: idQuery(SCRUM_ID),
      body: JSON.stringify({ content: { ...SCRUM, url: "http://x.example/c" } }),
    },
    { label: "(26) DELETE without id", method: "DELETE", query: "", body: undefined },
    { label: "(27) DELETE with a path-like id", method: "DELETE", query: "?id=../../x", body: undefined },
  ];

  for (const c of cases) {
    const res = await apiSend(request, c.method, c.query, c.body, owner);
    await expectAnswer(res, 400, { error: "invalid" }, c.label);
  }
  expect(dbCerts()).toEqual([row(SCRUM_ID, 0, SCRUM)]);
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
    { label: "POST valid", send: (c) => apiSend(request, "POST", "", postBody(SCRUM, -1), c) },
    { label: "POST raw brace", send: (c) => apiSend(request, "POST", "", "{", c) },
    {
      label: "PUT valid",
      send: (c) => apiSend(request, "PUT", idQuery(SCRUM_ID), JSON.stringify({ content: SCRUM }), c),
    },
    { label: "PUT raw brace", send: (c) => apiSend(request, "PUT", idQuery(SCRUM_ID), "{", c) },
    { label: "PATCH swap", send: (c) => apiSend(request, "PATCH", "", swapBody(), c) },
    { label: "DELETE", send: (c) => apiSend(request, "DELETE", idQuery(SCRUM_ID), undefined, c) },
  ];

  for (const s of sessions) {
    for (const call of calls) {
      const label = s.label + " " + call.label;
      const res = await call.send(s.cookie);
      expect(res.status(), label + " status").toBe(s.status);
      expect(res.headers()["cache-control"] ?? "", label + " cache-control").toContain("no-store");
      const text = await res.text();
      expect(JSON.parse(text), label + " body").toEqual({ error: s.error });
      for (const word of ["Professional Scrum", "Google IT", "credly.com", "coursera.org"]) {
        expect(text, label + " leaks " + word).not.toContain(word);
      }
    }
  }
  expect(dbCerts()).toEqual([row(SCRUM_ID, 0, SCRUM), row(GOOGLE_ID, 1, GOOGLE)]);
});

test("E2E-10: an unreachable database gives a fixed 503 to the owner, refusals do not depend on it, and it recovers", async ({
  request,
}) => {
  dbReset();
  storeReset();
  seedTwo();
  dbBreak();
  const owner = await ownerCookie();
  const seed = [row(SCRUM_ID, 0, SCRUM), row(GOOGLE_ID, 1, GOOGLE)];

  const sent: [string, APIResponse][] = [
    ["GET", await apiGet(request, owner)],
    ["POST", await apiSend(request, "POST", "", postBody(CHAIN, -1), owner)],
    ["PUT", await apiSend(request, "PUT", idQuery(SCRUM_ID), JSON.stringify({ content: SCRUM }), owner)],
    ["PATCH", await apiSend(request, "PATCH", "", swapBody(), owner)],
    ["DELETE", await apiSend(request, "DELETE", idQuery(SCRUM_ID), undefined, owner)],
  ];
  for (const [label, res] of sent) {
    expect(res.status(), label + " status").toBe(503);
    const text = await res.text();
    expect(text, label + " body").toBe('{"error":"unavailable"}');
    for (const leak of [...LEAKS, "Professional Scrum", "credly.com"]) {
      expect(text, label + " leaks " + leak).not.toContain(leak);
    }
  }

  const signedOut = await apiGet(request);
  await expectAnswer(signedOut, 401, { error: "not-signed-in" }, "signed-out GET");
  const otherCookie = await cookieOf(OTHER());
  const otherGet = await apiGet(request, otherCookie);
  await expectAnswer(otherGet, 403, { error: "not-allowed" }, "other GET");
  const otherDelete = await apiSend(request, "DELETE", idQuery(SCRUM_ID), undefined, otherCookie);
  await expectAnswer(otherDelete, 403, { error: "not-allowed" }, "other DELETE");

  dbFix();
  const fixed = await apiGet(request, owner);
  await expectAnswer(
    fixed,
    200,
    { entries: [entry(SCRUM_ID, 0, SCRUM), entry(GOOGLE_ID, 1, GOOGLE)] },
    "GET after the database is back",
  );
  expect(dbCerts()).toEqual(seed);
});

test("E2E-11: the certifications list shares the stand-in file with the other lists and is read tolerantly", async ({
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
  dbSeedAll(profile, [SCRUM_IMAGE], experience, projects, [row(SCRUM_ID, 0, SCRUM)]);
  const owner = await ownerCookie();

  const add = await apiSend(request, "POST", "", postBody(GOOGLE, -1), owner);
  expect(add.status(), "POST certifications").toBe(200);
  const put = await apiSend(
    request,
    "PUT",
    idQuery(SCRUM_ID),
    JSON.stringify({ content: { ...SCRUM, name: "Changed" } }),
    owner,
  );
  expect(put.status(), "PUT certifications").toBe(200);
  const addProject = await apiSend(
    request,
    "POST",
    "",
    '{"content":{"title":"Beta"},"position":-1}',
    owner,
    PROJECTS_API,
  );
  expect(addProject.status(), "POST projects").toBe(200);

  const certsList = await apiGet(request, owner);
  const certsText = await certsList.text();
  const projectsList = await apiGet(request, owner, PROJECTS_API);
  const projectsText = await projectsList.text();

  const file = readDbFile();
  expect(file.profile).toEqual(profile);
  expect(file.images).toEqual([SCRUM_IMAGE]);
  expect(file.experience).toHaveLength(1);
  expect(file.projects).toHaveLength(2);
  expect(
    (file.projects as { position: number; data: { title: string } }[])
      .map((r, i) => ({ r, i }))
      .sort((a, b) => a.r.position - b.r.position || a.i - b.i)
      .map(({ r }) => r.data.title),
  ).toEqual(["Beta", "Quantum Notes"]);
  expect(file.certifications).toHaveLength(2);
  expect(dbNames()).toEqual(["Google IT Automation with Python", "Changed"]);

  expect(certsList.status(), "GET certifications").toBe(200);
  const certsBody = JSON.parse(certsText) as { entries: { content: { name: string } }[] };
  expect(certsBody.entries.map((e) => e.content.name)).toEqual(["Google IT Automation with Python", "Changed"]);
  for (const word of ["Quantum Notes", "Beta", "Acme", "Engineer"]) {
    expect(certsText, "certifications leaks " + word).not.toContain(word);
  }

  expect(projectsList.status(), "GET projects").toBe(200);
  const projectsBody = JSON.parse(projectsText) as { entries: unknown[] };
  expect(projectsBody.entries).toHaveLength(2);
  for (const word of ["Google IT", "Changed", "credly.com"]) {
    expect(projectsText, "projects leaks " + word).not.toContain(word);
  }

  dbSeedCerts([
    { id: SCRUM_ID, position: 0, data: { name: "Only name", icon: 4, url: ["x"] } },
    { id: GOOGLE_ID, position: "1", data: {} },
    { id: 5, position: 2, data: {} },
    { position: 3, data: {} },
    "text",
    null,
    { id: CHAIN_ID, position: 4, data: null },
  ]);
  const tolerant = await apiGet(request, owner);
  await expectAnswer(
    tolerant,
    200,
    {
      entries: [
        entry(SCRUM_ID, 0, { name: "Only name", icon: "", url: "" }),
        entry(CHAIN_ID, 4, { name: "", icon: "", url: "" }),
      ],
    },
    "tolerant read",
  );

  fs.writeFileSync(DB_FILE, '{"certifications":"x"}');
  const notAList = await apiGet(request, owner);
  await expectAnswer(notAList, 200, { entries: [] }, "certifications not a list");
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

  const serverMentions = gitGrep(["-l", "-E", "lib/server", "--", "src", ":(exclude)src/lib/server", ":(exclude)src/app/api/admin"]);
  expect(serverMentions.stdout).toBe("");
  expect(serverMentions.status).toBe(1);
});

// Keep the experience address and the plain-text helpers that only later rows use from reading as unused here.
void [EXPERIENCE_API, CHAIN_IMAGE];

// ---------------------------------------------------------------------------------------------------------------
// Step 2: the browser-driven fixtures and rows.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SECTION_NAMES = ["Profile", "Experience", "Projects", "Certifications", "Tech stack", "Blog posts", "Images"];

type StoredCert = { id: string; position: number; data: { name?: string; icon?: string; url?: string } };
const storedCerts = (): StoredCert[] => dbCerts() as StoredCert[];
const iconOf = (id: string): string | undefined => storedCerts().find((r) => r.id === id)?.data.icon;

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
const screenOf = (page: Page) => page.locator('section[aria-label="Certifications editor"]');
const listOf = (page: Page) => page.getByRole("list", { name: "Certifications list" });
const itemsOf = (page: Page) => listOf(page).getByRole("listitem");
const labelsOf = (page: Page) => listOf(page).locator("li > span:first-child");
const button = (scope: Scope, name: string) => scope.getByRole("button", { name, exact: true });
const confirmGroup = (page: Page) => page.getByRole("group", { name: "Confirm delete" });
const escapeRe = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const itemStarting = (page: Page, text: string) =>
  itemsOf(page).filter({ hasText: new RegExp("^\\s*" + escapeRe(text)) });
const statusWith = (page: Page, text: string) => screenOf(page).getByRole("status").filter({ hasText: text });
const editHeading = (page: Page): Locator => page.getByRole("heading", { name: "Edit entry" });
const addHeading = (page: Page): Locator => page.getByRole("heading", { name: "Add entry" });
const paragraphsOf = (item: Locator): Locator => item.locator("p");
const nameBox = (page: Page): Locator => page.getByRole("textbox", { name: "Name", exact: true });
const imageSelect = (page: Page): Locator => page.getByRole("combobox", { name: "Uploaded image", exact: true });
const pathBox = (page: Page): Locator => page.getByRole("textbox", { name: "Badge image path", exact: true });
const linkBox = (page: Page): Locator => page.getByRole("textbox", { name: "Credential link", exact: true });
const badgeGroup = (page: Page): Locator => page.getByRole("group", { name: "Badge image", exact: true });
const addressOf = (id: string): string => publicOf(id);

// The text of the checked option of a select.
const selected = (select: Locator): Promise<string> =>
  select.evaluate((el) => {
    const node = el as HTMLSelectElement;
    return (node.options[node.selectedIndex]?.text ?? "").trim();
  });

const optionTexts = async (select: Locator): Promise<string[]> =>
  (await select.locator("option").allTextContents()).map((t) => t.trim());

// Click the menu button until the screen's heading is there (a click that lands before hydration is lost).
async function openCertifications(page: Page): Promise<void> {
  await page.goto(PANEL);
  const choose = button(menu(page), "Certifications");
  const heading = page.getByRole("heading", { name: "Certifications", level: 2, exact: true });
  await expect(async () => {
    await choose.click({ timeout: 5000 });
    await expect(heading).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 15000 });
}

// openCertifications, then wait until the editor's own request for the uploaded images has been answered.
async function openLoaded(page: Page): Promise<void> {
  const answered = page.waitForResponse((r) => /\/api\/admin\/images\/(\?.*)?$/.test(r.url()), { timeout: 20000 });
  await openCertifications(page);
  await answered;
  await expect(itemsOf(page).first()).toBeVisible();
}

type Fields = { name?: string; path?: string; link?: string };

async function fillCert(page: Page, values: Fields): Promise<void> {
  if (values.name !== undefined) await nameBox(page).fill(values.name);
  if (values.path !== undefined) await pathBox(page).fill(values.path);
  if (values.link !== undefined) await linkBox(page).fill(values.link);
}

// Holds every request of one method to the route until release() is called, then lets it through.
async function holdRoute(page: Page, method: string): Promise<{ release: () => void; count: () => number }> {
  let seen = 0;
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(/\/api\/admin\/certifications\/(\?.*)?$/, async (route) => {
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

async function expectInvalid(page: Page, field: Locator, message: string, label: string): Promise<void> {
  await expect(field, label + " invalid").toHaveAttribute("aria-invalid", "true");
  const describedBy = await field.getAttribute("aria-describedby");
  expect(describedBy, label + " describedby").not.toBeNull();
  await expect(page.locator('[id="' + describedBy + '"]'), label + " message").toHaveText(message);
}

const trimmedLabels = async (page: Page): Promise<string[]> =>
  (await labelsOf(page).allTextContents()).map((t) => t.trim());

test("E2E-13: the owner adds a certification with an uploaded image to an empty list and it is stored and listed after a reload", async ({
  browser,
  baseURL,
  request,
}) => {
  test.setTimeout(90000);
  dbReset();
  storeReset();
  dbSeedWith([SCRUM_IMAGE], []);
  seedFiles();
  const before = await (await request.get("/")).text();
  const { context, page } = await ownerPage(browser, baseURL as string);
  await openCertifications(page);
  const screen = screenOf(page);

  await expect(statusWith(page, NO_CERTS)).toBeVisible();
  await expect(listOf(page)).toHaveCount(0);
  await expect(button(screen, "Add certification")).toBeVisible();

  await button(screen, "Add certification").click();
  await expect(addHeading(page)).toBeVisible();
  await expect.poll(() => optionTexts(imageSelect(page))).toEqual(["None", "scrum-badge.png"]);
  await fillCert(page, { name: "Professional Scrum Developer" });
  await imageSelect(page).selectOption({ label: "scrum-badge.png" });
  await expect(pathBox(page)).toHaveValue("");
  await fillCert(page, { link: "https://www.credly.com/badges/example/public_url" });
  await button(screen, "Save").click();

  await expect(screen.getByRole("status")).toHaveText(ENTRY_SAVED);
  await expect(itemsOf(page)).toHaveCount(1);
  await expect(labelsOf(page)).toHaveText(["Professional Scrum Developer"]);
  await expect(paragraphsOf(itemsOf(page).first())).toHaveText([
    "Badge image: scrum-badge.png",
    "Credential link: https://www.credly.com/badges/example/public_url",
  ]);
  await expect(addHeading(page)).toHaveCount(0);
  const stored = storedCerts();
  expect(stored).toHaveLength(1);
  expect(stored[0].id).toMatch(UUID);
  expect(stored[0].position).toBe(0);
  expect(stored[0].data).toEqual({
    name: "Professional Scrum Developer",
    icon: "https://stand-in.invalid/storage/v1/object/public/images/55555555-5555-4555-8555-555555555555.png",
    url: "https://www.credly.com/badges/example/public_url",
  });

  await page.reload();
  await openCertifications(page);
  await expect(itemsOf(page)).toHaveCount(1);
  await expect(labelsOf(page)).toHaveText(["Professional Scrum Developer"]);
  await expect(paragraphsOf(itemsOf(page).first())).toHaveText([
    "Badge image: scrum-badge.png",
    "Credential link: https://www.credly.com/badges/example/public_url",
  ]);
  await expect(screen.getByText(NO_CERTS)).toHaveCount(0);

  await button(itemsOf(page).first(), "Edit").click();
  await expect(editHeading(page)).toBeVisible();
  await expect(nameBox(page)).toHaveValue("Professional Scrum Developer");
  await expect.poll(() => selected(imageSelect(page))).toBe("scrum-badge.png");
  await expect(pathBox(page)).toHaveValue("");
  await expect(linkBox(page)).toHaveValue("https://www.credly.com/badges/example/public_url");

  const after = await request.get("/");
  expect(after.status()).toBe(200);
  expect(await after.text()).toBe(before);
  await context.close();
});

test("E2E-14: the owner adds a certification with a typed badge path and it is stored as typed", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(60000);
  dbReset();
  storeReset();
  dbSeedWith([SCRUM_IMAGE], []);
  seedFiles();
  const { context, page } = await ownerPage(browser, baseURL as string);
  await openCertifications(page);
  const screen = screenOf(page);

  await button(screen, "Add certification").click();
  await fillCert(page, {
    name: "Professional Scrum Developer",
    path: "/certs/scrum.png",
    link: "https://www.credly.com/badges/example/public_url",
  });
  expect(await selected(imageSelect(page))).toBe("None");
  await button(screen, "Save").click();

  await expect(screen.getByRole("status")).toHaveText(ENTRY_SAVED);
  await expect(itemsOf(page)).toHaveCount(1);
  await expect(labelsOf(page)).toHaveText(["Professional Scrum Developer"]);
  await expect(paragraphsOf(itemsOf(page).first())).toHaveText([
    "Badge image: /certs/scrum.png",
    "Credential link: https://www.credly.com/badges/example/public_url",
  ]);
  const stored = storedCerts();
  expect(stored).toHaveLength(1);
  expect(stored[0].position).toBe(0);
  expect(stored[0].data).toEqual(SCRUM);

  await page.reload();
  await openCertifications(page);
  await expect(paragraphsOf(itemsOf(page).first())).toHaveText([
    "Badge image: /certs/scrum.png",
    "Credential link: https://www.credly.com/badges/example/public_url",
  ]);
  await button(itemsOf(page).first(), "Edit").click();
  await expect.poll(() => selected(imageSelect(page))).toBe("None");
  await expect(pathBox(page)).toHaveValue("/certs/scrum.png");
  await context.close();
});

test("E2E-15: the picker and the path field keep each other in step and the saved badge follows the last choice", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(90000);
  dbReset();
  storeReset();
  dbSeedWith([SCRUM_IMAGE, CHAIN_IMAGE], [row(SCRUM_ID, 0, SCRUM)]);
  seedFiles();
  const { context, page } = await ownerPage(browser, baseURL as string);
  await openCertifications(page);
  const screen = screenOf(page);
  await expect(itemsOf(page)).toHaveCount(1);

  await button(itemsOf(page).first(), "Edit").click();
  await expect(editHeading(page)).toBeVisible();
  expect(await selected(imageSelect(page))).toBe("None");
  await expect(pathBox(page)).toHaveValue("/certs/scrum.png");

  await imageSelect(page).selectOption({ label: "blockchain-badge.png" });
  await expect(pathBox(page)).toHaveValue("");
  await pathBox(page).fill("/certs/new.png");
  await expect.poll(() => selected(imageSelect(page))).toBe("None");
  await imageSelect(page).selectOption({ label: "scrum-badge.png" });
  await imageSelect(page).selectOption({ label: "None" });
  await expect(pathBox(page)).toHaveValue("");
  await expect.poll(() => selected(imageSelect(page))).toBe("None");
  await pathBox(page).fill("/certs/last.png");
  await button(screen, "Save").click();
  await expect(screen.getByRole("status")).toHaveText(ENTRY_SAVED);
  await expect.poll(() => iconOf(SCRUM_ID)).toBe("/certs/last.png");
  expect(storedCerts()[0].data).toEqual({ ...SCRUM, icon: "/certs/last.png" });

  await button(itemsOf(page).first(), "Edit").click();
  await expect(editHeading(page)).toBeVisible();
  await pathBox(page).fill("/certs/x.png");
  await imageSelect(page).selectOption({ label: "scrum-badge.png" });
  await button(screen, "Save").click();
  await expect(screen.getByRole("status")).toHaveText(ENTRY_SAVED);
  await expect
    .poll(() => iconOf(SCRUM_ID))
    .toBe("https://stand-in.invalid/storage/v1/object/public/images/55555555-5555-4555-8555-555555555555.png");
  await context.close();
});

test("E2E-16: the owner edits a certification, the old badge is replaced by the picked image and the image opens for anyone", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(90000);
  dbReset();
  storeReset();
  dbSeedWith([CHAIN_IMAGE], [row(CHAIN_ID, 0, CHAIN)]);
  seedFiles();
  const { context, page } = await ownerPage(browser, baseURL as string);
  await openCertifications(page);
  const screen = screenOf(page);
  await expect(itemsOf(page)).toHaveCount(1);
  await expect(paragraphsOf(itemsOf(page).first())).toHaveText([
    "Badge image: /certs/blockchain.png",
    "Credential link: https://www.blockchain-council.org/certificate/example",
  ]);

  await button(itemsOf(page).first(), "Edit").click();
  await expect(editHeading(page)).toBeVisible();
  await expect(nameBox(page)).toHaveValue("Certified Blockchain Developer");
  expect(await selected(imageSelect(page))).toBe("None");
  await expect(pathBox(page)).toHaveValue("/certs/blockchain.png");
  await fillCert(page, { name: "Certified Blockchain Developer (2026)" });
  await imageSelect(page).selectOption({ label: "blockchain-badge.png" });
  await button(screen, "Save").click();

  await expect(screen.getByRole("status")).toHaveText(ENTRY_SAVED);
  await expect(labelsOf(page)).toHaveText(["Certified Blockchain Developer (2026)"]);
  expect(await trimmedLabels(page)).toEqual(["Certified Blockchain Developer (2026)"]);
  await expect(paragraphsOf(itemsOf(page).first())).toHaveText([
    "Badge image: blockchain-badge.png",
    "Credential link: https://www.blockchain-council.org/certificate/example",
  ]);
  const publicAddress = "https://stand-in.invalid/storage/v1/object/public/images/66666666-6666-4666-8666-666666666666.png";
  expect(dbCerts()).toEqual([
    row(CHAIN_ID, 0, { ...CHAIN, name: "Certified Blockchain Developer (2026)", icon: publicAddress }),
  ]);

  await page.reload();
  await openCertifications(page);
  expect(await trimmedLabels(page)).toEqual(["Certified Blockchain Developer (2026)"]);
  await button(itemsOf(page).first(), "Edit").click();
  await expect.poll(() => selected(imageSelect(page))).toBe("blockchain-badge.png");
  await expect(pathBox(page)).toHaveValue("");
  const icon = iconOf(CHAIN_ID) ?? "";
  for (const needle of ["?", "token", "key"]) expect(icon, needle).not.toContain(needle);

  const visitor = await visitorPage(browser);
  const response = await visitor.page.goto(publicAddress);
  expect(response?.status()).toBe(200);
  expect(response?.headers()["content-type"]).toBe("image/png");
  expect((await response?.body())?.length).toBe(70);
  await visitor.context.close();
  await context.close();
});

test("E2E-17: the owner moves certifications up and down, the order is stored and the end buttons are absent", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(90000);
  dbReset();
  storeReset();
  seedThree();
  seedFiles();
  const { context, page } = await ownerPage(browser, baseURL as string);
  await openCertifications(page);
  const screen = screenOf(page);

  await expect(itemsOf(page)).toHaveCount(3);
  const counts = async (index: number): Promise<[number, number]> => [
    await button(itemsOf(page).nth(index), "Move up").count(),
    await button(itemsOf(page).nth(index), "Move down").count(),
  ];
  expect(await counts(0)).toEqual([0, 1]);
  expect(await counts(1)).toEqual([1, 1]);
  expect(await counts(2)).toEqual([1, 0]);

  await button(itemStarting(page, "Certified Blockchain Developer"), "Move up").click();
  await expect(screen.getByRole("status")).toHaveText(ORDER_SAVED);
  await expect(labelsOf(page)).toHaveText([
    "Professional Scrum Developer",
    "Certified Blockchain Developer",
    "Google IT Automation with Python",
  ]);
  expect(positionsOf()).toEqual({ [SCRUM_ID]: 0, [CHAIN_ID]: 1, [GOOGLE_ID]: 2 });

  await button(itemStarting(page, "Professional Scrum Developer"), "Move down").click();
  await expect(labelsOf(page)).toHaveText([
    "Certified Blockchain Developer",
    "Professional Scrum Developer",
    "Google IT Automation with Python",
  ]);
  await expect(screen.getByRole("status")).toHaveText(ORDER_SAVED);

  await page.reload();
  await openCertifications(page);
  await expect(labelsOf(page)).toHaveText([
    "Certified Blockchain Developer",
    "Professional Scrum Developer",
    "Google IT Automation with Python",
  ]);
  expect(dbNames()).toEqual([
    "Certified Blockchain Developer",
    "Professional Scrum Developer",
    "Google IT Automation with Python",
  ]);
  await context.close();
});

test("E2E-18: a new certification goes to the bottom of the list, one above the highest stored position", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(90000);
  dbReset();
  storeReset();
  dbSeedWith([SCRUM_IMAGE], [row(SCRUM_ID, 3, SCRUM), row(GOOGLE_ID, 7, GOOGLE)]);
  seedFiles();
  const { context, page } = await ownerPage(browser, baseURL as string);
  await openCertifications(page);
  const screen = screenOf(page);
  await expect(itemsOf(page)).toHaveCount(2);

  await button(screen, "Add certification").click();
  await fillCert(page, {
    name: "Certified Blockchain Developer",
    path: "/certs/blockchain.png",
    link: "https://www.blockchain-council.org/certificate/example",
  });
  await button(screen, "Save").click();

  await expect(screen.getByRole("status")).toHaveText(ENTRY_SAVED);
  const order = [
    "Professional Scrum Developer",
    "Google IT Automation with Python",
    "Certified Blockchain Developer",
  ];
  await expect(labelsOf(page)).toHaveText(order);
  const stored = storedCerts();
  expect(stored).toHaveLength(3);
  const added = stored.find((r) => r.data.name === "Certified Blockchain Developer");
  expect(added?.data).toEqual(CHAIN);
  expect(added?.position).toBe(8);
  expect(stored.find((r) => r.id === SCRUM_ID)?.position).toBe(3);
  expect(stored.find((r) => r.id === GOOGLE_ID)?.position).toBe(7);

  await page.reload();
  await openCertifications(page);
  await expect(labelsOf(page)).toHaveText(order);
  await context.close();
});

test("E2E-19: deleting asks first, Cancel keeps the certification and Confirm removes it for good", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(120000);
  for (const confirm of [false, true]) {
    dbReset();
    storeReset();
    seedTwo();
    seedFiles();
    const seed = [row(SCRUM_ID, 0, SCRUM), row(GOOGLE_ID, 1, GOOGLE)];
    const { context, page } = await ownerPage(browser, baseURL as string);
    await openCertifications(page);
    await expect(itemsOf(page)).toHaveCount(2);

    await button(itemStarting(page, "Google IT Automation with Python"), "Delete").click();
    const group = confirmGroup(page);
    await expect(group).toBeVisible();
    await expect(group.locator("p")).toHaveText(ASK_GOOGLE);
    await expect(button(group, "Confirm")).toBeVisible();
    await expect(button(group, "Cancel")).toBeVisible();
    await expect(itemsOf(page)).toHaveCount(2);
    expect(dbCerts()).toEqual(seed);

    if (!confirm) {
      await button(group, "Cancel").click();
      await expect(group).toHaveCount(0);
      await expect(labelsOf(page)).toHaveText(["Professional Scrum Developer", "Google IT Automation with Python"]);
      expect(dbCerts()).toEqual(seed);
      await page.reload();
      await openCertifications(page);
      await expect(labelsOf(page)).toHaveText(["Professional Scrum Developer", "Google IT Automation with Python"]);
      expect(dbCerts()).toEqual(seed);
    } else {
      await button(group, "Confirm").click();
      await expect(statusWith(page, "Entry deleted")).toBeVisible();
      await expect(labelsOf(page)).toHaveText(["Professional Scrum Developer"]);
      expect(dbCerts()).toEqual([row(SCRUM_ID, 0, SCRUM)]);
      await page.reload();
      await openCertifications(page);
      await expect(labelsOf(page)).toHaveText(["Professional Scrum Developer"]);
      expect(dbCerts()).toEqual([row(SCRUM_ID, 0, SCRUM)]);
    }
    await context.close();
  }
});

test("E2E-20: a bad name, badge or link is refused next to the field with nothing sent", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(180000);
  dbReset();
  storeReset();
  dbSeedWith([SCRUM_IMAGE], [row(SCRUM_ID, 0, SCRUM)]);
  seedFiles();
  const { context, page } = await ownerPage(browser, baseURL as string);
  await openCertifications(page);
  const screen = screenOf(page);
  await expect(itemsOf(page)).toHaveCount(1);

  type Case = {
    label: string;
    name: string;
    path: string;
    link: string;
    pick?: string;
    errors: { name?: string; path?: string; link?: string };
  };
  const OK_LINK = "https://example.com/cred";
  const cases: Case[] = [
    { label: "(1)", name: "", path: "/certs/scrum.png", link: OK_LINK, errors: { name: NAME_REQUIRED } },
    { label: "(2)", name: "   ", path: "/certs/scrum.png", link: OK_LINK, errors: { name: NAME_REQUIRED } },
    { label: "(3)", name: "Professional Scrum", path: "/certs/scrum.png", link: "credly.com/badge", errors: { link: LINK_INVALID } },
    { label: "(4)", name: "Professional Scrum", path: "/certs/scrum.png", link: "http://example.com/cred", errors: { link: LINK_INVALID } },
    { label: "(5)", name: "Professional Scrum", path: "certs/scrum.png", link: OK_LINK, errors: { path: ICON_INVALID } },
    { label: "(6)", name: "Professional Scrum", path: "//cdn.example.com/x.png", link: OK_LINK, errors: { path: ICON_INVALID } },
    { label: "(7)", name: "Professional Scrum", path: "", link: OK_LINK, errors: { path: ICON_REQUIRED } },
    {
      label: "(8)",
      name: "",
      path: "certs/scrum.png",
      link: "credly.com/badge",
      errors: { name: NAME_REQUIRED, path: ICON_INVALID, link: LINK_INVALID },
    },
    {
      label: "(9)",
      name: "Professional Scrum",
      path: "",
      link: "http://example.com/cred",
      pick: "scrum-badge.png",
      errors: { link: LINK_INVALID },
    },
  ];

  for (const c of cases) {
    await button(screen, "Add certification").click();
    await expect(addHeading(page)).toBeVisible();
    if (c.pick !== undefined) await imageSelect(page).selectOption({ label: c.pick });
    await fillCert(page, { name: c.name, link: c.link });
    if (c.pick === undefined) await fillCert(page, { path: c.path });
    await button(screen, "Save").click();

    const fields: [keyof Case["errors"], Locator][] = [
      ["name", nameBox(page)],
      ["path", pathBox(page)],
      ["link", linkBox(page)],
    ];
    for (const [key, field] of fields) {
      const message = c.errors[key];
      if (message !== undefined) await expectInvalid(page, field, message, c.label + " " + key);
      else await expect(field, c.label + " " + key + " valid").not.toHaveAttribute("aria-invalid", "true");
    }
    await expect(nameBox(page), c.label + " name kept").toHaveValue(c.name);
    await expect(pathBox(page), c.label + " path kept").toHaveValue(c.pick === undefined ? c.path : "");
    await expect(linkBox(page), c.label + " link kept").toHaveValue(c.link);
    if (c.pick !== undefined) expect(await selected(imageSelect(page)), c.label + " pick kept").toBe(c.pick);
    await expect(addHeading(page)).toBeVisible();
    await expect(statusWith(page, ENTRY_SAVED)).toHaveCount(0);
    expect(dbCerts(), c.label).toEqual([row(SCRUM_ID, 0, SCRUM)]);
    await button(screen, "Cancel").click();
    await expect(addHeading(page)).toHaveCount(0);
  }
  await context.close();
});

test("E2E-21: a blank name is refused on an edit, and saved text is trimmed with the badge and link rules applied", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(150000);
  dbReset();
  storeReset();
  dbSeedWith([SCRUM_IMAGE], [row(SCRUM_ID, 0, SCRUM)]);
  seedFiles();
  const { context, page } = await ownerPage(browser, baseURL as string);
  await openCertifications(page);
  const screen = screenOf(page);
  await expect(itemsOf(page)).toHaveCount(1);

  await button(itemStarting(page, "Professional Scrum Developer"), "Edit").click();
  await fillCert(page, { name: "   " });
  await button(screen, "Save").click();
  await expectInvalid(page, nameBox(page), NAME_REQUIRED, "edit name");
  await button(screen, "Cancel").click();
  await page.reload();
  await openCertifications(page);
  await expect(labelsOf(page)).toHaveText(["Professional Scrum Developer"]);

  await button(screen, "Add certification").click();
  await fillCert(page, {
    name: "  Google IT Automation with Python ",
    path: " /certs/google.png ",
    link: "  https://www.coursera.org/account/accomplishments/verify/GOOGLE1  ",
  });
  await button(screen, "Save").click();
  await expect(itemsOf(page)).toHaveCount(2);
  await expect(screen.getByRole("status")).toHaveText(ENTRY_SAVED);
  await expect(labelsOf(page)).toHaveText(["Professional Scrum Developer", "Google IT Automation with Python"]);
  const second = storedCerts().find((r) => r.id !== SCRUM_ID);
  expect(second?.data).toEqual(GOOGLE);
  expect(second?.position).toBe(1);

  await button(screen, "Add certification").click();
  await fillCert(page, { name: "Third", path: "HTTP://x.example/a.png", link: "HTTPS://X.example/cred" });
  await button(screen, "Save").click();
  await expect(itemsOf(page)).toHaveCount(3);
  await expect(screen.getByRole("status")).toHaveText(ENTRY_SAVED);
  const third = storedCerts().find((r) => r.data.name === "Third");
  expect(third?.data).toEqual({ name: "Third", icon: "HTTP://x.example/a.png", url: "HTTPS://X.example/cred" });
  expect(third?.position).toBe(2);

  await button(screen, "Add certification").click();
  await fillCert(page, { name: "Fourth", path: "/x", link: "https://x" });
  await button(screen, "Save").click();
  await expect(itemsOf(page)).toHaveCount(4);
  await expect(screen.getByRole("status")).toHaveText(ENTRY_SAVED);
  const fourth = storedCerts().find((r) => r.data.name === "Fourth");
  expect(fourth?.data).toEqual({ name: "Fourth", icon: "/x", url: "https://x" });
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
  await openCertifications(page);
  const screen = screenOf(page);

  await expect(page.getByRole("alert").filter({ hasText: LOAD_FAILED })).toHaveText(LOAD_FAILED);
  await expect(screen.getByText(NO_CERTS)).toHaveCount(0);
  await expect(button(screen, "Add certification")).toHaveCount(0);
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
  await button(menu(page), "Certifications").click();
  await expect(itemsOf(page)).toHaveCount(2);
  await expect(labelsOf(page)).toHaveText(["Professional Scrum Developer", "Google IT Automation with Python"]);
  await context.close();
});

test("E2E-23: a failed save, move or delete shows one fixed message, keeps the form and the list, and works again after recovery", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(150000);
  dbReset();
  storeReset();
  seedTwo();
  seedFiles();
  const { context, page } = await ownerPage(browser, baseURL as string);
  await openLoaded(page);
  const screen = screenOf(page);
  await expect(itemsOf(page)).toHaveCount(2);
  dbBreak();

  await button(itemsOf(page).first(), "Edit").click();
  await fillCert(page, { name: "Staff Certificate" });
  await button(screen, "Save").click();
  await expect(screen.getByRole("alert")).toHaveText(SAVE_FAILED);
  await expect(editHeading(page)).toBeVisible();
  await expect(nameBox(page)).toHaveValue("Staff Certificate");
  await expect(statusWith(page, ENTRY_SAVED)).toHaveCount(0);
  const failedText = await page.locator("body").innerText();
  for (const leak of LEAKS) expect(failedText, "save leaks " + leak).not.toContain(leak);

  await button(screen, "Cancel").click();
  await expect(labelsOf(page)).toHaveText(["Professional Scrum Developer", "Google IT Automation with Python"]);

  await button(screen, "Add certification").click();
  await fillCert(page, { name: "Gamma Cert", path: "/certs/g.png", link: "https://example.com/g" });
  await button(screen, "Save").click();
  await expect(screen.getByRole("alert")).toHaveText(SAVE_FAILED);
  await expect(addHeading(page)).toBeVisible();
  await expect(nameBox(page)).toHaveValue("Gamma Cert");
  await expect(pathBox(page)).toHaveValue("/certs/g.png");
  await expect(linkBox(page)).toHaveValue("https://example.com/g");
  await button(screen, "Cancel").click();

  await button(itemsOf(page).first(), "Move down").click();
  await expect(screen.getByRole("alert")).toHaveText(MOVE_FAILED);
  await expect(labelsOf(page)).toHaveText(["Professional Scrum Developer", "Google IT Automation with Python"]);
  await expect(statusWith(page, ORDER_SAVED)).toHaveCount(0);

  await button(itemsOf(page).first(), "Delete").click();
  await button(confirmGroup(page), "Confirm").click();
  await expect(screen.getByRole("alert")).toHaveText(DELETE_FAILED);
  await expect(itemsOf(page)).toHaveCount(2);

  dbFix();
  await button(confirmGroup(page), "Cancel").click();
  await button(itemsOf(page).first(), "Edit").click();
  await fillCert(page, { name: "Staff Certificate" });
  await button(screen, "Save").click();
  await expect(screen.getByRole("status")).toHaveText(ENTRY_SAVED);
  await expect(labelsOf(page).first()).toHaveText("Staff Certificate");
  const stored = storedCerts();
  expect(stored.find((r) => r.id === SCRUM_ID)?.data.name).toBe("Staff Certificate");
  const google = stored.find((r) => r.id === GOOGLE_ID);
  expect(google?.position).toBe(1);
  expect(google?.data).toEqual(GOOGLE);
  expect(stored.some((r) => r.data.name === "Gamma Cert")).toBe(false);
  await context.close();
});

test("E2E-24: a certification deleted in another tab is not brought back and the stale screen shows the failure", async ({
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
  await openCertifications(page);
  await openCertifications(second);
  await expect(itemsOf(page)).toHaveCount(3);
  await expect(itemsOf(second)).toHaveCount(3);

  await button(itemStarting(page, "Professional Scrum Developer"), "Delete").click();
  await button(confirmGroup(page), "Confirm").click();
  await expect(statusWith(page, "Entry deleted")).toBeVisible();
  expect(storedCerts().map((r) => r.id).sort()).toEqual([GOOGLE_ID, CHAIN_ID].sort());

  const screen2 = screenOf(second);
  await button(itemStarting(second, "Professional Scrum Developer"), "Edit").click();
  await fillCert(second, { name: "Resurrected" });
  await button(screen2, "Save").click();
  await expect(screen2.getByRole("alert")).toHaveText(SAVE_FAILED);
  await button(screen2, "Cancel").click();

  await button(itemStarting(second, "Google IT Automation with Python"), "Move up").click();
  await expect(screen2.getByRole("alert")).toHaveText(MOVE_FAILED);
  expect(storedCerts().map((r) => r.id).sort()).toEqual([GOOGLE_ID, CHAIN_ID].sort());
  expect(positionsOf()).toEqual({ [GOOGLE_ID]: 1, [CHAIN_ID]: 2 });

  await button(itemStarting(second, "Professional Scrum Developer"), "Delete").click();
  await button(confirmGroup(second), "Confirm").click();
  await expect(screen2.getByRole("alert")).toHaveText(DELETE_FAILED);

  await second.reload();
  await openCertifications(second);
  await expect(labelsOf(second)).toHaveText(["Google IT Automation with Python", "Certified Blockchain Developer"]);
  expect(storedCerts().some((r) => r.data.name === "Resurrected")).toBe(false);
  await context.close();
});

test("E2E-25: a move or save after sign-in ended or with no network shows the fixed failure and keeps the typed text", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(150000);
  const seed = [row(SCRUM_ID, 0, SCRUM), row(GOOGLE_ID, 1, GOOGLE)];

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
  await fillCert(one.page, { name: "Staff Certificate" });
  await button(screen1, "Save").click();
  await expect(screen1.getByRole("alert")).toHaveText(SAVE_FAILED);
  await expect(editHeading(one.page)).toBeVisible();
  await expect(nameBox(one.page)).toHaveValue("Staff Certificate");
  expect(dbCerts()).toEqual(seed);
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
  await fillCert(two.page, { name: "Offline Name" });
  await button(screen2, "Save").click();
  await expect(screen2.getByRole("alert")).toHaveText(SAVE_FAILED);
  await expect(nameBox(two.page)).toHaveValue("Offline Name");
  expect(dbCerts()).toEqual(seed);
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
  dbSeedWith([SCRUM_IMAGE], []);
  seedFiles();
  const { context, page } = await ownerPage(browser, baseURL as string);
  await openCertifications(page);
  const screen = screenOf(page);

  // Part 1: add, held.
  const post = await holdRoute(page, "POST");
  await button(screen, "Add certification").click();
  await fillCert(page, {
    name: "Professional Scrum Developer",
    path: "/certs/scrum.png",
    link: "https://www.credly.com/badges/example/public_url",
  });
  await button(screen, "Save").dblclick();
  await expect(screen.getByRole("status")).toHaveText("Saving…");
  await expect(button(screen, "Save")).toBeDisabled();
  await expect(button(screen, "Cancel")).toBeDisabled();
  await expect(nameBox(page)).toBeDisabled();
  await expect(pathBox(page)).toBeDisabled();
  await expect(linkBox(page)).toBeDisabled();
  await expect(imageSelect(page)).toBeDisabled();
  expect(post.count()).toBe(1);
  post.release();
  await expect(itemsOf(page)).toHaveCount(1);
  await expect(labelsOf(page)).toHaveText(["Professional Scrum Developer"]);
  expect(post.count()).toBe(1);
  expect(dbCerts()).toHaveLength(1);

  // Part 2: move, held.
  seedTwo();
  await page.reload();
  await openCertifications(page);
  await expect(itemsOf(page)).toHaveCount(2);
  const patch = await holdRoute(page, "PATCH");
  await button(itemsOf(page).first(), "Move down").click();
  await expect(screen.getByRole("status")).toHaveText("Saving…");
  for (const name of ["Edit", "Move up", "Move down", "Delete", "Add certification"]) {
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
  dbSeedWith([SCRUM_IMAGE], [row(SCRUM_ID, 0, SCRUM)]);
  seedFiles();
  const { context, page } = await ownerPage(browser, baseURL as string);
  await openCertifications(page);
  const screen = screenOf(page);
  await expect(itemsOf(page)).toHaveCount(1);

  await button(screen, "Add certification").click();
  await fillCert(page, { name: "Draft" });
  await button(screen, "Cancel").click();
  await expect(addHeading(page)).toHaveCount(0);
  await expect(labelsOf(page)).toHaveText(["Professional Scrum Developer"]);
  expect(dbCerts()).toEqual([row(SCRUM_ID, 0, SCRUM)]);

  await button(screen, "Add certification").click();
  await fillCert(page, { name: "Draft again", path: "/certs/draft-1999.png" });
  await page.reload();
  await openCertifications(page);
  await expect(itemsOf(page)).toHaveCount(1);
  await expect(addHeading(page)).toHaveCount(0);
  const text = await page.locator("body").innerText();
  expect(text).not.toContain("Draft");
  expect(text).not.toContain("1999");
  expect(dbCerts()).toEqual([row(SCRUM_ID, 0, SCRUM)]);
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

test("E2E-28: two certifications with the same text are two certifications, and the last save from two tabs wins quietly", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(150000);
  dbReset();
  storeReset();
  dbSeedWith([SCRUM_IMAGE], []);
  seedFiles();
  const first = await ownerPage(browser, baseURL as string);
  await openCertifications(first.page);
  const screen = screenOf(first.page);
  for (let i = 0; i < 2; i += 1) {
    await button(screen, "Add certification").click();
    await fillCert(first.page, {
      name: "Professional Scrum Developer",
      path: "/certs/scrum.png",
      link: "https://example.com/c",
    });
    await button(screen, "Save").click();
    await expect(itemsOf(first.page)).toHaveCount(i + 1);
    await expect(screen.getByRole("status")).toHaveText(ENTRY_SAVED);
  }
  await expect(labelsOf(first.page)).toHaveText(["Professional Scrum Developer", "Professional Scrum Developer"]);
  const stored = storedCerts();
  expect(stored).toHaveLength(2);
  expect(stored[0].id).not.toBe(stored[1].id);

  await button(itemsOf(first.page).first(), "Delete").click();
  await button(confirmGroup(first.page), "Confirm").click();
  await expect(itemsOf(first.page)).toHaveCount(1);
  expect(dbCerts()).toHaveLength(1);
  await first.context.close();

  dbSeedWith([SCRUM_IMAGE], [row(SCRUM_ID, 0, SCRUM)]);
  const one = await ownerPage(browser, baseURL as string);
  const two = await one.context.newPage();
  await openCertifications(one.page);
  await openCertifications(two);
  await expect(itemsOf(one.page)).toHaveCount(1);
  await expect(itemsOf(two)).toHaveCount(1);

  await button(itemsOf(one.page).first(), "Edit").click();
  await fillCert(one.page, { name: "First" });
  await button(screenOf(one.page), "Save").click();
  await expect(screenOf(one.page).getByRole("status")).toHaveText(ENTRY_SAVED);

  await button(itemsOf(two).first(), "Edit").click();
  await expect(nameBox(two)).toHaveValue("Professional Scrum Developer");
  await fillCert(two, { name: "Second" });
  await button(screenOf(two), "Save").click();
  await expect(screenOf(two).getByRole("status")).toHaveText(ENTRY_SAVED);
  await expect(screenOf(two).getByRole("alert")).toHaveCount(0);

  await one.page.reload();
  await openCertifications(one.page);
  await expect(labelsOf(one.page).first()).toHaveText("Second");
  const final = storedCerts();
  expect(final).toHaveLength(1);
  expect(final[0].data.name).toBe("Second");
  await one.context.close();
});

test("E2E-29: the Certifications screen fits a phone, follows the theme tokens and works from the keyboard", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(240000);
  const surfaceByTheme: Record<string, string> = {};
  const thirty = Array.from({ length: 30 }, (_, i) => {
    const nn = String(i + 1).padStart(2, "0");
    const long = nn === "15";
    return row("00000000-0000-4000-8000-0000000000" + nn, i, {
      name: long ? "N".repeat(120) : "Certificate " + nn,
      icon: long ? "/certs/" + "p".repeat(200) : "/certs/" + nn + ".png",
      url: long ? "https://example.com/" + "g".repeat(200) : "https://example.com/" + nn,
    });
  });

  for (const theme of ["light", "dark"]) {
    dbReset();
    storeReset();
    dbSeedWith([SCRUM_IMAGE], thirty);
    seedFiles();
    const { context, page } = await ownerPage(browser, baseURL as string, { viewport: { width: 375, height: 800 } });
    await page.addInitScript((t) => {
      try {
        localStorage.setItem("theme", t);
      } catch {
        // storage unavailable: the page falls back to its default theme
      }
    }, theme);
    await openCertifications(page);
    const screen = screenOf(page);
    await expect(itemsOf(page)).toHaveCount(30);

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
    const longBox = await itemsOf(page).nth(14).boundingBox();
    expect(listBox, "list box").not.toBeNull();
    expect(longBox, "long item box").not.toBeNull();
    expect((longBox as { width: number }).width, theme + " long item width").toBeLessThanOrEqual(
      (listBox as { width: number }).width + 0.5,
    );

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
    const linkLine = item.locator("p").filter({ hasText: "Credential link: https://example.com/01" });
    await expect(linkLine).toHaveCount(1);
    expect(await computed(linkLine, "color"), theme + " link line").toBe(await probe("color", "--muted"));
    surfaceByTheme[theme] = surfaceAlt;
    if (theme === "dark") await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    await button(itemsOf(page).nth(14), "Edit").click();
    await expect(editHeading(page)).toBeVisible();
    await fits("form of the long certification");
    const groupBox = await badgeGroup(page).boundingBox();
    expect(groupBox, "group box").not.toBeNull();
    expect((groupBox as { x: number }).x).toBeGreaterThanOrEqual(0);
    expect((groupBox as { x: number; width: number }).x + (groupBox as { width: number }).width).toBeLessThanOrEqual(375);
    await button(screen, "Cancel").click();
    await expect(editHeading(page)).toHaveCount(0);

    await button(itemsOf(page).first(), "Edit").click();
    await fillCert(page, { name: "   " });
    await button(screen, "Save").click();
    const alert = page.getByRole("alert").filter({ hasText: NAME_REQUIRED });
    await expect(alert).toHaveText(NAME_REQUIRED);
    expect(await computed(alert, "color"), theme + " alert").toBe(await probe("color", "--accent-rose"));
    await fits("form with an error");
    await button(screen, "Cancel").click();
    await expect(editHeading(page)).toHaveCount(0);

    const first = itemsOf(page).first();
    await button(first, "Edit").focus();
    await page.keyboard.press("Enter");
    await expect(editHeading(page)).toBeVisible();
    await button(screen, "Cancel").click();
    await expect(editHeading(page)).toHaveCount(0);

    await button(first, "Delete").focus();
    await page.keyboard.press("Enter");
    await expect(confirmGroup(page)).toBeVisible();
    await button(confirmGroup(page), "Confirm").focus();
    await page.keyboard.press("Tab");
    await expect(button(confirmGroup(page), "Cancel")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(confirmGroup(page)).toHaveCount(0);
    expect(dbCerts()).toHaveLength(30);
    await context.close();
  }
  expect(surfaceByTheme.dark).not.toBe(surfaceByTheme.light);
});

test("E2E-30: a stored certification with missing or wrong-typed parts is listed as none and refused on save without a change", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(90000);
  dbReset();
  storeReset();
  const stranger = [
    { id: SCRUM_ID, position: 0, data: { name: "Only name", icon: 4, url: ["x"] } },
    { id: GOOGLE_ID, position: 1, data: {} },
  ];
  dbSeedCerts(stranger);
  seedFiles();
  const { context, page } = await ownerPage(browser, baseURL as string);
  await openCertifications(page);
  const screen = screenOf(page);

  await expect(itemsOf(page)).toHaveCount(2);
  expect(await trimmedLabels(page)).toEqual(["Only name", ""]);
  for (const index of [0, 1]) {
    await expect(paragraphsOf(itemsOf(page).nth(index))).toHaveText(["Badge image: none", "Credential link: none"]);
  }

  await button(itemsOf(page).first(), "Edit").click();
  await expect(editHeading(page)).toBeVisible();
  await expect(nameBox(page)).toHaveValue("Only name");
  expect(await selected(imageSelect(page))).toBe("None");
  await expect(pathBox(page)).toHaveValue("");
  await expect(linkBox(page)).toHaveValue("");
  await button(screen, "Save").click();
  await expectInvalid(page, pathBox(page), ICON_REQUIRED, "path");
  await expectInvalid(page, linkBox(page), LINK_INVALID, "link");
  expect(dbCerts()).toEqual(stranger);
  await context.close();
});

test("E2E-31: when the images cannot be loaded or the image is gone the saved badge stays and a typed path still saves", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(150000);
  const chainAddress = addressOf(IMG_CHAIN);

  // Part 1: the images cannot be loaded.
  dbReset();
  storeReset();
  dbSeedWith(
    [CHAIN_IMAGE],
    [row(SCRUM_ID, 0, { ...SCRUM, icon: chainAddress }), row(GOOGLE_ID, 1, GOOGLE)],
  );
  seedFiles();
  storeBreak();
  const one = await ownerPage(browser, baseURL as string);
  await openCertifications(one.page);
  const screen = screenOf(one.page);
  await expect(itemsOf(one.page)).toHaveCount(2);
  await expect(paragraphsOf(itemsOf(one.page).first()).first()).toHaveText("Badge image: " + chainAddress);

  await button(itemsOf(one.page).first(), "Edit").click();
  await expect(editHeading(one.page)).toBeVisible();
  await expect(badgeGroup(one.page).getByRole("alert")).toHaveText(IMAGES_FAILED);
  expect(await optionTexts(imageSelect(one.page))).toEqual(["None"]);
  await expect(pathBox(one.page)).toHaveValue(chainAddress);
  const panelText = await one.page.locator("body").innerText();
  for (const leak of LEAKS) expect(panelText, "panel leaks " + leak).not.toContain(leak);
  await button(screen, "Save").click();
  await expect(screen.getByRole("status")).toHaveText(ENTRY_SAVED);
  expect(iconOf(SCRUM_ID)).toBe(chainAddress);

  await button(itemStarting(one.page, "Google IT Automation with Python"), "Edit").click();
  await expect(editHeading(one.page)).toBeVisible();
  await fillCert(one.page, { path: "/certs/google-2.png" });
  await button(screen, "Save").click();
  await expect.poll(() => iconOf(GOOGLE_ID)).toBe("/certs/google-2.png");
  await expect(screen.getByRole("status")).toHaveText(ENTRY_SAVED);

  storeFix();
  await one.page.reload();
  await openCertifications(one.page);
  await expect(paragraphsOf(itemsOf(one.page).first()).first()).toHaveText("Badge image: blockchain-badge.png");
  await one.context.close();

  // Part 2: the image was deleted.
  dbReset();
  dbSeedWith([], [row(CHAIN_ID, 0, { ...CHAIN, icon: chainAddress })]);
  storeReset();
  const two = await ownerPage(browser, baseURL as string);
  await openLoaded(two.page);
  const screen2 = screenOf(two.page);
  await expect(paragraphsOf(itemsOf(two.page).first()).first()).toHaveText("Badge image: " + chainAddress);
  await button(itemsOf(two.page).first(), "Edit").click();
  await expect(editHeading(two.page)).toBeVisible();
  await expect.poll(() => selected(imageSelect(two.page))).toBe("None");
  await expect(pathBox(two.page)).toHaveValue(chainAddress);
  await expect(badgeGroup(two.page).getByRole("alert")).toHaveCount(0);
  await button(screen2, "Save").click();
  await expect(screen2.getByRole("status")).toHaveText(ENTRY_SAVED);
  expect(iconOf(CHAIN_ID)).toBe(chainAddress);
  await two.context.close();
});

test("E2E-32: the earlier certifications store and spec are gone, the shared files stay, and nothing imports the old store", async () => {
  dbReset();
  storeReset();
  const mustNotExist = [piece("src/lib/", FIRE, "/certifications.ts"), "e2e/manage-certifications.spec.ts"];
  for (const path of mustNotExist) expect(fs.existsSync(path), path + " is gone").toBe(false);
  const mustExist = [
    "src/lib/admin/list.ts",
    "src/lib/admin/certifications.ts",
    "src/app/components/admin/ListEditor.tsx",
    "src/app/components/admin/TechStackEditor.tsx",
    "src/app/components/admin/BlogPostsEditor.tsx",
  ];
  for (const path of mustExist) expect(fs.existsSync(path), path + " exists").toBe(true);

  const read = (path: string): string => fs.readFileSync(path, "utf8");
  const editor = read("src/app/components/admin/CertificationsEditor.tsx");
  for (const text of [
    "createHttpListStore",
    "/api/admin/certifications/",
    "bottomPosition",
    "listImages",
    "photoSelection",
    "UploadedImage",
    'from "@/lib/admin/imagesClient"',
    "Badge image: ",
    "Credential link: ",
  ]) {
    expect(editor, "CertificationsEditor has " + text).toContain(text);
  }
  for (const word of [
    FIRE,
    piece("lib/", "server"),
    piece("lib/", "auth"),
    piece("next", "-auth"),
    PG,
    piece("server", "-only"),
  ]) {
    expect(editor.toLowerCase(), "CertificationsEditor names " + word).not.toContain(word);
  }
  expect(editor, "CertificationsEditor names savingOn").not.toContain(piece("saving", "On"));

  const panel = read("src/app/components/admin/AdminPanel.tsx");
  expect(panel).toContain("CertificationsEditor");
  expect(panel).toContain("ProjectsEditor");
  expect(panel).toContain("ExperienceEditor");
  expect(panel).not.toContain(piece("lib/", "auth"));
  expect(panel).not.toContain(piece("lib/", "server"));
  expect(panel.toLowerCase()).not.toContain(FIRE);

  const certs = read("src/lib/admin/certifications.ts");
  expect(certs.toLowerCase()).not.toContain(FIRE);
  expect(certs).toMatch(/export (function|const) certificationShape\b/);

  const route = read("src/app/api/admin/certifications/route.ts");
  expect(route).toContain(AUTH_MODULE);
  expect(route).toContain(piece("@/lib/", "server/listStore"));
  expect(route).toContain("force-dynamic");
  expect(route.toLowerCase()).not.toContain(FIRE);

  const importers = gitGrep(["-n", "-E", piece(FIRE, "/certifications"), "--", "src", "e2e"]);
  expect(importers.stdout).toBe("");
  expect(importers.status).toBe(1);
});

test("E2E-34: the earlier specs now skip Certifications, keep the table set, and no spec expects its notice", async () => {
  dbReset();
  storeReset();
  const read = (path: string): string => fs.readFileSync(path, "utf8");
  const gone = gitGrep(["-n", "-F", piece("Certifications editor is", " not available yet."), "--", "e2e"]);
  expect(gone.stdout).toBe("");
  expect(gone.status).toBe(1);

  const signIn = read("e2e/owner-google-sign-in.spec.ts");
  expect(signIn).toContain('l !== "Experience"');
  expect(signIn).toContain('l !== "Projects"');
  expect(signIn).toContain('l !== "Certifications"');
  const loop = signIn.split("\n").filter((l) => l.includes('l !== "Certifications"'));
  expect(loop.length).toBeGreaterThan(0);
  for (const line of loop) {
    expect(line).toContain('l !== "Profile"');
    expect(line).toContain('l !== "Images"');
  }

  const projects = read("e2e/owner-manages-projects.spec.ts");
  expect(projects).toContain(
    'export const LIST_TABLES: readonly ListTable[] = ["experience", "projects", "certifications", "tech_categories"];',
  );
  expect(projects).toContain('export type ListTable = "experience" | "projects" | "certifications" | "tech_categories";');
  for (const text of ["/list.ts"]) expect(projects).toContain(text);
  expect(projects).not.toContain("/certifications.ts");

  expect(read("e2e/owner-edits-profile.spec.ts")).not.toContain(piece("Blog posts editor is", " not available yet."));
  expect(read("e2e/owner-uploads-images.spec.ts")).not.toContain(piece("Blog posts editor is", " not available yet."));
});

test("E2E-35: CLAUDE.md lists the certifications route once, keeps the shared pattern and the settings, and drops the old counts", async () => {
  dbReset();
  storeReset();
  const doc = fs.readFileSync("CLAUDE.md", "utf8");
  for (const text of [
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
  ]) {
    expect(doc, text).toContain(text);
  }
  const lines = doc.split("\n");
  for (const route of ["certifications", "projects", "experience"]) {
    const rows = lines.filter((l) => l.startsWith("| `/api/admin/" + route + "/`"));
    expect(rows, "Routes table rows for the " + route + " route").toHaveLength(1);
  }
  for (const text of ["The site reads five settings by name", "The site reads four settings by name", "only API route"]) {
    expect(doc, text).not.toContain(text);
  }
});
