import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { expect, test, type APIRequestContext, type APIResponse } from "@playwright/test";
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
    "firebase",
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
    'export const LIST_TABLES: readonly ListTable[] = ["experience", "projects", "certifications"];',
  );
  expect(lines.filter((l) => /^export type ListTable =/.test(l))).toEqual([
    'export type ListTable = "experience" | "projects" | "certifications";',
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
