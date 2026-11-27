import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import { expect, test, type APIRequestContext, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { encode } from "next-auth/jwt";

test.describe.configure({ mode: "default" });

// Shared fixtures. The tests of this file share one stand-in database file (D-17), so every test starts by
// resetting it. The first three rows (Step 1) never read it, but the reset keeps the file's rule uniform.

const STAND_IN_PREFIX = "stand-in:";
const DB_URL = process.env.SUPABASE_DB_URL ?? "";
const DB_FILE = DB_URL.startsWith(STAND_IN_PREFIX) ? DB_URL.slice(STAND_IN_PREFIX.length) : "";

function dbReset(): void {
  if (DB_FILE !== "" && fs.existsSync(DB_FILE)) fs.rmSync(DB_FILE, { force: true });
}

function readDbFile(): Record<string, unknown> {
  if (DB_FILE === "" || !fs.existsSync(DB_FILE)) return {};
  return JSON.parse(fs.readFileSync(DB_FILE, "utf8")) as Record<string, unknown>;
}

function dbSeed(profile: unknown): void {
  fs.writeFileSync(DB_FILE, JSON.stringify({ profile }));
}

function dbBreak(): void {
  fs.writeFileSync(DB_FILE, JSON.stringify({ ...readDbFile(), unreachable: true }));
}

function dbFix(): void {
  const { unreachable: _unreachable, ...rest } = readDbFile();
  void _unreachable;
  fs.writeFileSync(DB_FILE, JSON.stringify(rest));
}

function dbStored(): unknown {
  const content = readDbFile();
  return "profile" in content ? content.profile : null;
}

const PANEL = "/bright-warm-greenhouse/";
const API = "/api/admin/profile/";

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

// The cookie header of a session; undefined for "no cookie header at all".
const cookieOf = async (claims: Claims, options: { secret?: string; maxAge?: number } = {}): Promise<string> =>
  SESSION_COOKIE + "=" + (await mint(claims, options));

const KEITH = {
  name: "Keith Lim",
  headline: "Software Engineer",
  about: ["First paragraph.", "Second paragraph."],
  photo: "/images/keith.jpg",
  email: "hello@example.com",
  resumeLink: "/resume.pdf",
  socialLinks: [{ label: "GitHub", url: "https://github.com/example" }],
};
const BASE = {
  name: "Keith Lim",
  headline: "Software Engineer",
  about: [] as string[],
  photo: "",
  email: "",
  resumeLink: "",
  socialLinks: [] as { label: string; url: string }[],
};
const LEAKS = ["10.1.2.3", "password-marker-standin", "ECONNREFUSED"];

async function apiGet(request: APIRequestContext, cookie?: string) {
  return request.get(API, { headers: cookie === undefined ? {} : { cookie }, maxRedirects: 0 });
}

async function apiPut(request: APIRequestContext, body: string, cookie?: string) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cookie !== undefined) headers.cookie = cookie;
  return request.put(API, { headers, data: body, maxRedirects: 0 });
}

// This file is scanned by the mechanical gate and by E2E-03's repository search, so the module name, the
// database scheme and the import statement below are put together from pieces.
const Q = String.fromCharCode(34);
const DASH = String.fromCharCode(8212);
const BODY = "export const x = 1;";
const LIB = ["post", "gres"].join("");
const SCHEME = [LIB, "(ql)?:"].join("");
const SLASHES = "/" + "/";
const importLine = (name: string, mod: string) => "imp" + "ort " + name + " fr" + "om " + Q + mod + Q + ";";

type GateRun = { lines: string[]; status: number | null };

// Build a throw-away git repository the way the earlier feature's gate test does, add the files and run the gate.
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

const starts = (run: GateRun, prefix: string) => run.lines.filter((l) => l.startsWith(prefix));
const startsWithPath = (run: GateRun, prefix: string, p: string) =>
  run.lines.filter((l) => l.startsWith(prefix) && l.includes(p));

test("E2E-01: the mechanical gate accepts new files under src/app/api/admin/ and still rejects the neighbouring cases", async () => {
  test.setTimeout(180000);
  dbReset();

  // (a), (b), (c): allowed API prefixes
  for (const [label, p] of [
    ["a", "src/app/api/admin/profile/route.ts"],
    ["b", "src/app/api/admin/other/route.ts"],
    ["c", "src/app/api/auth/[...nextauth]/route.ts"],
  ]) {
    const run = runGate([{ file: p, content: BODY }]);
    expect(starts(run, "PASS STATIC"), "(" + label + ") PASS STATIC").not.toEqual([]);
    expect(starts(run, "FAIL STATIC"), "(" + label + ") FAIL STATIC").toEqual([]);
  }

  // (d), (e), (f): any other API route, a look-alike prefix, and a middleware file
  for (const [label, p] of [
    ["d", "src/app/api/other/route.ts"],
    ["e", "src/app/api/administrator/route.ts"],
    ["f", "src/middleware.ts"],
  ]) {
    const run = runGate([{ file: p, content: BODY }]);
    expect(startsWithPath(run, "FAIL STATIC", p), "(" + label + ") FAIL STATIC names " + p).not.toEqual([]);
    expect(run.status, "(" + label + ") exit status").toBe(1);
  }

  // (g): the database library is not a forbidden import
  const g = runGate([{ file: "src/lib/server/x.ts", content: importLine("sql", LIB) + "\n" }]);
  expect(starts(g, "PASS IMPORTS"), "(g) PASS IMPORTS").not.toEqual([]);
  expect(starts(g, "FAIL IMPORTS"), "(g) FAIL IMPORTS").toEqual([]);
});

test("E2E-02: the database library is pinned exactly and no other database or Firebase dependency changed", async () => {
  dbReset();
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const lock = JSON.parse(fs.readFileSync("package-lock.json", "utf8")) as {
    packages: Record<string, { version?: string }>;
  };
  const supabaseClient = "@supabase/" + "supabase-js";
  const pgTypes = "@types/" + "pg";

  expect(pkg.dependencies?.[LIB]).toBe("4.1.1");
  expect(pkg.dependencies?.["next-auth"]).toBe("5.0.0-beta.32");
  expect(pkg.dependencies?.firebase).toBeDefined();
  expect(pkg.devDependencies?.["firebase-tools"]).toBeDefined();
  expect(pkg.dependencies?.pg).toBeUndefined();
  expect(pkg.devDependencies?.pg).toBeUndefined();
  expect(pkg.dependencies?.[supabaseClient]).toBeUndefined();
  expect(pkg.devDependencies?.[pgTypes]).toBeUndefined();
  expect(lock.packages["node_modules/" + LIB]?.version).toBe("4.1.1");
});

test("E2E-03: the test run carries a stand-in database setting and no connection string is committed", async () => {
  dbReset();
  expect(process.env.SUPABASE_DB_URL ?? "").toMatch(/^stand-in:\/.+portfolio-standin-[0-9a-f]{12}\.json$/);

  const result = spawnSync(
    "git",
    [
      "grep",
      "--untracked",
      "-n",
      "-E",
      SCHEME + SLASHES,
      "--",
      ".",
      ":(exclude)docs",
      ":(exclude)package-lock.json",
    ],
    { cwd: process.cwd(), encoding: "utf8" },
  );
  expect(result.stdout ?? "").toBe("");
  expect(result.status).toBe(1);
});

test("E2E-04: the owner reads and saves the profile through the route, and the route trims, normalises and replaces it whole", async ({
  request,
}) => {
  dbReset();
  const owner = await cookieOf(OWNER());

  const first = await apiGet(request, owner);
  expect(first.status()).toBe(200);
  expect(first.headers()["cache-control"]).toContain("no-store");
  expect(await first.json()).toEqual({ profile: null });

  const saved = {
    name: "Keith Lim",
    headline: "Software Engineer",
    about: ["First paragraph.", "Second paragraph."],
    photo: "/images/keith.jpg",
    email: "hello@example.com",
    resumeLink: "/resume.pdf",
    socialLinks: [
      { label: "GitHub", url: "https://github.com/example" },
      { label: "", url: "https://example.org/x" },
    ],
  };
  const put = await apiPut(
    request,
    '{"name":"  Keith Lim  ","headline":" Software Engineer ","about":["  First paragraph.  ","   ","Second paragraph."],"photo":" /images/keith.jpg ","email":" hello@example.com ","resumeLink":" /resume.pdf ","socialLinks":[{"label":" GitHub ","url":" https://github.com/example "},{"label":"","url":""},{"label":"","url":"https://example.org/x"}]}',
    owner,
  );
  expect(put.status()).toBe(200);
  expect(put.headers()["cache-control"]).toContain("no-store");
  expect(await put.json()).toEqual({ profile: saved });
  expect(dbStored()).toEqual(saved);

  const again = await apiGet(request, owner);
  expect(again.status()).toBe(200);
  expect(await again.json()).toEqual({ profile: saved });

  const second = {
    name: "Second",
    headline: "H",
    about: [],
    photo: "",
    email: "",
    resumeLink: "",
    socialLinks: [],
  };
  const replace = await apiPut(
    request,
    '{"name":"Second","headline":"H","about":[],"photo":"","email":"","resumeLink":"","socialLinks":[]}',
    owner,
  );
  expect(replace.status()).toBe(200);
  expect(dbStored()).toEqual(second);

  const last = await apiGet(request, owner);
  expect(await last.json()).toEqual({ profile: second });
});

test("E2E-05: the route refuses every invalid body with 400 and writes nothing", async ({ request }) => {
  dbReset();
  dbSeed(BASE);
  const owner = await cookieOf(OWNER());

  const bodies: string[] = [
    '{"name":"   ","headline":"H"}',
    '{"name":"N","headline":"   "}',
    '{"name":"N","headline":"H","email":"not-an-email"}',
    '{"name":"N","headline":"H","resumeLink":"resume.pdf"}',
    '{"name":"N","headline":"H","resumeLink":"//example.org"}',
    '{"name":"N","headline":"H","socialLinks":[{"label":"GitHub","url":"github.com/example"}]}',
    '{"name":"N","headline":"H","socialLinks":[{"label":"","url":"http://example.org"}]}',
    '{"name":"N","headline":"H","socialLinks":[{"label":"GitHub","url":""}]}',
    '{"name":5,"headline":"H"}',
    '{"name":"N","headline":"H","email":["x"],"about":"text"}',
    '{"name":"N","headline":"H","about":[1]}',
    '{"name":"N","headline":"H","socialLinks":[{"label":2,"url":"https://x.example"}]}',
    "{",
    "[]",
    '"Keith"',
    "",
  ];
  for (const [i, body] of bodies.entries()) {
    const res = await apiPut(request, body, owner);
    expect(res.status(), "body " + (i + 1)).toBe(400);
    expect(await res.json(), "body " + (i + 1)).toEqual({ error: "invalid" });
    expect(dbStored(), "body " + (i + 1) + " wrote nothing").toEqual(BASE);
  }

  const control = await apiPut(
    request,
    '{"name":"N","headline":"H","resumeLink":"https://example.org/cv.pdf","email":"a@b.co","socialLinks":[{"label":"","url":"https://example.org"}]}',
    owner,
  );
  expect(control.status()).toBe(200);
  expect(dbStored()).toEqual({
    name: "N",
    headline: "H",
    about: [],
    photo: "",
    email: "a@b.co",
    resumeLink: "https://example.org/cv.pdf",
    socialLinks: [{ label: "", url: "https://example.org" }],
  });
});

test("E2E-06: a request without a valid session is refused with 401 and touches nothing", async ({ request }) => {
  dbReset();
  dbSeed(BASE);

  const sessions: { label: string; cookie: string | undefined }[] = [
    { label: "no cookie", cookie: undefined },
    { label: "not a token", cookie: SESSION_COOKIE + "=not-a-token" },
    { label: "expired", cookie: await cookieOf(OWNER(), { maxAge: -3600 }) },
    { label: "wrong secret", cookie: await cookieOf(OWNER(), { secret: "another-secret-0123456789abcdef0123" }) },
  ];
  for (const s of sessions) {
    const get = await apiGet(request, s.cookie);
    expect(get.status(), s.label + " GET").toBe(401);
    expect(await get.json(), s.label + " GET").toEqual({ error: "not-signed-in" });
    const getText = await get.text();
    expect(getText).not.toContain("Keith Lim");
    expect(getText).not.toContain("Defaced");

    const put = await apiPut(request, '{"name":"Defaced","headline":"Defaced"}', s.cookie);
    expect(put.status(), s.label + " PUT").toBe(401);
    expect(await put.json(), s.label + " PUT").toEqual({ error: "not-signed-in" });
    const putText = await put.text();
    expect(putText).not.toContain("Keith Lim");
    expect(putText).not.toContain("Defaced");
    expect(dbStored(), s.label).toEqual(BASE);
  }
});

test("E2E-07: a signed-in account that is not the owner is refused with 403 and touches nothing", async ({ request }) => {
  dbReset();
  dbSeed(BASE);

  const sessions: { label: string; cookie: string }[] = [
    { label: "other account", cookie: await cookieOf(OTHER()) },
    { label: "unverified email", cookie: await cookieOf(UNVERIFIED()) },
  ];
  for (const s of sessions) {
    const get = await apiGet(request, s.cookie);
    expect(get.status(), s.label + " GET").toBe(403);
    expect(await get.json(), s.label + " GET").toEqual({ error: "not-allowed" });
    const getText = await get.text();
    expect(getText).not.toContain("Keith Lim");
    expect(getText).not.toContain("Defaced");

    const put = await apiPut(request, '{"name":"Defaced","headline":"Defaced"}', s.cookie);
    expect(put.status(), s.label + " PUT").toBe(403);
    expect(await put.json(), s.label + " PUT").toEqual({ error: "not-allowed" });
    const putText = await put.text();
    expect(putText).not.toContain("Keith Lim");
    expect(putText).not.toContain("Defaced");
    expect(dbStored(), s.label).toEqual(BASE);
  }
});

test("E2E-08: a stored record of the wrong shape is read tolerantly, field by field", async ({ request }) => {
  dbReset();
  const owner = await cookieOf(OWNER());

  fs.writeFileSync(
    DB_FILE,
    '{"profile":{"name":5,"headline":"Engineer","about":"not a list","photo":null,"email":["x"],"resumeLink":"/cv.pdf","socialLinks":[1,{"label":2,"url":"https://x.example"},"text"]}}',
  );
  const first = await apiGet(request, owner);
  expect(first.status()).toBe(200);
  expect(await first.json()).toEqual({
    profile: {
      name: "",
      headline: "Engineer",
      about: [],
      photo: "",
      email: "",
      resumeLink: "/cv.pdf",
      socialLinks: [{ label: "", url: "https://x.example" }],
    },
  });

  fs.writeFileSync(DB_FILE, '{"profile":{"about":["ok",7,"also"]}}');
  const second = await apiGet(request, owner);
  expect(second.status()).toBe(200);
  expect(await second.json()).toEqual({
    profile: { name: "", headline: "", about: ["ok", "also"], photo: "", email: "", resumeLink: "", socialLinks: [] },
  });
});

test("E2E-09: an unreachable database gives a fixed 503 with no leak, refusals do not depend on it, and it recovers", async ({
  request,
}) => {
  dbReset();
  dbSeed(BASE);
  dbBreak();
  const owner = await cookieOf(OWNER());

  const get = await apiGet(request, owner);
  const put = await apiPut(request, JSON.stringify(KEITH), owner);
  for (const [label, res] of [
    ["GET", get],
    ["PUT", put],
  ] as const) {
    expect(res.status(), label).toBe(503);
    expect(await res.json(), label).toEqual({ error: "unavailable" });
    const text = await res.text();
    for (const leak of [...LEAKS, "Keith Lim"]) expect(text, label + " leaks " + leak).not.toContain(leak);
  }
  expect(dbStored()).toEqual(BASE);

  const signedOut = await apiGet(request);
  expect(signedOut.status()).toBe(401);
  expect(await signedOut.json()).toEqual({ error: "not-signed-in" });
  const other = await apiGet(request, await cookieOf(OTHER()));
  expect(other.status()).toBe(403);
  expect(await other.json()).toEqual({ error: "not-allowed" });

  dbFix();
  const fixed = await apiGet(request, owner);
  expect(fixed.status()).toBe(200);
  expect(await fixed.json()).toEqual({ profile: BASE });
});

test("E2E-10: a missing or unreachable real database gives the fixed 503 and one fixed log line, with no secret in either", async () => {
  test.setTimeout(150000);
  dbReset();
  const origin = "http://localhost:3101";
  const connection = [LIB, "://", "app_user", ":", "pw-marker-standin", "@", "127.0.0.1:1", "/db"].join("");
  const owner = await cookieOf(OWNER());

  async function stop(child: ChildProcess): Promise<void> {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
    child.kill();
    await exited;
  }

  async function runWith(db: string): Promise<{ log: () => string; bodies: string[]; statuses: number[] }> {
    let output = "";
    const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", "3101"], {
      env: { ...process.env, SUPABASE_DB_URL: db },
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
              return (await fetch(origin + "/")).status;
            } catch {
              return 0;
            }
          },
          { timeout: 90000, intervals: [500, 1000] },
        )
        .toBe(200);

      const bodies: string[] = [];
      const statuses: number[] = [];
      const get = await fetch(origin + API, { headers: { cookie: owner } });
      statuses.push(get.status);
      bodies.push(await get.text());
      const put = await fetch(origin + API, {
        method: "PUT",
        headers: { cookie: owner, "content-type": "application/json" },
        body: JSON.stringify(KEITH),
      });
      statuses.push(put.status);
      bodies.push(await put.text());
      const out = await fetch(origin + API);
      statuses.push(out.status);
      bodies.push(await out.text());

      // Let the child's output arrive before the caller reads it.
      await expect.poll(() => output.includes("[database]"), { timeout: 15000 }).toBe(true);
      return { log: () => output, bodies, statuses };
    } finally {
      await stop(child);
    }
  }

  const empty = await runWith("");
  expect(empty.statuses).toEqual([503, 503, 401]);
  expect(empty.bodies[0]).toBe('{"error":"unavailable"}');
  expect(empty.bodies[1]).toBe('{"error":"unavailable"}');
  expect(empty.log()).toContain("[database] read failed unknown");
  expect(empty.log()).toContain("[database] write failed unknown");
  for (const leak of LEAKS) for (const body of empty.bodies) expect(body).not.toContain(leak);

  const refused = await runWith(connection);
  expect(refused.statuses).toEqual([503, 503, 401]);
  expect(refused.bodies[0]).toBe('{"error":"unavailable"}');
  expect(refused.bodies[1]).toBe('{"error":"unavailable"}');
  expect(refused.log()).toContain("[database] schema failed ECONNREFUSED");
  for (const secret of ["127.0.0.1:1", "pw-marker-standin", "app_user", "connect ECONNREFUSED", connection]) {
    expect(refused.log(), "log leaks " + secret).not.toContain(secret);
    for (const body of refused.bodies) expect(body, "body leaks " + secret).not.toContain(secret);
  }
  for (const leak of LEAKS) for (const body of refused.bodies) expect(body).not.toContain(leak);
});

test("E2E-11: the database log line carries the operation and a plain error code and nothing else", async () => {
  dbReset();
  const { databaseLogLine } = await import("../src/lib/admin/dblog");

  expect(
    databaseLogLine("read", Object.assign(new Error("connect ECONNREFUSED 10.1.2.3:5432"), { code: "ECONNREFUSED" })),
  ).toBe("[database] read failed ECONNREFUSED");
  expect(databaseLogLine("write", { code: "28P01", message: "password authentication failed for user x" })).toBe(
    "[database] write failed 28P01",
  );
  expect(databaseLogLine("schema", { code: "10.1.2.3:5432" })).toBe("[database] schema failed unknown");
  expect(databaseLogLine("read", { code: "A".repeat(21) })).toBe("[database] read failed unknown");
  expect(databaseLogLine("read", { code: "A".repeat(20) })).toBe("[database] read failed " + "A".repeat(20));

  const rest = [
    databaseLogLine("read", new Error("secret")),
    databaseLogLine("write", undefined),
    databaseLogLine("write", "text"),
    databaseLogLine("read", null),
    databaseLogLine("read", { code: 5 }),
  ];
  const ops = ["read", "write", "write", "read", "read"];
  rest.forEach((line, i) => expect(line).toBe("[database] " + ops[i] + " failed unknown"));

  const all = [
    databaseLogLine("read", Object.assign(new Error("connect ECONNREFUSED 10.1.2.3:5432"), { code: "ECONNREFUSED" })),
    databaseLogLine("write", { code: "28P01", message: "password authentication failed for user x" }),
    databaseLogLine("schema", { code: "10.1.2.3:5432" }),
    databaseLogLine("read", { code: "A".repeat(21) }),
    databaseLogLine("read", { code: "A".repeat(20) }),
    ...rest,
  ].join("\n");
  for (const text of ["secret", "password", "10.1.2.3", "5432"]) expect(all).not.toContain(text);
});

test("E2E-12: the SQL is exactly the proven text, the server files are marked server-only, and the route stays dynamic", async () => {
  dbReset();

  // (1) the SQL text
  const sql = fs.readFileSync("src/lib/server/sql.ts", "utf8");
  for (const statement of [
    "create table if not exists profile (id text primary key, data jsonb not null, updated_at timestamptz not null default now())",
    "alter table profile enable row level security",
    "insert into profile (id, data, updated_at) values ($1, $2::text::jsonb, now()) on conflict (id) do update set data = excluded.data, updated_at = now()",
    "select data from profile where id = $1",
  ]) {
    expect(sql).toContain(statement);
  }
  for (const word of ["drop ", "delete ", "truncate "]) expect(sql).not.toContain(word);

  // (2) every file of src/lib/server/ starts with the server-only import
  const serverFiles = fs.readdirSync("src/lib/server").filter((f) => fs.statSync("src/lib/server/" + f).isFile());
  expect(serverFiles.length).toBeGreaterThan(0);
  for (const f of serverFiles) {
    const first = fs
      .readFileSync("src/lib/server/" + f, "utf8")
      .split("\n")
      .find((line) => line.trim() !== "");
    expect(first, f).toBe('import "server-only";');
  }

  // (3) only the route and the server folder mention lib/server
  const mentions = spawnSync("git", ["grep", "--untracked", "-l", "-E", "lib/server", "--", "src"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  for (const file of (mentions.stdout ?? "").split("\n").filter(Boolean)) {
    expect(file.startsWith("src/app/api/admin/") || file.startsWith("src/lib/server/"), file).toBe(true);
  }

  // (4) only the database module imports the library
  const importers = spawnSync("git", ["grep", "--untracked", "-l", "-E", "[\"']" + LIB + "[\"']", "--", "src"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  expect((importers.stdout ?? "").split("\n").filter(Boolean)).toEqual(["src/lib/server/database.ts"]);

  // (5) the route is not prerendered and the public routes still are
  const manifest = JSON.parse(fs.readFileSync(".next/prerender-manifest.json", "utf8")) as {
    routes: Record<string, unknown>;
  };
  const keys = Object.keys(manifest.routes);
  expect(keys.filter((k) => k.startsWith("/api/admin"))).toEqual([]);
  for (const key of ["/", "/blog", "/robots.txt", "/rss.xml", "/sitemap.xml"]) expect(keys).toContain(key);
});

test("E2E-13: no public page or script carries the database setting, the stand-in or the admin route", async ({ request }) => {
  dbReset();
  const forbidden = ["SUPABASE_DB_URL", "stand-in:", DB_FILE, "api/admin", "ECONNREFUSED", "DatabaseUnavailable"].filter(
    (s) => s !== "",
  );
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
});

// Step 3: the Profile screen, shown in the panel.

const SAVE_FAILED = "The profile could not be saved. Try again, and check that you are signed in as the owner.";
const LOAD_FAILED = "The profile could not be loaded.";
const NO_PROFILE = "No profile has been saved yet.";
const SECTION_LABELS = ["Profile", "Experience", "Projects", "Certifications", "Tech stack", "Blog posts", "Images"];

async function ownerContext(
  browser: Browser,
  baseURL: string,
  options: Parameters<Browser["newContext"]>[0] = {},
): Promise<BrowserContext> {
  const context = await browser.newContext(options);
  await context.addCookies([{ name: SESSION_COOKIE, value: await mint(OWNER()), url: baseURL }]);
  return context;
}

const menu = (page: Page) => page.getByRole("navigation", { name: "Admin sections" });
const editor = (page: Page) => page.locator('section[aria-label="Profile editor"]');
const field = (page: Page, label: string) => page.getByLabel(label, { exact: true });
const buttonNamed = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
const statusWith = (page: Page, text: string) => page.getByRole("status").filter({ hasText: text });
const alertWith = (page: Page, text: string) => page.getByRole("alert").filter({ hasText: text });
const aboutItems = (page: Page) => page.getByRole("list", { name: "About paragraphs" }).getByRole("listitem");
const socialItems = (page: Page) => page.getByRole("list", { name: "Social links" }).getByRole("listitem");

// Click the Profile menu button until the screen is there (the click is lost if it lands before hydration).
async function openProfile(page: Page): Promise<void> {
  const button = menu(page).getByRole("button", { name: "Profile", exact: true });
  await expect(async () => {
    await button.click({ timeout: 5000 });
    await expect(editor(page)).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 15000 });
}

async function openPanel(browser: Browser, baseURL: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await ownerContext(browser, baseURL);
  const page = await context.newPage();
  await page.goto(PANEL);
  return { context, page };
}

async function reloadAndOpen(page: Page): Promise<void> {
  await page.reload();
  await openProfile(page);
}

test("E2E-14: the owner edits every field, saves, and the saved profile comes back after a reload", async ({
  browser,
  baseURL,
}) => {
  dbReset();
  dbSeed({
    name: "Old Name",
    headline: "Old Headline",
    about: ["Old paragraph."],
    photo: "",
    email: "",
    resumeLink: "",
    socialLinks: [],
  });
  const { context, page } = await openPanel(browser, baseURL as string);
  await openProfile(page);
  await expect(field(page, "Name")).toHaveValue("Old Name");

  await field(page, "Name").fill("Keith Lim");
  await field(page, "Headline").fill("Software Engineer");
  await field(page, "About paragraph 1").fill("First paragraph.");
  await buttonNamed(page, "Add paragraph").click();
  await field(page, "About paragraph 2").fill("Second paragraph.");
  await field(page, "Photo path").fill("/images/keith.jpg");
  await field(page, "Email").fill("hello@example.com");
  await field(page, "Resume link").fill("/resume.pdf");
  await buttonNamed(page, "Add social link").click();
  await field(page, "Social link 1 label").fill("GitHub");
  await field(page, "Social link 1 address").fill("https://github.com/example");
  await buttonNamed(page, "Save").click();

  await expect(statusWith(page, "Profile saved")).toHaveText("Profile saved");
  await expect(page.getByText(NO_PROFILE)).toHaveCount(0);
  expect(dbStored()).toEqual(KEITH);

  await reloadAndOpen(page);
  await expect(field(page, "Name")).toHaveValue("Keith Lim");
  await expect(field(page, "Headline")).toHaveValue("Software Engineer");
  await expect(field(page, "About paragraph 1")).toHaveValue("First paragraph.");
  await expect(field(page, "About paragraph 2")).toHaveValue("Second paragraph.");
  await expect(field(page, "About paragraph 3")).toHaveCount(0);
  await expect(field(page, "Photo path")).toHaveValue("/images/keith.jpg");
  await expect(field(page, "Email")).toHaveValue("hello@example.com");
  await expect(field(page, "Resume link")).toHaveValue("/resume.pdf");
  await expect(field(page, "Social link 1 label")).toHaveValue("GitHub");
  await expect(field(page, "Social link 1 address")).toHaveValue("https://github.com/example");
  await expect(field(page, "Social link 2 label")).toHaveCount(0);
  await context.close();
});

test("E2E-15: with nothing stored the form is empty and writes nothing until the first save", async ({
  browser,
  baseURL,
}) => {
  dbReset();
  const { context, page } = await openPanel(browser, baseURL as string);
  await openProfile(page);

  await expect(statusWith(page, NO_PROFILE)).toHaveText(NO_PROFILE);
  for (const label of ["Name", "Headline", "Photo path", "Email", "Resume link"]) {
    await expect(field(page, label), label).toHaveValue("");
  }
  await expect(aboutItems(page)).toHaveCount(0);
  await expect(socialItems(page)).toHaveCount(0);
  expect(dbStored()).toBeNull();

  await field(page, "Name").fill("Keith Lim");
  await field(page, "Headline").fill("Software Engineer");
  await buttonNamed(page, "Save").click();
  await expect(statusWith(page, "Profile saved")).toHaveText("Profile saved");
  await expect(page.getByText(NO_PROFILE)).toHaveCount(0);
  expect(dbStored()).toEqual(BASE);

  await reloadAndOpen(page);
  await expect(field(page, "Name")).toHaveValue("Keith Lim");
  await expect(page.getByText(NO_PROFILE)).toHaveCount(0);
  await expect(page.getByText("Profile saved")).toHaveCount(0);
  await context.close();
});

test("E2E-16: an invalid field is refused beside the field, the typed values stay, nothing is sent", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(120000);
  const cases: {
    label: string;
    apply: (page: Page) => Promise<void>;
    target: string;
    message: string;
    kept: [string, string][];
  }[] = [
    {
      label: "case 1",
      apply: async (page) => {
        await field(page, "Name").fill("   ");
        await field(page, "Headline").fill("Typed headline");
      },
      target: "Name",
      message: "Name is required",
      kept: [["Headline", "Typed headline"]],
    },
    {
      label: "case 2",
      apply: async (page) => {
        await field(page, "Headline").fill("   ");
        await field(page, "Name").fill("Typed name");
      },
      target: "Headline",
      message: "Headline is required",
      kept: [["Name", "Typed name"]],
    },
    {
      label: "case 3",
      apply: async (page) => {
        await field(page, "Email").fill("not-an-email");
        await field(page, "Headline").fill("Typed headline");
      },
      target: "Email",
      message: "Enter an email address like name@site.com",
      kept: [["Headline", "Typed headline"]],
    },
    {
      label: "case 4",
      apply: async (page) => {
        await field(page, "Resume link").fill("resume.pdf");
        await field(page, "Headline").fill("Typed headline");
      },
      target: "Resume link",
      message: "Enter a web address or a path starting with /",
      kept: [["Headline", "Typed headline"]],
    },
    {
      label: "case 5",
      apply: async (page) => {
        await buttonNamed(page, "Add social link").click();
        await field(page, "Social link 1 label").fill("GitHub");
        await field(page, "Social link 1 address").fill("github.com/example");
        await field(page, "Headline").fill("Typed headline");
      },
      target: "Social link 1 address",
      message: "Enter a full web address starting with https://",
      kept: [
        ["Social link 1 label", "GitHub"],
        ["Social link 1 address", "github.com/example"],
        ["Headline", "Typed headline"],
      ],
    },
    {
      label: "case 6",
      apply: async (page) => {
        await buttonNamed(page, "Add social link").click();
        await field(page, "Social link 1 label").fill("GitHub");
        await field(page, "Headline").fill("Typed headline");
      },
      target: "Social link 1 address",
      message: "Enter a full web address starting with https://",
      kept: [
        ["Social link 1 label", "GitHub"],
        ["Headline", "Typed headline"],
      ],
    },
  ];

  for (const c of cases) {
    dbReset();
    dbSeed(BASE);
    const { context, page } = await openPanel(browser, baseURL as string);
    const puts: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "PUT" && request.url().includes(API)) puts.push(request.url());
    });
    await openProfile(page);
    await expect(field(page, "Name"), c.label).toHaveValue("Keith Lim");

    await c.apply(page);
    await buttonNamed(page, "Save").click();

    await expect(alertWith(page, c.message), c.label).toHaveText(c.message);
    await expect(field(page, c.target), c.label).toHaveAccessibleDescription(c.message);
    for (const [label, value] of c.kept) await expect(field(page, label), c.label + " " + label).toHaveValue(value);
    await expect(page.getByText("Profile saved"), c.label).toHaveCount(0);
    expect(puts, c.label + " sent no PUT").toEqual([]);
    expect(dbStored(), c.label + " stored").toEqual(BASE);

    await reloadAndOpen(page);
    await expect(field(page, "Name"), c.label + " after reload").toHaveValue("Keith Lim");
    await context.close();
  }
});

test("E2E-17: an unreachable database shows only the load message, no form and no leak, and the panel stays usable", async ({
  browser,
  baseURL,
  request,
}) => {
  dbReset();
  dbSeed(BASE);
  const before = await request.get("/");
  expect(before.status()).toBe(200);
  const beforeText = await before.text();
  dbBreak();

  const { context, page } = await openPanel(browser, baseURL as string);
  await openProfile(page);
  await expect(alertWith(page, LOAD_FAILED)).toHaveText(LOAD_FAILED);

  const section = editor(page);
  await expect(section.getByRole("textbox")).toHaveCount(0);
  await expect(page.locator('section[aria-label="Profile editor"] form')).toHaveCount(0);
  await expect(section.getByRole("button", { name: "Save" })).toHaveCount(0);

  const panelText = await page.getByRole("region", { name: "Admin", exact: true }).innerText();
  expect(panelText).not.toContain("Keith Lim");
  for (const leak of LEAKS) expect(panelText, "panel leaks " + leak).not.toContain(leak);
  await expect(menu(page).getByRole("button")).toHaveText(SECTION_LABELS);
  await expect(buttonNamed(page, "Sign out")).toBeVisible();

  await menu(page).getByRole("button", { name: "Blog posts", exact: true }).click();
  await expect(alertWith(page, "The entries could not be loaded.")).toHaveText("The entries could not be loaded.");
  await expect(page.getByText("No posts yet.")).toHaveCount(0);
  await expect(alertWith(page, LOAD_FAILED)).toHaveCount(0);

  const after = await request.get("/");
  expect(after.status()).toBe(200);
  expect(await after.text()).toBe(beforeText);
  await context.close();
});

test("E2E-18: a failed save keeps what was typed, shows the fixed message, and a later save succeeds", async ({
  browser,
  baseURL,
}) => {
  dbReset();
  dbSeed(KEITH);
  const { context, page } = await openPanel(browser, baseURL as string);
  await openProfile(page);
  await expect(field(page, "Name")).toHaveValue("Keith Lim");
  await field(page, "Headline").fill("Staff Engineer");
  dbBreak();
  await buttonNamed(page, "Save").click();

  await expect(alertWith(page, SAVE_FAILED)).toHaveText(SAVE_FAILED);
  await expect(field(page, "Headline")).toHaveValue("Staff Engineer");
  await expect(page.getByText("Profile saved")).toHaveCount(0);
  await expect(page.getByText("Saving…")).toHaveCount(0);
  await expect(buttonNamed(page, "Save")).toBeEnabled();
  const panelText = await page.getByRole("region", { name: "Admin", exact: true }).innerText();
  for (const leak of LEAKS) expect(panelText, "panel leaks " + leak).not.toContain(leak);
  expect((dbStored() as { headline: string }).headline).toBe("Software Engineer");

  dbFix();
  await buttonNamed(page, "Save").click();
  await expect(statusWith(page, "Profile saved")).toHaveText("Profile saved");
  await expect(alertWith(page, SAVE_FAILED)).toHaveCount(0);
  expect(dbStored()).toEqual({ ...KEITH, headline: "Staff Engineer" });
  await context.close();
});

test("E2E-19: saving the profile does not change the public site", async ({ browser, baseURL, request }) => {
  dbReset();
  const first = await request.get("/");
  const html1 = await first.text();
  expect(html1).toContain("Keith Lim");
  expect(html1).toContain("Software engineer by profession, but a plant lover");

  const { context, page } = await openPanel(browser, baseURL as string);
  await openProfile(page);
  await field(page, "Name").fill("Someone Else");
  await field(page, "Headline").fill("H");
  await buttonNamed(page, "Add paragraph").click();
  await field(page, "About paragraph 1").fill("Someone Else about text.");
  await buttonNamed(page, "Save").click();
  await expect(statusWith(page, "Profile saved")).toHaveText("Profile saved");
  expect((dbStored() as { name: string }).name).toBe("Someone Else");

  const publicContext = await browser.newContext();
  const publicPage = await publicContext.newPage();
  const second = await publicContext.request.get("/");
  const html2 = await second.text();
  expect(html2).toBe(html1);
  expect(html2).not.toContain("Someone Else");
  expect(html2).not.toContain("Someone Else about text.");

  await publicPage.goto("/");
  const about = publicPage.locator("#about").first();
  await expect(about).toContainText("Software engineer by profession");
  await expect(about).not.toContainText("Someone Else");
  await publicContext.close();
  await context.close();
});

test("E2E-20: what is saved is trimmed, blank paragraphs and empty links are dropped, and the form shows the result", async ({
  browser,
  baseURL,
}) => {
  dbReset();
  const { context, page } = await openPanel(browser, baseURL as string);
  await openProfile(page);
  await field(page, "Name").fill("  Keith Lim  ");
  await field(page, "Headline").fill(" Software Engineer ");
  await buttonNamed(page, "Add paragraph").click();
  await field(page, "About paragraph 1").fill("   ");
  await buttonNamed(page, "Add paragraph").click();
  await field(page, "About paragraph 2").fill(" Kept paragraph. ");
  await buttonNamed(page, "Add social link").click();
  await buttonNamed(page, "Add social link").click();
  await field(page, "Social link 2 address").fill("https://example.org/x");
  await buttonNamed(page, "Add social link").click();
  await field(page, "Social link 3 label").fill("GitHub");
  await field(page, "Social link 3 address").fill(" https://github.com/example ");
  await buttonNamed(page, "Save").click();

  await expect(statusWith(page, "Profile saved")).toHaveText("Profile saved");
  expect(dbStored()).toEqual({
    name: "Keith Lim",
    headline: "Software Engineer",
    about: ["Kept paragraph."],
    photo: "",
    email: "",
    resumeLink: "",
    socialLinks: [
      { label: "", url: "https://example.org/x" },
      { label: "GitHub", url: "https://github.com/example" },
    ],
  });
  await expect(field(page, "Name")).toHaveValue("Keith Lim");
  await expect(field(page, "About paragraph 1")).toHaveValue("Kept paragraph.");
  await expect(field(page, "About paragraph 2")).toHaveCount(0);
  await expect(field(page, "Social link 1 label")).toHaveValue("");
  await expect(field(page, "Social link 1 address")).toHaveValue("https://example.org/x");
  await expect(field(page, "Social link 2 label")).toHaveValue("GitHub");
  await expect(field(page, "Social link 3 label")).toHaveCount(0);
  await context.close();
});

test("E2E-21: a stored record of the wrong shape fills the form field by field", async ({ browser, baseURL }) => {
  dbReset();
  fs.writeFileSync(
    DB_FILE,
    '{"profile":{"name":5,"headline":"Engineer","about":"not a list","photo":null,"email":["x"],"resumeLink":"/cv.pdf","socialLinks":[1,{"label":2,"url":"https://x.example"}]}}',
  );
  const { context, page } = await openPanel(browser, baseURL as string);
  await openProfile(page);

  await expect(field(page, "Headline")).toHaveValue("Engineer");
  await expect(field(page, "Name")).toHaveValue("");
  await expect(aboutItems(page)).toHaveCount(0);
  await expect(field(page, "Photo path")).toHaveValue("");
  await expect(field(page, "Email")).toHaveValue("");
  await expect(field(page, "Resume link")).toHaveValue("/cv.pdf");
  await expect(field(page, "Social link 1 label")).toHaveValue("");
  await expect(field(page, "Social link 1 address")).toHaveValue("https://x.example");
  await expect(field(page, "Social link 2 label")).toHaveCount(0);
  await expect(page.getByText(NO_PROFILE)).toHaveCount(0);
  await context.close();
});

test("E2E-22: a double click on Save sends one request, disables the form while it runs and enables it after", async ({
  browser,
  baseURL,
}) => {
  dbReset();
  dbSeed(KEITH);
  const { context, page } = await openPanel(browser, baseURL as string);
  await openProfile(page);
  await expect(field(page, "Name")).toHaveValue("Keith Lim");

  let puts = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/admin/profile/", async (route) => {
    if (route.request().method() === "PUT") {
      puts += 1;
      await gate;
    }
    await route.continue();
  });

  await buttonNamed(page, "Save").dblclick();
  await expect(statusWith(page, "Saving…")).toHaveText("Saving…");
  await expect(field(page, "Name")).toBeDisabled();
  await expect(field(page, "Headline")).toBeDisabled();
  await expect(buttonNamed(page, "Add paragraph")).toBeDisabled();
  await expect(buttonNamed(page, "Save")).toBeDisabled();
  await expect.poll(() => puts).toBe(1);

  release();
  await expect(statusWith(page, "Profile saved")).toHaveText("Profile saved");
  await expect(field(page, "Name")).toBeEnabled();
  await expect(buttonNamed(page, "Save")).toBeEnabled();
  expect(puts).toBe(1);
  await context.close();
});

test("E2E-23: a save with a session that is no longer valid shows the save message and keeps the typed values", async ({
  browser,
  baseURL,
}) => {
  dbReset();
  dbSeed(KEITH);
  const { context, page } = await openPanel(browser, baseURL as string);
  await openProfile(page);
  await expect(field(page, "Name")).toHaveValue("Keith Lim");
  await field(page, "Headline").fill("Staff Engineer");
  await context.addCookies([{ name: SESSION_COOKIE, value: "not-a-token", url: baseURL as string }]);
  await buttonNamed(page, "Save").click();

  await expect(alertWith(page, SAVE_FAILED)).toHaveText(SAVE_FAILED);
  await expect(field(page, "Headline")).toHaveValue("Staff Engineer");
  expect((dbStored() as { headline: string }).headline).toBe("Software Engineer");

  await page.reload();
  await expect(buttonNamed(page, "Sign in with Google")).toBeVisible();
  await expect(menu(page)).toHaveCount(0);
  await context.close();
});

test("E2E-24: a network failure on save shows the save message, keeps the typed values, and the next save works", async ({
  browser,
  baseURL,
}) => {
  dbReset();
  dbSeed(KEITH);
  const { context, page } = await openPanel(browser, baseURL as string);
  await openProfile(page);
  await expect(field(page, "Name")).toHaveValue("Keith Lim");
  await field(page, "Headline").fill("Staff Engineer");

  const abortPut = async (route: import("@playwright/test").Route) => {
    if (route.request().method() === "PUT") await route.abort("connectionfailed");
    else await route.continue();
  };
  await page.route("**/api/admin/profile/", abortPut);
  await buttonNamed(page, "Save").click();

  await expect(alertWith(page, SAVE_FAILED)).toHaveText(SAVE_FAILED);
  await expect(field(page, "Headline")).toHaveValue("Staff Engineer");
  await expect(page.getByText("Profile saved")).toHaveCount(0);
  expect((dbStored() as { headline: string }).headline).toBe("Software Engineer");

  await page.unroute("**/api/admin/profile/", abortPut);
  await buttonNamed(page, "Save").click();
  await expect(statusWith(page, "Profile saved")).toHaveText("Profile saved");
  expect((dbStored() as { headline: string }).headline).toBe("Staff Engineer");
  await context.close();
});

test("E2E-25: unsaved typing is dropped on a menu switch or a reload, with no dialog", async ({ browser, baseURL }) => {
  dbReset();
  dbSeed(KEITH);
  const { context, page } = await openPanel(browser, baseURL as string);
  const dialogs: string[] = [];
  page.on("dialog", (dialog) => {
    dialogs.push(dialog.type());
    void dialog.accept();
  });
  await openProfile(page);
  await expect(field(page, "Name")).toHaveValue("Keith Lim");
  await field(page, "Name").fill("Draft Name");

  await menu(page).getByRole("button", { name: "Blog posts", exact: true }).click();
  await expect(page.getByText("No posts yet.")).toBeVisible();
  await openProfile(page);
  await expect(field(page, "Name")).toHaveValue("Keith Lim");
  await field(page, "Name").fill("Draft Again");

  await reloadAndOpen(page);
  await expect(field(page, "Name")).toHaveValue("Keith Lim");
  expect(dialogs).toEqual([]);
  expect(dbStored()).toEqual(KEITH);
  await context.close();
});

test("E2E-26: two saves from two windows both succeed and the later one wins", async ({ browser, baseURL }) => {
  dbReset();
  dbSeed(KEITH);
  const a = await openPanel(browser, baseURL as string);
  const b = await openPanel(browser, baseURL as string);
  for (const { page } of [a, b]) {
    await openProfile(page);
    await expect(field(page, "Name")).toHaveValue("Keith Lim");
  }

  await field(a.page, "Headline").fill("From A");
  await buttonNamed(a.page, "Save").click();
  await expect(statusWith(a.page, "Profile saved")).toHaveText("Profile saved");

  await field(b.page, "Name").fill("From B");
  await buttonNamed(b.page, "Save").click();
  await expect(statusWith(b.page, "Profile saved")).toHaveText("Profile saved");
  await expect(b.page.getByRole("alert").filter({ hasText: /\S/ })).toHaveCount(0);
  expect(dbStored()).toEqual({ ...KEITH, name: "From B" });
  await a.context.close();
  await b.context.close();
});

test("E2E-27: the screen fits a 375-pixel phone and is styled from the theme tokens in light and dark", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(90000);
  const long = {
    name: "N".repeat(120),
    headline: "H".repeat(120),
    about: ["P".repeat(300)],
    photo: "",
    email: "e".repeat(100) + "@example.test",
    resumeLink: "https://example.org/" + "r".repeat(200),
    socialLinks: [{ label: "L".repeat(100), url: "https://example.org/" + "u".repeat(200) }],
  };
  const surfaceByTheme: Record<string, string> = {};

  for (const theme of ["light", "dark"]) {
    dbReset();
    dbSeed(long);
    const context = await ownerContext(browser, baseURL as string, { viewport: { width: 375, height: 800 } });
    const page = await context.newPage();
    await page.addInitScript((t) => {
      try {
        localStorage.setItem("theme", t);
      } catch {
        // storage unavailable: the page falls back to its default theme
      }
    }, theme);
    await page.goto(PANEL);
    await openProfile(page);
    await expect(field(page, "Name"), theme).toHaveValue(long.name);

    const widths = await page.evaluate(() => ({
      root: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
    }));
    expect(widths.root, theme + " root scrollWidth").toBeLessThanOrEqual(375);
    expect(widths.body, theme + " body scrollWidth").toBeLessThanOrEqual(375);
    const controls = await page.locator("input, textarea, button").all();
    expect(controls.length, theme + " controls").toBeGreaterThan(0);
    for (const control of controls) {
      const box = await control.boundingBox();
      if (box === null) continue;
      expect(box.x, theme + " control x").toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, theme + " control right edge").toBeLessThanOrEqual(375);
    }

    await field(page, "Name").fill("");
    await buttonNamed(page, "Save").click();
    const nameAlert = alertWith(page, "Name is required");
    await expect(nameAlert, theme).toHaveText("Name is required");

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
    const computed = (locator: ReturnType<typeof page.locator>, property: "background-color" | "color") =>
      locator.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), property);

    const surfaceAlt = await probe("backgroundColor", "--surface-alt");
    expect(await computed(field(page, "Name"), "background-color"), theme + " input").toBe(surfaceAlt);
    expect(await computed(page.getByText("Headline", { exact: true }).first(), "color"), theme + " label").toBe(
      await probe("color", "--foreground"),
    );
    expect(await computed(nameAlert, "color"), theme + " error").toBe(await probe("color", "--accent-rose"));
    if (theme === "dark") await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    surfaceByTheme[theme] = surfaceAlt;
    await context.close();
  }
  expect(surfaceByTheme.dark).not.toBe(surfaceByTheme.light);
});

test("E2E-28: nothing the browser receives carries a database setting or detail, and the screen's code names no server module", async ({
  browser,
  baseURL,
}) => {
  dbReset();
  dbSeed(BASE);
  const context = await ownerContext(browser, baseURL as string);
  const page = await context.newPage();
  const recorded: { url: string; method: string; type: string; text: string }[] = [];
  const pending: Promise<void>[] = [];
  page.on("response", (response) => {
    const type = response.headers()["content-type"] ?? "";
    if (!/html|javascript|json|css/i.test(type)) return;
    pending.push(
      response.text().then(
        (text) => {
          recorded.push({ url: response.url(), method: response.request().method(), type, text });
        },
        () => undefined,
      ),
    );
  });

  await page.goto(PANEL);
  await openProfile(page);
  await expect(field(page, "Name")).toHaveValue("Keith Lim");
  await field(page, "Headline").fill("Saved");
  await buttonNamed(page, "Save").click();
  await expect(statusWith(page, "Profile saved")).toHaveText("Profile saved");
  await page.reload();
  await page.waitForLoadState("networkidle");
  await Promise.all(pending);

  expect(recorded.some((r) => /javascript/i.test(r.type))).toBe(true);
  const apiResponses = recorded.filter((r) => r.url.includes(API));
  expect(apiResponses.some((r) => r.method === "GET")).toBe(true);
  expect(apiResponses.some((r) => r.method === "PUT")).toBe(true);
  const forbidden = ["SUPABASE_DB_URL", "stand-in:", DB_FILE, "ECONNREFUSED", "10.1.2.3"].filter((s) => s !== "");
  for (const r of recorded) {
    for (const text of forbidden) expect(r.text, r.url + " carries " + text).not.toContain(text);
  }

  const named = spawnSync(
    "git",
    [
      "grep",
      "--untracked",
      "-n",
      "-i",
      "firebase",
      "--",
      "src/app/components/admin/ProfileEditor.tsx",
      "src/app/components/admin/AdminPanel.tsx",
      "src/lib/server",
      "src/lib/admin/dblog.ts",
      "src/app/api/admin",
    ],
    { cwd: process.cwd(), encoding: "utf8" },
  );
  expect(named.stdout ?? "").toBe("");
  expect(named.status).toBe(1);

  const modules = spawnSync(
    "git",
    [
      "grep",
      "--untracked",
      "-n",
      "-E",
      "-e",
      "lib/server",
      "-e",
      "lib/auth",
      "-e",
      "next-auth",
      "-e",
      LIB,
      "-e",
      "server-only",
      "--",
      "src/app/components/admin/ProfileEditor.tsx",
    ],
    { cwd: process.cwd(), encoding: "utf8" },
  );
  expect(modules.stdout ?? "").toBe("");
  expect(modules.status).toBe(1);
  await context.close();
});

test("E2E-31: a request without the owner's session cannot change the profile, and the panel shows the stored one", async ({
  browser,
  baseURL,
  request,
}) => {
  dbReset();
  dbSeed(BASE);
  const sessions: (string | undefined)[] = [undefined, await cookieOf(OTHER()), await cookieOf(UNVERIFIED())];
  for (const cookie of sessions) {
    await apiGet(request, cookie);
    await apiPut(request, '{"name":"Defaced","headline":"Defaced"}', cookie);
  }

  const { context, page } = await openPanel(browser, baseURL as string);
  await openProfile(page);
  await expect(field(page, "Name")).toHaveValue("Keith Lim");
  await expect(field(page, "Headline")).toHaveValue("Software Engineer");
  expect(dbStored()).toEqual(BASE);
  await context.close();
});

// Step 4: the standing docs the database makes false.

test("E2E-29: the standing docs describe the database, the new route and the five settings, and the old Firebase profile files are gone", async () => {
  dbReset();

  expect(fs.existsSync("src/lib/firebase/profile.ts"), "src/lib/firebase/profile.ts").toBe(false);
  expect(fs.existsSync("e2e/manage-profile.spec.ts"), "e2e/manage-profile.spec.ts").toBe(false);

  const claude = fs.readFileSync("CLAUDE.md", "utf8");
  for (const text of [
    "SUPABASE_DB_URL",
    "/api/admin/profile/",
    "src/lib/server/",
    "stand-in:",
    "src/app/api/admin/**",
    "AUTH_SECRET",
    "/api/auth/callback/google",
  ]) {
    expect(claude, "CLAUDE.md contains " + text).toContain(text);
  }
  for (const text of ["The site reads four settings by name", "only API route"]) {
    expect(claude, "CLAUDE.md no longer contains " + text).not.toContain(text);
  }

  const profile = fs.readFileSync(".claude/repo-profile.md", "utf8");
  for (const text of ["SUPABASE_DB_URL", "stand-in:", "next start", "ADMIN_EMAIL"]) {
    expect(profile, "repo-profile.md contains " + text).toContain(text);
  }
  for (const text of ["There is no database, so no test database.", "reads four settings by name"]) {
    expect(profile, "repo-profile.md no longer contains " + text).not.toContain(text);
  }
});
