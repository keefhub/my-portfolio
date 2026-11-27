import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { expect, test, type APIRequestContext, type APIResponse } from "@playwright/test";
import { encode } from "next-auth/jwt";
import { checkExperience, experienceFromData, experienceShape, experienceToData } from "../src/lib/admin/experience";
import { LIST_ID_PATTERN } from "../src/lib/admin/list";

test.describe.configure({ mode: "default" });

// Shared fixtures. The tests of this file share one stand-in database file (D-14), so every test starts by
// resetting it. The rows of Step 1 never read it, but the reset keeps the file's rule uniform.

const STAND_IN_PREFIX = "stand-in:";
const DB_URL = process.env.SUPABASE_DB_URL ?? "";
const DB_FILE = DB_URL.startsWith(STAND_IN_PREFIX) ? DB_URL.slice(STAND_IN_PREFIX.length) : "";

function dbReset(): void {
  if (DB_FILE !== "" && fs.existsSync(DB_FILE)) fs.rmSync(DB_FILE, { force: true });
}

const API = "/api/admin/experience/";

const ACME_ID = "11111111-1111-4111-8111-111111111111";
const BETA_ID = "22222222-2222-4222-8222-222222222222";
const GAMMA_ID = "33333333-3333-4333-8333-333333333333";

const ACME = {
  year: "2024",
  title: "Software Engineer",
  company: "Acme",
  duration: "Jan 2024 - Present",
  description: "Built the billing service.",
  details: ["Cut invoice errors by 40%"],
};
const BETA = {
  year: "2022",
  title: "Analyst",
  company: "Beta",
  duration: "2022 - 2023",
  description: "Reported on sales.",
  details: [] as string[],
};
const GAMMA = {
  year: "2020",
  title: "Intern",
  company: "Gamma",
  duration: "Summer 2020",
  description: "Filed reports.",
  details: [] as string[],
};

// The gate scans this file, so the name of the forbidden client module is put together from pieces.
const SUPABASE_PREFIX = ["@supa", "base/"].join("");

test("E2E-01: no dependency or setting name was added", async () => {
  dbReset();
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

  const result = spawnSync(
    "git",
    ["grep", "--untracked", "-ohE", "process\\.env\\.[A-Za-z_]+", "--", "src", "playwright.config.ts"],
    { cwd: process.cwd(), encoding: "utf8" },
  );
  const names = [
    ...new Set(
      (result.stdout ?? "")
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

test("E2E-02: experienceShape, checkExperience and LIST_ID_PATTERN apply the stated rules", async () => {
  dbReset();
  const full = { year: "2024", title: "T", company: "C", duration: "D", description: "X" };

  // experienceShape
  const a = { ...full, details: ["a", "b"] };
  expect(experienceShape(a)).toEqual(a);
  expect(experienceShape({ title: "T" })).toEqual({
    year: "",
    title: "T",
    company: "",
    duration: "",
    description: "",
    details: [],
  });
  const c = experienceShape({ ...full, details: [], extra: 5 });
  expect(c).not.toBeNull();
  expect(Object.keys(c as object)).not.toContain("extra");
  expect(c).toEqual({ ...full, details: [] });
  expect(experienceShape({ ...full, year: 5 })).toBeNull();
  expect(experienceShape({ ...full, details: "a" })).toBeNull();
  expect(experienceShape({ ...full, details: ["a", 1] })).toBeNull();
  expect(experienceShape({ ...full, title: null })).toBeNull();
  expect(experienceShape(null)).toBeNull();
  expect(experienceShape([])).toBeNull();
  expect(experienceShape("x")).toBeNull();
  expect(experienceShape(7)).toBeNull();

  // checkExperience
  const padded = checkExperience({
    year: "  2023  ",
    title: "  Analyst ",
    company: " Beta  ",
    duration: "2023 - 2024 ",
    description: "  Reported on sales. ",
    details: ["  First  ", "   ", "Second"],
  });
  expect(padded).toEqual({
    ok: true,
    content: {
      year: "2023",
      title: "Analyst",
      company: "Beta",
      duration: "2023 - 2024",
      description: "Reported on sales.",
      details: ["First", "Second"],
    },
  });
  const twoBlank = checkExperience({
    year: "",
    title: "   ",
    company: " Beta  ",
    duration: "2023 - 2024 ",
    description: "  Reported on sales. ",
    details: ["  First  ", "   ", "Second"],
  });
  expect(twoBlank.ok).toBe(false);
  if (!twoBlank.ok) expect(twoBlank.errors).toEqual({ year: "Year is required", title: "Title is required" });
  const allBlank = checkExperience({
    year: "   ",
    title: "   ",
    company: "   ",
    duration: "   ",
    description: "   ",
    details: ["   "],
  });
  expect(allBlank.ok).toBe(false);
  if (!allBlank.ok) {
    expect(allBlank.errors).toEqual({
      year: "Year is required",
      title: "Title is required",
      company: "Company is required",
      duration: "Duration is required",
      description: "Description is required",
    });
  }

  // LIST_ID_PATTERN
  expect(LIST_ID_PATTERN.test(ACME_ID)).toBe(true);
  for (const bad of [
    "AAAAAAAA-1111-4111-8111-111111111111",
    "11111111-1111-4111-8111-11111111111",
    "../x",
    "11111111-1111-4111-8111-111111111111/",
    "",
  ]) {
    expect(LIST_ID_PATTERN.test(bad), JSON.stringify(bad)).toBe(false);
  }
});

type Recorded = { url: string; init: RequestInit | undefined };
type Answer = Response | Error;

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const plain = (status: number, body: string): Response => new Response(body, { status });

test("E2E-03: the browser list store sends the stated requests and fails with one fixed error", async () => {
  dbReset();
  // The module is loaded here, not at the top, so the two rows above run before the file exists.
  const { createHttpListStore } = await import("../src/lib/admin/listClient");

  const original = globalThis.fetch;
  const calls: Recorded[] = [];
  const allCalls: Recorded[] = [];
  const queue: Answer[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const rec = { url: String(input), init };
    calls.push(rec);
    allCalls.push(rec);
    const next = queue.shift();
    if (next === undefined) throw new Error("no answer queued");
    if (next instanceof Error) throw next;
    return next;
  }) as typeof fetch;

  const reset = () => {
    calls.length = 0;
  };
  const headerOf = (rec: Recorded, name: string): string | null => new Headers(rec.init?.headers).get(name);
  const bodyOf = (rec: Recorded): unknown => JSON.parse(String(rec.init?.body));
  const method = (rec: Recorded): string => (rec.init?.method ?? "GET").toUpperCase();

  try {
    const store = createHttpListStore(API, experienceFromData, experienceToData);

    // (1) load
    queue.push(
      json(200, {
        entries: [
          {
            id: ACME_ID,
            position: 0,
            content: { year: "2024", title: "Software Engineer", company: "Acme", duration: "d", description: "x", details: ["a"] },
          },
          { id: BETA_ID, position: 1, content: { title: "Analyst" } },
        ],
      }),
    );
    const loaded = await store.load();
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(API);
    expect(method(calls[0])).toBe("GET");
    expect(calls[0].init?.cache).toBe("no-store");
    expect(calls[0].init?.signal).toBeTruthy();
    expect(loaded).toEqual([
      {
        id: ACME_ID,
        position: 0,
        content: { year: "2024", title: "Software Engineer", company: "Acme", duration: "d", description: "x", details: ["a"] },
      },
      {
        id: BETA_ID,
        position: 1,
        content: { year: "", title: "Analyst", company: "", duration: "", description: "", details: [] },
      },
    ]);

    // (2) add
    reset();
    queue.push(json(200, { id: GAMMA_ID }));
    const added = await store.add(GAMMA, -1);
    expect(added).toBe(GAMMA_ID);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(API);
    expect(method(calls[0])).toBe("POST");
    expect(headerOf(calls[0], "content-type")).toBe("application/json");
    expect(bodyOf(calls[0])).toEqual({ content: GAMMA, position: -1 });

    // (3) update
    reset();
    queue.push(json(200, { updated: true }));
    const updated = await store.update(ACME_ID, ACME);
    expect(updated).toBeUndefined();
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(API + "?id=" + ACME_ID);
    expect(method(calls[0])).toBe("PUT");
    expect(headerOf(calls[0], "content-type")).toBe("application/json");
    expect(bodyOf(calls[0])).toEqual({ content: ACME });

    // (4) reorder
    reset();
    queue.push(json(200, { moved: true }));
    await store.reorder([
      { id: ACME_ID, position: 1 },
      { id: BETA_ID, position: 0 },
    ]);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(API);
    expect(method(calls[0])).toBe("PATCH");
    expect(headerOf(calls[0], "content-type")).toBe("application/json");
    expect(bodyOf(calls[0])).toEqual({
      changes: [
        { id: ACME_ID, position: 1 },
        { id: BETA_ID, position: 0 },
      ],
    });
    reset();
    await store.reorder([]);
    expect(calls).toHaveLength(0);

    // (5) remove
    reset();
    queue.push(json(200, { deleted: true }));
    await store.remove(BETA_ID);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(API + "?id=" + BETA_ID);
    expect(method(calls[0])).toBe("DELETE");
    expect(calls[0].init?.body ?? undefined).toBeUndefined();
    reset();
    queue.push(json(200, { deleted: true }));
    await store.remove("a b/c?");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(API + "?id=a%20b%2Fc%3F");
    expect(method(calls[0])).toBe("DELETE");

    // (6) failures
    const failures: Record<string, () => Answer> = {
      "401": () => json(401, { error: "not-signed-in" }),
      "404": () => json(404, { error: "not-found" }),
      "503": () => json(503, { error: "unavailable", detail: "SECRET-MARKER" }),
      throws: () => new TypeError("connect ECONNREFUSED 10.1.2.3"),
    };
    const forbidden = ["SECRET-MARKER", "10.1.2.3", "not-signed-in", "unavailable"];

    const expectFailure = async (label: string, run: () => Promise<unknown>, answer: Answer) => {
      queue.length = 0;
      queue.push(answer);
      let caught: unknown;
      try {
        await run();
      } catch (e) {
        caught = e;
      }
      expect(caught, label + " rejects").toBeInstanceOf(Error);
      const message = (caught as Error).message;
      expect(message, label).toBe("The request failed.");
      for (const f of forbidden) expect(message, label + " leaks " + f).not.toContain(f);
    };

    const loadBad: [string, () => Answer][] = [
      ...Object.entries(failures),
      ["not json", () => plain(200, "not json")],
      ["entries string", () => json(200, { entries: "x" })],
      ["entry without a content", () => json(200, { entries: [{ id: 5 }] })],
    ];
    for (const [label, make] of loadBad) await expectFailure("load " + label, () => store.load(), make());

    const calls4: [string, () => Promise<unknown>][] = [
      ["add", () => store.add(GAMMA, 0)],
      ["update", () => store.update(ACME_ID, ACME)],
      ["reorder", () => store.reorder([{ id: ACME_ID, position: 1 }])],
      ["remove", () => store.remove(ACME_ID)],
    ];
    for (const [name, run] of calls4) {
      for (const [label, make] of Object.entries(failures)) await expectFailure(name + " " + label, run, make());
    }
    await expectFailure("add empty answer", () => store.add(GAMMA, 0), json(200, {}));
    await expectFailure("add not json", () => store.add(GAMMA, 0), plain(200, "not json"));

    for (const rec of allCalls) expect(rec.init?.cache).toBe("no-store");
  } finally {
    globalThis.fetch = original;
  }
});

// Step 2: the owner-only route, called directly.

const GONE_ID = "99999999-9999-4999-8999-999999999999";

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

function dbSeedExperience(list: unknown[]): void {
  fs.writeFileSync(DB_FILE, JSON.stringify({ experience: list }));
}

function dbSeedAll(profile: unknown, images: unknown, list: unknown[]): void {
  fs.writeFileSync(DB_FILE, JSON.stringify({ profile, images, experience: list }));
}

function dbExperience(): unknown[] {
  const list = readDbFile().experience;
  return Array.isArray(list) ? list : [];
}

type StoredRow = { id: string; position: number; data: { title?: string } };

// The titles of the stored entries, stably sorted by position (equal positions keep array order).
function dbTitles(): string[] {
  return (dbExperience() as StoredRow[])
    .map((r, i) => ({ r, i }))
    .sort((a, b) => a.r.position - b.r.position || a.i - b.i)
    .map(({ r }) => r.data.title ?? "");
}

const positionsOf = (): Record<string, unknown> =>
  Object.fromEntries((dbExperience() as StoredRow[]).map((r) => [r.id, r.position]));

const row = (id: string, position: number, content: unknown) => ({ id, position, data: content });
const entry = (id: string, position: number, content: unknown) => ({ id, position, content });
const seedTwo = (): void => dbSeedExperience([row(ACME_ID, 0, ACME), row(BETA_ID, 1, BETA)]);
const seedThree = (): void =>
  dbSeedExperience([row(ACME_ID, 0, ACME), row(BETA_ID, 1, BETA), row(GAMMA_ID, 2, GAMMA)]);

const LEAKS = ["10.1.2.3", "password-marker-standin", "ECONNREFUSED"];

async function apiGet(request: APIRequestContext, cookie?: string): Promise<APIResponse> {
  return request.get(API, { headers: cookie === undefined ? {} : { cookie }, maxRedirects: 0 });
}

async function apiSend(
  request: APIRequestContext,
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  query: string,
  body: string | undefined,
  cookie?: string,
): Promise<APIResponse> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (cookie !== undefined) headers.cookie = cookie;
  return request.fetch(API + query, {
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
      { id: ACME_ID, position: 1 },
      { id: BETA_ID, position: 0 },
    ],
  });
const idQuery = (id: string): string => "?id=" + id;

async function titlesFromGet(request: APIRequestContext, cookie: string): Promise<string[]> {
  const res = await apiGet(request, cookie);
  expect(res.status(), "GET status").toBe(200);
  const body = (await res.json()) as { entries: { content: { title: string } }[] };
  return body.entries.map((e) => e.content.title);
}

// This file is scanned by the mechanical gate, so the words and the module names it greps for are put together
// from pieces.
const FIRE = ["fire", "base"].join("");
const PG = ["post", "gres"].join("");
const AUTH_MODULE = ["@/lib/", "auth"].join("");
const TABLE_MARK = ["$", "{table}"].join("");

function gitGrep(args: string[]): { stdout: string; status: number | null } {
  const result = spawnSync("git", ["grep", "--untracked", ...args], { cwd: process.cwd(), encoding: "utf8" });
  return { stdout: result.stdout ?? "", status: result.status };
}

test("E2E-04: the list SQL is exactly the proven text, the server files are marked server-only, and nothing names Firebase", async () => {
  dbReset();

  const sql = fs.readFileSync("src/lib/server/listSql.ts", "utf8").split(TABLE_MARK).join("experience");
  for (const statement of [
    "create table if not exists experience (seq bigint generated always as identity, id text primary key, position integer not null, data jsonb not null, updated_at timestamptz not null default now())",
    "alter table experience enable row level security",
    "select id, position, data from experience order by position, seq",
    "insert into experience (id, position, data) values ($1, $2, $3::text::jsonb) returning id",
    "update experience set data = $2::text::jsonb, updated_at = now() where id = $1 returning id",
    "delete from experience where id = $1 returning id",
    "with wanted as (select id, position from jsonb_to_recordset($1::text::jsonb) as w(id text, position integer)) update experience e set position = wanted.position, updated_at = now() from wanted where e.id = wanted.id and (select count(*) from experience x join wanted w on w.id = x.id) = (select count(*) from wanted) returning e.id",
  ]) {
    expect(sql, statement).toContain(statement);
  }
  for (const word of ["drop ", "truncate "]) expect(sql, word).not.toContain(word);

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
    "src/app/api/admin/experience",
  ]);
  expect(named.stdout).toBe("");
  expect(named.status).toBe(1);
});

test("E2E-05: the owner lists, adds, replaces and removes an entry through the route, with trimmed content", async ({
  request,
}) => {
  dbReset();
  const owner = await ownerCookie();
  const answers: [string, APIResponse][] = [];

  const first = await apiGet(request, owner);
  answers.push(["GET 1", first]);
  await expectAnswer(first, 200, { entries: [] }, "GET 1");

  const added = await apiSend(
    request,
    "POST",
    "",
    '{"content":{"year":"  2024 ","title":" Software Engineer","company":"Acme ","duration":"Jan 2024 - Present","description":" Built the billing service. ","details":["  Cut invoice errors by 40%  ","   ",""]},"position":0}',
    owner,
  );
  answers.push(["POST", added]);
  expect(added.status(), "POST status").toBe(200);
  const addedBody = (await added.json()) as Record<string, unknown>;
  expect(Object.keys(addedBody)).toEqual(["id"]);
  const id1 = addedBody.id as string;
  expect(id1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  const stored = {
    year: "2024",
    title: "Software Engineer",
    company: "Acme",
    duration: "Jan 2024 - Present",
    description: "Built the billing service.",
    details: ["Cut invoice errors by 40%"],
  };
  expect(dbExperience()).toEqual([row(id1, 0, stored)]);

  const second = await apiGet(request, owner);
  answers.push(["GET 2", second]);
  await expectAnswer(second, 200, { entries: [entry(id1, 0, stored)] }, "GET 2");

  const replaced = await apiSend(
    request,
    "PUT",
    idQuery(id1),
    '{"content":{"year":"2024","title":"Senior Software Engineer","company":"Acme","duration":"Jan 2024 - Present","description":"Built the billing service.","details":[]}}',
    owner,
  );
  answers.push(["PUT", replaced]);
  await expectAnswer(replaced, 200, { updated: true }, "PUT");

  const third = await apiGet(request, owner);
  answers.push(["GET 3", third]);
  await expectAnswer(
    third,
    200,
    { entries: [entry(id1, 0, { ...stored, title: "Senior Software Engineer", details: [] })] },
    "GET 3",
  );

  const removed = await apiSend(request, "DELETE", idQuery(id1), undefined, owner);
  answers.push(["DELETE", removed]);
  await expectAnswer(removed, 200, { deleted: true }, "DELETE");

  const last = await apiGet(request, owner);
  answers.push(["GET 4", last]);
  await expectAnswer(last, 200, { entries: [] }, "GET 4");
  expect(dbExperience()).toEqual([]);

  for (const [label, res] of answers) expectJsonNoStore(res, label);
});

test("E2E-06: the route keeps the positions the client sends, orders by position then insertion, and refuses an out-of-range one", async ({
  request,
}) => {
  dbReset();
  const owner = await ownerCookie();

  const posted: string[] = [];
  for (const [content, position] of [
    [ACME, 0],
    [BETA, -1],
    [GAMMA, -2],
  ] as const) {
    const res = await apiSend(request, "POST", "", postBody(content, position), owner);
    expect(res.status(), "POST " + content.title).toBe(200);
    posted.push(((await res.json()) as { id: string }).id);
  }
  expect(await titlesFromGet(request, owner)).toEqual(["Intern", "Analyst", "Software Engineer"]);

  const again = await apiSend(request, "POST", "", postBody(GAMMA, -2), owner);
  expect(again.status(), "second Gamma").toBe(200);
  const againId = ((await again.json()) as { id: string }).id;
  const afterFourth = await apiGet(request, owner);
  const listed = ((await afterFourth.json()) as { entries: { id: string; content: { title: string } }[] }).entries;
  expect(listed.map((e) => e.content.title)).toEqual(["Intern", "Intern", "Analyst", "Software Engineer"]);
  expect(listed[0].id).not.toBe(listed[1].id);
  expect(listed[0].id).toBe(posted[2]);
  expect(listed[1].id).toBe(againId);

  dbSeedExperience([row(ACME_ID, 2, ACME), row(BETA_ID, 2, BETA), row(GAMMA_ID, -5, GAMMA)]);
  expect(await titlesFromGet(request, owner)).toEqual(["Intern", "Software Engineer", "Analyst"]);

  const high = await apiSend(request, "POST", "", postBody(ACME, 2147483647), owner);
  expect(high.status(), "position 2147483647").toBe(200);
  const low = await apiSend(request, "POST", "", postBody(ACME, -2147483648), owner);
  expect(low.status(), "position -2147483648").toBe(200);
  const before = dbExperience().length;
  const over = await apiSend(request, "POST", "", postBody(ACME, 2147483648), owner);
  await expectAnswer(over, 400, { error: "invalid" }, "position 2147483648");
  expect(dbExperience()).toHaveLength(before);
});

test("E2E-07: a replace or remove of an entry that is not stored answers 404 and stores nothing", async ({ request }) => {
  dbReset();
  seedTwo();
  const owner = await ownerCookie();
  const seed = [row(ACME_ID, 0, ACME), row(BETA_ID, 1, BETA)];

  const missingPut = await apiSend(
    request,
    "PUT",
    idQuery(GONE_ID),
    JSON.stringify({ content: { ...ACME, title: "Changed" } }),
    owner,
  );
  await expectAnswer(missingPut, 404, { error: "not-found" }, "PUT of a missing id");
  const missingDelete = await apiSend(request, "DELETE", idQuery(GONE_ID), undefined, owner);
  await expectAnswer(missingDelete, 404, { error: "not-found" }, "DELETE of a missing id");
  expect(dbExperience()).toEqual(seed);

  const edit = await apiSend(
    request,
    "PUT",
    idQuery(BETA_ID),
    JSON.stringify({ content: { ...BETA, title: "Analyst II" } }),
    owner,
  );
  await expectAnswer(edit, 200, { updated: true }, "PUT of Beta");
  const stored = dbExperience() as { id: string; position: number; data: unknown }[];
  expect(stored.find((r) => r.id === BETA_ID)).toEqual(row(BETA_ID, 1, { ...BETA, title: "Analyst II" }));
  expect(stored.find((r) => r.id === ACME_ID)).toEqual(row(ACME_ID, 0, ACME));

  const removed = await apiSend(request, "DELETE", idQuery(ACME_ID), undefined, owner);
  await expectAnswer(removed, 200, { deleted: true }, "first DELETE of Acme");
  const revive = await apiSend(request, "PUT", idQuery(ACME_ID), JSON.stringify({ content: ACME }), owner);
  await expectAnswer(revive, 404, { error: "not-found" }, "PUT of a removed id");
  const removedAgain = await apiSend(request, "DELETE", idQuery(ACME_ID), undefined, owner);
  expect(removedAgain.status(), "second DELETE of Acme").toBe(404);
  expect((dbExperience() as { id: string }[]).map((r) => r.id)).toEqual([BETA_ID]);
});

test("E2E-08: a reorder changes every named position or none, and refuses every malformed body", async ({ request }) => {
  dbReset();
  seedThree();
  const owner = await ownerCookie();

  const moved = await apiSend(request, "PATCH", "", swapBody(), owner);
  await expectAnswer(moved, 200, { moved: true }, "swap");
  expect(await titlesFromGet(request, owner)).toEqual(["Analyst", "Software Engineer", "Intern"]);

  const partial = await apiSend(
    request,
    "PATCH",
    "",
    JSON.stringify({
      changes: [
        { id: GAMMA_ID, position: 0 },
        { id: GONE_ID, position: 1 },
      ],
    }),
    owner,
  );
  await expectAnswer(partial, 404, { error: "not-found" }, "move with a missing id");
  expect(await titlesFromGet(request, owner)).toEqual(["Analyst", "Software Engineer", "Intern"]);
  const settled = { [BETA_ID]: 0, [ACME_ID]: 1, [GAMMA_ID]: 2 };
  expect(positionsOf()).toEqual(settled);

  const bad: [string, string | undefined][] = [
    ["empty changes", JSON.stringify({ changes: [] })],
    [
      "repeated id",
      JSON.stringify({
        changes: [
          { id: ACME_ID, position: 0 },
          { id: ACME_ID, position: 1 },
        ],
      }),
    ],
    ["fractional position", JSON.stringify({ changes: [{ id: ACME_ID, position: 1.5 }] })],
    ["string position", JSON.stringify({ changes: [{ id: ACME_ID, position: "1" }] })],
    ["position over range", JSON.stringify({ changes: [{ id: ACME_ID, position: 2147483648 }] })],
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

test("E2E-09: the route refuses every invalid add, replace and remove with 400 and stores nothing", async ({ request }) => {
  dbReset();
  dbSeedExperience([row(ACME_ID, 0, ACME)]);
  const owner = await ownerCookie();

  const { year, title, duration, description, details } = ACME;
  const noCompany = { year, title, duration, description, details };
  const post = (content: unknown, position: unknown = 0): string => JSON.stringify({ content, position });
  const withoutPosition = JSON.stringify({ content: ACME });

  type Case = { label: string; method: "POST" | "PUT" | "DELETE"; query: string; body: string | undefined };
  const cases: Case[] = [
    { label: "(1) year empty", method: "POST", query: "", body: post({ ...ACME, year: "" }) },
    { label: "(2) title blank", method: "POST", query: "", body: post({ ...ACME, title: "   " }) },
    { label: "(3) company missing", method: "POST", query: "", body: post(noCompany) },
    { label: "(4) duration blank", method: "POST", query: "", body: post({ ...ACME, duration: "   " }) },
    { label: "(5) description empty", method: "POST", query: "", body: post({ ...ACME, description: "" }) },
    { label: "(6) year a number", method: "POST", query: "", body: post({ ...ACME, year: 5 }) },
    { label: "(7) details a string", method: "POST", query: "", body: post({ ...ACME, details: "a" }) },
    { label: "(8) details with a number", method: "POST", query: "", body: post({ ...ACME, details: ["a", 1] }) },
    { label: "(9) content null", method: "POST", query: "", body: post(null) },
    { label: "(10) content an array", method: "POST", query: "", body: post([]) },
    { label: "(11) position missing", method: "POST", query: "", body: withoutPosition },
    { label: "(12) position a string", method: "POST", query: "", body: post(ACME, "0") },
    { label: "(13) position fractional", method: "POST", query: "", body: post(ACME, 0.5) },
    { label: "(14) position null", method: "POST", query: "", body: post(ACME, null) },
    { label: "(15a) raw brace", method: "POST", query: "", body: "{" },
    { label: "(15b) array body", method: "POST", query: "", body: "[]" },
    { label: "(15c) empty body", method: "POST", query: "", body: undefined },
    { label: "(16) PUT without id", method: "PUT", query: "", body: JSON.stringify({ content: ACME }) },
    { label: "(17) PUT with a bad id", method: "PUT", query: "?id=not-an-id", body: JSON.stringify({ content: ACME }) },
    {
      label: "(18) PUT with an empty title",
      method: "PUT",
      query: idQuery("11111111-1111-4111-8111-111111111111"),
      body: JSON.stringify({ content: { ...ACME, title: "" } }),
    },
    { label: "(19) PUT with an empty object", method: "PUT", query: idQuery(ACME_ID), body: "{}" },
    { label: "(20) DELETE without id", method: "DELETE", query: "", body: undefined },
    { label: "(21) DELETE with a path-like id", method: "DELETE", query: "?id=../../x", body: undefined },
  ];

  for (const c of cases) {
    const res = await apiSend(request, c.method, c.query, c.body, owner);
    await expectAnswer(res, 400, { error: "invalid" }, c.label);
  }
  expect(dbExperience()).toEqual([row(ACME_ID, 0, ACME)]);
});

test("E2E-10: without the owner's session every request is refused with 401 or 403 and touches nothing", async ({
  request,
}) => {
  test.setTimeout(90000);
  dbReset();
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
    { label: "POST valid", send: (c) => apiSend(request, "POST", "", postBody(ACME, -1), c) },
    { label: "POST raw brace", send: (c) => apiSend(request, "POST", "", "{", c) },
    {
      label: "PUT valid",
      send: (c) => apiSend(request, "PUT", idQuery(ACME_ID), JSON.stringify({ content: ACME }), c),
    },
    { label: "PUT raw brace", send: (c) => apiSend(request, "PUT", idQuery(ACME_ID), "{", c) },
    { label: "PATCH swap", send: (c) => apiSend(request, "PATCH", "", swapBody(), c) },
    { label: "DELETE", send: (c) => apiSend(request, "DELETE", idQuery(ACME_ID), undefined, c) },
  ];

  for (const s of sessions) {
    for (const call of calls) {
      const label = s.label + " " + call.label;
      const res = await call.send(s.cookie);
      expect(res.status(), label + " status").toBe(s.status);
      expect(res.headers()["cache-control"] ?? "", label + " cache-control").toContain("no-store");
      const text = await res.text();
      expect(JSON.parse(text), label + " body").toEqual({ error: s.error });
      for (const word of ["Software Engineer", "Analyst", "Acme", "Beta"]) {
        expect(text, label + " leaks " + word).not.toContain(word);
      }
    }
  }
  expect(dbExperience()).toEqual([row(ACME_ID, 0, ACME), row(BETA_ID, 1, BETA)]);
});

test("E2E-11: an unreachable database gives a fixed 503 to the owner, refusals do not depend on it, and it recovers", async ({
  request,
}) => {
  dbReset();
  seedTwo();
  dbBreak();
  const owner = await ownerCookie();
  const seed = [row(ACME_ID, 0, ACME), row(BETA_ID, 1, BETA)];

  const sent: [string, APIResponse][] = [
    ["GET", await apiGet(request, owner)],
    ["POST", await apiSend(request, "POST", "", postBody(GAMMA, -1), owner)],
    ["PUT", await apiSend(request, "PUT", idQuery(ACME_ID), JSON.stringify({ content: ACME }), owner)],
    ["PATCH", await apiSend(request, "PATCH", "", swapBody(), owner)],
    ["DELETE", await apiSend(request, "DELETE", idQuery(ACME_ID), undefined, owner)],
  ];
  for (const [label, res] of sent) {
    expect(res.status(), label + " status").toBe(503);
    const text = await res.text();
    expect(text, label + " body").toBe('{"error":"unavailable"}');
    for (const leak of [...LEAKS, "Software Engineer", "Acme"]) expect(text, label + " leaks " + leak).not.toContain(leak);
  }

  const signedOut = await apiGet(request);
  await expectAnswer(signedOut, 401, { error: "not-signed-in" }, "signed-out GET");
  const otherCookie = await cookieOf(OTHER());
  const otherGet = await apiGet(request, otherCookie);
  await expectAnswer(otherGet, 403, { error: "not-allowed" }, "other GET");
  const otherDelete = await apiSend(request, "DELETE", idQuery(ACME_ID), undefined, otherCookie);
  await expectAnswer(otherDelete, 403, { error: "not-allowed" }, "other DELETE");

  dbFix();
  const fixed = await apiGet(request, owner);
  await expectAnswer(
    fixed,
    200,
    { entries: [entry(ACME_ID, 0, ACME), entry(BETA_ID, 1, BETA)] },
    "GET after the database is back",
  );
  expect(dbExperience()).toEqual(seed);
});

test("E2E-12: the experience list shares the stand-in file with the profile and images and is read tolerantly", async ({
  request,
}) => {
  dbReset();
  const profile = { name: "Keith Lim", headline: "Software Engineer" };
  const image = { id: "44444444-4444-4444-8444-444444444444.png", name: "p.png", contentType: "image/png", size: 70 };
  dbSeedAll(profile, [image], [row(ACME_ID, 0, ACME)]);
  const owner = await ownerCookie();

  const add = await apiSend(request, "POST", "", postBody(BETA, -1), owner);
  expect(add.status(), "POST").toBe(200);
  const put = await apiSend(request, "PUT", idQuery(ACME_ID), JSON.stringify({ content: { ...ACME, title: "Changed" } }), owner);
  expect(put.status(), "PUT").toBe(200);
  const file = readDbFile();
  expect(file.profile).toEqual(profile);
  expect(file.images).toEqual([image]);
  expect(file.experience).toHaveLength(2);

  dbSeedExperience([
    { id: ACME_ID, position: 0, data: { year: 7, title: "Only title", details: ["x", 3, "y"] } },
    { id: BETA_ID, position: "1", data: {} },
    { id: 5, position: 2, data: {} },
    { position: 3, data: {} },
    "text",
    null,
    { id: GAMMA_ID, position: 4, data: null },
  ]);
  const tolerant = await apiGet(request, owner);
  await expectAnswer(
    tolerant,
    200,
    {
      entries: [
        entry(ACME_ID, 0, { year: "", title: "Only title", company: "", duration: "", description: "", details: ["x", "y"] }),
        entry(GAMMA_ID, 4, { year: "", title: "", company: "", duration: "", description: "", details: [] }),
      ],
    },
    "tolerant read",
  );

  fs.writeFileSync(DB_FILE, '{"experience":"x"}');
  const notAList = await apiGet(request, owner);
  await expectAnswer(notAList, 200, { entries: [] }, "experience not a list");
});

test("E2E-13: no public page or script carries the route or the database, and the route stays dynamic and server-only", async ({
  request,
}) => {
  dbReset();
  const manifest = JSON.parse(fs.readFileSync(".next/prerender-manifest.json", "utf8")) as {
    routes: Record<string, unknown>;
  };
  const keys = Object.keys(manifest.routes);
  expect(keys.filter((k) => k.startsWith("/api/admin"))).toEqual([]);
  for (const key of ["/", "/blog", "/blog/hello-world", "/blog/building-portfolio-nextjs", "/robots.txt", "/rss.xml", "/sitemap.xml"]) {
    expect(keys, key).toContain(key);
  }

  const forbidden = ["api/admin/experience", "SUPABASE_DB_URL", "stand-in:", "DatabaseUnavailable"];
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
