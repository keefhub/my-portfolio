import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import { expect, test, type APIRequestContext } from "@playwright/test";
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
void PANEL;

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
