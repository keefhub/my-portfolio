// Turns the output of a test, lint, type or build run into a short digest that an agent can read instead of the log.
//
// Pure functions. Test results come from the reporters' own JSON (Playwright's and Vitest's), so they are data and
// not scraped text; type, lint and build output is matched on its fixed formats. Nothing here guesses: a run that
// failed and produced no recognised report is shown as such, with the end of its log, never as a clean result.

import path from "node:path";

/** `level` is FAIL unless stated; a lint warning is WARN. */
export type Failure = { id: string; where: string; message: string[]; level?: "FAIL" | "WARN" };
export type Section = { kind: string; summary: string; failures: Failure[]; notes: string[] };

const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;
const LINE_WIDTH = 200;
const MESSAGE_LINES = 6;
export const MAX_FAILURES = 8;
export const MAX_DIGEST_LINES = 90;

export const stripAnsi = (text: string): string => text.replace(ANSI, "");

const norm = (p: string): string => p.replace(/\\/g, "/");
const clip = (line: string): string => (line.length > LINE_WIDTH ? `${line.slice(0, LINE_WIDTH - 1)}…` : line);

/**
 * The part of an error message worth reading: no colour codes, no blank lines, and nothing from the first stack frame
 * or `Call log:` on, since the log holds those. At most `max` lines, each at most 200 characters.
 */
export function cleanMessage(raw: string, max: number = MESSAGE_LINES): string[] {
  const kept: string[] = [];
  for (const line of stripAnsi(raw).replace(/\r/g, "").split("\n")) {
    if (/^\s*Call log:/.test(line) || /^\s+at\s+\S/.test(line)) break;
    if (line.trim() === "") continue;
    kept.push(clip(line.trimEnd()));
  }
  if (kept.length <= max) return kept;
  return [...kept.slice(0, max), `… ${kept.length - max} more line(s) in the log`];
}

const isAbsolute = (p: string): boolean => p.startsWith("/") || /^[A-Za-z]:\//.test(p);

function relativeTo(root: string, file: string): string {
  const f = norm(file);
  const r = norm(root).replace(/\/$/, "");
  if (r && f.toLowerCase().startsWith(`${r.toLowerCase()}/`)) return f.slice(r.length + 1);
  return f;
}

// ---------------------------------------------------------------------------------------------------
// Playwright (JSON reporter)

type PwResult = {
  error?: { message?: string; location?: { file?: string; line?: number } };
  errors?: { message?: string }[];
};
type PwTest = { status: string; results?: PwResult[] };
type PwSpec = { title: string; file: string; line: number; tests?: PwTest[] };
type PwSuite = { specs?: PwSpec[]; suites?: PwSuite[] };
export type PlaywrightReport = {
  config?: { rootDir?: string; projects?: { testDir?: string }[] };
  suites?: PwSuite[];
  errors?: { message?: string }[];
  stats?: { expected: number; unexpected: number; flaky: number; skipped: number };
};

export function parsePlaywright(report: PlaywrightReport): Section {
  const rootDir = norm(report.config?.rootDir ?? "");
  const testDir = norm(report.config?.projects?.[0]?.testDir ?? rootDir);
  const display = (file: string): string => {
    const f = norm(file);
    return relativeTo(rootDir, isAbsolute(f) ? f : path.posix.join(testDir, f));
  };

  const failures: Failure[] = [];
  const flaky: string[] = [];
  const visit = (suites: PwSuite[] | undefined): void => {
    for (const suite of suites ?? []) {
      for (const spec of suite.specs ?? []) {
        for (const test of spec.tests ?? []) {
          const where = `${display(spec.file)}:${spec.line}`;
          if (test.status === "flaky") flaky.push(`${where}  ${spec.title}`);
          if (test.status !== "unexpected") continue;
          const last = test.results?.[test.results.length - 1];
          const raw = last?.error?.message ?? last?.errors?.[0]?.message ?? "";
          const message = raw ? cleanMessage(raw) : ["(no error message in the report)"];
          const at = last?.error?.location;
          if (at?.file && at.line !== undefined) {
            const atText = `${display(at.file)}:${at.line}`;
            if (atText !== where) message.unshift(`at ${atText}`);
          }
          failures.push({ id: spec.title, where, message });
        }
      }
      visit(suite.suites);
    }
  };
  visit(report.suites);
  for (const error of report.errors ?? []) {
    failures.push({ id: "(run error)", where: "", message: cleanMessage(error.message ?? "") });
  }

  const s = report.stats ?? { expected: 0, unexpected: failures.length, flaky: flaky.length, skipped: 0 };
  const total = s.expected + s.unexpected + s.flaky + s.skipped;
  return {
    kind: "playwright",
    summary: `${s.expected} passed, ${s.unexpected} failed, ${s.flaky} flaky, ${s.skipped} skipped (of ${total})`,
    failures,
    notes: flaky.map((f) => `FLAKY ${f}`),
  };
}

// ---------------------------------------------------------------------------------------------------
// Vitest (JSON reporter)

type VtAssertion = { fullName: string; status: string; failureMessages?: string[] };
type VtFile = { name: string; status: string; message?: string; assertionResults: VtAssertion[] };
export type VitestReport = {
  numTotalTests: number;
  numPassedTests: number;
  numFailedTests: number;
  numPendingTests: number;
  testResults: VtFile[];
};

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function parseVitest(report: VitestReport, root: string): Section {
  const failures: Failure[] = [];
  let filesNotRun = 0;
  for (const file of report.testResults) {
    const rel = relativeTo(root, file.name);
    if (file.status === "failed" && file.assertionResults.length === 0) {
      filesNotRun++;
      failures.push({ id: "(file did not run)", where: rel, message: cleanMessage(file.message ?? "") });
      continue;
    }
    for (const test of file.assertionResults) {
      if (test.status !== "failed") continue;
      const raw = test.failureMessages?.[0] ?? "";
      // Vitest gives no line per test: take the first stack frame inside the test file.
      const frame = new RegExp(`${escapeRegExp(path.posix.basename(norm(file.name)))}:(\\d+):\\d+`).exec(stripAnsi(raw));
      failures.push({
        id: test.fullName,
        where: frame ? `${rel}:${frame[1]}` : rel,
        message: raw ? cleanMessage(raw) : ["(no failure message in the report)"],
      });
    }
  }
  const failed = report.numFailedTests;
  const parts = [`${report.numPassedTests} passed`, `${failed} failed`, `${report.numPendingTests} skipped`];
  if (filesNotRun > 0) parts.push(`${filesNotRun} file(s) did not run`);
  return { kind: "vitest", summary: `${parts.join(", ")} (of ${report.numTotalTests})`, failures, notes: [] };
}

// ---------------------------------------------------------------------------------------------------
// Text formats: tsc, eslint (stylish), next build

export function parseTsc(text: string): Section | null {
  const failures: Failure[] = [];
  for (const line of stripAnsi(text).split("\n")) {
    const m = /^(.+?)\((\d+),\d+\): error (TS\d+): (.*)$/.exec(line.trimEnd());
    if (m) failures.push({ id: m[3], where: `${norm(m[1])}:${m[2]}`, message: [clip(m[4])] });
  }
  if (failures.length === 0) return null;
  return { kind: "typecheck", summary: `${failures.length} type error(s)`, failures, notes: [] };
}

export function parseEslint(text: string, root: string): Section | null {
  const errors: Failure[] = [];
  const warnings: Failure[] = [];
  let current = "";
  let summary: string | null = null;
  for (const raw of stripAnsi(text).split("\n")) {
    const line = raw.trimEnd();
    const total = /^✖\s+(\d+ problems? \(.*\))/.exec(line);
    if (total) summary = total[1];
    if (/^\S/.test(line) && !line.startsWith("✖") && !line.startsWith(">") && line.trim() !== "") current = line.trim();
    const m = /^\s+(\d+):\d+\s+(error|warning)\s+(.*?)\s{2,}(\S+)$/.exec(line);
    if (!m) continue;
    const failure: Failure = {
      id: m[4],
      where: `${relativeTo(root, current)}:${m[1]}`,
      message: [`${m[2]}: ${clip(m[3])}`],
      level: m[2] === "error" ? "FAIL" : "WARN",
    };
    (m[2] === "error" ? errors : warnings).push(failure);
  }
  if (errors.length === 0 && warnings.length === 0 && !summary) return null;
  return {
    kind: "lint",
    summary: summary ?? `${errors.length} error(s), ${warnings.length} warning(s)`,
    failures: [...errors, ...warnings],
    notes: [],
  };
}

/**
 * `next build` prints "Compiled successfully" before its type check runs, so success is only claimed for exit 0.
 * A failed type check is reported by the type errors themselves (tsc's format); a failed compile has a block of its own.
 */
export function parseBuild(text: string, exitCode: number): Section | null {
  const clean = stripAnsi(text);
  if (exitCode === 0) {
    return /Compiled successfully|Creating an optimized production build/.test(clean)
      ? { kind: "build", summary: "build ok", failures: [], notes: [] }
      : null;
  }
  if (/Failed to type check/.test(clean)) {
    return { kind: "build", summary: "build failed at the type check (the type errors are listed with it)", failures: [], notes: [] };
  }
  const lines = clean.split("\n");
  const at = lines.findIndex((l) => /Failed to compile|Build error occurred|Module not found/.test(l));
  if (at === -1) return null;
  const block = cleanMessage(lines.slice(at, at + 40).join("\n"), 12);
  return { kind: "build", summary: "build failed", failures: [{ id: "next build", where: "", message: block }], notes: [] };
}

// ---------------------------------------------------------------------------------------------------
// The digest

export type DigestInput = {
  command: string;
  exitCode: number;
  seconds: number;
  logPath: string;
  sections: Section[];
  /** The last lines of the log, for a run that produced no recognised report or failed without a failure. */
  logTail: string[];
};

const tailLines = (lines: string[], n: number): string[] =>
  lines.slice(-n).map((l) => `  | ${clip(l)}`);

export function formatDigest(input: DigestInput): string {
  const out: string[] = [
    `VERIFY  ${clip(input.command)}`,
    `EXIT    ${input.exitCode}  (${input.seconds.toFixed(1)}s)`,
    `LOG     ${input.logPath}`,
  ];
  let anyFailure = false;
  for (const section of input.sections) {
    out.push(`[${section.kind}] ${section.summary}`);
    section.failures.slice(0, MAX_FAILURES).forEach((f) => {
      out.push(`${f.level ?? "FAIL"} ${f.where ? `${f.where}  ` : ""}${f.id}`);
      for (const line of f.message) out.push(`  | ${line}`);
    });
    if (section.failures.some((f) => (f.level ?? "FAIL") === "FAIL")) anyFailure = true;
    if (section.failures.length > MAX_FAILURES) {
      out.push(`… and ${section.failures.length - MAX_FAILURES} more failure(s); the LOG has them all`);
    }
    for (const note of section.notes.slice(0, 5)) out.push(note);
  }
  if (input.exitCode !== 0 && !anyFailure) {
    out.push(
      input.sections.length === 0
        ? "RESULT failed, and the run produced no report this tool recognises. End of the log:"
        : "RESULT failed (non-zero exit) although no failing test was reported. End of the log:",
    );
    out.push(...tailLines(input.logTail, 15));
  } else if (input.exitCode === 0 && input.sections.length === 0) {
    out.push("RESULT ok");
    out.push(...tailLines(input.logTail, 2));
  }
  if (out.length > MAX_DIGEST_LINES) {
    return [...out.slice(0, MAX_DIGEST_LINES), `(digest cut at ${MAX_DIGEST_LINES} lines; the LOG has the rest)`].join("\n");
  }
  return out.join("\n");
}
