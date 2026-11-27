import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { expect, test } from "@playwright/test";
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
