// Runs a command, keeps its whole output in a log file, and prints a short digest instead.
//
// usage:
//   npm run -s verify -- <command> [args...]            e.g. npm run -s verify -- npx vitest run tests/auth
//   npm run -s verify -- "<shell command string>"       one argument is run as a shell string (&&, pipes)
//   npm run -s verify -- --log <path> <command ...>     choose the log path (default .run-logs/verify/<time>-<hash>.log)
//   VERIFY_COMMAND="<shell string>" [VERIFY_LOG=<path>] npm run -s verify     no argument quoting at all
//
// The command runs under bash with its stdout and stderr written to the log. Playwright and Vitest also write their
// JSON reports (<log>.playwright.json, <log>.vitest.json) through the reporter settings in playwright.config.ts and
// vitest.config.ts, which the digest reads as data. The digest is at most 90 lines whatever the output: the
// command, the exit status, the log path, and per section the counts and each failure's `file:line`, title and the
// first lines of its error. Exit status: the command's own.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  formatDigest,
  parseBuild,
  parseEslint,
  parsePlaywright,
  parseTsc,
  parseVitest,
  type PlaywrightReport,
  type Section,
  type VitestReport,
} from "./parse";

const shellQuote = (arg: string): string => `'${arg.replace(/'/g, `'\\''`)}'`;

function readJson<T>(file: string): T | null {
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return null; // a report cut off by a crash: the digest then falls back to the end of the log
  }
}

function main(): void {
  const args = process.argv.slice(2);
  let logPath = process.env.VERIFY_LOG;
  while (args[0] === "--log") {
    logPath = args[1];
    args.splice(0, 2);
  }
  const command = process.env.VERIFY_COMMAND ?? (args.length === 1 ? args[0] : args.map(shellQuote).join(" "));
  const shown = process.env.VERIFY_COMMAND ?? args.join(" ");
  if (!command || command.trim() === "") {
    console.error("usage: npm run -s verify -- [--log <path>] <command> [args...]");
    process.exitCode = 2;
    return;
  }

  const root = process.cwd().replace(/\\/g, "/");
  if (!logPath) {
    const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
    const hash = createHash("sha1").update(command).digest("hex").slice(0, 6);
    logPath = `.run-logs/verify/${stamp}-${hash}.log`;
  }
  const base = logPath.replace(/\.[^./\\]+$/, "");
  const playwrightJson = path.resolve(`${base}.playwright.json`);
  const vitestJson = path.resolve(`${base}.vitest.json`);
  fs.mkdirSync(path.dirname(path.resolve(logPath)), { recursive: true });
  for (const stale of [playwrightJson, vitestJson]) fs.rmSync(stale, { force: true });

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NO_COLOR: "1",
    VERIFY_PLAYWRIGHT_JSON: playwrightJson,
    VERIFY_VITEST_JSON: vitestJson,
  };
  delete env.FORCE_COLOR;
  // The command is run by this script, never by a script it starts: a test that runs `verify` inside `npm run test`
  // would otherwise inherit VERIFY_COMMAND from the gate and start `npm run test` again, without end.
  delete env.VERIFY_COMMAND;
  delete env.VERIFY_LOG;

  const started = Date.now();
  const fd = fs.openSync(logPath, "w");
  const result = spawnSync("bash", ["-c", command], { stdio: ["ignore", fd, fd], env });
  fs.closeSync(fd);
  const seconds = (Date.now() - started) / 1000;
  const exitCode = result.status ?? 1;
  if (result.error) fs.appendFileSync(logPath, `\nverify: could not run the command: ${result.error.message}\n`);

  const text = fs.readFileSync(logPath, "utf8");
  const sections: Section[] = [];
  const pw = readJson<PlaywrightReport>(playwrightJson);
  if (pw) sections.push(parsePlaywright(pw));
  const vt = readJson<VitestReport>(vitestJson);
  if (vt) sections.push(parseVitest(vt, root));
  for (const section of [parseTsc(text), parseEslint(text, root), parseBuild(text, exitCode)]) {
    if (section) sections.push(section);
  }

  // The end of the log, without blank lines, the `> package@version script` banners npm prints and stack frames
  // (when a run crashes, the frames fill the last lines and push the error message out of them).
  const logTail = text.split("\n").filter((l) => l.trim() !== "" && !/^>\s/.test(l) && !/^\s+at\s+\S/.test(l));
  console.log(formatDigest({ command: shown, exitCode, seconds, logPath, sections, logTail }));
  process.exitCode = exitCode;
}

main();
