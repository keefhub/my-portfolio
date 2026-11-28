import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { expect, test } from "@playwright/test";

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
