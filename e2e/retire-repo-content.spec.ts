import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  expect,
  request as playwrightRequest,
  test,
  type APIRequestContext,
} from "@playwright/test";
import { encode } from "next-auth/jwt";

const FIVE_DOCS = [
  "README.md",
  "Reference.md",
  "CLAUDE.md",
  "docs/features/OVERVIEW.md",
  ".claude/repo-profile.md",
];
const FOUR_DOCS = FIVE_DOCS.slice(0, 4);

const OLD_PHRASES = [
  "prerendered",
  "content/blog",
  "at build time",
  "build-time",
  "baked at build",
  "held in the components",
  "embedded in components",
  "frontmatter validation",
  "duplicate blog slug",
  "renders from the repo",
];

const HASHES = [
  "58b1d9f",
  "21b2aae",
  "b61ba7b",
  "adda6c3",
  "b057997",
  "7a142c7",
];

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").toLowerCase();
}

function oldPhraseHits(text: string): string[] {
  const norm = normalize(text);
  return OLD_PHRASES.filter((p) => norm.includes(p));
}

function read(file: string): string {
  return fs.readFileSync(file, "utf8");
}

test("E2E-01: the standing documents no longer describe repo-held content or build-time rendering", () => {
  // Control: the check must be able to fail.
  expect(oldPhraseHits("pages are prerendered at build time")).toEqual(
    expect.arrayContaining(["prerendered", "at build time"]),
  );

  for (const file of FIVE_DOCS) {
    expect(oldPhraseHits(read(file)), `${file} still holds old text`).toEqual(
      [],
    );
  }
});

test("E2E-02: each standing document says content lives only in the database and is refreshed by Publish", () => {
  for (const file of FOUR_DOCS) {
    const text = read(file);
    expect(text, file).toMatch(/content lives only in (the database|supabase)/i);
    expect(text, file).toContain("presses Publish");
  }
});

test("E2E-03: the pull request template flags the rewrite and Reference.md records the removing commits", () => {
  const template = read(".github/pull_request_template.md");
  const lines = template.split("\n");

  expect(lines.filter((l) => l.trimEnd() === "## Standing rules rewritten"))
    .toHaveLength(1);
  const start = lines.findIndex((l) => l.trimEnd() === "## Standing rules rewritten");
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].startsWith("## ")) {
      end = i;
      break;
    }
  }
  const section = lines.slice(start, end).join("\n").toLowerCase();
  for (const word of ["reference.md", "rewritten", "do not merge", ...HASHES]) {
    expect(section, `template section lacks ${word}`).toContain(word);
  }

  expect(
    lines.filter((l) => l.trimEnd() === "## Settings to set in Vercel"),
  ).toHaveLength(1);

  const reference = read("Reference.md").split("\n");
  const refStart = reference.findIndex(
    (l) => l.trimEnd() === "## Content removed from the repository",
  );
  expect(refStart, "Reference.md lacks the removed-content section").toBeGreaterThanOrEqual(0);
  const after = reference.slice(refStart).join("\n");
  for (const hash of HASHES) {
    expect(after, `Reference.md lacks ${hash}`).toContain(hash);
  }
  expect(after).toContain("git show");

  for (const hash of HASHES) {
    const r = spawnSync("git", ["cat-file", "-t", hash], { encoding: "utf8" });
    expect(r.stdout.trim(), `git cat-file -t ${hash}`).toBe("commit");
  }
});


// ---------------------------------------------------------------------------
// File-scan checks (E2E-04 to E2E-11)
// ---------------------------------------------------------------------------

const BASE = "89e2b170134a99d4533a8c0ab654fe55f763c9ab";

const SETTING_NAMES = [
  "AUTH_SECRET",
  "AUTH_GOOGLE_ID",
  "AUTH_GOOGLE_SECRET",
  "ADMIN_EMAIL",
  "SUPABASE_DB_URL",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
];

const TEXT_PATHS = [
  "src",
  "public",
  "scripts",
  ".github",
  "next.config.ts",
  "vercel.json",
  "playwright.config.ts",
  "package.json",
  "README.md",
  "CLAUDE.md",
  "Reference.md",
  ".claude/repo-profile.md",
];

function git(cwd: string, args: string[]) {
  const r = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return { status: r.status, out: r.stdout ?? "" };
}

/** Run git grep (untracked included, binary skipped); returns matching lines. */
function gitGrep(cwd: string, flags: string[], pattern: string, paths: string[]): string[] {
  const r = git(cwd, [
    "grep",
    "--untracked",
    "-I",
    ...flags,
    "-e",
    pattern,
    "--",
    ...paths,
  ]);
  if (r.status !== 0 && r.status !== 1) {
    throw new Error(`git grep failed with status ${r.status}`);
  }
  return r.out.split("\n").filter((l) => l.length > 0);
}

function withTempRepo<T>(files: Record<string, string>, fn: (dir: string) => T): T {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "scan-"));
  try {
    git(dir, ["init", "-q"]);
    for (const [rel, body] of Object.entries(files)) {
      const full = path.join(dir, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, body);
    }
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function matchedFiles(lines: string[]): string[] {
  return [...new Set(lines.map((l) => l.split(":")[0]))];
}

function phraseScan(cwd: string, phrase: string, paths: string[]): string[] {
  return gitGrep(cwd, ["-i", "-F", "-n"], phrase, paths);
}

const OLD_CONTENT_PHRASES = [
  "yylim-keith",
  "keefhub",
  "Oh yes, and my name is Keith",
  "Software engineer by profession, but a plant lover",
  "Resorts World Sentosa",
  "ST Engineering Defence Aerospace",
  "Dimerco Express Group",
  "Nanyang Technological University",
  "Welfare Services Club",
  "sqlserver.png",
  "kaafei.org",
  "primeunity.biz",
  "Prime Unity Electronics",
  "CloudHacks",
  "Mobile App for Travel Planning",
  "My mum has too many recipes",
  "Professional Scrum Developer",
  "Certified Blockchain Developer",
  "Google IT Automation with Python",
  "7d656748-f230-421f-992b-2af88ce8c022",
  "DGLR364HW5KZ",
  "Hello, World — Welcome to My Blog",
  "Building a Portfolio with Next.js and Tailwind CSS",
  "A walkthrough of how I built this portfolio site",
];

test("E2E-04: none of the old content text is left in the project's files", () => {
  const control = withTempRepo({ "src/x.txt": "Resorts World Sentosa\n" }, (dir) =>
    matchedFiles(phraseScan(dir, "Resorts World Sentosa", TEXT_PATHS)),
  );
  expect(control).toContain("src/x.txt");

  for (const phrase of OLD_CONTENT_PHRASES) {
    const hits = phraseScan(".", phrase, TEXT_PATHS);
    expect(hits, `phrase "${phrase}" found`).toEqual([]);
  }
});

const LITERAL_PATTERN = "https?://|mailto:|/icons/|/certs/|/profile/|/images/";
const LIST_PATTERN =
  "(experience|project|certification|techStack|socialLink|social)[A-Za-z]*(\\s*:\\s*[^=]+)?\\s*=\\s*\\[\\s*(\\{|\")";
const COMPONENT_PATHS = [
  "src/app/page.tsx",
  ":(glob)src/app/components/*.tsx",
  ":(glob)src/app/components/blog/*.tsx",
];

test("E2E-05: no component holds a literal content list or a hard-coded link or image address", () => {
  const control = withTempRepo(
    {
      "src/app/components/x.tsx": 'const projects = [{ title: "x" }]\n',
      "src/app/components/y.tsx": 'const a = { href: "https://example.org/a" }\n',
    },
    (dir) => ({
      list: matchedFiles(gitGrep(dir, ["-i", "-E", "-n"], LIST_PATTERN, COMPONENT_PATHS)),
      literal: matchedFiles(gitGrep(dir, ["-E", "-n"], LITERAL_PATTERN, COMPONENT_PATHS)),
    }),
  );
  expect(control.list).toContain("src/app/components/x.tsx");
  expect(control.literal).toContain("src/app/components/y.tsx");

  expect(
    gitGrep(".", ["-E", "-n"], LITERAL_PATTERN, COMPONENT_PATHS),
    "literal address found",
  ).toEqual([]);
  expect(
    gitGrep(".", ["-i", "-E", "-n"], LIST_PATTERN, COMPONENT_PATHS),
    "literal content list found",
  ).toEqual([]);
});

const POST_TERMS = [
  "content/blog",
  "getPublishedPosts",
  "getPostBySlug",
  "getFeaturedPosts",
  "estimateReadingTime",
  'from "gray-matter"',
];
const MD_OK_PREFIXES = ["docs/", "requirement/", "spec/", ".claude/", ".github/"];
const MD_OK_ROOT = ["README.md", "CLAUDE.md", "Reference.md"];

function repoContentProblems(dir: string): string[] {
  const problems: string[] = [];
  const listed = git(dir, ["ls-files", "--cached", "--others", "--exclude-standard"])
    .out.split("\n")
    .filter(Boolean);
  for (const f of listed) {
    if (f.startsWith("content/")) problems.push(`content entry ${f}`);
    if (/\.mdx?$/.test(f)) {
      const ok = MD_OK_PREFIXES.some((p) => f.startsWith(p)) || MD_OK_ROOT.includes(f);
      if (!ok) problems.push(`markdown file ${f}`);
    }
  }
  if (fs.existsSync(path.join(dir, "src/lib/blog/posts.ts"))) {
    problems.push("src/lib/blog/posts.ts exists");
  }
  for (const f of listed) {
    if (!(f.startsWith("src/") || f.startsWith("public/"))) continue;
    const full = path.join(dir, f);
    if (!fs.existsSync(full)) continue;
    let head: string;
    try {
      const buf = fs.readFileSync(full);
      if (buf.includes(0)) continue;
      head = buf.toString("utf8");
    } catch {
      continue;
    }
    const lines = head.split("\n");
    if (lines[0]?.trimEnd() === "---" && (lines[1] ?? "").startsWith("title:")) {
      problems.push(`front-matter file ${f}`);
    }
  }
  for (const term of POST_TERMS) {
    for (const hit of gitGrep(dir, ["-F", "-n"], term, ["src"])) {
      problems.push(`term "${term}" at ${hit.split(":").slice(0, 2).join(":")}`);
    }
  }
  return problems;
}

test("E2E-06: no post file, front-matter file or post-reading code is left", () => {
  const control = withTempRepo(
    {
      "content/blog/a.md": "---\ntitle: x\n---\nbody\n",
      "src/lib/p.ts": "export const x = getPostBySlug;\n",
    },
    (dir) => repoContentProblems(dir),
  );
  expect(control.some((p) => p.startsWith("content entry content/blog/a.md"))).toBe(true);
  expect(control.some((p) => p.includes("getPostBySlug"))).toBe(true);

  expect(repoContentProblems("."), "post content left in the project").toEqual([]);
});

type Manifest = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

function addedOrChanged(base: Manifest, current: Manifest): string[] {
  const out: string[] = [];
  for (const group of ["dependencies", "devDependencies"] as const) {
    const b = base[group] ?? {};
    const c = current[group] ?? {};
    for (const [name, version] of Object.entries(c)) {
      if (!(name in b) || b[name] !== version) out.push(name);
    }
  }
  return out;
}

test("E2E-07: no dependency or lock package was added since the baseline", () => {
  expect(
    addedOrChanged(
      { dependencies: { a: "1" } },
      { dependencies: { a: "1", b: "2" } },
    ),
  ).toEqual(["b"]);

  const show = (file: string) => {
    const r = git(".", ["show", `${BASE}:${file}`]);
    expect(r.status, `git show ${BASE}:${file}`).toBe(0);
    return JSON.parse(r.out);
  };
  const basePkg = show("package.json") as Manifest;
  const curPkg = JSON.parse(fs.readFileSync("package.json", "utf8")) as Manifest;
  expect(addedOrChanged(basePkg, curPkg), "dependencies added or changed").toEqual([]);

  const baseLock = show("package-lock.json") as { packages?: Record<string, unknown> };
  const curLock = JSON.parse(fs.readFileSync("package-lock.json", "utf8")) as {
    packages?: Record<string, unknown>;
  };
  const baseKeys = new Set(Object.keys(baseLock.packages ?? {}));
  const added = Object.keys(curLock.packages ?? {}).filter((k) => !baseKeys.has(k));
  expect(added, "lock packages added").toEqual([]);
});

const ALLOWED_ENV_NAMES = [...SETTING_NAMES, "NODE_ENV", "NEXT_PHASE"];

function extractEnvNames(text: string): string[] {
  return [...text.matchAll(/process\.env\.([A-Z_]+)/g)].map((m) => m[1]);
}

test("E2E-08: the code reads only the seven settings and the build files are unchanged", () => {
  expect(extractEnvNames("process.env.EXTRA_SETTING")).toEqual(["EXTRA_SETTING"]);

  const lines = gitGrep(".", ["-o", "-E", "-n"], "process\\.env\\.[A-Z_]+", ["src"]);
  const names = [...new Set(lines.flatMap((l) => extractEnvNames(l)))];
  const unknown = names.filter((n) => !ALLOWED_ENV_NAMES.includes(n));
  expect(unknown, "unknown setting names read in src").toEqual([]);

  const diff = git(".", [
    "diff",
    "--quiet",
    BASE,
    "--",
    "vercel.json",
    "next.config.ts",
    ".github/workflows",
  ]);
  expect(diff.status, "vercel.json, next.config.ts or workflows changed").toBe(0);
});

test("E2E-09: no database address is written in the project's files", () => {
  const pattern = "supabase\\.(co|com|in)\\b|postgres(ql)?://|pooler\\.supabase";
  const paths = [...TEXT_PATHS, "docs/features/OVERVIEW.md"];
  const control = withTempRepo({ "src/x.ts": "abcdefgh.supabase.co\n" }, (dir) =>
    matchedFiles(gitGrep(dir, ["-i", "-E", "-n"], pattern, paths)),
  );
  expect(control).toContain("src/x.ts");

  expect(gitGrep(".", ["-i", "-E", "-n"], pattern, paths), "database address found").toEqual(
    [],
  );
});

function recursiveGrep(dir: string, value: string): string[] {
  const r = spawnSync("grep", ["-rIlF", "-e", value, dir], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return (r.stdout ?? "").split("\n").filter(Boolean);
}

const PLACEHOLDER_DOMAINS = ["example.com", "example.test", "example.org", "site.com"];

test("E2E-10: no setting value or real email is in the repository or the built output", () => {
  const names = [
    "AUTH_SECRET",
    "AUTH_GOOGLE_ID",
    "AUTH_GOOGLE_SECRET",
    "ADMIN_EMAIL",
    "SUPABASE_DB_URL",
    "SUPABASE_URL",
  ];
  const values: Record<string, string> = {};
  for (const n of names) {
    const v = process.env[n] ?? "";
    expect(v.length, `${n} is not set in the test run`).toBeGreaterThan(0);
    values[n] = v;
  }

  // Controls: the repository scan and the recursive scan can both find the value.
  const email = values.ADMIN_EMAIL;
  const repoControl = withTempRepo({ "src/x.ts": `${email}\n` }, (dir) =>
    matchedFiles(gitGrep(dir, ["-F", "-n"], email, ["."])),
  );
  expect(repoControl).toContain("src/x.ts");
  const dirControl = fs.mkdtempSync(path.join(os.tmpdir(), "scan-"));
  try {
    fs.writeFileSync(path.join(dirControl, "f.txt"), `${email}\n`);
    expect(recursiveGrep(dirControl, email).length).toBeGreaterThan(0);
  } finally {
    fs.rmSync(dirControl, { recursive: true, force: true });
  }

  for (const dir of [".next/server/app", ".next/static"]) {
    expect(fs.existsSync(dir), `${dir} is missing: run npm run build first`).toBe(true);
  }

  const inRepo: string[] = [];
  const inBuild: string[] = [];
  for (const n of names) {
    if (gitGrep(".", ["-F", "-l"], values[n], ["."]).length > 0) inRepo.push(n);
    for (const dir of [".next/server/app", ".next/static"]) {
      if (recursiveGrep(dir, values[n]).length > 0) inBuild.push(`${n} in ${dir}`);
    }
  }
  expect(inRepo, "setting values found in the repository").toEqual([]);
  expect(inBuild, "setting values found in the built output").toEqual([]);

  const emailLines = gitGrep(
    ".",
    ["-o", "-E", "-n"],
    "[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}",
    [
      "src",
      "scripts",
      "public",
      ".github",
      "next.config.ts",
      "vercel.json",
      "playwright.config.ts",
      "package.json",
      "README.md",
      "CLAUDE.md",
      "Reference.md",
      ".claude/repo-profile.md",
      "docs/features/OVERVIEW.md",
    ],
  );
  const badEmails = emailLines.filter((l) => {
    const domain = l.slice(l.lastIndexOf("@") + 1).toLowerCase();
    return !PLACEHOLDER_DOMAINS.includes(domain);
  });
  expect(
    badEmails.map((l) => l.split(":").slice(0, 2).join(":")),
    "non-placeholder email addresses",
  ).toEqual([]);
});

function consoleLineProblem(file: string, text: string): boolean {
  const allowed = ["src/lib/auth.ts", "src/lib/server/database.ts", "src/lib/server/storage.ts"];
  if (!allowed.includes(file)) return true;
  if (text.includes("process.env")) return true;
  return SETTING_NAMES.some((n) => text.includes(n));
}

test("E2E-11: no console call can log a setting", () => {
  expect(consoleLineProblem("src/lib/auth.ts", "console.log(process.env.AUTH_SECRET)")).toBe(true);

  const lines = gitGrep(".", ["-n"], "console\\.", ["src"]);
  const bad = lines.filter((l) => {
    const m = /^([^:]+):\d+:(.*)$/.exec(l);
    return !m || consoleLineProblem(m[1], m[2]);
  });
  expect(
    bad.map((l) => l.split(":").slice(0, 2).join(":")),
    "console call outside the allowed files or touching a setting",
  ).toEqual([]);
});


// ---------------------------------------------------------------------------
// Site checks (E2E-12 to E2E-18). E2E-19 and E2E-20 are manual rows: no test.
// ---------------------------------------------------------------------------

test.describe.configure({ mode: "serial" });
test.setTimeout(150000);

const STAND_IN_PREFIX = "stand-in:";
const DB_URL = process.env.SUPABASE_DB_URL ?? "";
const DB_FILE = DB_URL.startsWith(STAND_IN_PREFIX) ? DB_URL.slice(STAND_IN_PREFIX.length) : "";
const SESSION_COOKIE = "authjs.session-token";
const setting = (name: string): string => process.env[name] ?? "";

type Claims = { sub: string; email: string; name: string; emailVerified: boolean };
const OWNER = (): Claims => ({
  sub: "owner-1",
  email: setting("ADMIN_EMAIL"),
  name: "Owner Test",
  emailVerified: true,
});
const OTHER: Claims = {
  sub: "other-1",
  email: "mallory@example.test",
  name: "Mallory",
  emailVerified: true,
};

async function cookieOf(claims: Claims): Promise<string> {
  const value = await encode({
    token: { ...claims },
    secret: setting("AUTH_SECRET"),
    salt: SESSION_COOKIE,
    maxAge: 3600,
  });
  return SESSION_COOKIE + "=" + value;
}

const baseUrlOf = (): string =>
  String(test.info().project.use.baseURL ?? "http://localhost:3100");

async function withRequest<T>(
  base: string,
  run: (request: APIRequestContext) => Promise<T>,
): Promise<T> {
  const request = await playwrightRequest.newContext({ baseURL: base });
  try {
    return await run(request);
  } finally {
    await request.dispose();
  }
}

type Fetched = { status: number; headers: Record<string, string>; text: string; body: Buffer };

async function fetchFile(base: string, url: string, cookie?: string): Promise<Fetched> {
  return withRequest(base, async (request) => {
    const response = await request.get(url, {
      maxRedirects: 0,
      ...(cookie ? { headers: { cookie } } : {}),
    });
    const body = await response.body();
    return {
      status: response.status(),
      headers: response.headers(),
      text: body.toString("utf8"),
      body,
    };
  });
}

const textOf = async (base: string, url: string): Promise<string> =>
  (await fetchFile(base, url)).text;

async function waitHas(base: string, url: string, needle: string, present = true): Promise<void> {
  await expect
    .poll(async () => (await textOf(base, url)).includes(needle), { timeout: 60000 })
    .toBe(present);
}

async function ownerSend(
  base: string,
  method: "get" | "post" | "put",
  url: string,
  data?: unknown,
): Promise<{ status: number; json: unknown }> {
  return withRequest(base, async (request) => {
    const headers: Record<string, string> = { cookie: await cookieOf(OWNER()) };
    if (data !== undefined) headers["content-type"] = "application/json";
    const response = await request[method](url, {
      headers,
      maxRedirects: 0,
      ...(data !== undefined ? { data: JSON.stringify(data) } : {}),
    });
    let json: unknown = null;
    try {
      json = await response.json();
    } catch {
      json = null;
    }
    return { status: response.status(), json };
  });
}

async function publish(base: string): Promise<void> {
  const r = await ownerSend(base, "post", "/api/admin/publish/");
  expect(r.status).toBe(200);
  expect(r.json).toEqual({ published: true });
}

async function blank(base: string): Promise<void> {
  if (DB_FILE !== "" && fs.existsSync(DB_FILE)) fs.rmSync(DB_FILE, { force: true });
  await publish(base);
  await expect
    .poll(
      async () =>
        !(await textOf(base, "/")).includes('id="experience"') &&
        (await textOf(base, "/blog/")).includes("No posts yet"),
      { timeout: 60000, intervals: [250] },
    )
    .toBe(true);
}

const PROFILE = {
  name: "Retire Probe Person",
  headline: "Probe Headline Engineer",
  about: ["Probe about paragraph."],
  photo: "",
  email: "hello@example.com",
  resumeLink: "",
  socialLinks: [{ label: "GitHub", url: "https://github.com/example" }],
};

const EXPERIENCE = {
  position: 0,
  content: {
    year: "2026",
    title: "Probe Staff Engineer",
    company: "Probe Works Ltd",
    duration: "Jan 2026 - Present",
    description: "Probe description.",
    details: ["Probe detail one."],
  },
};
const TECH = {
  position: 0,
  content: {
    category: "Probe Category",
    tools: [{ name: "ProbeKit", icon: "/icons/react.png" }],
  },
};
const PROJECT = {
  position: 0,
  content: {
    title: "Probe Project",
    shortDesc: "Probe summary",
    description: ["Probe paragraph."],
    tech: ["React"],
    github: "https://github.com/example/probe",
    demo: "",
  },
};
const CERT = {
  position: 0,
  content: {
    name: "Probe Certificate",
    icon: "/certs/scrum.png",
    url: "https://example.com/credential/probe",
  },
};

const POST = {
  title: "Growing Pothos",
  excerpt: "How to keep a pothos happy indoors",
  date: "2026-05-15",
  slug: "retire-growing-pothos",
  tags: [] as string[],
  draft: false,
  featured: false,
  coverImage: "",
  coverAlt: "",
  body: "Pothos body words.\n",
};
const DRAFT = {
  ...POST,
  title: "Half Written Pothos Notes",
  excerpt: "Not ready yet",
  date: "2026-04-01",
  slug: "retire-half-written",
  draft: true,
  body: "Secret draft words.\n",
};

async function seedOk(base: string, url: string, body: unknown): Promise<void> {
  const r = await ownerSend(base, "post", url, body);
  expect(r.status, `POST ${url}`).toBe(200);
}

async function putProfile(base: string, profile: unknown): Promise<void> {
  const r = await ownerSend(base, "put", "/api/admin/profile/", profile);
  expect(r.status, "PUT profile").toBe(200);
}

async function seedPosts(base: string, posts: unknown[]): Promise<void> {
  for (const post of posts) await seedOk(base, "/api/admin/blog-posts/", { content: post });
}

async function seedFull(base: string): Promise<void> {
  await putProfile(base, PROFILE);
  await seedOk(base, "/api/admin/experience/", EXPERIENCE);
  await seedOk(base, "/api/admin/tech-stack/", TECH);
  await seedOk(base, "/api/admin/projects/", PROJECT);
  await seedOk(base, "/api/admin/certifications/", CERT);
  await seedPosts(base, [POST]);
}

async function scenario(run: (base: string) => Promise<void>): Promise<void> {
  const base = baseUrlOf();
  await blank(base);
  try {
    await run(base);
  } finally {
    await blank(base);
  }
}

test.afterAll(async () => {
  await blank(baseUrlOf());
});

test("E2E-12: published content shows on the home page and the blog", async ({ browser }) => {
  await scenario(async (base) => {
    await seedFull(base);
    await publish(base);
    await expect
      .poll(
        async () => {
          const home = await textOf(base, "/");
          const blog = await textOf(base, "/blog/");
          return home.includes("Probe Project") && blog.includes("Growing Pothos");
        },
        { timeout: 60000 },
      )
      .toBe(true);
    const home = await textOf(base, "/");
    for (const text of [
      "Retire Probe Person",
      "Probe Headline Engineer",
      "Probe Staff Engineer",
      "Probe Works Ltd",
      "Probe Category",
      "ProbeKit",
      "Probe Project",
      "Probe Certificate",
    ]) {
      expect(home, `home lacks ${text}`).toContain(text);
    }
    expect(await textOf(base, "/blog/")).toContain("Growing Pothos");

    const context = await browser.newContext({ baseURL: base });
    try {
      const page = await context.newPage();
      await page.goto("/");
      const nav = page.locator('nav[aria-label="Main navigation"]');
      for (const name of ["Experience", "Projects", "Certifications"]) {
        await expect(nav.getByRole("link", { name, exact: true })).toBeVisible();
      }
    } finally {
      await context.close();
    }
  });
});

test("E2E-13: a draft stays out of the blog, its address, the feed and the sitemap", async ({
  browser,
}) => {
  await scenario(async (base) => {
    await seedPosts(base, [POST, DRAFT]);
    await publish(base);
    await waitHas(base, "/blog/", "Growing Pothos");
    expect(await textOf(base, "/blog/")).not.toContain("Half Written Pothos Notes");

    const context = await browser.newContext({ baseURL: base });
    try {
      const page = await context.newPage();
      const response = await page.goto("/blog/retire-half-written/");
      expect(response?.status()).toBe(404);
      await expect(
        page.getByRole("heading", { level: 2, name: "This page could not be found.", exact: true }),
      ).toBeVisible();
      expect(await page.locator("body").innerText()).not.toContain("Secret draft words.");
    } finally {
      await context.close();
    }

    await waitHas(base, "/rss.xml", "Growing Pothos");
    const rss = await textOf(base, "/rss.xml");
    expect(rss).toContain("Growing Pothos");
    expect(rss).not.toContain("Half Written Pothos Notes");
    expect(rss).not.toContain("retire-half-written");

    await waitHas(base, "/sitemap.xml", "retire-growing-pothos");
    const sitemap = await textOf(base, "/sitemap.xml");
    expect(sitemap).toContain("retire-growing-pothos");
    expect(sitemap).not.toContain("retire-half-written");
  });
});

test("E2E-14: the public pages and scripts carry no setting value or name", async () => {
  await scenario(async (base) => {
    await seedFull(base);
    await publish(base);
    await waitHas(base, "/", "Probe Project");
    await waitHas(base, "/blog/", "Growing Pothos");

    const home = await textOf(base, "/");
    const blog = await textOf(base, "/blog/");
    const srcs = new Set<string>();
    for (const html of [home, blog]) {
      for (const m of html.matchAll(/<script[^>]*\ssrc="(\/_next\/[^"]+)"/g)) srcs.add(m[1]);
    }
    expect(srcs.size, "no script was found").toBeGreaterThan(0);

    const texts = [home, blog];
    for (const src of srcs) {
      const r = await fetchFile(base, src);
      expect(r.status, src).toBe(200);
      texts.push(r.text);
    }

    const values = ["ADMIN_EMAIL", "AUTH_SECRET", "AUTH_GOOGLE_SECRET", "SUPABASE_DB_URL"].map(
      (n) => {
        const v = setting(n);
        expect(v.length, `${n} is not set in the test run`).toBeGreaterThan(0);
        return v;
      },
    );
    const names = [
      "SUPABASE_SERVICE_ROLE_KEY",
      "SUPABASE_DB_URL",
      "postgres://",
      "postgresql://",
      "stand-in:",
    ];
    for (const text of texts) {
      for (const needle of [...values, ...names]) {
        expect(text.includes(needle), "a page or script holds a setting").toBe(false);
      }
    }
  });
});

test("E2E-15: addresses, redirects, feeds and the slash setting hold", async () => {
  await scenario(async (base) => {
    await seedPosts(base, [POST]);
    await publish(base);
    await expect
      .poll(async () => (await fetchFile(base, "/blog/retire-growing-pothos/")).status, {
        timeout: 60000,
      })
      .toBe(200);
    await waitHas(base, "/sitemap.xml", "retire-growing-pothos");

    for (const [from, to] of [
      ["/blog", "/blog/"],
      ["/blog/retire-growing-pothos", "/blog/retire-growing-pothos/"],
    ]) {
      const r = await fetchFile(base, from);
      expect([307, 308], `${from} status`).toContain(r.status);
      expect(new URL(r.headers["location"] ?? "", base).pathname).toBe(to);
    }
    for (const url of [
      "/",
      "/blog/",
      "/blog/retire-growing-pothos/",
      "/rss.xml",
      "/sitemap.xml",
      "/robots.txt",
    ]) {
      expect((await fetchFile(base, url)).status, url).toBe(200);
    }
    expect((await fetchFile(base, "/rss.xml")).headers["content-type"]).toContain("rss");
    const sitemap = await textOf(base, "/sitemap.xml");
    expect([...sitemap.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1])).toEqual([
      "https://thegoldenpothos.xyz/",
      "https://thegoldenpothos.xyz/blog/",
      "https://thegoldenpothos.xyz/blog/retire-growing-pothos/",
    ]);
    expect(fs.readFileSync("next.config.ts", "utf8")).toContain("trailingSlash: true");
    expect(JSON.parse(fs.readFileSync("vercel.json", "utf8")).trailingSlash).toBe(true);
  });
});

test("E2E-16: a post date reads the same in every time zone with no console error", async ({
  browser,
}) => {
  await scenario(async (base) => {
    await seedPosts(base, [POST]);
    await publish(base);
    await waitHas(base, "/blog/", "Growing Pothos");
    await expect
      .poll(async () => (await fetchFile(base, "/blog/retire-growing-pothos/")).status, {
        timeout: 60000,
      })
      .toBe(200);

    for (const timezoneId of ["Pacific/Kiritimati", "Pacific/Pago_Pago", "UTC"]) {
      const context = await browser.newContext({ baseURL: base, timezoneId });
      try {
        const page = await context.newPage();
        const errors: string[] = [];
        page.on("console", (m) => {
          if (m.type() === "error") errors.push(m.text());
        });
        page.on("pageerror", (e) => errors.push(String(e)));
        for (const address of ["/blog/", "/blog/retire-growing-pothos/"]) {
          await page.goto(address);
          const time = page.locator('time[datetime="2026-05-15"]').first();
          await expect(time, `${timezoneId} ${address}`).toHaveText("15 May 2026");
        }
        expect(errors, `${timezoneId} errors`).toEqual([]);
      } finally {
        await context.close();
      }
    }
  });
});

test("E2E-17: the profile photo is served as is, not through the image optimiser", async () => {
  await scenario(async (base) => {
    await putProfile(base, { ...PROFILE, photo: "/profile/placeholder.jpg" });
    await publish(base);
    await waitHas(base, "/", 'src="/profile/placeholder.jpg"');
    const home = await textOf(base, "/");
    expect(home).toContain('src="/profile/placeholder.jpg"');
    expect(home).not.toContain("/_next/image");
    const photo = await fetchFile(base, "/profile/placeholder.jpg");
    expect(photo.status).toBe(200);
    expect(photo.headers["content-type"]).toBe("image/jpeg");
    expect(photo.body.equals(fs.readFileSync("public/profile/placeholder.jpg"))).toBe(true);
    expect(fs.readFileSync("next.config.ts", "utf8")).toContain("unoptimized: true");
  });
});

test("E2E-18: only the owner can read, change or publish; the panel asks for sign-in", async ({
  browser,
}) => {
  await scenario(async (base) => {
    await putProfile(base, PROFILE);
    const defaced = { ...PROFILE, name: "Defaced Name" };
    const attempts = async (cookie?: string): Promise<number[]> =>
      withRequest(base, async (request) => {
        const headers: Record<string, string> = cookie ? { cookie } : {};
        const put = { ...headers, "content-type": "application/json" };
        const get = await request.get("/api/admin/profile/", { headers, maxRedirects: 0 });
        const putR = await request.put("/api/admin/profile/", {
          headers: put,
          data: JSON.stringify(defaced),
          maxRedirects: 0,
        });
        const pub = await request.post("/api/admin/publish/", { headers, maxRedirects: 0 });
        return [get.status(), putR.status(), pub.status()];
      });
    expect(await attempts()).toEqual([401, 401, 401]);
    expect(await attempts(await cookieOf(OTHER))).toEqual([403, 403, 403]);

    const context = await browser.newContext({ baseURL: base });
    try {
      const page = await context.newPage();
      await page.goto("/bright-warm-greenhouse/");
      await expect(
        page.getByRole("button", { name: "Sign in with Google", exact: true }),
      ).toBeVisible();
      await expect(page.getByRole("button", { name: "Publish", exact: true })).toHaveCount(0);
    } finally {
      await context.close();
    }

    const owner = await ownerSend(base, "get", "/api/admin/profile/");
    expect(owner.status).toBe(200);
    expect(JSON.stringify(owner.json)).toContain("Retire Probe Person");
    expect(JSON.stringify(owner.json)).not.toContain("Defaced Name");
  });
});
