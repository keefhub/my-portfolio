import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
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
import {
  ALLOWED_IMAGE_TYPES,
  IMAGE_ID_PATTERN,
  MAX_IMAGE_BYTES,
  checkImageInput,
  formatBytes,
  imageExtension,
  validateImageFile,
} from "../src/lib/admin/images";

test.describe.configure({ mode: "default" });

// Shared fixtures. The tests of this file share the database stand-in file and the storage stand-in directory
// with the profile spec (D-22), so every test starts by resetting both. The first three rows (Step 1) never read
// either, but the reset keeps the file's rule uniform.

const STAND_IN_PREFIX = "stand-in:";

const DB_URL = process.env.SUPABASE_DB_URL ?? "";
const DB_FILE = DB_URL.startsWith(STAND_IN_PREFIX) ? DB_URL.slice(STAND_IN_PREFIX.length) : "";

const STORE_URL = process.env.SUPABASE_URL ?? "";
const STORE_DIR = STORE_URL.startsWith(STAND_IN_PREFIX) ? STORE_URL.slice(STAND_IN_PREFIX.length) : "";

function dbReset(): void {
  if (DB_FILE !== "" && fs.existsSync(DB_FILE)) fs.rmSync(DB_FILE, { force: true });
}

function storeReset(): void {
  if (STORE_DIR !== "") fs.rmSync(STORE_DIR, { recursive: true, force: true });
}

function readDbFile(): Record<string, unknown> {
  if (DB_FILE === "" || !fs.existsSync(DB_FILE)) return {};
  return JSON.parse(fs.readFileSync(DB_FILE, "utf8")) as Record<string, unknown>;
}

// The `images` array of the database stand-in file, or [].
function dbImages(): unknown[] {
  const images = readDbFile().images;
  return Array.isArray(images) ? images : [];
}

// The `profile` value of the database stand-in file, or null.
function dbStored(): unknown {
  const content = readDbFile();
  return "profile" in content ? content.profile : null;
}

const PANEL_API = "/api/admin/profile/";

// Session helpers, copied from the profile spec: sessions are minted with the Auth.js encoder.
const SESSION_COOKIE = "authjs.session-token";
type Claims = { sub: string; email: string; name: string; emailVerified: boolean };
const setting = (name: string): string => process.env[name] ?? "";
const OWNER = (): Claims => ({ sub: "owner-1", email: setting("ADMIN_EMAIL"), name: "Owner Test", emailVerified: true });

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

const HEADSHOT = {
  id: "11111111-1111-4111-8111-111111111111.png",
  name: "headshot.png",
  contentType: "image/png",
  size: 307200,
};

// This file is scanned by the mechanical gate and by E2E-01's repository search, so the key name and the two
// search patterns are put together from pieces and no quoted module name follows an import keyword.
const KEY_NAME = ["SUPABASE", "SERVICE", "ROLE", "KEY"].join("_");
const SCHEME_AND_SLASHES = "https?:" + "/" + "/";
const KEY_PATTERN = KEY_NAME + "[\"']?[[:space:]]*[:=][[:space:]]*[\"'][^\"']+[\"']";
const HOST_PATTERN = SCHEME_AND_SLASHES + "[a-z0-9]+" + "\\." + "supa" + "base" + "\\." + "co";
const SCOPE = ["--", ".", ":(exclude)docs", ":(exclude)package-lock.json"];

function repoGrep(pattern: string): { stdout: string; status: number | null } {
  const result = spawnSync("git", ["grep", "--untracked", "-n", "-E", pattern, ...SCOPE], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  return { stdout: result.stdout ?? "", status: result.status };
}

test("E2E-01: the test run carries a stand-in storage value, no storage client is added and no key or project address is committed", async () => {
  dbReset();
  storeReset();

  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const lock = JSON.parse(fs.readFileSync("package-lock.json", "utf8")) as {
    packages: Record<string, { version?: string }>;
  };
  const dbLibrary = ["post", "gres"].join("");

  expect(pkg.dependencies?.[dbLibrary]).toBe("4.1.1");
  expect(pkg.dependencies?.["next-auth"]).toBe("5.0.0-beta.32");
  const clientScope = "@supa" + "base/";
  for (const name of [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})]) {
    expect(name.startsWith(clientScope), name).toBe(false);
  }
  expect(lock.packages["node_modules/" + dbLibrary]?.version).toBe("4.1.1");

  expect(process.env.SUPABASE_URL ?? "").toMatch(/^stand-in:\/.+portfolio-standin-storage-[0-9a-f]{12}$/);
  expect(process.env[KEY_NAME]).toBeUndefined();

  const keyHits = repoGrep(KEY_PATTERN);
  expect(keyHits.stdout).toBe("");
  expect(keyHits.status).toBe(1);

  const hostHits = repoGrep(HOST_PATTERN);
  expect(hostHits.stdout).toBe("");
  expect(hostHits.status).toBe(1);
});

test("E2E-02: the shared image rules give the story's limits, messages, extensions, id pattern and input checks", async () => {
  dbReset();
  storeReset();

  expect(MAX_IMAGE_BYTES).toBe(5242880);
  expect([...ALLOWED_IMAGE_TYPES]).toEqual(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]);

  expect([0, 1023, 2048, 307200, 204800, 1572864, 5242880, 5242881].map(formatBytes)).toEqual([
    "0 B",
    "1023 B",
    "2 KB",
    "300 KB",
    "200 KB",
    "1.5 MB",
    "5 MB",
    "5 MB",
  ]);

  expect(
    [
      { name: "a.png", size: 0, type: "image/png" },
      { name: "a.png", size: 5242881, type: "image/png" },
      { name: "a.pdf", size: 6291456, type: "application/pdf" },
      { name: "a.pdf", size: 0, type: "application/pdf" },
      { name: "a.gif", size: 100, type: "image/gif" },
      { name: "a.png", size: 5242880, type: "image/png" },
    ].map(validateImageFile),
  ).toEqual([
    "That file is empty",
    "That image is over 5 MB",
    "Only PNG, JPEG, WebP or SVG images can be uploaded",
    "That file is empty",
    "Only PNG, JPEG, WebP or SVG images can be uploaded",
    null,
  ]);

  expect(
    ["image/png", "image/jpeg", "image/webp", "image/svg+xml", "IMAGE/PNG", "image/gif", "__proto__"].map(imageExtension),
  ).toEqual(["png", "jpg", "webp", "svg", null, null, null]);
  expect(imageExtension("constructor")).toBeNull();

  const UUID = "11111111-1111-4111-8111-111111111111";
  for (const ext of ["png", "jpg", "webp", "svg"]) {
    expect(IMAGE_ID_PATTERN.test(UUID + "." + ext), ext).toBe(true);
  }
  for (const bad of [
    "../x.png",
    UUID + ".gif",
    UUID + ".PNG",
    UUID + ".png/",
    "11111111-1111-4111-8111-11111111111.png",
    "",
  ]) {
    expect(IMAGE_ID_PATTERN.test(bad), JSON.stringify(bad)).toBe(false);
  }

  const good = { name: "a.png", type: "image/png", size: 100 };
  const refusal = (input: unknown) => {
    const check = checkImageInput(input);
    return check.ok ? "ok" : check.reason;
  };

  expect(checkImageInput({ name: " headshot.png ", type: "image/png", size: 307200 })).toEqual({
    ok: true,
    value: { name: "headshot.png", type: "image/png", size: 307200 },
  });
  expect(refusal({ ...good, size: 5242880 })).toBe("ok");
  expect(refusal({ ...good, size: 1 })).toBe("ok");
  expect(refusal({ ...good, name: "a".repeat(255) })).toBe("ok");
  expect(checkImageInput({ ...good, extra: "ignored", other: 5 })).toEqual({ ok: true, value: good });

  expect(refusal({ ...good, size: 5242881 })).toBe("too-big");
  expect(refusal({ ...good, size: 0 })).toBe("empty");
  expect(refusal({ name: "a.pdf", type: "application/pdf", size: 6291456 })).toBe("wrong-type");
  expect(refusal({ ...good, type: "image/gif" })).toBe("wrong-type");
  expect(refusal({ ...good, type: "IMAGE/PNG" })).toBe("wrong-type");
  expect(refusal({ name: "a.pdf", type: "application/pdf", size: 0 })).toBe("empty");

  const noType = { name: "a.png", size: 100 };
  const invalidInputs: [string, unknown][] = [
    ["name of spaces", { ...good, name: "   " }],
    ["name of 256 characters", { ...good, name: "a".repeat(256) }],
    ["name that is a number", { ...good, name: 5 }],
    ["missing type", noType],
    ["type that is a number", { ...good, type: 5 }],
    ["size that is text", { ...good, size: "100" }],
    ["size 1.5", { ...good, size: 1.5 }],
    ["size -1", { ...good, size: -1 }],
    ["size NaN", { ...good, size: Number.NaN }],
    ["size Infinity", { ...good, size: Number.POSITIVE_INFINITY }],
    ["size 2 to the 53", { ...good, size: 9007199254740992 }],
    ["null", null],
    ["an array", []],
    ["text", "x"],
  ];
  for (const [label, input] of invalidInputs) {
    expect(refusal(input), label).toBe("invalid");
  }
});

test("E2E-03: the storage log line carries the operation and a safe code and never the failure's own text", async () => {
  dbReset();
  storeReset();

  const { storageLogLine } = await import("../src/lib/admin/storagelog");

  const results = {
    a: storageLogLine(
      "bucket",
      Object.assign(new Error("connect ECONNREFUSED 10.1.2.3:443"), { code: "ECONNREFUSED" }),
    ),
    b: storageLogLine("sign", { status: 503 }),
    c: storageLogLine("stat", { status: 99 }),
    d: storageLogLine("stat", { status: 600 }),
    e: storageLogLine("remove", { status: 404.5 }),
    f: storageLogLine("bucket", { cause: { code: "ENOTFOUND" } }),
    g: storageLogLine("bucket", { code: "10.1.2.3:443" }),
    h: storageLogLine("bucket", { code: "A".repeat(21) }),
    i: storageLogLine("bucket", { code: "A".repeat(20) }),
    j: storageLogLine("remove", new Error("secret")),
    k: storageLogLine("sign", { status: 500, code: "ECONNRESET" }),
  };

  expect(results.a).toBe("[storage] bucket failed ECONNREFUSED");
  expect(results.b).toBe("[storage] sign failed HTTP_503");
  expect(results.c).toBe("[storage] stat failed unknown");
  expect(results.d).toBe("[storage] stat failed unknown");
  expect(results.e).toBe("[storage] remove failed unknown");
  expect(results.f).toBe("[storage] bucket failed ENOTFOUND");
  expect(results.g).toBe("[storage] bucket failed unknown");
  expect(results.h).toBe("[storage] bucket failed unknown");
  expect(results.i).toBe("[storage] bucket failed " + "A".repeat(20));
  expect(results.j).toBe("[storage] remove failed unknown");
  expect(results.k).toBe("[storage] sign failed HTTP_500");

  const others = [
    storageLogLine("stat", undefined),
    storageLogLine("stat", null),
    storageLogLine("stat", "text"),
    storageLogLine("stat", 5),
  ];
  for (const line of others) expect(line.endsWith(" failed unknown"), line).toBe(true);

  for (const line of [...Object.values(results), ...others]) {
    for (const leak of ["secret", "10.1.2.3", "443"]) expect(line.includes(leak), line + " / " + leak).toBe(false);
  }
});

function gitGrep(args: string[]): { stdout: string; status: number | null } {
  const result = spawnSync("git", ["grep", "--untracked", ...args], { cwd: process.cwd(), encoding: "utf8" });
  return { stdout: result.stdout ?? "", status: result.status };
}

const gitPaths = (stdout: string): string[] => stdout.split("\n").filter((line) => line !== "");

test("E2E-04: the image SQL is exactly the proven text, every server file is server-only, and the database library, the storage settings and the word for the old backend stay in their files", async () => {
  dbReset();
  storeReset();

  // (1) the image SQL module
  const sql = fs.readFileSync("src/lib/server/imageSql.ts", "utf8");
  const statements = [
    "create table if not exists images (seq bigint generated always as identity, id text primary key, name text not null, content_type text not null, size integer not null, created_at timestamptz not null default now())",
    "alter table images enable row level security",
    "select id, name, content_type, size from images order by seq desc",
    "select id from images where id = $1",
    "insert into images (id, name, content_type, size) values ($1, $2, $3, $4) on conflict (id) do nothing",
    "delete from images where id = $1 returning id",
  ];
  for (const statement of statements) expect(sql.includes(statement), statement).toBe(true);
  for (const word of ["drop ", "truncate ", "update "]) expect(sql.includes(word), word).toBe(false);

  // (2) the first non-empty line of every file in src/lib/server/
  const files = fs.readdirSync("src/lib/server").filter((name) => fs.statSync("src/lib/server/" + name).isFile());
  expect(files).toEqual(expect.arrayContaining(["imageSql.ts", "storage.ts", "storageStandin.ts"]));
  for (const name of files) {
    const first = fs
      .readFileSync("src/lib/server/" + name, "utf8")
      .split("\n")
      .find((line) => line.trim() !== "");
    expect(first?.trim(), name).toBe('import "server-only";');
  }

  // (3) who imports from lib/server
  const importers = gitPaths(gitGrep(["-l", "-E", "lib/server", "--", "src"]).stdout);
  expect(importers.length).toBeGreaterThan(0);
  for (const path of importers) {
    expect(path.startsWith("src/app/api/admin/") || path.startsWith("src/lib/server/"), path).toBe(true);
  }

  // (4) who names the database library
  const dbLibrary = ["post", "gres"].join("");
  const libraryHits = gitGrep(["-l", "-E", "[\"']" + dbLibrary + "[\"']", "--", "src"]);
  expect(gitPaths(libraryHits.stdout)).toEqual(["src/lib/server/database.ts"]);

  // (5) who reads the two storage settings
  const urlName = ["SUPABASE", "URL"].join("_");
  const settingHits = gitGrep(["-l", "-E", "-e", KEY_NAME, "-e", urlName, "--", "src"]);
  expect(gitPaths(settingHits.stdout)).toEqual(["src/lib/server/storage.ts"]);

  // (6) the old backend's name appears nowhere in the new server surface
  const oldBackend = ["fire", "base"].join("");
  const oldHits = gitGrep([
    "-n",
    "-i",
    oldBackend,
    "--",
    "src/lib/server",
    "src/lib/admin/storagelog.ts",
    "src/lib/admin/imagesClient.ts",
    "src/app/api/admin",
  ]);
  expect(oldHits.stdout).toBe("");
  expect(oldHits.status).toBe(1);
});

test("E2E-05: saving the profile keeps the stored image list and reading an image-only file answers an empty profile", async ({
  request,
}) => {
  dbReset();
  storeReset();

  const owner = await cookieOf(OWNER());
  const put = (body: string) =>
    request.put(PANEL_API, {
      headers: { "content-type": "application/json", cookie: owner },
      data: body,
      maxRedirects: 0,
    });

  // (a) a file holding both keys
  fs.writeFileSync(
    DB_FILE,
    '{"profile":{"name":"Keith Lim","headline":"Software Engineer"},"images":[{"id":"11111111-1111-4111-8111-111111111111.png","name":"headshot.png","contentType":"image/png","size":307200}]}',
  );
  const first = await put('{"name":"Second","headline":"H"}');
  expect(first.status()).toBe(200);
  expect(dbImages()).toEqual([HEADSHOT]);
  expect(dbStored()).toEqual({
    name: "Second",
    headline: "H",
    about: [],
    photo: "",
    email: "",
    resumeLink: "",
    socialLinks: [],
  });

  // (b) a file holding only images
  fs.writeFileSync(
    DB_FILE,
    '{"images":[{"id":"11111111-1111-4111-8111-111111111111.png","name":"headshot.png","contentType":"image/png","size":307200}]}',
  );
  const read = await request.get(PANEL_API, { headers: { cookie: owner }, maxRedirects: 0 });
  expect(read.status()).toBe(200);
  expect(await read.json()).toEqual({ profile: null });

  const second = await put('{"name":"Second","headline":"H"}');
  expect(second.status()).toBe(200);
  expect(dbStored()).toEqual({
    name: "Second",
    headline: "H",
    about: [],
    photo: "",
    email: "",
    resumeLink: "",
    socialLinks: [],
  });
  expect(dbImages()).toEqual([HEADSHOT]);
});

// ---------------------------------------------------------------------------------------------------------------
// Step 3 fixtures: the owner-only routes. Rows E2E-06 to E2E-16 call them through `next start`.
// ---------------------------------------------------------------------------------------------------------------

const LIST_API = "/api/admin/images/";
const UPLOAD_API = "/api/admin/images/upload/";

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

function dbBreak(): void {
  fs.writeFileSync(DB_FILE, JSON.stringify({ ...readDbFile(), unreachable: true }));
}

function dbFix(): void {
  const { unreachable: _unreachable, ...rest } = readDbFile();
  void _unreachable;
  fs.writeFileSync(DB_FILE, JSON.stringify(rest));
}

function dbSeedImages(list: unknown[]): void {
  fs.writeFileSync(DB_FILE, JSON.stringify({ images: list }));
}

function dbSeedBoth(profile: unknown, list: unknown[]): void {
  fs.writeFileSync(DB_FILE, JSON.stringify({ profile, images: list }));
}

function storeBreak(): void {
  fs.mkdirSync(STORE_DIR, { recursive: true });
  fs.writeFileSync(STORE_DIR + "/unreachable", "");
}

function storeFix(): void {
  fs.rmSync(STORE_DIR + "/unreachable", { force: true });
}

function storePut(id: string, bytes: Buffer, type: string): void {
  fs.mkdirSync(STORE_DIR, { recursive: true });
  fs.writeFileSync(STORE_DIR + "/" + id, bytes);
  fs.writeFileSync(STORE_DIR + "/" + id + ".type", type);
}

function storeHas(id: string): boolean {
  return fs.existsSync(STORE_DIR + "/" + id);
}

function storeIds(): string[] {
  if (!fs.existsSync(STORE_DIR)) return [];
  return fs
    .readdirSync(STORE_DIR)
    .filter((name) => name !== "unreachable" && !name.endsWith(".type"))
    .sort();
}

const HOST = "https://stand-in.invalid";
const publicOf = (id: string): string => HOST + "/storage/v1/object/public/images/" + id;
const uploadOf = (id: string): string =>
  HOST + "/storage/v1/object/upload/sign/images/" + id + "?token=stand-in-token";

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

// The 70 bytes of PNG_1X1 followed by zero bytes up to exactly n bytes.
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

const imageOf = (entry: { id: string; name: string; contentType: string; size: number }) => ({
  id: entry.id,
  name: entry.name,
  url: publicOf(entry.id),
  contentType: entry.contentType,
  size: entry.size,
});

function seedHeadshot(): void {
  dbSeedImages([HEADSHOT]);
  storePut(HEADSHOT.id, png(307200), "image/png");
}

const KEITH_BASE = {
  name: "Keith Lim",
  headline: "Software Engineer",
  about: [] as string[],
  photo: "",
  email: "",
  resumeLink: "",
  socialLinks: [] as { label: string; url: string }[],
};

const LEAKS = ["10.1.2.3", "key-marker-standin", "password-marker-standin", "ECONNREFUSED"];

const ID_PATTERN = /^[0-9a-f-]{36}\.png$/;

type Reply = { status: number; text: string; json: unknown; cacheControl: string };

// One direct call, without a browser. A body is sent as given with a JSON content type; the cookie header is the
// whole header value, or absent.
async function send(
  request: APIRequestContext,
  method: "GET" | "POST" | "DELETE" | "PUT",
  url: string,
  options: { cookie?: string; body?: string } = {},
): Promise<Reply> {
  const headers: Record<string, string> = {};
  if (options.cookie !== undefined) headers.cookie = options.cookie;
  if (options.body !== undefined) headers["content-type"] = "application/json";
  const response = await request.fetch(url, {
    method,
    headers,
    data: options.body,
    maxRedirects: 0,
  });
  const text = await response.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  return { status: response.status(), text, json, cacheControl: response.headers()["cache-control"] ?? "" };
}

const asText = (body: unknown): string => JSON.stringify(body);

function containsNone(text: string, needles: string[]): boolean {
  return needles.every((needle) => !text.includes(needle));
}

test("E2E-06: every image route refuses a visitor, a wrong account and an unverified owner before it reads, lists, stores or deletes anything", async ({
  request,
}) => {
  dbReset();
  storeReset();
  seedHeadshot();
  const SECOND = "22222222-2222-4222-8222-222222222222.png";
  storePut(SECOND, png(70), "image/png");

  const sessions: { label: string; cookie: string | undefined; status: number; error: string }[] = [
    { label: "no cookie", cookie: undefined, status: 401, error: "not-signed-in" },
    { label: "not a token", cookie: SESSION_COOKIE + "=not-a-token", status: 401, error: "not-signed-in" },
    { label: "other account", cookie: await cookieOf(OTHER()), status: 403, error: "not-allowed" },
    { label: "unverified email", cookie: await cookieOf(UNVERIFIED()), status: 403, error: "not-allowed" },
  ];

  for (const session of sessions) {
    const calls: { label: string; reply: Reply }[] = [
      { label: "list", reply: await send(request, "GET", LIST_API, { cookie: session.cookie }) },
      {
        label: "upload address",
        reply: await send(request, "POST", UPLOAD_API, {
          cookie: session.cookie,
          body: asText({ name: "small.png", type: "image/png", size: 2048 }),
        }),
      },
      {
        label: "register",
        reply: await send(request, "POST", LIST_API, {
          cookie: session.cookie,
          body: asText({ id: SECOND, name: "x.png", type: "image/png", size: 70 }),
        }),
      },
      {
        label: "delete",
        reply: await send(request, "DELETE", LIST_API + "?id=" + HEADSHOT.id, { cookie: session.cookie }),
      },
    ];
    for (const call of calls) {
      const where = session.label + " / " + call.label;
      expect(call.reply.status, where).toBe(session.status);
      expect(call.reply.json, where).toEqual({ error: session.error });
      expect(call.reply.cacheControl, where).toContain("no-store");
      expect(containsNone(call.reply.text, ["headshot.png", "small.png"]), where).toBe(true);
    }
  }

  expect(dbImages()).toEqual([HEADSHOT]);
  expect(storeIds()).toEqual([HEADSHOT.id, SECOND]);
});

test("E2E-07: every limit and every malformed input is refused with its fixed reason, and nothing is stored or listed", async ({
  request,
}) => {
  dbReset();
  storeReset();
  const owner = await cookieOf(OWNER());

  const png5 = (extra: Record<string, unknown>) => ({ name: "x.png", type: "image/png", size: 1000, ...extra });
  const withoutKey = (key: string): Record<string, unknown> => {
    const body: Record<string, unknown> = png5({});
    delete body[key];
    return body;
  };

  // Bodies (1) to (17): the raw text sent and the reason expected.
  const bodies: { text: string; reason: string }[] = [
    { text: asText({ name: "big.png", type: "image/png", size: 6291456 }), reason: "too-big" },
    { text: asText({ name: "big.png", type: "image/png", size: 5242881 }), reason: "too-big" },
    { text: asText({ name: "doc.pdf", type: "application/pdf", size: 1000 }), reason: "wrong-type" },
    { text: asText({ name: "doc.pdf", type: "application/pdf", size: 6291456 }), reason: "wrong-type" },
    { text: asText({ name: "anim.gif", type: "image/gif", size: 1000 }), reason: "wrong-type" },
    { text: asText({ name: "x.png", type: "IMAGE/PNG", size: 1000 }), reason: "wrong-type" },
    { text: asText({ name: "empty.png", type: "image/png", size: 0 }), reason: "empty" },
    { text: asText(png5({ name: "   " })), reason: "invalid" },
    { text: asText(png5({ name: "a".repeat(256) })), reason: "invalid" },
    { text: asText(withoutKey("size")), reason: "invalid" },
    { text: asText(withoutKey("type")), reason: "invalid" },
    { text: asText(png5({ size: "1000" })), reason: "invalid" },
    { text: asText(png5({ size: 1.5 })), reason: "invalid" },
    { text: asText(png5({ size: -1 })), reason: "invalid" },
    { text: "{", reason: "invalid" },
    { text: "[]", reason: "invalid" },
    { text: "", reason: "invalid" },
  ];

  for (const [index, body] of bodies.entries()) {
    const reply = await send(request, "POST", UPLOAD_API, { cookie: owner, body: body.text });
    expect(reply.status, "upload body " + (index + 1)).toBe(400);
    expect(reply.json, "upload body " + (index + 1)).toEqual({ error: body.reason });
  }

  // Registration with bodies (1) to (14) plus a well-formed id.
  const ID = "33333333-3333-4333-8333-333333333333.png";
  for (const [index, body] of bodies.slice(0, 14).entries()) {
    const parsed = JSON.parse(body.text) as Record<string, unknown>;
    const reply = await send(request, "POST", LIST_API, {
      cookie: owner,
      body: asText({ ...parsed, id: ID }),
    });
    expect(reply.status, "register body " + (index + 1)).toBe(400);
    expect(reply.json, "register body " + (index + 1)).toEqual({ error: body.reason });
  }

  // Registration without or with a bad id.
  const good = { name: "x.png", type: "image/png", size: 1000 };
  const badIds: (string | undefined)[] = [
    undefined,
    "../x.png",
    "33333333-3333-4333-8333-333333333333.gif",
    "33333333-3333-4333-8333-333333333333.PNG",
  ];
  for (const id of badIds) {
    const reply = await send(request, "POST", LIST_API, {
      cookie: owner,
      body: asText(id === undefined ? good : { ...good, id }),
    });
    expect(reply.status, "register id " + String(id)).toBe(400);
    expect(reply.json, "register id " + String(id)).toEqual({ error: "invalid" });
  }

  // Deletes with a missing, a path-like, a wrong-extension and an empty id.
  for (const url of [
    LIST_API,
    LIST_API + "?id=../../x",
    LIST_API + "?id=33333333-3333-4333-8333-333333333333.gif",
    LIST_API + "?id=",
  ]) {
    const reply = await send(request, "DELETE", url, { cookie: owner });
    expect(reply.status, "delete " + url).toBe(400);
    expect(reply.json, "delete " + url).toEqual({ error: "invalid" });
  }

  // Controls: the edges of the limits are accepted.
  for (const size of [5242880, 1]) {
    const reply = await send(request, "POST", UPLOAD_API, {
      cookie: owner,
      body: asText({ name: "edge.png", type: "image/png", size }),
    });
    expect(reply.status, "control " + size).toBe(200);
    const answer = reply.json as { id?: string; uploadUrl?: string };
    expect(answer.id ?? "", "control " + size).toMatch(ID_PATTERN);
    expect(answer.uploadUrl, "control " + size).toBe(uploadOf(answer.id ?? ""));
  }

  expect(dbImages()).toEqual([]);
  expect(storeIds()).toEqual([]);
});

test("E2E-08: the owner gets an upload address, registers the stored file, and lists it newest first with an address that carries no file name", async ({
  request,
}) => {
  dbReset();
  storeReset();
  const owner = await cookieOf(OWNER());
  const noStore = (reply: Reply, where: string) => expect(reply.cacheControl, where).toContain("no-store");

  const first = await send(request, "GET", LIST_API, { cookie: owner });
  noStore(first, "(1)");
  expect(first.status).toBe(200);
  expect(first.json).toEqual({ images: [] });

  const body = asText({ name: "headshot.png", type: "image/png", size: 307200 });
  const issued1 = await send(request, "POST", UPLOAD_API, { cookie: owner, body });
  noStore(issued1, "(2)");
  expect(issued1.status).toBe(200);
  const { id: id1 = "", uploadUrl: url1 } = issued1.json as { id?: string; uploadUrl?: string };
  expect(id1).toMatch(ID_PATTERN);
  expect(url1).toBe(uploadOf(id1));
  expect(storeIds()).toEqual([]);
  expect(dbImages()).toEqual([]);

  storePut(id1, png(307200), "image/png");
  const registered1 = await send(request, "POST", LIST_API, {
    cookie: owner,
    body: asText({ id: id1, name: " headshot.png ", type: "image/png", size: 307200 }),
  });
  noStore(registered1, "(3)");
  expect(registered1.status).toBe(200);
  const entry1 = { id: id1, name: "headshot.png", url: publicOf(id1), contentType: "image/png", size: 307200 };
  expect(registered1.json).toEqual({ image: entry1 });
  expect(dbImages()).toEqual([{ id: id1, name: "headshot.png", contentType: "image/png", size: 307200 }]);

  const second = await send(request, "GET", LIST_API, { cookie: owner });
  noStore(second, "(4)");
  expect(second.status).toBe(200);
  expect(second.json).toEqual({ images: [entry1] });

  const issued2 = await send(request, "POST", UPLOAD_API, { cookie: owner, body });
  noStore(issued2, "(5)");
  expect(issued2.status).toBe(200);
  const { id: id2 = "" } = issued2.json as { id?: string };
  expect(id2).not.toBe(id1);
  storePut(id2, png(307200), "image/png");
  const registered2 = await send(request, "POST", LIST_API, {
    cookie: owner,
    body: asText({ id: id2, name: " headshot.png ", type: "image/png", size: 307200 }),
  });
  noStore(registered2, "(5)");
  expect(registered2.status).toBe(200);

  const third = await send(request, "GET", LIST_API, { cookie: owner });
  noStore(third, "(6)");
  expect(third.status).toBe(200);
  const list = (third.json as { images: { id: string; name: string; url: string }[] }).images;
  expect(list).toHaveLength(2);
  expect(list[0].id).toBe(id2);
  expect(list[1].id).toBe(id1);
  expect(list.map((item) => item.name)).toEqual(["headshot.png", "headshot.png"]);
  expect(list[0].url).not.toBe(list[1].url);
  for (const item of list) expect(item.url).not.toContain("headshot");
});

test("E2E-09: a registration is checked against what storage really holds, and a stored file outside the rules is removed", async ({
  request,
}) => {
  dbReset();
  storeReset();
  const owner = await cookieOf(OWNER());

  const register = (id: string, type: string, size: number) =>
    send(request, "POST", LIST_API, { cookie: owner, body: asText({ id, name: "f", type, size }) });

  const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png";
  const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.png";
  const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc.png";
  const D = "dddddddd-dddd-4ddd-8ddd-dddddddddddd.png";
  const E = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee.png";
  const F = "ffffffff-ffff-4fff-8fff-ffffffffffff.png";
  const G = "99999999-9999-4999-8999-999999999999.png";

  const a = await register(A, "image/png", 1000);
  expect(a.status, "(a)").toBe(400);
  expect(a.json, "(a)").toEqual({ error: "missing" });

  storePut(B, png(6291456), "image/png");
  const b = await register(B, "image/png", 1000);
  expect(b.status, "(b)").toBe(400);
  expect(b.json, "(b)").toEqual({ error: "rejected" });
  expect(storeHas(B), "(b) removed").toBe(false);

  storePut(C, Buffer.alloc(0), "image/png");
  const c = await register(C, "image/png", 5);
  expect(c.status, "(c)").toBe(400);
  expect(c.json, "(c)").toEqual({ error: "rejected" });
  expect(storeHas(C), "(c) removed").toBe(false);

  storePut(D, png(100), "application/pdf");
  const d = await register(D, "image/png", 100);
  expect(d.status, "(d)").toBe(400);
  expect(d.json, "(d)").toEqual({ error: "rejected" });
  expect(storeHas(D), "(d) removed").toBe(false);

  storePut(E, svg(100), "image/svg+xml");
  const e = await register(E, "image/svg+xml", 100);
  expect(e.status, "(e)").toBe(400);
  expect(e.json, "(e)").toEqual({ error: "rejected" });
  expect(storeHas(E), "(e) removed").toBe(false);

  storePut(F, png(100), "image/png");
  const f = await register(F, "image/jpeg", 100);
  expect(f.status, "(f)").toBe(400);
  expect(f.json, "(f)").toEqual({ error: "rejected" });
  expect(storeHas(F), "(f) removed").toBe(false);

  storePut(G, png(2000), "image/png");
  const g = await register(G, "image/png", 999);
  expect(g.status, "(g)").toBe(200);
  expect((g.json as { image: { size: number } }).image.size, "(g)").toBe(2000);

  const h = await register(G, "image/png", 999);
  expect(h.status, "(h)").toBe(200);
  expect(h.json, "(h)").toEqual(g.json);

  expect(dbImages()).toEqual([{ id: G, name: "f", contentType: "image/png", size: 2000 }]);
  expect(storeIds()).toEqual([G]);
});

test("E2E-10: a delete removes the file first, then the entry, and a storage or database failure leaves the entry for another try", async ({
  request,
}) => {
  dbReset();
  storeReset();
  seedHeadshot();
  const owner = await cookieOf(OWNER());
  const remove = () => send(request, "DELETE", LIST_API + "?id=" + HEADSHOT.id, { cookie: owner });

  const one = await remove();
  expect(one.status, "(1)").toBe(200);
  expect(one.json, "(1)").toEqual({ deleted: true });
  expect(storeHas(HEADSHOT.id), "(1) file").toBe(false);
  expect(dbImages(), "(1) entry").toEqual([]);

  const two = await remove();
  expect(two.status, "(2)").toBe(404);
  expect(two.json, "(2)").toEqual({ error: "not-found" });

  dbSeedImages([HEADSHOT]);
  const three = await remove();
  expect(three.status, "(3)").toBe(200);
  expect(three.json, "(3)").toEqual({ deleted: true });
  expect(dbImages(), "(3) entry").toEqual([]);

  seedHeadshot();
  storeBreak();
  const four = await remove();
  storeFix();
  expect(four.status, "(4)").toBe(503);
  expect(four.json, "(4)").toEqual({ error: "unavailable" });
  expect(dbImages(), "(4) entry").toEqual([HEADSHOT]);
  expect(storeHas(HEADSHOT.id), "(4) file").toBe(true);
  expect(containsNone(four.text, LEAKS), "(4) leaks").toBe(true);

  dbBreak();
  const five = await remove();
  expect(five.status, "(5)").toBe(503);
  expect(five.json, "(5)").toEqual({ error: "unavailable" });
  expect(storeHas(HEADSHOT.id), "(5) file").toBe(true);
  dbFix();
  expect(dbImages(), "(5) entry").toEqual([HEADSHOT]);
  expect(containsNone(five.text, LEAKS), "(5) leaks").toBe(true);
});

test("E2E-11: an unreachable storage or database gives the fixed 503 on every route, with the refusals unchanged and no detail leaked", async ({
  request,
}) => {
  dbReset();
  storeReset();
  seedHeadshot();
  const FOURTH = "44444444-4444-4444-8444-444444444444.png";
  storePut(FOURTH, png(70), "image/png");
  storeBreak();
  const owner = await cookieOf(OWNER());

  const smallBody = asText({ name: "small.png", type: "image/png", size: 2048 });
  const registerBody = asText({ id: FOURTH, name: "x.png", type: "image/png", size: 70 });
  const calls = {
    list: () => send(request, "GET", LIST_API, { cookie: owner }),
    upload: () => send(request, "POST", UPLOAD_API, { cookie: owner, body: smallBody }),
    register: () => send(request, "POST", LIST_API, { cookie: owner, body: registerBody }),
    remove: () => send(request, "DELETE", LIST_API + "?id=" + HEADSHOT.id, { cookie: owner }),
  };

  for (const [label, call] of Object.entries(calls)) {
    const reply = await call();
    expect(reply.status, "(1) " + label).toBe(503);
    expect(reply.json, "(1) " + label).toEqual({ error: "unavailable" });
    expect(containsNone(reply.text, [...LEAKS, "headshot.png"]), "(1) leaks " + label).toBe(true);
  }

  const signedOut = await send(request, "GET", LIST_API);
  expect(signedOut.status, "(2) no cookie").toBe(401);
  expect(signedOut.json, "(2) no cookie").toEqual({ error: "not-signed-in" });
  const stranger = await send(request, "GET", LIST_API, { cookie: await cookieOf(OTHER()) });
  expect(stranger.status, "(2) other account").toBe(403);
  expect(stranger.json, "(2) other account").toEqual({ error: "not-allowed" });

  storeFix();
  dbBreak();
  const list = await calls.list();
  expect(list.status, "(3) list").toBe(503);
  expect(list.json, "(3) list").toEqual({ error: "unavailable" });
  expect(containsNone(list.text, LEAKS), "(3) list leaks").toBe(true);

  const upload = await calls.upload();
  expect(upload.status, "(3) upload").toBe(200);
  expect((upload.json as { id?: string }).id ?? "", "(3) upload").toMatch(ID_PATTERN);

  const register = await calls.register();
  expect(register.status, "(3) register").toBe(503);
  expect(register.json, "(3) register").toEqual({ error: "unavailable" });
  expect(containsNone(register.text, LEAKS), "(3) register leaks").toBe(true);

  const remove = await calls.remove();
  expect(remove.status, "(3) delete").toBe(503);
  expect(remove.json, "(3) delete").toEqual({ error: "unavailable" });
  expect(containsNone(remove.text, LEAKS), "(3) delete leaks").toBe(true);
  expect(storeHas(HEADSHOT.id), "(3) file").toBe(true);

  dbFix();
  const after = await calls.list();
  expect(after.status, "(4)").toBe(200);
  expect(after.json, "(4)").toEqual({ images: [imageOf(HEADSHOT)] });
});

// ---------------------------------------------------------------------------------------------------------------
// The real fetch code: a fake Storage server run by the test process and a second built site on port 3102.
// ---------------------------------------------------------------------------------------------------------------

const SITE_PORT = 3102;
const SITE = "http://localhost:" + SITE_PORT;
const REAL_KEY = ["key", "marker", "realpath"].join("-");
const BUCKET_BODY =
  '{"id":"images","name":"images","public":true,"file_size_limit":5242880,"allowed_mime_types":["image/png","image/jpeg","image/webp","image/svg+xml"]}';

type Seen = { method: string; url: string; headers: http.IncomingHttpHeaders; body: string };
type FakeServer = { base: string; seen: Seen[]; close: () => Promise<void> };

async function startFake(
  handler: (seen: Seen, body: Buffer, res: http.ServerResponse) => void,
): Promise<FakeServer> {
  const seen: Seen[] = [];
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      const entry: Seen = {
        method: req.method ?? "",
        url: req.url ?? "",
        headers: req.headers,
        body: body.toString("utf8"),
      };
      seen.push(entry);
      handler(entry, body, res);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  return {
    base: "http://127.0.0.1:" + port,
    seen,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

function reply(res: http.ServerResponse, status: number, text: string, type = "application/json"): void {
  res.writeHead(status, { "content-type": type });
  res.end(text);
}

type Site = { log: () => string };

async function stopChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
  child.kill();
  await exited;
}

// Start the built site on SITE_PORT with the given storage settings, run the work, and always stop it.
async function withSite<T>(
  settings: { url: string; key: string | undefined },
  work: (site: Site) => Promise<T>,
): Promise<T> {
  let output = "";
  const env: NodeJS.ProcessEnv = { ...process.env, SUPABASE_URL: settings.url };
  if (settings.key === undefined) delete env[KEY_NAME];
  else env[KEY_NAME] = settings.key;
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(SITE_PORT)], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  try {
    await expect
      .poll(
        async () => {
          try {
            return (await fetch(SITE + "/")).status;
          } catch {
            return 0;
          }
        },
        { timeout: 90000, intervals: [500, 1000] },
      )
      .toBe(200);
    return await work({ log: () => output });
  } finally {
    await stopChild(child);
  }
}

test("E2E-12: the real storage calls carry the key, create the bucket once, issue and confirm an upload and remove the file", async ({
  request,
}) => {
  test.setTimeout(240000);
  dbReset();
  storeReset();

  const objects = new Map<string, { body: Buffer; type: string }>();
  let bucketCreated = false;
  const fake = await startFake((seen, body, res) => {
    const path = seen.url.split("?")[0];
    const signed = path.startsWith("/storage/v1/object/upload/sign/images/") && seen.method === "PUT";
    const publicHead = path.startsWith("/storage/v1/object/public/images/") && seen.method === "HEAD";
    const keyed = seen.headers.apikey === REAL_KEY && seen.headers.authorization === "Bearer " + REAL_KEY;
    if (!signed && !publicHead && !keyed) return reply(res, 401, '{"error":"unauthorized"}');

    if (seen.method === "GET" && path === "/storage/v1/bucket/images") {
      return bucketCreated
        ? reply(res, 200, '{"id":"images"}')
        : reply(res, 404, '{"statusCode":"404","error":"Bucket not found"}');
    }
    if (seen.method === "POST" && path === "/storage/v1/bucket") {
      bucketCreated = true;
      return reply(res, 200, '{"name":"images"}');
    }
    if (seen.method === "POST" && path.startsWith("/storage/v1/object/upload/sign/images/")) {
      const id = path.slice("/storage/v1/object/upload/sign/images/".length);
      return reply(res, 200, JSON.stringify({ url: "/object/upload/sign/images/" + id + "?token=fake-token" }));
    }
    if (signed) {
      const id = path.slice("/storage/v1/object/upload/sign/images/".length);
      if (!seen.url.endsWith("?token=fake-token")) return reply(res, 401, '{"error":"bad token"}');
      objects.set(id, { body, type: String(seen.headers["content-type"] ?? "") });
      return reply(res, 200, JSON.stringify({ Key: "images/" + id }));
    }
    if (publicHead) {
      const stored = objects.get(path.slice("/storage/v1/object/public/images/".length));
      if (!stored) {
        res.writeHead(400);
        return void res.end();
      }
      res.writeHead(200, { "content-length": String(stored.body.length), "content-type": stored.type });
      return void res.end();
    }
    if (seen.method === "DELETE" && path === "/storage/v1/object/images") {
      const prefixes = (JSON.parse(seen.body) as { prefixes: string[] }).prefixes;
      for (const id of prefixes) objects.delete(id);
      return reply(res, 200, JSON.stringify(prefixes.map((name) => ({ name }))));
    }
    return reply(res, 404, '{"error":"unknown"}');
  });

  try {
    await withSite({ url: fake.base, key: REAL_KEY }, async (site) => {
      const owner = await cookieOf(OWNER());
      const texts: string[] = [];
      const call = async (
        method: "GET" | "POST" | "DELETE",
        path: string,
        body?: string,
      ): Promise<Reply> => {
        const result = await send(request, method, SITE + path, { cookie: owner, body });
        texts.push(result.text);
        return result;
      };
      const keyHeaders = (entry: Seen) => {
        expect(entry.headers.apikey, entry.method + " " + entry.url).toBe(REAL_KEY);
        expect(entry.headers.authorization, entry.method + " " + entry.url).toBe("Bearer " + REAL_KEY);
      };

      const one = await call("GET", LIST_API);
      expect(one.status, "(1)").toBe(200);
      expect(one.json, "(1)").toEqual({ images: [] });
      const bucketReads = fake.seen.filter((s) => s.method === "GET" && s.url === "/storage/v1/bucket/images");
      const bucketCreates = fake.seen.filter((s) => s.method === "POST" && s.url === "/storage/v1/bucket");
      expect(bucketReads).toHaveLength(1);
      expect(bucketCreates).toHaveLength(1);
      keyHeaders(bucketReads[0]);
      keyHeaders(bucketCreates[0]);
      expect(bucketCreates[0].body).toBe(BUCKET_BODY);
      expect(String(bucketCreates[0].headers["content-type"])).toContain("application/json");

      const two = await call("POST", UPLOAD_API, asText({ name: "headshot.png", type: "image/png", size: 70 }));
      expect(two.status, "(2)").toBe(200);
      const { id = "", uploadUrl } = two.json as { id?: string; uploadUrl?: string };
      expect(id, "(2)").toMatch(ID_PATTERN);
      expect(uploadUrl, "(2)").toBe(fake.base + "/storage/v1/object/upload/sign/images/" + id + "?token=fake-token");
      const signing = fake.seen.find((s) => s.method === "POST" && s.url === "/storage/v1/object/upload/sign/images/" + id);
      expect(signing, "(2) signing call").toBeDefined();
      expect(signing?.body, "(2) signing body").toBe("{}");
      expect(String(signing?.headers["content-type"]), "(2) signing type").toContain("application/json");

      const three = await request.put(uploadUrl ?? "", {
        headers: { "content-type": "image/png" },
        data: PNG_1X1,
        maxRedirects: 0,
      });
      expect(three.status(), "(3)").toBe(200);

      const four = await call("POST", LIST_API, asText({ id, name: "headshot.png", type: "image/png", size: 70 }));
      expect(four.status, "(4)").toBe(200);
      const entry = (four.json as { image: { url: string; size: number } }).image;
      expect(entry.url, "(4)").toBe(fake.base + "/storage/v1/object/public/images/" + id);
      expect(entry.size, "(4)").toBe(70);
      const head = fake.seen.find((s) => s.method === "HEAD" && s.url === "/storage/v1/object/public/images/" + id);
      expect(head, "(4) HEAD").toBeDefined();
      expect(head?.headers["accept-encoding"], "(4) HEAD encoding").toBe("identity");
      expect(head?.headers.apikey, "(4) HEAD key").toBeUndefined();
      expect(head?.headers.authorization, "(4) HEAD authorization").toBeUndefined();

      const five = await call("GET", LIST_API);
      expect(five.status, "(5)").toBe(200);
      expect(five.json, "(5)").toEqual({ images: [four.json && (four.json as { image: unknown }).image] });

      const six = await call("DELETE", LIST_API + "?id=" + id);
      expect(six.status, "(6)").toBe(200);
      expect(six.json, "(6)").toEqual({ deleted: true });
      const removal = fake.seen.find((s) => s.method === "DELETE" && s.url === "/storage/v1/object/images");
      expect(removal, "(6) removal").toBeDefined();
      expect(removal?.body, "(6) removal body").toBe(JSON.stringify({ prefixes: [id] }));
      if (removal) keyHeaders(removal);
      expect(objects.size, "(6) fake map").toBe(0);

      const seven = await call("GET", LIST_API);
      expect(seven.json, "(7)").toEqual({ images: [] });

      expect(fake.seen.filter((s) => s.method === "GET" && s.url === "/storage/v1/bucket/images")).toHaveLength(1);
      expect(fake.seen.filter((s) => s.method === "POST" && s.url === "/storage/v1/bucket")).toHaveLength(1);
      for (const text of texts) expect(text).not.toContain(REAL_KEY);
      expect(site.log()).not.toContain(REAL_KEY);
    });
  } finally {
    await fake.close();
  }
});

test("E2E-13: an unusable setting or a failing storage gives the fixed 503, one fixed log line and no secret in either", async ({
  request,
}) => {
  test.setTimeout(240000);
  const owner = await cookieOf(OWNER());
  const smallBody = asText({ name: "small.png", type: "image/png", size: 2048 });

  type Outcome = { list?: Reply; upload: Reply; signedOut: Reply; log: string };

  async function run(
    settings: { url: string; key: string | undefined },
    options: { listFirst: boolean; line: string },
  ): Promise<Outcome> {
    dbReset();
    return withSite(settings, async (site) => {
      const list = options.listFirst ? await send(request, "GET", SITE + LIST_API, { cookie: owner }) : undefined;
      const upload = await send(request, "POST", SITE + UPLOAD_API, { cookie: owner, body: smallBody });
      const signedOut = await send(request, "GET", SITE + LIST_API);
      await expect.poll(() => site.log().includes(options.line), { timeout: 15000 }).toBe(true);
      return { list, upload, signedOut, log: site.log() };
    });
  }

  const unavailable = (outcome: Outcome, label: string) => {
    if (outcome.list) {
      expect(outcome.list.status, label + " list").toBe(503);
      expect(outcome.list.text, label + " list").toBe('{"error":"unavailable"}');
    }
    expect(outcome.upload.status, label + " upload").toBe(503);
    expect(outcome.upload.text, label + " upload").toBe('{"error":"unavailable"}');
    expect(outcome.signedOut.status, label + " signed out").toBe(401);
  };

  // (i) an empty address and no key
  const empty = await run({ url: "", key: undefined }, { listFirst: true, line: "[storage] bucket failed unknown" });
  unavailable(empty, "(i)");
  expect(empty.log).toContain("[storage] bucket failed unknown");
  for (const reply of [empty.list, empty.upload, empty.signedOut]) {
    expect(containsNone(reply?.text ?? "", LEAKS), "(i) leaks").toBe(true);
  }

  // (ii) an address with an empty key: the fake must see no request at all
  const idle = await startFake((_seen, _body, res) => reply(res, 200, "{}"));
  try {
    const blank = await run({ url: idle.base, key: "" }, { listFirst: true, line: "[storage] bucket failed unknown" });
    unavailable(blank, "(ii)");
    expect(blank.log).toContain("[storage] bucket failed unknown");
    expect(idle.seen, "(ii) fake requests").toEqual([]);
    for (const answer of [blank.list, blank.upload, blank.signedOut]) {
      expect(containsNone(answer?.text ?? "", LEAKS), "(ii) leaks").toBe(true);
    }
  } finally {
    await idle.close();
  }

  // (iii) a storage that answers 500 with text that names the key
  const failing = await startFake((_seen, _body, res) => reply(res, 500, REAL_KEY + " internal detail", "text/plain"));
  try {
    const broken = await run(
      { url: failing.base, key: REAL_KEY },
      { listFirst: true, line: "[storage] bucket failed HTTP_500" },
    );
    unavailable(broken, "(iii)");
    expect(broken.log).toContain("[storage] bucket failed HTTP_500");
    const hostPort = failing.base.slice("http://".length);
    for (const secret of [REAL_KEY, "internal detail", hostPort]) {
      for (const answer of [broken.list, broken.upload, broken.signedOut]) {
        expect(answer?.text ?? "", "(iii) response leaks " + secret).not.toContain(secret);
      }
      expect(broken.log, "(iii) log leaks " + secret).not.toContain(secret);
    }
  } finally {
    await failing.close();
  }

  // (iv) a storage that answers the bucket read and then signs an address that is not the object's
  const elsewhere = await startFake((seen, _body, res) => {
    if (seen.method === "GET" && seen.url === "/storage/v1/bucket/images") return reply(res, 200, '{"id":"images"}');
    return reply(res, 200, '{"url":"/elsewhere"}');
  });
  try {
    const odd = await run(
      { url: elsewhere.base, key: REAL_KEY },
      { listFirst: false, line: "[storage] sign failed unknown" },
    );
    unavailable(odd, "(iv)");
    expect(odd.log).toContain("[storage] sign failed unknown");
    const hostPort = elsewhere.base.slice("http://".length);
    for (const secret of [REAL_KEY, "internal detail", hostPort, "/elsewhere"]) {
      for (const answer of [odd.upload, odd.signedOut]) {
        expect(answer.text, "(iv) response leaks " + secret).not.toContain(secret);
      }
      expect(odd.log, "(iv) log leaks " + secret).not.toContain(secret);
    }
  } finally {
    await elsewhere.close();
  }
});

test("E2E-14: the public pages stay prerendered and their pages and scripts carry nothing of the storage, the routes or the settings", async ({
  request,
}) => {
  dbReset();
  storeReset();

  const manifest = JSON.parse(fs.readFileSync(".next/prerender-manifest.json", "utf8")) as {
    routes: Record<string, unknown>;
  };
  const keys = Object.keys(manifest.routes);
  expect(keys.filter((key) => key.startsWith("/api/admin"))).toEqual([]);
  for (const route of [
    "/",
    "/blog",
    "/blog/hello-world",
    "/blog/building-portfolio-nextjs",
    "/robots.txt",
    "/rss.xml",
    "/sitemap.xml",
  ]) {
    expect(keys, route).toContain(route);
  }

  const forbidden = [
    "SUPABASE_URL",
    KEY_NAME,
    "stand-in.invalid",
    "api/admin",
    "upload/sign",
    "StorageUnavailable",
  ];
  const scripts = new Set<string>();
  for (const page of ["/", "/blog/", "/blog/hello-world/", "/blog/building-portfolio-nextjs/"]) {
    const response = await request.get(page);
    expect(response.status(), page).toBe(200);
    const html = await response.text();
    for (const needle of forbidden) expect(html, page + " carries " + needle).not.toContain(needle);
    for (const match of html.matchAll(/\/_next\/static\/[^"'\s\\]+?\.js/g)) scripts.add(match[0]);
  }
  expect(scripts.size).toBeGreaterThan(0);
  for (const script of scripts) {
    const response = await request.get(script);
    expect(response.status(), script).toBe(200);
    const text = await response.text();
    for (const needle of forbidden) expect(text, script + " carries " + needle).not.toContain(needle);
  }

  const auth = gitGrep(["-l", "-E", "@/lib/auth\\b", "--", "src"]);
  for (const path of gitPaths(auth.stdout)) {
    expect(
      path.startsWith("src/app/api/auth/") ||
        path.startsWith("src/app/api/admin/") ||
        path.startsWith("src/app/bright-warm-greenhouse/"),
      path,
    ).toBe(true);
  }
  const server = gitGrep(["-l", "-E", "lib/server", "--", "src", ":(exclude)src/lib/server", ":(exclude)src/app/api/admin"]);
  expect(server.stdout).toBe("");
  expect(server.status).toBe(1);
});

test("E2E-15: uploading and deleting an image never touches the stored profile", async ({ request }) => {
  dbReset();
  storeReset();
  dbSeedBoth(KEITH_BASE, []);
  const owner = await cookieOf(OWNER());

  const issued = await send(request, "POST", UPLOAD_API, {
    cookie: owner,
    body: asText({ name: "headshot.png", type: "image/png", size: 70 }),
  });
  expect(issued.status).toBe(200);
  const { id = "" } = issued.json as { id?: string };
  expect(id).toMatch(ID_PATTERN);

  storePut(id, png(70), "image/png");
  const registered = await send(request, "POST", LIST_API, {
    cookie: owner,
    body: asText({ id, name: "headshot.png", type: "image/png", size: 70 }),
  });
  expect(registered.status).toBe(200);
  expect(dbStored()).toEqual(KEITH_BASE);
  expect(dbImages()).toHaveLength(1);

  const removed = await send(request, "DELETE", LIST_API + "?id=" + id, { cookie: owner });
  expect(removed.status).toBe(200);
  expect(dbStored()).toEqual(KEITH_BASE);
  expect(dbImages()).toEqual([]);
});

// Build a throw-away git repository the way the sign-in and profile specs' gate tests do, add the files and run
// the gate. Pieces are put together so that this file never trips the gate's own scans.
const DASH = String.fromCharCode(8212);
const BODY = "export const x = 1;";
const QUOTE = String.fromCharCode(34);
const GLOBAL_CALL = ["fet", "ch"].join("") + "(" + QUOTE + "https:" + "/" + "/" + "example.test" + QUOTE + ");";

type GateRun = { lines: string[]; status: number | null };

function runGate(files: { file: string; content: string }[]): GateRun {
  const dir = fs.mkdtempSync(os.tmpdir() + "/gate-");
  try {
    const sh = (cmd: string, args: string[], env: Record<string, string> = {}) =>
      spawnSync(cmd, args, { cwd: dir, encoding: "utf8", env: { ...process.env, ...env } });

    sh("git", ["init", "-q"]);
    fs.mkdirSync(dir + "/docs/features/fixture", { recursive: true });
    fs.writeFileSync(
      dir + "/docs/features/fixture/spec.md",
      [
        "## 8. Implementation plan",
        "",
        "## Phase A " + DASH + " Fixture",
        "",
        "### Step 1 " + DASH + " Fixture",
        "",
        "- **Files:**",
        ...files.map((f) => "  - add `" + f.file + "`"),
        "- **Risk:** low " + DASH + " fixture",
        "- **Verify:**",
        "  - `npm run typecheck`",
        "",
      ].join("\n"),
    );
    fs.mkdirSync(dir + "/scripts", { recursive: true });
    fs.copyFileSync(process.cwd() + "/scripts/check-task.sh", dir + "/scripts/check-task.sh");
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
      const target = dir + "/" + f.file;
      fs.mkdirSync(target.slice(0, target.lastIndexOf("/")), { recursive: true });
      fs.writeFileSync(target, f.content);
    }

    const result = sh("bash", ["scripts/check-task.sh", "fixture", "1"], { CHECK_SKIP_RUN: "1" });
    return { lines: (result.stdout ?? "").split("\n"), status: result.status };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("E2E-16: the mechanical gate accepts the new routes, the storage module and the browser client, and still rejects an API route elsewhere", async () => {
  test.setTimeout(180000);
  dbReset();
  storeReset();

  const added = runGate([
    { file: "src/app/api/admin/images/route.ts", content: BODY },
    { file: "src/app/api/admin/images/upload/route.ts", content: BODY },
    { file: "src/lib/server/storage.ts", content: GLOBAL_CALL + "\n" },
    { file: "src/lib/admin/imagesClient.ts", content: BODY },
  ]);
  expect(added.lines.filter((l) => l.startsWith("PASS STATIC")), "PASS STATIC").not.toEqual([]);
  expect(added.lines.filter((l) => l.startsWith("PASS IMPORTS")), "PASS IMPORTS").not.toEqual([]);
  expect(added.lines.filter((l) => l.startsWith("FAIL STATIC")), "FAIL STATIC").toEqual([]);
  expect(added.lines.filter((l) => l.startsWith("FAIL IMPORTS")), "FAIL IMPORTS").toEqual([]);

  const stray = runGate([{ file: "src/app/api/images/route.ts", content: BODY }]);
  expect(
    stray.lines.filter((l) => l.startsWith("FAIL STATIC") && l.includes("src/app/api/images/route.ts")),
    "FAIL STATIC names the stray route",
  ).not.toEqual([]);
  expect(stray.status).toBe(1);
});

// ---------------------------------------------------------------------------------------------------------------
// Step 4 fixtures: the Images screen and the Profile screen's image select, driven in a browser. The browser's own
// calls to the stand-in storage host are answered here with context.route, so the repo has no test-only route (D-5).
// ---------------------------------------------------------------------------------------------------------------

const PANEL = "/bright-warm-greenhouse/";
const UPLOAD_FAILED = "The image could not be uploaded.";
const LOAD_FAILED = "The images could not be loaded.";
const DELETE_FAILED = "That image could not be deleted.";
const ALREADY_GONE = "That image was already deleted.";
const EMPTY_LIST = "No images uploaded yet";
const SECTION_LABELS = ["Profile", "Experience", "Projects", "Certifications", "Tech stack", "Blog posts", "Images"];
const PHOTO = {
  id: "22222222-2222-4222-8222-222222222222.jpg",
  name: "photo.jpg",
  contentType: "image/jpeg",
  size: 1572864,
};

type UploadFile = { name: string; mimeType: string; buffer: Buffer };

async function routeStorage(context: BrowserContext): Promise<void> {
  const uploadPrefix = "/storage/v1/object/upload/sign/images/";
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
    if (method === "PUT" && url.pathname.startsWith(uploadPrefix)) {
      const id = decodeURIComponent(url.pathname.slice(uploadPrefix.length));
      if (url.searchParams.get("token") !== "stand-in-token") {
        await route.fulfill({
          status: 403,
          headers: { ...cors, "content-type": "application/json" },
          body: '{"error":"forbidden"}',
        });
        return;
      }
      fs.mkdirSync(STORE_DIR, { recursive: true });
      fs.writeFileSync(STORE_DIR + "/" + id, request.postDataBuffer() ?? Buffer.alloc(0));
      fs.writeFileSync(STORE_DIR + "/" + id + ".type", request.headers()["content-type"] ?? "");
      await route.fulfill({
        status: 200,
        headers: { ...cors, "content-type": "application/json" },
        body: JSON.stringify({ Key: "images/" + id }),
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

async function ownerPage(
  browser: Browser,
  baseURL: string,
  options: Parameters<Browser["newContext"]>[0] = {},
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext(options);
  await context.addCookies([{ name: SESSION_COOKIE, value: await mint(OWNER()), url: baseURL }]);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
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

const menu = (page: Page) => page.getByRole("navigation", { name: "Admin sections" });
const library = (page: Page) => page.locator('section[aria-label="Image library"]');
const itemsOf = (page: Page) => page.getByRole("list", { name: "Uploaded images" }).getByRole("listitem");
const itemNamed = (page: Page, name: string) => itemsOf(page).filter({ hasText: name });
const libraryAlert = (page: Page) => library(page).getByRole("alert");
const libraryStatus = (page: Page, text: string) => library(page).getByRole("status").filter({ hasText: text });
const uploadButton = (page: Page) => library(page).getByRole("button", { name: "Upload", exact: true });
const fileField = (page: Page) => page.getByLabel("Image file", { exact: true });
const confirmGroup = (page: Page) => page.getByRole("group", { name: "Confirm delete" });

// Click a menu button until its screen is there (the click is lost if it lands before hydration).
async function openScreen(page: Page, label: string, shown: Locator): Promise<void> {
  const button = menu(page).getByRole("button", { name: label, exact: true });
  await expect(async () => {
    await button.click({ timeout: 5000 });
    await expect(shown).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 15000 });
}

const imagesHeading = (page: Page) => page.getByRole("heading", { name: "Images", exact: true });

async function openImages(page: Page): Promise<void> {
  await page.goto(PANEL);
  await openScreen(page, "Images", imagesHeading(page));
}

async function reopenImages(page: Page): Promise<void> {
  await page.reload();
  await openScreen(page, "Images", imagesHeading(page));
}

async function openProfile(page: Page): Promise<void> {
  await page.goto(PANEL);
  await openScreen(page, "Profile", page.getByLabel("Name", { exact: true }));
}

async function reopenProfile(page: Page): Promise<void> {
  await page.reload();
  await openScreen(page, "Profile", page.getByLabel("Name", { exact: true }));
}

async function clickUpload(page: Page): Promise<void> {
  await uploadButton(page).click();
}

async function upload(page: Page, file: UploadFile): Promise<void> {
  await fileField(page).setInputFiles(file);
  await clickUpload(page);
}

const HEADSHOT_FILE = (): UploadFile => ({ name: "headshot.png", mimeType: "image/png", buffer: png(307200) });

async function clickDeleteConfirm(page: Page, name: string): Promise<void> {
  await itemNamed(page, name).getByRole("button", { name: "Delete", exact: true }).click();
  await confirmGroup(page).getByRole("button", { name: "Confirm", exact: true }).click();
}

type Recorded = { url: string; type: string; text: string };

// Record the URL and text of every response whose content type is HTML, JavaScript, JSON or CSS.
function recordResponses(page: Page): () => Promise<Recorded[]> {
  const records: Recorded[] = [];
  const pending: Promise<void>[] = [];
  page.on("response", (response) => {
    const type = response.headers()["content-type"] ?? "";
    if (!/html|javascript|json|css/i.test(type)) return;
    pending.push(
      response.text().then(
        (text) => {
          records.push({ url: response.url(), type, text });
        },
        () => undefined,
      ),
    );
  });
  return async () => {
    await Promise.all(pending);
    return records;
  };
}

// A route that holds the matching request of the given method until the test releases it.
function holdRoute(page: Page, match: (url: URL) => boolean, method: string) {
  let count = 0;
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const ready = page.route(match, async (route) => {
    if (route.request().method() === method) {
      count += 1;
      await gate;
    }
    await route.continue();
  });
  return { ready, count: () => count, release: () => release() };
}

test("E2E-17: the owner uploads a PNG, JPEG, WebP or SVG image, sees its name, size and preview, and finds it again after a reload", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(150000);
  const cases = [
    { name: "headshot.png", type: "image/png", buffer: png(307200), bytes: 307200, size: "300 KB", ext: "png" },
    { name: "photo.jpg", type: "image/jpeg", buffer: png(1572864), bytes: 1572864, size: "1.5 MB", ext: "jpg" },
    { name: "banner.webp", type: "image/webp", buffer: png(204800), bytes: 204800, size: "200 KB", ext: "webp" },
    { name: "logo.svg", type: "image/svg+xml", buffer: svg(2048), bytes: 2048, size: "2 KB", ext: "svg" },
    { name: "large.png", type: "image/png", buffer: png(5242880), bytes: 5242880, size: "5 MB", ext: "png" },
  ];

  for (const c of cases) {
    dbReset();
    storeReset();
    const { context, page } = await ownerPage(browser, baseURL as string);
    await openImages(page);
    await expect(page.getByText(EMPTY_LIST)).toBeVisible();
    await upload(page, { name: c.name, mimeType: c.type, buffer: c.buffer });

    const check = async (where: string) => {
      await expect(itemsOf(page), where).toHaveCount(1);
      const item = itemsOf(page).first();
      await expect(item, where).toContainText(c.name);
      await expect(item, where).toContainText(c.size);
      const entries = dbImages() as { id: string }[];
      expect(entries, where).toHaveLength(1);
      const id = entries[0].id;
      const image = item.getByRole("img");
      await expect(image, where).toHaveAttribute("alt", c.name);
      await expect(image, where).toHaveAttribute("src", publicOf(id));
      await expect(libraryAlert(page), where).toHaveCount(0);
    };

    await check(c.name + " after the upload");
    const ids = storeIds();
    expect(ids, c.name).toHaveLength(1);
    expect(ids[0].endsWith(c.ext), c.name + " extension").toBe(true);
    expect(dbImages(), c.name).toEqual([{ id: ids[0], name: c.name, contentType: c.type, size: c.bytes }]);
    expect(fs.statSync(STORE_DIR + "/" + ids[0]).size, c.name + " stored bytes").toBe(c.bytes);
    if (c.ext === "svg") await expect(page.locator("object, embed, iframe")).toHaveCount(0);

    await reopenImages(page);
    await check(c.name + " after the reload");
    if (c.ext === "svg") await expect(page.locator("object, embed, iframe")).toHaveCount(0);
    await context.close();
  }
});

test("E2E-18: the owner copies an image's address, and anyone can open it with no sign-in and no secret in it", async ({
  browser,
  baseURL,
}) => {
  dbReset();
  storeReset();
  const { context, page } = await ownerPage(browser, baseURL as string);
  const recorded = recordResponses(page);
  await openImages(page);
  await upload(page, HEADSHOT_FILE());
  await expect(itemsOf(page)).toHaveCount(1);

  await itemsOf(page).first().getByRole("button", { name: "Copy address", exact: true }).click();
  await expect(libraryStatus(page, "Address copied")).toHaveText("Address copied");
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  const id = (dbImages() as { id: string }[])[0].id;
  expect(copied).toBe(publicOf(id));
  for (const needle of ["?", "token", "key", "SUPABASE"]) expect(copied, needle).not.toContain(needle);

  const visitor = await visitorPage(browser);
  const response = await visitor.page.goto(copied);
  expect(response?.status()).toBe(200);
  expect(response?.headers()["content-type"]).toBe("image/png");
  expect((await response?.body())?.length).toBe(307200);
  await visitor.context.close();

  const needles = ["SUPABASE_URL", KEY_NAME, "key-marker-standin", "token="];
  const html = await page.content();
  for (const needle of needles) expect(html, "page html carries " + needle).not.toContain(needle);
  for (const record of await recorded()) {
    if (record.url.endsWith("/api/admin/images/upload/")) continue;
    for (const needle of needles) expect(record.text, record.url + " carries " + needle).not.toContain(needle);
  }
  await context.close();
});

test("E2E-19: a file over 5 MB, of another type, empty, or none at all is refused on the screen before anything is sent", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(150000);
  const cases: { label: string; file: UploadFile | null; alert: string }[] = [
    { label: "5 MB and 1 byte", file: { name: "big1.png", mimeType: "image/png", buffer: png(5242881) }, alert: "That image is over 5 MB" },
    { label: "6 MB", file: { name: "big6.png", mimeType: "image/png", buffer: png(6291456) }, alert: "That image is over 5 MB" },
    {
      label: "a PDF",
      file: { name: "doc.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4") },
      alert: "Only PNG, JPEG, WebP or SVG images can be uploaded",
    },
    { label: "an empty file", file: { name: "empty.png", mimeType: "image/png", buffer: Buffer.alloc(0) }, alert: "That file is empty" },
    { label: "no file", file: null, alert: "Choose an image first." },
  ];

  for (const c of cases) {
    dbReset();
    storeReset();
    seedHeadshot();
    const { context, page } = await ownerPage(browser, baseURL as string);
    const posts: string[] = [];
    page.on("request", (request) => {
      const path = new URL(request.url()).pathname;
      if (request.method() === "POST" && (path === LIST_API || path === UPLOAD_API)) posts.push(path);
    });
    await openImages(page);
    await expect(itemNamed(page, "headshot.png")).toHaveCount(1);

    if (c.file) await upload(page, c.file);
    else await clickUpload(page);

    await expect(libraryAlert(page), c.label).toHaveText(c.alert);
    expect(posts, c.label + " posts").toEqual([]);
    await expect(itemsOf(page), c.label).toHaveCount(1);
    await expect(itemsOf(page).first(), c.label).toContainText("headshot.png");
    expect(dbImages(), c.label).toEqual([HEADSHOT]);
    expect(storeIds(), c.label).toEqual([HEADSHOT.id]);
    await context.close();
  }
});

test("E2E-20: the file's type decides what is accepted, not its name", async ({ browser, baseURL }) => {
  dbReset();
  storeReset();
  const { context, page } = await ownerPage(browser, baseURL as string);
  await openImages(page);
  await expect(page.getByText(EMPTY_LIST)).toBeVisible();

  await upload(page, { name: "notes.txt", mimeType: "image/png", buffer: png(2048) });
  await expect(itemsOf(page)).toHaveCount(1);
  await expect(itemsOf(page).first()).toContainText("notes.txt");
  await expect(itemsOf(page).first()).toContainText("2 KB");
  const entries = dbImages() as { id: string; name: string; contentType: string }[];
  expect(entries).toHaveLength(1);
  expect(entries[0].name).toBe("notes.txt");
  expect(entries[0].contentType).toBe("image/png");
  expect(entries[0].id.endsWith(".png")).toBe(true);

  await upload(page, { name: "photo.png", mimeType: "application/pdf", buffer: png(100) });
  await expect(libraryAlert(page)).toHaveText("Only PNG, JPEG, WebP or SVG images can be uploaded");
  await expect(itemsOf(page)).toHaveCount(1);
  expect(storeIds()).toHaveLength(1);
  await context.close();
});

test("E2E-21: the same file uploaded twice is two images with their own addresses, newest first", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(90000);
  dbReset();
  storeReset();
  const { context, page } = await ownerPage(browser, baseURL as string);
  await openImages(page);
  await expect(page.getByText(EMPTY_LIST)).toBeVisible();

  await upload(page, HEADSHOT_FILE());
  await expect(itemsOf(page)).toHaveCount(1);
  await upload(page, HEADSHOT_FILE());
  await expect(itemsOf(page)).toHaveCount(2);
  await upload(page, { name: "photo.jpg", mimeType: "image/jpeg", buffer: png(1572864) });
  await expect(itemsOf(page)).toHaveCount(3);

  const order = ["photo.jpg", "headshot.png", "headshot.png"];
  const check = async (where: string) => {
    await expect(itemsOf(page), where).toHaveCount(3);
    await expect(itemsOf(page), where).toContainText(order);
    const entries = dbImages() as { id: string; name: string }[];
    expect(entries, where).toHaveLength(3);
    expect(entries.map((entry) => entry.name), where).toEqual(order);
    const ids = entries.map((entry) => entry.id);
    expect(new Set(ids).size, where).toBe(3);
    for (const id of ids) expect(id, where).toMatch(/^[0-9a-f-]{36}\.(png|jpg)$/);
    const sources = await itemsOf(page).getByRole("img").evaluateAll((nodes) =>
      nodes.map((node) => (node as HTMLImageElement).getAttribute("src") ?? ""),
    );
    expect(sources, where).toEqual(ids.map(publicOf));
    expect(new Set(sources).size, where).toBe(3);
    for (const source of sources) {
      expect(source.includes("headshot"), where).toBe(false);
      expect(source.includes("photo"), where).toBe(false);
    }
  };

  await check("after the uploads");
  expect(storeIds()).toHaveLength(3);
  await reopenImages(page);
  await check("after the reload");
  await context.close();
});

test("E2E-22: deleting an image removes its file and its entry, and the address stops opening", async ({
  browser,
  baseURL,
}) => {
  dbReset();
  storeReset();
  dbSeedBoth({ ...KEITH_BASE, photo: publicOf(HEADSHOT.id) }, [HEADSHOT]);
  storePut(HEADSHOT.id, png(307200), "image/png");
  const { context, page } = await ownerPage(browser, baseURL as string);
  await openImages(page);
  await expect(itemNamed(page, "headshot.png")).toHaveCount(1);

  await clickDeleteConfirm(page, "headshot.png");
  await expect(page.getByText(EMPTY_LIST)).toBeVisible();
  expect(storeHas(HEADSHOT.id)).toBe(false);
  expect(dbImages()).toEqual([]);

  const visitor = await visitorPage(browser);
  const response = await visitor.page.goto(publicOf(HEADSHOT.id));
  expect(response?.status()).toBe(404);
  await visitor.context.close();

  await reopenImages(page);
  await expect(page.getByText(EMPTY_LIST)).toBeVisible();
  await expect(page.getByRole("list", { name: "Uploaded images" })).toHaveCount(0);
  expect(dbStored()).toEqual({ ...KEITH_BASE, photo: publicOf(HEADSHOT.id) });
  await context.close();
});

test("E2E-23: deleting asks first, and cancelling keeps the image and its address", async ({ browser, baseURL }) => {
  dbReset();
  storeReset();
  seedHeadshot();
  const { context, page } = await ownerPage(browser, baseURL as string);
  await openImages(page);
  await expect(itemNamed(page, "headshot.png")).toHaveCount(1);

  await itemNamed(page, "headshot.png").getByRole("button", { name: "Delete", exact: true }).click();
  await expect(
    page.getByText('Delete "headshot.png"? Records that still use this image will show a broken image.'),
  ).toBeVisible();
  await expect(confirmGroup(page).getByRole("button", { name: "Confirm", exact: true })).toBeVisible();
  await expect(confirmGroup(page).getByRole("button", { name: "Cancel", exact: true })).toBeVisible();
  expect(dbImages()).toEqual([HEADSHOT]);
  expect(storeHas(HEADSHOT.id)).toBe(true);

  const visitor = await visitorPage(browser);
  const response = await visitor.page.goto(publicOf(HEADSHOT.id));
  expect(response?.status()).toBe(200);
  expect(response?.headers()["content-type"]).toBe("image/png");
  await visitor.context.close();

  await confirmGroup(page).getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.getByText('Delete "headshot.png"? Records that still use this image will show a broken image.'),
  ).toHaveCount(0);
  await reopenImages(page);
  await expect(itemsOf(page)).toHaveCount(1);
  await expect(itemsOf(page).first()).toContainText("headshot.png");
  await context.close();
});

test("E2E-24: a failed upload says so, leaves nothing listed, and the owner can try again", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(120000);

  // (a) storage unreachable, then back
  {
    dbReset();
    storeReset();
    const { context, page } = await ownerPage(browser, baseURL as string);
    await openImages(page);
    await expect(page.getByText(EMPTY_LIST)).toBeVisible();
    storeBreak();
    await upload(page, HEADSHOT_FILE());
    await expect(libraryAlert(page)).toHaveText(UPLOAD_FAILED);
    await expect(page.getByText(EMPTY_LIST)).toBeVisible();
    expect(dbImages()).toEqual([]);
    await expect(uploadButton(page)).toBeEnabled();
    await expect(libraryStatus(page, "Uploading…")).toHaveCount(0);

    storeFix();
    await upload(page, HEADSHOT_FILE());
    await expect(itemsOf(page)).toHaveCount(1);
    await expect(itemsOf(page).first()).toContainText("headshot.png");
    await context.close();
  }

  // (b) the browser's own send of the file fails
  {
    dbReset();
    storeReset();
    const { context, page } = await ownerPage(browser, baseURL as string);
    await context.route("https://stand-in.invalid/**", async (route) => {
      if (route.request().method() === "PUT") await route.abort("connectionfailed");
      else await route.fallback();
    });
    await openImages(page);
    await expect(page.getByText(EMPTY_LIST)).toBeVisible();
    await upload(page, HEADSHOT_FILE());
    await expect(libraryAlert(page)).toHaveText(UPLOAD_FAILED);
    expect(dbImages()).toEqual([]);
    expect(storeIds()).toEqual([]);
    await expect(uploadButton(page)).toBeEnabled();
    await context.close();
  }

  // (c) the database unreachable when the file is registered
  {
    dbReset();
    storeReset();
    const { context, page } = await ownerPage(browser, baseURL as string);
    await openImages(page);
    await expect(page.getByText(EMPTY_LIST)).toBeVisible();
    dbBreak();
    await upload(page, HEADSHOT_FILE());
    await expect(libraryAlert(page)).toHaveText(UPLOAD_FAILED);
    dbFix();
    await reopenImages(page);
    await expect(page.getByText(EMPTY_LIST)).toBeVisible();
    expect(dbImages()).toEqual([]);
    await context.close();
  }
});

test("E2E-25: when the list cannot be loaded the screen says so, the panel stays usable, and the public site is untouched", async ({
  browser,
  baseURL,
  request,
}) => {
  test.setTimeout(120000);
  for (const mode of ["storage", "database"] as const) {
    dbReset();
    storeReset();
    seedHeadshot();
    const first = await request.get("/");
    const before = await first.text();
    const { context, page } = await ownerPage(browser, baseURL as string);
    if (mode === "storage") storeBreak();
    else dbBreak();
    await openImages(page);

    await expect(libraryAlert(page), mode).toHaveText(LOAD_FAILED);
    await expect(page.getByText(EMPTY_LIST), mode).toHaveCount(0);
    await expect(page.getByRole("list", { name: "Uploaded images" }), mode).toHaveCount(0);
    const text = await page.locator("body").innerText();
    expect(containsNone(text, LEAKS), mode + " leaks").toBe(true);
    await expect(menu(page).getByRole("button"), mode).toHaveText(SECTION_LABELS);
    await expect(page.getByRole("button", { name: "Sign out", exact: true }), mode).toBeVisible();

    await menu(page).getByRole("button", { name: "Blog posts", exact: true }).click();
    if (mode === "storage") {
      await expect(page.getByText("No posts yet."), mode).toBeVisible();
    } else {
      await expect(page.getByRole("alert").filter({ hasText: "The entries could not be loaded." }), mode).toHaveText(
        "The entries could not be loaded.",
      );
    }
    await expect(page.getByRole("alert").filter({ hasText: LOAD_FAILED }), mode).toHaveCount(0);
    const second = await request.get("/");
    expect(second.status(), mode).toBe(200);
    expect(await second.text(), mode).toBe(before);

    if (mode === "storage") storeFix();
    else dbFix();
    await menu(page).getByRole("button", { name: "Images", exact: true }).click();
    await expect(itemsOf(page), mode).toHaveCount(1);
    await expect(itemsOf(page).first(), mode).toContainText("headshot.png");
    await context.close();
  }
});

test("E2E-26: a failed delete says so and leaves the image listed and stored, so it can be deleted again", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(120000);
  dbReset();
  storeReset();
  seedHeadshot();
  const { context, page } = await ownerPage(browser, baseURL as string);
  await openImages(page);
  await expect(itemNamed(page, "headshot.png")).toHaveCount(1);

  await itemNamed(page, "headshot.png").getByRole("button", { name: "Delete", exact: true }).click();
  storeBreak();
  await confirmGroup(page).getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(libraryAlert(page)).toHaveText(DELETE_FAILED);
  await expect(itemNamed(page, "headshot.png")).toHaveCount(1);
  await expect(confirmGroup(page)).toHaveCount(0);
  expect(dbImages()).toEqual([HEADSHOT]);
  expect(containsNone(await library(page).innerText(), LEAKS)).toBe(true);

  storeFix();
  await clickDeleteConfirm(page, "headshot.png");
  await expect(page.getByText(EMPTY_LIST)).toBeVisible();

  seedHeadshot();
  await reopenImages(page);
  await expect(itemNamed(page, "headshot.png")).toHaveCount(1);
  await itemNamed(page, "headshot.png").getByRole("button", { name: "Delete", exact: true }).click();
  dbBreak();
  await confirmGroup(page).getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(libraryAlert(page)).toHaveText(DELETE_FAILED);
  expect(storeHas(HEADSHOT.id)).toBe(true);
  await expect(itemNamed(page, "headshot.png")).toHaveCount(1);
  await context.close();
});

test("E2E-27: while an upload or a delete is running the controls are off and a double click sends one request", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(120000);
  dbReset();
  storeReset();
  const { context, page } = await ownerPage(browser, baseURL as string);
  await openImages(page);
  await expect(page.getByText(EMPTY_LIST)).toBeVisible();

  const uploadHold = holdRoute(page, (url) => url.pathname === UPLOAD_API, "POST");
  await uploadHold.ready;
  await fileField(page).setInputFiles(HEADSHOT_FILE());
  await uploadButton(page).dblclick();
  await expect(libraryStatus(page, "Uploading…")).toHaveText("Uploading…");
  await expect(uploadButton(page)).toBeDisabled();
  await expect(fileField(page)).toBeDisabled();
  expect(uploadHold.count()).toBe(1);
  uploadHold.release();
  await expect(itemsOf(page)).toHaveCount(1);
  await expect(itemsOf(page).first()).toContainText("headshot.png");
  expect(uploadHold.count()).toBe(1);
  expect(dbImages()).toHaveLength(1);

  const deleteHold = holdRoute(
    page,
    (url) => url.pathname === LIST_API && url.searchParams.has("id"),
    "DELETE",
  );
  await deleteHold.ready;
  const item = itemNamed(page, "headshot.png");
  await item.getByRole("button", { name: "Delete", exact: true }).click();
  await confirmGroup(page).getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(libraryStatus(page, "Deleting…")).toHaveText("Deleting…");
  await expect(confirmGroup(page).getByRole("button", { name: "Confirm", exact: true })).toBeDisabled();
  await expect(confirmGroup(page).getByRole("button", { name: "Cancel", exact: true })).toBeDisabled();
  await expect(item.getByRole("button", { name: "Delete", exact: true })).toBeDisabled();
  await expect(uploadButton(page)).toBeDisabled();
  deleteHold.release();
  await expect(page.getByText(EMPTY_LIST)).toBeVisible();

  dbReset();
  storeReset();
  await reopenImages(page);
  await expect(page.getByText(EMPTY_LIST)).toBeVisible();
  const lastHold = holdRoute(page, (url) => url.pathname === UPLOAD_API, "POST");
  await lastHold.ready;
  await fileField(page).setInputFiles(HEADSHOT_FILE());
  await uploadButton(page).click();
  await expect.poll(() => lastHold.count()).toBe(1);
  await reopenImages(page);
  const stored = dbImages().length;
  if (stored === 0) await expect(page.getByText(EMPTY_LIST)).toBeVisible();
  expect(await fileField(page).evaluate((input) => (input as HTMLInputElement).files?.length ?? 0)).toBe(0);
  await expect(itemsOf(page)).toHaveCount(stored);

  await page.unrouteAll({ behavior: "ignoreErrors" });
  await context.close();
});

test("E2E-28: deleting an image that another window already deleted says so and refreshes the list", async ({
  browser,
  baseURL,
}) => {
  dbReset();
  storeReset();
  seedHeadshot();
  const { context, page } = await ownerPage(browser, baseURL as string);
  const second = await context.newPage();
  await openImages(page);
  await openImages(second);
  await expect(itemNamed(page, "headshot.png")).toHaveCount(1);
  await expect(itemNamed(second, "headshot.png")).toHaveCount(1);

  await clickDeleteConfirm(page, "headshot.png");
  await expect(page.getByText(EMPTY_LIST)).toBeVisible();
  await expect(itemNamed(second, "headshot.png")).toHaveCount(1);

  await clickDeleteConfirm(second, "headshot.png");
  await expect(libraryAlert(second)).toHaveText(ALREADY_GONE);
  await expect(second.getByText(EMPTY_LIST)).toBeVisible();
  expect(dbImages()).toEqual([]);
  await context.close();
});

test("E2E-29: the Images screen fits a phone, follows the theme tokens and works from the keyboard", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(120000);
  const longName = "N".repeat(120) + ".png";
  const surfaceByTheme: Record<string, string> = {};

  for (const theme of ["light", "dark"]) {
    dbReset();
    storeReset();
    dbSeedImages([{ id: HEADSHOT.id, name: longName, contentType: "image/png", size: 307200 }]);
    storePut(HEADSHOT.id, png(307200), "image/png");
    const { context, page } = await ownerPage(browser, baseURL as string, { viewport: { width: 375, height: 800 } });
    await page.addInitScript((t) => {
      try {
        localStorage.setItem("theme", t);
      } catch {
        // storage unavailable: the page falls back to its default theme
      }
    }, theme);
    await openImages(page);
    await expect(itemsOf(page)).toHaveCount(1);
    await clickUpload(page);
    await expect(libraryAlert(page).filter({ hasText: "Choose an image first." })).toHaveText("Choose an image first.");

    const widths = await page.evaluate(() => ({
      root: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
    }));
    expect(widths.root, theme + " root width").toBeLessThanOrEqual(375);
    expect(widths.body, theme + " body width").toBeLessThanOrEqual(375);
    const boxes = await page.locator("button, input, img").evaluateAll((nodes) =>
      nodes.map((node) => {
        const rect = node.getBoundingClientRect();
        return { label: node.tagName + " " + (node.textContent ?? "").slice(0, 20), x: rect.x, right: rect.x + rect.width, width: rect.width, height: rect.height };
      }),
    );
    for (const box of boxes) {
      if (box.width === 0 && box.height === 0) continue;
      expect(box.x, theme + " " + box.label).toBeGreaterThanOrEqual(0);
      expect(box.right, theme + " " + box.label).toBeLessThanOrEqual(375);
    }

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
    expect(await computed(item.getByText(longName, { exact: true }), "color"), theme + " name").toBe(
      await probe("color", "--foreground"),
    );
    expect(await computed(item.getByText("300 KB", { exact: true }), "color"), theme + " size").toBe(
      await probe("color", "--muted"),
    );
    const alert = libraryAlert(page).filter({ hasText: "Choose an image first." });
    expect(await computed(alert, "color"), theme + " alert").toBe(await probe("color", "--accent-rose"));
    surfaceByTheme[theme] = surfaceAlt;
    if (theme === "dark") await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    await item.getByRole("button", { name: "Delete", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(confirmGroup(page)).toBeVisible();
    await confirmGroup(page).getByRole("button", { name: "Confirm", exact: true }).focus();
    await page.keyboard.press("Tab");
    await expect(confirmGroup(page).getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(confirmGroup(page)).toHaveCount(0);
    await context.close();
  }
  expect(surfaceByTheme.dark).not.toBe(surfaceByTheme.light);
});

test("E2E-30: no page, script or answer carries a storage setting or a failure's text, and the three screens' files name no server or old-backend module", async ({
  browser,
  baseURL,
}) => {
  dbReset();
  storeReset();
  const { context, page } = await ownerPage(browser, baseURL as string);
  const recorded = recordResponses(page);
  await openImages(page);
  await upload(page, HEADSHOT_FILE());
  await expect(itemsOf(page)).toHaveCount(1);
  await itemsOf(page).first().getByRole("button", { name: "Copy address", exact: true }).click();
  await expect(libraryStatus(page, "Address copied")).toHaveText("Address copied");
  await clickDeleteConfirm(page, "headshot.png");
  await expect(page.getByText(EMPTY_LIST)).toBeVisible();
  await openScreen(page, "Profile", page.getByLabel("Name", { exact: true }));
  await expect(page.getByLabel("Uploaded image", { exact: true })).toBeVisible();

  const records = await recorded();
  expect(STORE_DIR).not.toBe("");
  expect(records.some((record) => /javascript/i.test(record.type))).toBe(true);
  expect(records.some((record) => new URL(record.url).pathname === LIST_API)).toBe(true);
  expect(records.some((record) => new URL(record.url).pathname === PANEL_API)).toBe(true);

  const needles = [
    "SUPABASE_URL",
    KEY_NAME,
    "key-marker-standin",
    "password-marker-standin",
    STAND_IN_PREFIX,
    STORE_DIR,
    "ECONNREFUSED",
    "10.1.2.3",
  ];
  for (const record of records) {
    if (record.url.endsWith("/api/admin/images/upload/")) continue;
    for (const needle of needles) expect(record.text, record.url + " carries " + needle).not.toContain(needle);
  }

  const files = [
    "src/app/components/admin/ImageLibrary.tsx",
    "src/app/components/admin/AdminPanel.tsx",
    "src/app/components/admin/ProfileEditor.tsx",
    "src/lib/admin/imagesClient.ts",
    "src/lib/admin/images.ts",
    "src/lib/admin/storagelog.ts",
  ];
  const serverSide = [
    ["lib", "server"].join("/"),
    ["lib", "auth"].join("/"),
    ["next", "auth"].join("-"),
    ["post", "gres"].join(""),
    ["server", "only"].join("-"),
  ];
  const oldBackend = ["fire", "base"].join("");
  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    for (const needle of serverSide) expect(text.includes(needle), file + " names " + needle).toBe(false);
    expect(text.toLowerCase().includes(oldBackend), file + " names the old backend").toBe(false);
  }
  await context.close();
});

const photoSelect = (page: Page) => page.getByLabel("Uploaded image", { exact: true });
const selectedOption = (select: Locator) => select.locator("option:checked");
const photoPath = (page: Page) => page.getByLabel("Photo path", { exact: true });

test("E2E-31: the profile's photo can be chosen from the uploaded images, and the choice survives a save and a reload", async ({
  browser,
  baseURL,
}) => {
  dbReset();
  storeReset();
  dbSeedBoth(KEITH_BASE, [PHOTO, HEADSHOT]);
  storePut(PHOTO.id, png(1572864), "image/jpeg");
  storePut(HEADSHOT.id, png(307200), "image/png");
  const { context, page } = await ownerPage(browser, baseURL as string);
  await openProfile(page);

  await expect(photoSelect(page).locator("option")).toHaveText(["None", "photo.jpg", "headshot.png"]);
  await photoSelect(page).selectOption({ label: "headshot.png" });
  await expect(photoPath(page)).toHaveValue("");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Profile saved" })).toHaveText("Profile saved");
  expect(dbStored()).toEqual({ ...KEITH_BASE, photo: publicOf(HEADSHOT.id) });

  await reopenProfile(page);
  await expect(selectedOption(photoSelect(page))).toHaveText("headshot.png");
  await expect(photoPath(page)).toHaveValue("");
  await context.close();
});

test("E2E-32: a photo that is not one of the uploaded images stays as typed text", async ({ browser, baseURL }) => {
  dbReset();
  storeReset();
  dbSeedBoth({ ...KEITH_BASE, photo: publicOf(HEADSHOT.id) }, [HEADSHOT]);
  storePut(HEADSHOT.id, png(307200), "image/png");
  const { context, page } = await ownerPage(browser, baseURL as string);
  await openProfile(page);

  await expect(selectedOption(photoSelect(page))).toHaveText("headshot.png");
  await expect(photoPath(page)).toHaveValue("");
  await photoPath(page).fill("/images/keith.jpg");
  await expect(selectedOption(photoSelect(page))).toHaveText("None");

  const unknown = publicOf("55555555-5555-4555-8555-555555555555.png");
  dbSeedBoth({ ...KEITH_BASE, photo: unknown }, [HEADSHOT]);
  await reopenProfile(page);
  await expect(selectedOption(photoSelect(page))).toHaveText("None");
  await expect(photoPath(page)).toHaveValue(unknown);
  await context.close();
});

test("E2E-33: when the uploaded images cannot be loaded the profile form still loads and saves with a typed path", async ({
  browser,
  baseURL,
}) => {
  dbReset();
  storeReset();
  dbSeedBoth(KEITH_BASE, [HEADSHOT]);
  storeBreak();
  const { context, page } = await ownerPage(browser, baseURL as string);
  await openProfile(page);

  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Keith Lim");
  await expect(
    page.getByRole("group", { name: "Photo", exact: true }).getByRole("alert"),
  ).toHaveText("The uploaded images could not be loaded.");
  await expect(photoSelect(page).locator("option")).toHaveText(["None"]);
  const text = await page.locator('section[aria-label="Profile editor"]').innerText();
  expect(containsNone(text, LEAKS)).toBe(true);

  await photoPath(page).fill("/images/keith.jpg");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Profile saved" })).toHaveText("Profile saved");
  expect((dbStored() as { photo: string }).photo).toBe("/images/keith.jpg");
  await context.close();
});

test("E2E-34: the earlier Firebase-era image code is gone and nothing in src or e2e still names it", async () => {
  dbReset();
  storeReset();

  // The patterns are built from pieces so this file does not match itself.
  const oldPath = ["fire", "base"].join("") + "/" + "images";
  const oldType = ["Image", "Record"].join("");
  const oldHelper = ["storage", "Path", "For"].join("");

  expect(fs.existsSync(["src", "lib", ["fire", "base"].join(""), "images.ts"].join("/"))).toBe(false);
  expect(fs.existsSync(["e2e", ["manage", "image", "library"].join("-") + ".spec.ts"].join("/"))).toBe(false);

  const rules = fs.readFileSync("src/lib/admin/images.ts", "utf8");
  expect(new RegExp("\\b" + oldType + "\\b").test(rules), "images.ts names the old type").toBe(false);
  expect(new RegExp("\\b" + oldHelper + "\\b").test(rules), "images.ts names the old helper").toBe(false);

  const editors = ["BlogPostsEditor", "CertificationsEditor", "TechStackEditor"];
  for (const editor of editors) {
    const file = "src/app/components/admin/" + editor + ".tsx";
    const text = fs.readFileSync(file, "utf8");
    expect(text.includes('from "@/lib/admin/imagesClient"'), file + " imports the new client").toBe(true);
    expect(text.includes("UploadedImage"), file + " uses the new type").toBe(true);
    expect(new RegExp("\\b" + oldType + "\\b").test(text), file + " names the old type").toBe(false);
    expect(text.includes(oldPath), file + " names the old module").toBe(false);
  }

  const path = gitGrep(["-n", "-E", oldPath, "--", "src", "e2e"]);
  expect(path.stdout, "old module path").toBe("");
  expect(path.status).toBe(1);

  const names = gitGrep(["-n", "-w", "-E", "-e", oldType, "-e", oldHelper, "--", "src", "e2e"]);
  expect(names.stdout, "old type or helper").toBe("");
  expect(names.status).toBe(1);
});

// Step 6: the standing docs the storage makes false.

test("E2E-35: the standing docs name the storage settings, the image routes and the stand-in, and no longer say five settings", async () => {
  dbReset();
  storeReset();

  const claude = fs.readFileSync("CLAUDE.md", "utf8");
  for (const text of [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "/api/admin/images/",
    "/api/admin/images/upload/",
    "stand-in:",
    "SUPABASE_DB_URL",
    "/api/admin/profile/",
    "AUTH_SECRET",
    "/api/auth/callback/google",
    "The site reads seven settings by name",
  ]) {
    expect(claude, "CLAUDE.md contains " + text).toContain(text);
  }
  for (const text of ["The site reads five settings by name", "only API route"]) {
    expect(claude, "CLAUDE.md no longer contains " + text).not.toContain(text);
  }

  const profile = fs.readFileSync(".claude/repo-profile.md", "utf8");
  for (const text of [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_DB_URL",
    "stand-in:",
    "next start",
    "ADMIN_EMAIL",
    "The site reads seven settings by name",
  ]) {
    expect(profile, "repo-profile.md contains " + text).toContain(text);
  }
  for (const text of ["The site reads five settings by name", "There is no database, so no test database."]) {
    expect(profile, "repo-profile.md no longer contains " + text).not.toContain(text);
  }
});
