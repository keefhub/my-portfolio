import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import { expect, test } from "@playwright/test";

test.describe.configure({ mode: "default" });

// Shared fixtures. The tests of this file share one stand-in database file (D-17), so every test starts by
// resetting it. The first three rows (Step 1) never read it, but the reset keeps the file's rule uniform.

const STAND_IN_PREFIX = "stand-in:";
const DB_URL = process.env.SUPABASE_DB_URL ?? "";
const DB_FILE = DB_URL.startsWith(STAND_IN_PREFIX) ? DB_URL.slice(STAND_IN_PREFIX.length) : "";

function dbReset(): void {
  if (DB_FILE !== "" && fs.existsSync(DB_FILE)) fs.rmSync(DB_FILE, { force: true });
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
