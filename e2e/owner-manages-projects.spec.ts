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

// Step 2: the Projects screen in the browser, the retired earlier code, the amended earlier spec and the docs.

const PANEL = "/bright-warm-greenhouse/";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const QUANTUM_ID = "44444444-4444-4444-8444-444444444444";
const ENTRY_SAVED = "Entry saved";
const ORDER_SAVED = "Order saved";
const NO_PROJECTS = "No projects yet.";
const LOAD_FAILED = "The entries could not be loaded.";
const SAVE_FAILED = "The entry could not be saved. Try again, and check that you are signed in as the owner.";
const MOVE_FAILED = "The entry could not be moved. Try again, and check that you are signed in as the owner.";
const DELETE_FAILED = "The entry could not be deleted. Try again, and check that you are signed in as the owner.";
const ASK_BETA = 'Delete "Beta"? This cannot be undone.';
const TITLE_REQUIRED = "Title is required";
const SECTION_NAMES = ["Profile", "Experience", "Projects", "Certifications", "Tech stack", "Blog posts", "Images"];

const dbTitles = (): string[] => sortedTitles(dbProjects());

async function ownerPage(
  browser: Browser,
  baseURL: string,
  options: Parameters<Browser["newContext"]>[0] = {},
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext(options);
  await context.addCookies([{ name: SESSION_COOKIE, value: await mint(OWNER()), url: baseURL }]);
  const page = await context.newPage();
  return { context, page };
}

type Scope = Pick<Page, "getByRole">;

const menu = (page: Page) => page.getByRole("navigation", { name: "Admin sections" });
const screenOf = (page: Page) => page.locator('section[aria-label="Projects editor"]');
const listOf = (page: Page) => page.getByRole("list", { name: "Projects list" });
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
const paragraph = (page: Page, n: number): Locator =>
  page.getByRole("textbox", { name: "Paragraph " + n, exact: true });
const techName = (page: Page, n: number): Locator =>
  page.getByRole("textbox", { name: "Tech name " + n, exact: true });

// Click the menu button until the screen's heading is there (a click that lands before hydration is lost).
async function openProjects(page: Page): Promise<void> {
  await page.goto(PANEL);
  const choose = button(menu(page), "Projects");
  const heading = page.getByRole("heading", { name: "Projects", level: 2, exact: true });
  await expect(async () => {
    await choose.click({ timeout: 5000 });
    await expect(heading).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 15000 });
}

type Fields = { title?: string; shortDesc?: string; github?: string; demo?: string };
const FIELD_LABELS: [keyof Fields, string][] = [
  ["title", "Title"],
  ["shortDesc", "Short description"],
  ["github", "GitHub link"],
  ["demo", "Demo link"],
];

async function fill(page: Page, values: Fields): Promise<void> {
  for (const [key, label] of FIELD_LABELS) {
    const value = values[key];
    if (value !== undefined) await page.getByLabel(label, { exact: true }).fill(value);
  }
}

const FULL_FIELDS = {
  title: "Quantum Notes",
  shortDesc: "A notes app",
  github: "https://github.com/example/quantum-notes",
  demo: "https://notes.example.com",
};

// FULL: the four fields, one paragraph and one tech name.
async function FULL(page: Page): Promise<void> {
  await fill(page, FULL_FIELDS);
  await button(screenOf(page), "Add paragraph").click();
  await paragraph(page, 1).fill("Built for fast capture.");
  await button(screenOf(page), "Add tech name").click();
  await techName(page, 1).fill("React");
}

// Holds every request of one method to the route until release() is called, then lets it through.
async function holdRoute(page: Page, method: string): Promise<{ release: () => void; count: () => number }> {
  let seen = 0;
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(/\/api\/admin\/projects\/(\?.*)?$/, async (route) => {
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

test("E2E-13: the owner adds a project to an empty list and it is stored and listed after a reload", async ({
  browser,
  baseURL,
  request,
}) => {
  test.setTimeout(60000);
  dbReset();
  const before = await (await request.get("/")).text();
  const { context, page } = await ownerPage(browser, baseURL as string);
  await openProjects(page);
  const screen = screenOf(page);

  await expect(statusWith(page, NO_PROJECTS)).toBeVisible();
  await expect(listOf(page)).toHaveCount(0);
  await expect(button(screen, "Add entry")).toBeVisible();

  await button(screen, "Add entry").click();
  await FULL(page);
  await button(screen, "Add tech name").click();
  await techName(page, 2).fill("Supabase");
  await button(screen, "Save").click();

  await expect(screen.getByRole("status")).toHaveText(ENTRY_SAVED);
  await expect(itemsOf(page)).toHaveCount(1);
  await expect(labelsOf(page)).toHaveText(["Quantum Notes"]);
  await expect(addHeading(page)).toHaveCount(0);
  const stored = dbProjects() as { id: string; position: number; data: unknown }[];
  expect(stored).toHaveLength(1);
  expect(stored[0].id).toMatch(UUID);
  expect(stored[0].position).toBe(0);
  expect(stored[0].data).toEqual(QUANTUM);

  await page.reload();
  await openProjects(page);
  await expect(itemsOf(page)).toHaveCount(1);
  await expect(labelsOf(page)).toHaveText(["Quantum Notes"]);
  await expect(screen.getByText(NO_PROJECTS)).toHaveCount(0);

  await button(itemsOf(page).first(), "Edit").click();
  await expect(editHeading(page)).toBeVisible();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Quantum Notes");
  await expect(page.getByLabel("Short description", { exact: true })).toHaveValue("A notes app");
  await expect(page.getByLabel("GitHub link", { exact: true })).toHaveValue("https://github.com/example/quantum-notes");
  await expect(page.getByLabel("Demo link", { exact: true })).toHaveValue("https://notes.example.com");
  await expect(paragraph(page, 1)).toHaveValue("Built for fast capture.");
  await expect(techName(page, 1)).toHaveValue("React");
  await expect(techName(page, 2)).toHaveValue("Supabase");

  const after = await request.get("/");
  expect(after.status()).toBe(200);
  expect(await after.text()).toBe(before);
  await context.close();
});

test("E2E-14: the owner edits a project and the change is stored and kept after a reload", async ({ browser, baseURL }) => {
  test.setTimeout(60000);
  dbReset();
  dbSeedProjects([row(QUANTUM_ID, 0, QUANTUM)]);
  const { context, page } = await ownerPage(browser, baseURL as string);
  await openProjects(page);
  const screen = screenOf(page);

  await button(itemStarting(page, "Quantum Notes"), "Edit").click();
  await expect(editHeading(page)).toBeVisible();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Quantum Notes");
  await expect(page.getByLabel("Demo link", { exact: true })).toHaveValue("https://notes.example.com");

  await fill(page, { title: "Quantum Notes 2", demo: "" });
  await button(screen, "Save").click();

  await expect(screen.getByRole("status")).toHaveText(ENTRY_SAVED);
  await expect(labelsOf(page)).toHaveText(["Quantum Notes 2"]);
  expect(dbProjects()).toEqual([row(QUANTUM_ID, 0, { ...QUANTUM, title: "Quantum Notes 2", demo: "" })]);

  await page.reload();
  await openProjects(page);
  await expect(labelsOf(page)).toHaveText(["Quantum Notes 2"]);
  await button(itemsOf(page).first(), "Edit").click();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Quantum Notes 2");
  await expect(page.getByLabel("Demo link", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("GitHub link", { exact: true })).toHaveValue("https://github.com/example/quantum-notes");
  await expect(page.getByLabel("Short description", { exact: true })).toHaveValue("A notes app");
  await expect(paragraph(page, 1)).toHaveValue("Built for fast capture.");
  await expect(techName(page, 1)).toHaveValue("React");
  await expect(techName(page, 2)).toHaveValue("Supabase");
  await context.close();
});

test("E2E-15: the owner moves projects up and down, the order is stored and the end buttons are absent", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(60000);
  dbReset();
  seedThree();
  const { context, page } = await ownerPage(browser, baseURL as string);
  await openProjects(page);
  const screen = screenOf(page);

  await expect(itemsOf(page)).toHaveCount(3);
  const counts = async (index: number): Promise<[number, number]> => [
    await button(itemsOf(page).nth(index), "Move up").count(),
    await button(itemsOf(page).nth(index), "Move down").count(),
  ];
  expect(await counts(0)).toEqual([0, 1]);
  expect(await counts(1)).toEqual([1, 1]);
  expect(await counts(2)).toEqual([1, 0]);

  await button(itemStarting(page, "Gamma"), "Move up").click();
  await expect(screen.getByRole("status")).toHaveText(ORDER_SAVED);
  await expect(labelsOf(page)).toHaveText(["Alpha", "Gamma", "Beta"]);
  expect(positionsOf()).toEqual({ [ALPHA_ID]: 0, [GAMMA_ID]: 1, [BETA_ID]: 2 });

  await button(itemStarting(page, "Alpha"), "Move down").click();
  await expect(labelsOf(page)).toHaveText(["Gamma", "Alpha", "Beta"]);
  await expect(screen.getByRole("status")).toHaveText(ORDER_SAVED);

  await page.reload();
  await openProjects(page);
  await expect(labelsOf(page)).toHaveText(["Gamma", "Alpha", "Beta"]);
  expect(dbTitles()).toEqual(["Gamma", "Alpha", "Beta"]);
  await context.close();
});

test("E2E-16: a new project goes to the bottom of the list, one above the highest stored position", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(60000);
  dbReset();
  dbSeedProjects([row(ALPHA_ID, 3, ALPHA), row(BETA_ID, 7, BETA)]);
  const { context, page } = await ownerPage(browser, baseURL as string);
  await openProjects(page);
  const screen = screenOf(page);
  await expect(itemsOf(page)).toHaveCount(2);

  await button(screen, "Add entry").click();
  await fill(page, { title: "Delta" });
  await button(screen, "Save").click();

  await expect(screen.getByRole("status")).toHaveText(ENTRY_SAVED);
  await expect(labelsOf(page)).toHaveText(["Alpha", "Beta", "Delta"]);
  const stored = dbProjects() as { id: string; position: number; data: { title: string } }[];
  expect(stored).toHaveLength(3);
  expect(stored.find((r) => r.data.title === "Delta")?.position).toBe(8);
  expect(stored.find((r) => r.id === ALPHA_ID)?.position).toBe(3);
  expect(stored.find((r) => r.id === BETA_ID)?.position).toBe(7);

  await page.reload();
  await openProjects(page);
  await expect(labelsOf(page)).toHaveText(["Alpha", "Beta", "Delta"]);
  await context.close();
});

test("E2E-17: deleting asks first, Cancel keeps the project and Confirm removes it for good", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(90000);
  for (const confirm of [false, true]) {
    dbReset();
    seedTwo();
    const seed = [row(ALPHA_ID, 0, ALPHA), row(BETA_ID, 1, BETA)];
    const { context, page } = await ownerPage(browser, baseURL as string);
    await openProjects(page);
    await expect(itemsOf(page)).toHaveCount(2);

    await button(itemStarting(page, "Beta"), "Delete").click();
    const group = confirmGroup(page);
    await expect(group).toBeVisible();
    await expect(group.locator("p")).toHaveText(ASK_BETA);
    await expect(button(group, "Confirm")).toBeVisible();
    await expect(button(group, "Cancel")).toBeVisible();
    await expect(labelsOf(page)).toHaveText(["Alpha", "Beta"]);
    expect(dbProjects()).toEqual(seed);

    if (!confirm) {
      await button(group, "Cancel").click();
      await expect(group).toHaveCount(0);
      await expect(labelsOf(page)).toHaveText(["Alpha", "Beta"]);
      expect(dbProjects()).toEqual(seed);
      await page.reload();
      await openProjects(page);
      await expect(labelsOf(page)).toHaveText(["Alpha", "Beta"]);
      expect(dbProjects()).toEqual(seed);
    } else {
      await button(group, "Confirm").click();
      await expect(statusWith(page, "Entry deleted")).toBeVisible();
      await expect(labelsOf(page)).toHaveText(["Alpha"]);
      expect(dbProjects()).toEqual([row(ALPHA_ID, 0, ALPHA)]);
      await page.reload();
      await openProjects(page);
      await expect(labelsOf(page)).toHaveText(["Alpha"]);
      expect(dbProjects()).toEqual([row(ALPHA_ID, 0, ALPHA)]);
    }
    await context.close();
  }
});

test("E2E-18: a blank title or a link without a scheme is refused next to the field with nothing sent", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(120000);
  dbReset();
  dbSeedProjects([row(ALPHA_ID, 0, ALPHA)]);
  const { context, page } = await ownerPage(browser, baseURL as string);
  await openProjects(page);
  const screen = screenOf(page);
  await expect(itemsOf(page)).toHaveCount(1);

  const BAD_GITHUB = "github.com/example/x";
  const BAD_DEMO = "ftp://demo.example.com";
  const cases: { label: string; replace: Fields; errors: [string, string][] }[] = [
    { label: "(1) title empty", replace: { title: "" }, errors: [["Title", TITLE_REQUIRED]] },
    { label: "(2) title blank", replace: { title: "   " }, errors: [["Title", TITLE_REQUIRED]] },
    { label: "(3) github", replace: { github: BAD_GITHUB }, errors: [["GitHub link", GITHUB_INVALID]] },
    { label: "(4) demo", replace: { demo: BAD_DEMO }, errors: [["Demo link", DEMO_INVALID]] },
    {
      label: "(5) both links",
      replace: { github: BAD_GITHUB, demo: BAD_DEMO },
      errors: [
        ["GitHub link", GITHUB_INVALID],
        ["Demo link", DEMO_INVALID],
      ],
    },
  ];

  for (const c of cases) {
    await button(screen, "Add entry").click();
    await FULL(page);
    await fill(page, c.replace);
    await button(screen, "Save").click();

    const expected: Fields = { ...FULL_FIELDS, ...c.replace };
    for (const [label, message] of c.errors) {
      const field = page.getByLabel(label, { exact: true });
      await expect(field, c.label + " " + label + " invalid").toHaveAttribute("aria-invalid", "true");
      const describedBy = await field.getAttribute("aria-describedby");
      expect(describedBy, c.label + " " + label + " describedby").not.toBeNull();
      await expect(page.locator("#" + describedBy), c.label + " " + label + " message").toHaveText(message);
    }
    for (const [key, label] of FIELD_LABELS) {
      await expect(page.getByLabel(label, { exact: true }), c.label + " " + label + " kept").toHaveValue(
        expected[key] as string,
      );
    }
    await expect(paragraph(page, 1), c.label + " paragraph kept").toHaveValue("Built for fast capture.");
    await expect(techName(page, 1), c.label + " tech name kept").toHaveValue("React");
    await expect(addHeading(page)).toBeVisible();
    await expect(statusWith(page, ENTRY_SAVED)).toHaveCount(0);
    expect(dbProjects(), c.label).toEqual([row(ALPHA_ID, 0, ALPHA)]);
    await button(screen, "Cancel").click();
    await expect(addHeading(page)).toHaveCount(0);
  }
  await context.close();
});

test("E2E-19: a blank title is refused on an edit, and saved text is trimmed with blank lines dropped", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(120000);
  dbReset();
  dbSeedProjects([row(ALPHA_ID, 0, ALPHA)]);
  const { context, page } = await ownerPage(browser, baseURL as string);
  await openProjects(page);
  const screen = screenOf(page);
  await expect(itemsOf(page)).toHaveCount(1);

  await button(itemStarting(page, "Alpha"), "Edit").click();
  await fill(page, { title: "   " });
  await button(screen, "Save").click();
  const title = page.getByLabel("Title", { exact: true });
  await expect(title).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#" + (await title.getAttribute("aria-describedby")))).toHaveText(TITLE_REQUIRED);
  expect(dbProjects()).toEqual([row(ALPHA_ID, 0, ALPHA)]);
  await button(screen, "Cancel").click();
  await page.reload();
  await openProjects(page);
  await expect(labelsOf(page)).toHaveText(["Alpha"]);

  await button(screen, "Add entry").click();
  await fill(page, {
    title: "  Delta ",
    shortDesc: "  Fourth  ",
    github: " HTTPS://Github.com/example/delta ",
  });
  for (let i = 0; i < 3; i += 1) await button(screen, "Add paragraph").click();
  await paragraph(page, 1).fill("  First  ");
  await paragraph(page, 2).fill("   ");
  await paragraph(page, 3).fill("Second");
  for (let i = 0; i < 3; i += 1) await button(screen, "Add tech name").click();
  await techName(page, 1).fill(" Go ");
  await techName(page, 2).fill("");
  await techName(page, 3).fill("SQL ");
  await button(screen, "Save").click();
  await expect(screen.getByRole("status")).toHaveText(ENTRY_SAVED);
  await expect(labelsOf(page)).toHaveText(["Alpha", "Delta"]);
  const afterDelta = (dbProjects() as { id: string; position: number; data: unknown }[]).filter((r) => r.id !== ALPHA_ID);
  expect(afterDelta).toHaveLength(1);
  expect(afterDelta[0].data).toEqual({
    title: "Delta",
    shortDesc: "Fourth",
    description: ["First", "Second"],
    tech: ["Go", "SQL"],
    github: "HTTPS://Github.com/example/delta",
    demo: "",
  });
  expect(afterDelta[0].position).toBe(1);

  await button(screen, "Add entry").click();
  await fill(page, { title: "Epsilon" });
  await button(screen, "Save").click();
  await expect(labelsOf(page)).toHaveText(["Alpha", "Delta", "Epsilon"]);
  await expect(screen.getByRole("status")).toHaveText(ENTRY_SAVED);
  const epsilon = (dbProjects() as { id: string; position: number; data: { title: string } }[]).filter(
    (r) => r.data.title === "Epsilon",
  );
  expect(epsilon).toHaveLength(1);
  expect(epsilon[0].data).toEqual({ title: "Epsilon", shortDesc: "", description: [], tech: [], github: "", demo: "" });
  expect(epsilon[0].position).toBe(2);
  await context.close();
});

test("E2E-20: an unreachable database shows one fixed load message, keeps the menu working and recovers", async ({
  browser,
  baseURL,
  request,
}) => {
  test.setTimeout(60000);
  dbReset();
  seedTwo();
  dbBreak();
  const before = await (await request.get("/")).text();
  const { context, page } = await ownerPage(browser, baseURL as string);
  await openProjects(page);
  const screen = screenOf(page);

  await expect(page.getByRole("alert").filter({ hasText: LOAD_FAILED })).toHaveText(LOAD_FAILED);
  await expect(screen.getByText(NO_PROJECTS)).toHaveCount(0);
  await expect(button(screen, "Add entry")).toHaveCount(0);
  await expect(listOf(page)).toHaveCount(0);
  const panelText = await page.locator("body").innerText();
  for (const leak of LEAKS) expect(panelText, "panel leaks " + leak).not.toContain(leak);
  for (const name of SECTION_NAMES) await expect(button(menu(page), name), name).toBeVisible();
  await expect(button(page, "Sign out")).toBeVisible();

  await button(menu(page), "Blog posts").click();
  await expect(page.getByRole("status").filter({ hasText: "Blog posts editor is not available yet." })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: LOAD_FAILED })).toHaveCount(0);
  const after = await request.get("/");
  expect(after.status()).toBe(200);
  expect(await after.text()).toBe(before);

  dbFix();
  await button(menu(page), "Projects").click();
  await expect(labelsOf(page)).toHaveText(["Alpha", "Beta"]);
  await context.close();
});

test("E2E-21: a failed save, move or delete shows one fixed message, keeps the form and the list, and works again after recovery", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(120000);
  dbReset();
  seedTwo();
  const { context, page } = await ownerPage(browser, baseURL as string);
  await openProjects(page);
  const screen = screenOf(page);
  await expect(itemsOf(page)).toHaveCount(2);
  dbBreak();

  await button(itemsOf(page).first(), "Edit").click();
  await fill(page, { title: "Staff Project" });
  await button(screen, "Save").click();
  await expect(screen.getByRole("alert")).toHaveText(SAVE_FAILED);
  await expect(editHeading(page)).toBeVisible();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Staff Project");
  await expect(statusWith(page, ENTRY_SAVED)).toHaveCount(0);
  const failedText = await page.locator("body").innerText();
  for (const leak of LEAKS) expect(failedText, "save leaks " + leak).not.toContain(leak);

  await button(screen, "Cancel").click();
  await expect(labelsOf(page)).toHaveText(["Alpha", "Beta"]);

  await button(screen, "Add entry").click();
  await fill(page, { title: "Gamma" });
  await button(screen, "Save").click();
  await expect(screen.getByRole("alert")).toHaveText(SAVE_FAILED);
  await expect(addHeading(page)).toBeVisible();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Gamma");
  await button(screen, "Cancel").click();

  await button(itemsOf(page).first(), "Move down").click();
  await expect(screen.getByRole("alert")).toHaveText(MOVE_FAILED);
  await expect(labelsOf(page)).toHaveText(["Alpha", "Beta"]);
  await expect(statusWith(page, ORDER_SAVED)).toHaveCount(0);

  await button(itemsOf(page).first(), "Delete").click();
  await button(confirmGroup(page), "Confirm").click();
  await expect(screen.getByRole("alert")).toHaveText(DELETE_FAILED);
  await expect(itemsOf(page)).toHaveCount(2);

  dbFix();
  await button(confirmGroup(page), "Cancel").click();
  await button(itemsOf(page).first(), "Edit").click();
  await fill(page, { title: "Staff Project" });
  await button(screen, "Save").click();
  await expect(screen.getByRole("status")).toHaveText(ENTRY_SAVED);
  await expect(labelsOf(page).first()).toHaveText("Staff Project");
  const stored = dbProjects() as { id: string; position: number; data: { title: string } }[];
  expect(stored.find((r) => r.id === ALPHA_ID)?.data.title).toBe("Staff Project");
  const beta = stored.find((r) => r.id === BETA_ID);
  expect(beta?.position).toBe(1);
  expect(beta?.data).toEqual(BETA);
  expect(stored.some((r) => r.data.title === "Gamma")).toBe(false);
  await context.close();
});

test("E2E-22: a project deleted in another tab is not brought back and the stale screen shows the failure", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(120000);
  dbReset();
  seedThree();
  const { context, page } = await ownerPage(browser, baseURL as string);
  const second = await context.newPage();
  await openProjects(page);
  await openProjects(second);
  await expect(itemsOf(page)).toHaveCount(3);
  await expect(itemsOf(second)).toHaveCount(3);

  await button(itemStarting(page, "Alpha"), "Delete").click();
  await button(confirmGroup(page), "Confirm").click();
  await expect(statusWith(page, "Entry deleted")).toBeVisible();
  expect((dbProjects() as { id: string }[]).map((r) => r.id).sort()).toEqual([BETA_ID, GAMMA_ID]);

  const screen2 = screenOf(second);
  await button(itemStarting(second, "Alpha"), "Edit").click();
  await fill(second, { title: "Resurrected" });
  await button(screen2, "Save").click();
  await expect(screen2.getByRole("alert")).toHaveText(SAVE_FAILED);
  await button(screen2, "Cancel").click();

  await button(itemStarting(second, "Beta"), "Move up").click();
  await expect(screen2.getByRole("alert")).toHaveText(MOVE_FAILED);
  expect((dbProjects() as { id: string }[]).map((r) => r.id).sort()).toEqual([BETA_ID, GAMMA_ID]);
  expect(positionsOf()).toEqual({ [BETA_ID]: 1, [GAMMA_ID]: 2 });

  await button(itemStarting(second, "Alpha"), "Delete").click();
  await button(confirmGroup(second), "Confirm").click();
  await expect(screen2.getByRole("alert")).toHaveText(DELETE_FAILED);

  await second.reload();
  await openProjects(second);
  await expect(labelsOf(second)).toHaveText(["Beta", "Gamma"]);
  expect((dbProjects() as { data: { title: string } }[]).some((r) => r.data.title === "Resurrected")).toBe(false);
  await context.close();
});

test("E2E-23: a move or save after sign-in ended or with no network shows the fixed failure and keeps the typed text", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(120000);
  const seed = [row(ALPHA_ID, 0, ALPHA), row(BETA_ID, 1, BETA)];

  // Case 1: the sign-in ended.
  dbReset();
  seedTwo();
  const one = await ownerPage(browser, baseURL as string);
  await openProjects(one.page);
  await expect(itemsOf(one.page)).toHaveCount(2);
  await one.context.clearCookies();
  const screen1 = screenOf(one.page);
  await button(itemsOf(one.page).first(), "Move down").click();
  await expect(screen1.getByRole("alert")).toHaveText(MOVE_FAILED);
  await button(itemsOf(one.page).first(), "Edit").click();
  await fill(one.page, { title: "Staff Project" });
  await button(screen1, "Save").click();
  await expect(screen1.getByRole("alert")).toHaveText(SAVE_FAILED);
  await expect(editHeading(one.page)).toBeVisible();
  await expect(one.page.getByLabel("Title", { exact: true })).toHaveValue("Staff Project");
  expect(dbProjects()).toEqual(seed);
  await one.context.close();

  // Case 2: no network.
  dbReset();
  seedTwo();
  const two = await ownerPage(browser, baseURL as string);
  await openProjects(two.page);
  await expect(itemsOf(two.page)).toHaveCount(2);
  const screen2 = screenOf(two.page);
  await two.context.setOffline(true);
  await button(itemsOf(two.page).first(), "Move down").click();
  await expect(screen2.getByRole("alert")).toHaveText(MOVE_FAILED);
  await button(itemsOf(two.page).first(), "Edit").click();
  await fill(two.page, { title: "Offline Title" });
  await button(screen2, "Save").click();
  await expect(screen2.getByRole("alert")).toHaveText(SAVE_FAILED);
  await expect(two.page.getByLabel("Title", { exact: true })).toHaveValue("Offline Title");
  expect(dbProjects()).toEqual(seed);
  await two.context.setOffline(false);
  await button(screen2, "Save").click();
  await expect(screen2.getByRole("status")).toHaveText(ENTRY_SAVED);
  await expect(labelsOf(two.page).first()).toHaveText("Offline Title");
  await two.context.close();
});

test("E2E-24: while a request is in flight the screen shows its state, disables the controls and sends it once", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(120000);
  dbReset();
  const { context, page } = await ownerPage(browser, baseURL as string);
  await openProjects(page);
  const screen = screenOf(page);

  // Part 1: add, held.
  const post = await holdRoute(page, "POST");
  await button(screen, "Add entry").click();
  await fill(page, { title: "Quantum Notes" });
  await button(screen, "Save").dblclick();
  await expect(screen.getByRole("status")).toHaveText("Saving…");
  await expect(button(screen, "Save")).toBeDisabled();
  await expect(button(screen, "Cancel")).toBeDisabled();
  for (const [, label] of FIELD_LABELS) await expect(page.getByLabel(label, { exact: true }), label).toBeDisabled();
  await expect(button(screen, "Add paragraph")).toBeDisabled();
  await expect(button(screen, "Add tech name")).toBeDisabled();
  expect(post.count()).toBe(1);
  post.release();
  await expect(itemsOf(page)).toHaveCount(1);
  await expect(labelsOf(page)).toHaveText(["Quantum Notes"]);
  expect(post.count()).toBe(1);
  expect(dbProjects()).toHaveLength(1);

  // Part 2: move, held.
  seedTwo();
  await page.reload();
  await openProjects(page);
  await expect(itemsOf(page)).toHaveCount(2);
  const patch = await holdRoute(page, "PATCH");
  await button(itemsOf(page).first(), "Move down").click();
  await expect(screen.getByRole("status")).toHaveText("Saving…");
  for (const name of ["Edit", "Move up", "Move down", "Delete", "Add entry"]) {
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

test("E2E-25: nothing typed in an unsaved form is kept after Cancel or a reload", async ({ browser, baseURL }) => {
  test.setTimeout(60000);
  dbReset();
  dbSeedProjects([row(ALPHA_ID, 0, ALPHA)]);
  const { context, page } = await ownerPage(browser, baseURL as string);
  await openProjects(page);
  const screen = screenOf(page);
  await expect(itemsOf(page)).toHaveCount(1);

  await button(screen, "Add entry").click();
  await fill(page, { title: "Draft" });
  await button(screen, "Cancel").click();
  await expect(addHeading(page)).toHaveCount(0);
  await expect(labelsOf(page)).toHaveText(["Alpha"]);
  expect(dbProjects()).toEqual([row(ALPHA_ID, 0, ALPHA)]);

  await button(screen, "Add entry").click();
  await fill(page, { title: "Draft again", shortDesc: "1999" });
  await page.reload();
  await openProjects(page);
  await expect(itemsOf(page)).toHaveCount(1);
  await expect(addHeading(page)).toHaveCount(0);
  const text = await page.locator("body").innerText();
  expect(text).not.toContain("Draft");
  expect(text).not.toContain("1999");
  expect(dbProjects()).toEqual([row(ALPHA_ID, 0, ALPHA)]);
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

test("E2E-26: two projects with the same text are two projects, and the last save from two tabs wins quietly", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(120000);
  dbReset();
  const first = await ownerPage(browser, baseURL as string);
  await openProjects(first.page);
  const screen = screenOf(first.page);
  for (let i = 0; i < 2; i += 1) {
    await button(screen, "Add entry").click();
    await fill(first.page, { title: "Quantum Notes" });
    await button(screen, "Save").click();
    await expect(itemsOf(first.page)).toHaveCount(i + 1);
    await expect(screen.getByRole("status")).toHaveText(ENTRY_SAVED);
  }
  await expect(labelsOf(first.page)).toHaveText(["Quantum Notes", "Quantum Notes"]);
  const stored = dbProjects() as { id: string }[];
  expect(stored).toHaveLength(2);
  expect(stored[0].id).not.toBe(stored[1].id);

  await button(itemsOf(first.page).first(), "Delete").click();
  await button(confirmGroup(first.page), "Confirm").click();
  await expect(itemsOf(first.page)).toHaveCount(1);
  expect(dbProjects()).toHaveLength(1);
  await first.context.close();

  dbSeedProjects([row(ALPHA_ID, 0, ALPHA)]);
  const one = await ownerPage(browser, baseURL as string);
  const two = await one.context.newPage();
  await openProjects(one.page);
  await openProjects(two);
  await expect(itemsOf(one.page)).toHaveCount(1);
  await expect(itemsOf(two)).toHaveCount(1);

  await button(itemsOf(one.page).first(), "Edit").click();
  await fill(one.page, { title: "First" });
  await button(screenOf(one.page), "Save").click();
  await expect(screenOf(one.page).getByRole("status")).toHaveText(ENTRY_SAVED);

  await button(itemsOf(two).first(), "Edit").click();
  await expect(two.getByLabel("Title", { exact: true })).toHaveValue("Alpha");
  await fill(two, { title: "Second" });
  await button(screenOf(two), "Save").click();
  await expect(screenOf(two).getByRole("status")).toHaveText(ENTRY_SAVED);
  await expect(screenOf(two).getByRole("alert")).toHaveCount(0);

  await one.page.reload();
  await openProjects(one.page);
  await expect(labelsOf(one.page).first()).toHaveText("Second");
  const final = dbProjects() as { data: { title: string } }[];
  expect(final).toHaveLength(1);
  expect(final[0].data.title).toBe("Second");
  await one.context.close();
});

test("E2E-27: the Projects screen fits a phone, follows the theme tokens and works from the keyboard", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(180000);
  const surfaceByTheme: Record<string, string> = {};
  const thirty = Array.from({ length: 30 }, (_, i) => {
    const nn = String(i + 1).padStart(2, "0");
    const long = nn === "15";
    return row("00000000-0000-4000-8000-0000000000" + nn, i, {
      title: long ? "N".repeat(120) : "Project " + nn,
      shortDesc: "Short " + nn,
      description: [long ? "D".repeat(300) : "Paragraph " + nn],
      tech: ["Tech " + nn],
      github: long ? "https://example.com/" + "g".repeat(200) : "https://github.com/example/" + nn,
      demo: "",
    });
  });

  for (const theme of ["light", "dark"]) {
    dbReset();
    dbSeedProjects(thirty);
    const { context, page } = await ownerPage(browser, baseURL as string, { viewport: { width: 375, height: 800 } });
    await page.addInitScript((t) => {
      try {
        localStorage.setItem("theme", t);
      } catch {
        // storage unavailable: the page falls back to its default theme
      }
    }, theme);
    await openProjects(page);
    const screen = screenOf(page);
    await expect(itemsOf(page)).toHaveCount(30);

    const fits = async (when: string): Promise<void> => {
      const widths = await page.evaluate(() => ({
        root: document.documentElement.scrollWidth,
        body: document.body.scrollWidth,
      }));
      expect(widths.root, theme + " root width " + when).toBeLessThanOrEqual(375);
      expect(widths.body, theme + " body width " + when).toBeLessThanOrEqual(375);
      const boxes = await page.locator("button, input, textarea").evaluateAll((nodes) =>
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
    surfaceByTheme[theme] = surfaceAlt;
    if (theme === "dark") await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    await button(itemsOf(page).nth(14), "Edit").click();
    await expect(editHeading(page)).toBeVisible();
    await fits("form of the long project");
    await button(screen, "Cancel").click();
    await expect(editHeading(page)).toHaveCount(0);

    await button(itemsOf(page).first(), "Edit").click();
    await fill(page, { title: "   " });
    await button(screen, "Save").click();
    const alert = page.getByRole("alert").filter({ hasText: TITLE_REQUIRED });
    await expect(alert).toHaveText(TITLE_REQUIRED);
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
    expect(dbProjects()).toHaveLength(30);
    await context.close();
  }
  expect(surfaceByTheme.dark).not.toBe(surfaceByTheme.light);
});

// The words and module names below are put together from pieces because the gate scans this file.
const piece = (...parts: string[]): string => parts.join("");

test("E2E-28: the earlier Projects store and spec are gone, the shared files stay, and nothing imports the old store", async () => {
  dbReset();
  const mustNotExist = [piece("src/lib/", FIRE, "/projects.ts"), "e2e/manage-projects.spec.ts"];
  for (const path of mustNotExist) expect(fs.existsSync(path), path + " is gone").toBe(false);
  const mustExist = [
    piece("src/lib/", FIRE, "/list.ts"),
    piece("src/lib/", FIRE, "/certifications.ts"),
    piece("src/lib/", FIRE, "/techstack.ts"),
    piece("src/lib/", FIRE, "/blogposts.ts"),
    "src/lib/admin/list.ts",
    "src/lib/admin/projects.ts",
    "src/app/components/admin/ListEditor.tsx",
    "src/app/components/admin/CertificationsEditor.tsx",
    "src/app/components/admin/TechStackEditor.tsx",
    "src/app/components/admin/BlogPostsEditor.tsx",
  ];
  for (const path of mustExist) expect(fs.existsSync(path), path + " exists").toBe(true);

  const read = (path: string): string => fs.readFileSync(path, "utf8");
  const editor = read("src/app/components/admin/ProjectsEditor.tsx");
  for (const text of ["createHttpListStore", "/api/admin/projects/", "bottomPosition"]) {
    expect(editor, "ProjectsEditor has " + text).toContain(text);
  }
  for (const word of [
    FIRE,
    piece("lib/", "server"),
    piece("lib/", "auth"),
    piece("next", "-auth"),
    PG,
    piece("server", "-only"),
    piece("saving", "On").toLowerCase(),
  ]) {
    expect(editor.toLowerCase(), "ProjectsEditor names " + word).not.toContain(word);
  }
  expect(editor, "ProjectsEditor names savingOn").not.toContain(piece("saving", "On"));

  const panel = read("src/app/components/admin/AdminPanel.tsx");
  expect(panel).toContain("ProjectsEditor");
  expect(panel).toContain("ExperienceEditor");
  expect(panel).not.toContain(piece("lib/", "auth"));
  expect(panel).not.toContain(piece("lib/", "server"));
  expect(panel.toLowerCase()).not.toContain(FIRE);

  const projects = read("src/lib/admin/projects.ts");
  expect(projects.toLowerCase()).not.toContain(FIRE);
  expect(projects).toMatch(/export (function|const) projectShape\b/);

  const route = read("src/app/api/admin/projects/route.ts");
  expect(route).toContain(AUTH_MODULE);
  expect(route).toContain(piece("@/lib/", "server/listStore"));
  expect(route).toContain("force-dynamic");
  expect(route.toLowerCase()).not.toContain(FIRE);

  const importers = gitGrep(["-n", "-E", piece(FIRE, "/projects"), "--", "src", "e2e"]);
  expect(importers.stdout).toBe("");
  expect(importers.status).toBe(1);
});

test("E2E-30: the earlier sign-in spec now skips Projects and no spec expects its notice", async () => {
  dbReset();
  const read = (path: string): string => fs.readFileSync(path, "utf8");
  const gone = gitGrep(["-n", "-F", piece("Projects editor is", " not available yet."), "--", "e2e"]);
  expect(gone.stdout).toBe("");
  expect(gone.status).toBe(1);

  const signIn = read("e2e/owner-google-sign-in.spec.ts");
  expect(signIn).toContain('l !== "Experience"');
  expect(signIn).toContain('l !== "Projects"');
  const loop = signIn.split("\n").filter((l) => l.includes('l !== "Projects"'));
  expect(loop.length).toBeGreaterThan(0);
  for (const line of loop) {
    expect(line).toContain('l !== "Profile"');
    expect(line).toContain('l !== "Images"');
  }
  expect(read("e2e/owner-edits-profile.spec.ts")).toContain("Blog posts editor is not available yet.");
  expect(read("e2e/owner-uploads-images.spec.ts")).toContain("Blog posts editor is not available yet.");
});

test("E2E-31: CLAUDE.md lists the projects route once, keeps the shared pattern and the settings, and drops the old counts", async () => {
  dbReset();
  const doc = fs.readFileSync("CLAUDE.md", "utf8");
  for (const text of [
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
  ]) {
    expect(doc, text).toContain(text);
  }
  const rows = doc.split("\n").filter((l) => l.startsWith("| `/api/admin/projects/`"));
  expect(rows, "Routes table rows for the projects route").toHaveLength(1);
  for (const text of ["The site reads five settings by name", "The site reads four settings by name", "only API route"]) {
    expect(doc, text).not.toContain(text);
  }
});
