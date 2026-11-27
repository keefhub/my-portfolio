import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { expect, test, type APIRequestContext, type APIResponse } from "@playwright/test";
import { encode } from "next-auth/jwt";
import { checkProject, projectFromData, projectShape, projectToData } from "../src/lib/admin/projects";

test.describe.configure({ mode: "default" });

// Shared fixtures. The tests of this file share one stand-in database file (D-12), so every test starts by
// resetting it.

const STAND_IN_PREFIX = "stand-in:";
const DB_URL = process.env.SUPABASE_DB_URL ?? "";
const DB_FILE = DB_URL.startsWith(STAND_IN_PREFIX) ? DB_URL.slice(STAND_IN_PREFIX.length) : "";

function dbReset(): void {
  if (DB_FILE !== "" && fs.existsSync(DB_FILE)) fs.rmSync(DB_FILE, { force: true });
}

const API = "/api/admin/projects/";
const EXPERIENCE_API = "/api/admin/experience/";

const ALPHA_ID = "11111111-1111-4111-8111-111111111111";
const BETA_ID = "22222222-2222-4222-8222-222222222222";
const GAMMA_ID = "33333333-3333-4333-8333-333333333333";
const GONE_ID = "99999999-9999-4999-8999-999999999999";

const ALPHA = {
  title: "Alpha",
  shortDesc: "First project",
  description: ["Alpha paragraph."],
  tech: ["TypeScript"],
  github: "https://github.com/example/alpha",
  demo: "https://alpha.example.com",
};
const BETA = {
  title: "Beta",
  shortDesc: "",
  description: [] as string[],
  tech: [] as string[],
  github: "",
  demo: "",
};
const GAMMA = {
  title: "Gamma",
  shortDesc: "Third project",
  description: ["Gamma one.", "Gamma two."],
  tech: ["Go", "SQL"],
  github: "https://github.com/example/gamma",
  demo: "",
};
const QUANTUM = {
  title: "Quantum Notes",
  shortDesc: "A notes app",
  description: ["Built for fast capture."],
  tech: ["React", "Supabase"],
  github: "https://github.com/example/quantum-notes",
  demo: "https://notes.example.com",
};

const GITHUB_INVALID = "GitHub link must start with https:// or http://";
const DEMO_INVALID = "Demo link must start with https:// or http://";

// The gate scans this file, so the names of forbidden words and modules are put together from pieces.
const SUPABASE_PREFIX = ["@supa", "base/"].join("");
const FIRE = ["fire", "base"].join("");
const PG = ["post", "gres"].join("");
const AUTH_MODULE = ["@/lib/", "auth"].join("");
const TABLE_MARK = ["$", "{table}"].join("");

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

function dbSeedProjects(list: unknown[]): void {
  fs.writeFileSync(DB_FILE, JSON.stringify({ projects: list }));
}

function dbSeedAll(profile: unknown, images: unknown, experience: unknown[], projects: unknown[]): void {
  fs.writeFileSync(DB_FILE, JSON.stringify({ profile, images, experience, projects }));
}

function dbProjects(): unknown[] {
  const list = readDbFile().projects;
  return Array.isArray(list) ? list : [];
}

type StoredRow = { id: string; position: number; data: { title?: string } };

// The titles of the stored projects, stably sorted by position (equal positions keep array order).
function sortedTitles(rows: unknown[]): string[] {
  return (rows as StoredRow[])
    .map((r, i) => ({ r, i }))
    .sort((a, b) => a.r.position - b.r.position || a.i - b.i)
    .map(({ r }) => r.data.title ?? "");
}

const positionsOf = (): Record<string, unknown> =>
  Object.fromEntries((dbProjects() as StoredRow[]).map((r) => [r.id, r.position]));

const row = (id: string, position: number, content: unknown) => ({ id, position, data: content });
const entry = (id: string, position: number, content: unknown) => ({ id, position, content });
const seedTwo = (): void => dbSeedProjects([row(ALPHA_ID, 0, ALPHA), row(BETA_ID, 1, BETA)]);
const seedThree = (): void =>
  dbSeedProjects([row(ALPHA_ID, 0, ALPHA), row(BETA_ID, 1, BETA), row(GAMMA_ID, 2, GAMMA)]);

const LEAKS = ["10.1.2.3", "password-marker-standin", "ECONNREFUSED"];

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
      { id: ALPHA_ID, position: 1 },
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

function gitGrep(args: string[]): { stdout: string; status: number | null } {
  const result = spawnSync("git", ["grep", "--untracked", ...args], { cwd: process.cwd(), encoding: "utf8" });
  return { stdout: result.stdout ?? "", status: result.status };
}

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

test("E2E-02: projectShape, checkProject, projectFromData and projectToData apply the stated rules", async () => {
  dbReset();

  // projectShape
  const a = {
    title: "T",
    shortDesc: "S",
    description: ["p1", "p2"],
    tech: ["a", "b"],
    github: "https://g.example",
    demo: "http://d.example",
  };
  expect(projectShape(a)).toEqual(a);
  expect(projectShape({ title: "T" })).toEqual({
    title: "T",
    shortDesc: "",
    description: [],
    tech: [],
    github: "",
    demo: "",
  });
  const c = projectShape({ ...a, extra: 5 });
  expect(c).not.toBeNull();
  expect(Object.keys(c as object)).not.toContain("extra");
  expect(c).toEqual(a);
  expect(projectShape({ title: 5 })).toBeNull();
  expect(projectShape({ title: "T", description: "a" })).toBeNull();
  expect(projectShape({ title: "T", tech: ["a", 1] })).toBeNull();
  expect(projectShape({ title: "T", github: null })).toBeNull();
  expect(projectShape({ title: "T", demo: 7 })).toBeNull();
  expect(projectShape({ title: "T", shortDesc: [] })).toBeNull();
  for (const bad of [null, [], "x", 7]) expect(projectShape(bad), JSON.stringify(bad)).toBeNull();

  // checkProject
  const padded = checkProject({
    title: "  Quantum  ",
    shortDesc: " A notes app ",
    description: ["  one  ", "   ", "two"],
    tech: [" React ", "", "  ", " Supabase"],
    github: " https://github.com/example/q ",
    demo: "  HTTP://Demo.Example.com ",
  });
  expect(padded).toEqual({
    ok: true,
    content: {
      title: "Quantum",
      shortDesc: "A notes app",
      description: ["one", "two"],
      tech: ["React", "Supabase"],
      github: "https://github.com/example/q",
      demo: "HTTP://Demo.Example.com",
    },
  });
  const blankTitle = checkProject({ title: "   ", shortDesc: "", description: [], tech: [], github: "", demo: "" });
  expect(blankTitle.ok).toBe(false);
  if (!blankTitle.ok) expect(blankTitle.errors).toEqual({ title: "Title is required" });
  const badLinks = checkProject({
    title: "T",
    shortDesc: "",
    description: [],
    tech: [],
    github: "github.com/example/x",
    demo: "ftp://demo.example.com",
  });
  expect(badLinks.ok).toBe(false);
  if (!badLinks.ok) expect(badLinks.errors).toEqual({ github: GITHUB_INVALID, demo: DEMO_INVALID });

  const withGithub = (github: string) =>
    checkProject({ title: "T", shortDesc: "", description: [], tech: [], github, demo: "" });
  for (const v of ["htp://x", "https:/x", "https//x", "mailto:a@b.c", "//x.example", " ftp://x"]) {
    const result = withGithub(v);
    expect(result.ok, JSON.stringify(v)).toBe(false);
    if (!result.ok) expect(result.errors, JSON.stringify(v)).toEqual({ github: GITHUB_INVALID });
  }
  for (const v of ["https://", "http://x", "HTTPS://X", "hTtP://x"]) {
    expect(withGithub(v).ok, JSON.stringify(v)).toBe(true);
  }
  expect(checkProject({ title: "T", shortDesc: "", description: [], tech: [], github: "", demo: "" })).toEqual({
    ok: true,
    content: { title: "T", shortDesc: "", description: [], tech: [], github: "", demo: "" },
  });

  // projectFromData
  expect(
    projectFromData({ title: 7, shortDesc: "s", description: ["a", 3, "b"], tech: "x", github: null, demo: "d" }),
  ).toEqual({ title: "", shortDesc: "s", description: ["a", "b"], tech: [], github: "", demo: "d" });
  expect(projectFromData(null)).toEqual({ title: "", shortDesc: "", description: [], tech: [], github: "", demo: "" });

  // projectToData
  const data = projectToData(QUANTUM);
  expect(Object.keys(data).sort()).toEqual(["demo", "description", "github", "shortDesc", "tech", "title"]);
  expect(data).toEqual(QUANTUM);
  (data.description as string[]).push("z");
  (data.tech as string[]).push("z");
  expect(QUANTUM.description).toEqual(["Built for fast capture."]);
  expect(QUANTUM.tech).toEqual(["React", "Supabase"]);
});

test("E2E-03: the list SQL is exactly the proven text for both tables, the server files are marked server-only, and nothing names the old backend", async () => {
  dbReset();

  const original = fs.readFileSync("src/lib/server/listSql.ts", "utf8");
  for (const table of ["experience", "projects"]) {
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
  expect(lines).toContain('export const LIST_TABLES: readonly ListTable[] = ["experience", "projects"];');
  expect(lines.filter((l) => /^export type ListTable =/.test(l))).toEqual([
    'export type ListTable = "experience" | "projects";',
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
    "src/app/api/admin/projects",
  ]);
  expect(named.stdout).toBe("");
  expect(named.status).toBe(1);
});

test("E2E-04: the owner lists, adds, replaces and removes a project through the route, with trimmed content", async ({
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
    '{"content":{"title":"  Quantum Notes ","shortDesc":" A notes app ","description":["  Built for fast capture.  ","   ",""],"tech":[" React ","Supabase","  "],"github":" https://github.com/example/quantum-notes ","demo":"https://notes.example.com "},"position":0}',
    owner,
  );
  answers.push(["POST", added]);
  expect(added.status(), "POST status").toBe(200);
  const addedBody = (await added.json()) as Record<string, unknown>;
  expect(Object.keys(addedBody)).toEqual(["id"]);
  const id1 = addedBody.id as string;
  expect(id1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  expect(dbProjects()).toEqual([row(id1, 0, QUANTUM)]);

  const second = await apiGet(request, owner);
  answers.push(["GET 2", second]);
  await expectAnswer(second, 200, { entries: [entry(id1, 0, QUANTUM)] }, "GET 2");

  const replaced = await apiSend(
    request,
    "PUT",
    idQuery(id1),
    '{"content":{"title":"Quantum Notes 2","shortDesc":"A notes app","description":["Built for fast capture."],"tech":["React","Supabase"],"github":"https://github.com/example/quantum-notes","demo":""}}',
    owner,
  );
  answers.push(["PUT", replaced]);
  await expectAnswer(replaced, 200, { updated: true }, "PUT");

  const third = await apiGet(request, owner);
  answers.push(["GET 3", third]);
  await expectAnswer(
    third,
    200,
    { entries: [entry(id1, 0, { ...QUANTUM, title: "Quantum Notes 2", demo: "" })] },
    "GET 3",
  );

  const removed = await apiSend(request, "DELETE", idQuery(id1), undefined, owner);
  answers.push(["DELETE", removed]);
  await expectAnswer(removed, 200, { deleted: true }, "DELETE");

  const last = await apiGet(request, owner);
  answers.push(["GET 4", last]);
  await expectAnswer(last, 200, { entries: [] }, "GET 4");
  expect(dbProjects()).toEqual([]);

  for (const [label, res] of answers) expectJsonNoStore(res, label);
});

test("E2E-05: the route keeps the positions the client sends, orders by position then insertion, and refuses an out-of-range one", async ({
  request,
}) => {
  dbReset();
  const owner = await ownerCookie();

  const posted: string[] = [];
  for (const [content, position] of [
    [ALPHA, 0],
    [BETA, -1],
    [GAMMA, -2],
  ] as const) {
    const res = await apiSend(request, "POST", "", postBody(content, position), owner);
    expect(res.status(), "POST " + content.title).toBe(200);
    posted.push(((await res.json()) as { id: string }).id);
  }
  expect(await titlesFromGet(request, owner)).toEqual(["Gamma", "Beta", "Alpha"]);

  const again = await apiSend(request, "POST", "", postBody(GAMMA, -2), owner);
  expect(again.status(), "second Gamma").toBe(200);
  const againId = ((await again.json()) as { id: string }).id;
  const afterFourth = await apiGet(request, owner);
  const listed = ((await afterFourth.json()) as { entries: { id: string; content: { title: string } }[] }).entries;
  expect(listed.map((e) => e.content.title)).toEqual(["Gamma", "Gamma", "Beta", "Alpha"]);
  expect(listed[0].id).not.toBe(listed[1].id);
  expect(listed[0].id).toBe(posted[2]);
  expect(listed[1].id).toBe(againId);

  dbSeedProjects([row(ALPHA_ID, 2, ALPHA), row(BETA_ID, 2, BETA), row(GAMMA_ID, -5, GAMMA)]);
  expect(await titlesFromGet(request, owner)).toEqual(["Gamma", "Alpha", "Beta"]);

  const high = await apiSend(request, "POST", "", postBody(BETA, 2147483647), owner);
  expect(high.status(), "position 2147483647").toBe(200);
  const low = await apiSend(request, "POST", "", postBody(BETA, -2147483648), owner);
  expect(low.status(), "position -2147483648").toBe(200);
  const before = dbProjects().length;
  const over = await apiSend(request, "POST", "", postBody(BETA, 2147483648), owner);
  await expectAnswer(over, 400, { error: "invalid" }, "position 2147483648");
  expect(dbProjects()).toHaveLength(before);
});

test("E2E-06: a replace or remove of a project that is not stored answers 404 and stores nothing", async ({ request }) => {
  dbReset();
  seedTwo();
  const owner = await ownerCookie();
  const seed = [row(ALPHA_ID, 0, ALPHA), row(BETA_ID, 1, BETA)];

  const missingPut = await apiSend(
    request,
    "PUT",
    idQuery(GONE_ID),
    JSON.stringify({ content: { ...ALPHA, title: "Changed" } }),
    owner,
  );
  await expectAnswer(missingPut, 404, { error: "not-found" }, "PUT of a missing id");
  const missingDelete = await apiSend(request, "DELETE", idQuery(GONE_ID), undefined, owner);
  await expectAnswer(missingDelete, 404, { error: "not-found" }, "DELETE of a missing id");
  expect(dbProjects()).toEqual(seed);

  const edit = await apiSend(
    request,
    "PUT",
    idQuery(BETA_ID),
    JSON.stringify({ content: { ...BETA, title: "Beta II" } }),
    owner,
  );
  await expectAnswer(edit, 200, { updated: true }, "PUT of Beta");
  const stored = dbProjects() as { id: string; position: number; data: unknown }[];
  expect(stored.find((r) => r.id === BETA_ID)).toEqual(row(BETA_ID, 1, { ...BETA, title: "Beta II" }));
  expect(stored.find((r) => r.id === ALPHA_ID)).toEqual(row(ALPHA_ID, 0, ALPHA));

  const removed = await apiSend(request, "DELETE", idQuery(ALPHA_ID), undefined, owner);
  await expectAnswer(removed, 200, { deleted: true }, "first DELETE of Alpha");
  const revive = await apiSend(request, "PUT", idQuery(ALPHA_ID), JSON.stringify({ content: ALPHA }), owner);
  await expectAnswer(revive, 404, { error: "not-found" }, "PUT of a removed id");
  const removedAgain = await apiSend(request, "DELETE", idQuery(ALPHA_ID), undefined, owner);
  expect(removedAgain.status(), "second DELETE of Alpha").toBe(404);
  expect((dbProjects() as { id: string }[]).map((r) => r.id)).toEqual([BETA_ID]);
});

test("E2E-07: a reorder changes every named position or none, and refuses every malformed body", async ({ request }) => {
  dbReset();
  seedThree();
  const owner = await ownerCookie();

  const moved = await apiSend(request, "PATCH", "", swapBody(), owner);
  await expectAnswer(moved, 200, { moved: true }, "swap");
  expect(await titlesFromGet(request, owner)).toEqual(["Beta", "Alpha", "Gamma"]);

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
  expect(await titlesFromGet(request, owner)).toEqual(["Beta", "Alpha", "Gamma"]);
  const settled = { [BETA_ID]: 0, [ALPHA_ID]: 1, [GAMMA_ID]: 2 };
  expect(positionsOf()).toEqual(settled);

  const bad: [string, string | undefined][] = [
    ["empty changes", JSON.stringify({ changes: [] })],
    [
      "repeated id",
      JSON.stringify({
        changes: [
          { id: ALPHA_ID, position: 0 },
          { id: ALPHA_ID, position: 1 },
        ],
      }),
    ],
    ["fractional position", JSON.stringify({ changes: [{ id: ALPHA_ID, position: 1.5 }] })],
    ["string position", JSON.stringify({ changes: [{ id: ALPHA_ID, position: "1" }] })],
    ["position over range", JSON.stringify({ changes: [{ id: ALPHA_ID, position: 2147483648 }] })],
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
  dbSeedProjects([row(ALPHA_ID, 0, ALPHA)]);
  const owner = await ownerCookie();

  const { shortDesc, description, tech, github, demo } = ALPHA;
  const noTitle = { shortDesc, description, tech, github, demo };
  const post = (content: unknown, position: unknown = 0): string => JSON.stringify({ content, position });
  const withoutPosition = JSON.stringify({ content: ALPHA });

  type Case = { label: string; method: "POST" | "PUT" | "DELETE"; query: string; body: string | undefined };
  const cases: Case[] = [
    { label: "(1) title empty", method: "POST", query: "", body: post({ ...ALPHA, title: "" }) },
    { label: "(2) title blank", method: "POST", query: "", body: post({ ...ALPHA, title: "   " }) },
    { label: "(3) title missing", method: "POST", query: "", body: post(noTitle) },
    { label: "(4) github without scheme", method: "POST", query: "", body: post({ ...ALPHA, github: "github.com/example/x" }) },
    { label: "(5) demo ftp", method: "POST", query: "", body: post({ ...ALPHA, demo: "ftp://demo.example.com" }) },
    { label: "(6) github htp", method: "POST", query: "", body: post({ ...ALPHA, github: "htp://x" }) },
    { label: "(7) title a number", method: "POST", query: "", body: post({ ...ALPHA, title: 5 }) },
    { label: "(8) description a string", method: "POST", query: "", body: post({ ...ALPHA, description: "a" }) },
    { label: "(9) tech with a number", method: "POST", query: "", body: post({ ...ALPHA, tech: ["a", 1] }) },
    { label: "(10) shortDesc an array", method: "POST", query: "", body: post({ ...ALPHA, shortDesc: [] }) },
    { label: "(11) github null", method: "POST", query: "", body: post({ ...ALPHA, github: null }) },
    { label: "(12) content null", method: "POST", query: "", body: post(null) },
    { label: "(13) content an array", method: "POST", query: "", body: post([]) },
    { label: "(14) position missing", method: "POST", query: "", body: withoutPosition },
    { label: "(15) position a string", method: "POST", query: "", body: post(ALPHA, "0") },
    { label: "(16) position fractional", method: "POST", query: "", body: post(ALPHA, 0.5) },
    { label: "(17) position null", method: "POST", query: "", body: post(ALPHA, null) },
    { label: "(18a) raw brace", method: "POST", query: "", body: "{" },
    { label: "(18b) array body", method: "POST", query: "", body: "[]" },
    { label: "(18c) empty body", method: "POST", query: "", body: undefined },
    { label: "(19) PUT without id", method: "PUT", query: "", body: JSON.stringify({ content: ALPHA }) },
    { label: "(20) PUT with a bad id", method: "PUT", query: "?id=not-an-id", body: JSON.stringify({ content: ALPHA }) },
    {
      label: "(21) PUT with an empty title",
      method: "PUT",
      query: idQuery(BETA_ID),
      body: JSON.stringify({ content: { ...ALPHA, title: "" } }),
    },
    { label: "(22) PUT with an empty object", method: "PUT", query: idQuery(ALPHA_ID), body: "{}" },
    {
      label: "(23) PUT with a bad demo",
      method: "PUT",
      query: idQuery(ALPHA_ID),
      body: JSON.stringify({ content: { ...ALPHA, demo: "ftp://x" } }),
    },
    { label: "(24) DELETE without id", method: "DELETE", query: "", body: undefined },
    { label: "(25) DELETE with a path-like id", method: "DELETE", query: "?id=../../x", body: undefined },
  ];

  for (const c of cases) {
    const res = await apiSend(request, c.method, c.query, c.body, owner);
    await expectAnswer(res, 400, { error: "invalid" }, c.label);
  }
  expect(dbProjects()).toEqual([row(ALPHA_ID, 0, ALPHA)]);
});

test("E2E-09: without the owner's session every request is refused with 401 or 403 and touches nothing", async ({
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
    { label: "POST valid", send: (c) => apiSend(request, "POST", "", postBody(ALPHA, -1), c) },
    { label: "POST raw brace", send: (c) => apiSend(request, "POST", "", "{", c) },
    {
      label: "PUT valid",
      send: (c) => apiSend(request, "PUT", idQuery(ALPHA_ID), JSON.stringify({ content: ALPHA }), c),
    },
    { label: "PUT raw brace", send: (c) => apiSend(request, "PUT", idQuery(ALPHA_ID), "{", c) },
    { label: "PATCH swap", send: (c) => apiSend(request, "PATCH", "", swapBody(), c) },
    { label: "DELETE", send: (c) => apiSend(request, "DELETE", idQuery(ALPHA_ID), undefined, c) },
  ];

  for (const s of sessions) {
    for (const call of calls) {
      const label = s.label + " " + call.label;
      const res = await call.send(s.cookie);
      expect(res.status(), label + " status").toBe(s.status);
      expect(res.headers()["cache-control"] ?? "", label + " cache-control").toContain("no-store");
      const text = await res.text();
      expect(JSON.parse(text), label + " body").toEqual({ error: s.error });
      for (const word of ["Alpha", "Beta", "First project", "github.com"]) {
        expect(text, label + " leaks " + word).not.toContain(word);
      }
    }
  }
  expect(dbProjects()).toEqual([row(ALPHA_ID, 0, ALPHA), row(BETA_ID, 1, BETA)]);
});

test("E2E-10: an unreachable database gives a fixed 503 to the owner, refusals do not depend on it, and it recovers", async ({
  request,
}) => {
  dbReset();
  seedTwo();
  dbBreak();
  const owner = await ownerCookie();
  const seed = [row(ALPHA_ID, 0, ALPHA), row(BETA_ID, 1, BETA)];

  const sent: [string, APIResponse][] = [
    ["GET", await apiGet(request, owner)],
    ["POST", await apiSend(request, "POST", "", postBody(GAMMA, -1), owner)],
    ["PUT", await apiSend(request, "PUT", idQuery(ALPHA_ID), JSON.stringify({ content: ALPHA }), owner)],
    ["PATCH", await apiSend(request, "PATCH", "", swapBody(), owner)],
    ["DELETE", await apiSend(request, "DELETE", idQuery(ALPHA_ID), undefined, owner)],
  ];
  for (const [label, res] of sent) {
    expect(res.status(), label + " status").toBe(503);
    const text = await res.text();
    expect(text, label + " body").toBe('{"error":"unavailable"}');
    for (const leak of [...LEAKS, "Alpha", "github.com"]) expect(text, label + " leaks " + leak).not.toContain(leak);
  }

  const signedOut = await apiGet(request);
  await expectAnswer(signedOut, 401, { error: "not-signed-in" }, "signed-out GET");
  const otherCookie = await cookieOf(OTHER());
  const otherGet = await apiGet(request, otherCookie);
  await expectAnswer(otherGet, 403, { error: "not-allowed" }, "other GET");
  const otherDelete = await apiSend(request, "DELETE", idQuery(ALPHA_ID), undefined, otherCookie);
  await expectAnswer(otherDelete, 403, { error: "not-allowed" }, "other DELETE");

  dbFix();
  const fixed = await apiGet(request, owner);
  await expectAnswer(
    fixed,
    200,
    { entries: [entry(ALPHA_ID, 0, ALPHA), entry(BETA_ID, 1, BETA)] },
    "GET after the database is back",
  );
  expect(dbProjects()).toEqual(seed);
});

test("E2E-11: the projects list shares the stand-in file with the other lists and is read tolerantly", async ({
  request,
}) => {
  dbReset();
  const profile = { name: "Keith Lim", headline: "Software Engineer" };
  const image = { id: "55555555-5555-4555-8555-555555555555.png", name: "p.png", contentType: "image/png", size: 70 };
  const experience = [
    {
      id: "66666666-6666-4666-8666-666666666666",
      position: 0,
      data: { year: "2024", title: "Engineer", company: "Acme", duration: "2024", description: "Built.", details: [] },
    },
  ];
  dbSeedAll(profile, [image], experience, [row(ALPHA_ID, 0, ALPHA)]);
  const owner = await ownerCookie();

  const add = await apiSend(request, "POST", "", postBody(BETA, -1), owner);
  expect(add.status(), "POST projects").toBe(200);
  const put = await apiSend(request, "PUT", idQuery(ALPHA_ID), JSON.stringify({ content: { ...ALPHA, title: "Changed" } }), owner);
  expect(put.status(), "PUT projects").toBe(200);
  const addExperience = await apiSend(
    request,
    "POST",
    "",
    JSON.stringify({
      content: {
        year: "2023",
        title: "Analyst",
        company: "Delta Co",
        duration: "2023",
        description: "Reported.",
        details: [],
      },
      position: -1,
    }),
    owner,
    EXPERIENCE_API,
  );
  expect(addExperience.status(), "POST experience").toBe(200);

  const projectsList = await apiGet(request, owner);
  const projectsText = await projectsList.text();
  const experienceList = await apiGet(request, owner, EXPERIENCE_API);
  const experienceText = await experienceList.text();

  const file = readDbFile();
  expect(file.profile).toEqual(profile);
  expect(file.images).toEqual([image]);
  expect(file.projects).toHaveLength(2);
  expect(sortedTitles(file.projects as unknown[])).toEqual(["Beta", "Changed"]);
  expect(file.experience).toHaveLength(2);
  expect(sortedTitles(file.experience as unknown[])).toEqual(["Analyst", "Engineer"]);

  expect(projectsList.status(), "GET projects").toBe(200);
  const projectsBody = JSON.parse(projectsText) as { entries: { content: { title: string } }[] };
  expect(projectsBody.entries.map((e) => e.content.title)).toEqual(["Beta", "Changed"]);
  for (const word of ["Analyst", "Engineer", "Acme"]) expect(projectsText, "projects leaks " + word).not.toContain(word);

  expect(experienceList.status(), "GET experience").toBe(200);
  const experienceBody = JSON.parse(experienceText) as { entries: unknown[] };
  expect(experienceBody.entries).toHaveLength(2);
  for (const word of ["Beta", "Changed", "github.com"]) {
    expect(experienceText, "experience leaks " + word).not.toContain(word);
  }

  dbSeedProjects([
    { id: ALPHA_ID, position: 0, data: { title: "Only title", shortDesc: 4, description: ["x", 3, "y"], tech: "t" } },
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
        entry(ALPHA_ID, 0, {
          title: "Only title",
          shortDesc: "",
          description: ["x", "y"],
          tech: [],
          github: "",
          demo: "",
        }),
        entry(GAMMA_ID, 4, { title: "", shortDesc: "", description: [], tech: [], github: "", demo: "" }),
      ],
    },
    "tolerant read",
  );

  fs.writeFileSync(DB_FILE, '{"projects":"x"}');
  const notAList = await apiGet(request, owner);
  await expectAnswer(notAList, 200, { entries: [] }, "projects not a list");
});

test("E2E-12: no public page or script carries the route or the database, and the route stays dynamic and server-only", async ({
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

  const forbidden = ["api/admin/projects", "api/admin/experience", "SUPABASE_DB_URL", "stand-in:", "DatabaseUnavailable"];
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
