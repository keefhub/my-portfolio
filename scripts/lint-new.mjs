// Lint gate for the pipeline: fail on any ESLint error except the known baseline.
//
// `npm run lint` exits 1 today because of one pre-existing error, so a task cannot use it as a pass/fail
// signal. This runs ESLint, drops the baseline entries listed below, prints what is left in plain text and
// exits 1 only when something is left. Remove an entry from BASELINE when its error is fixed.
//
// usage: npm run lint:new

import { spawnSync } from "node:child_process";

const BASELINE = [
  // CLAUDE.md § Commands: known pre-existing failure, do not fix as a drive-by
  { file: "src/app/components/ThemeProvider.tsx", ruleId: "react-hooks/set-state-in-effect" },
];

const run = spawnSync("npx", ["eslint", ".", "-f", "json"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
let results;
try {
  results = JSON.parse(run.stdout);
} catch {
  console.error("lint:new: ESLint did not produce a JSON report");
  console.error((run.stderr || run.stdout || "").split("\n").slice(-30).join("\n"));
  process.exit(1);
}

const cwd = process.cwd() + "/";
const isBaseline = (rel, m) => BASELINE.some((b) => b.file === rel && b.ruleId === m.ruleId);

let errors = 0;
let warnings = 0;
let ignored = 0;
for (const r of results) {
  const rel = r.filePath.replace(cwd, "");
  for (const m of r.messages) {
    if (m.severity === 2 && isBaseline(rel, m)) {
      ignored++;
      continue;
    }
    if (m.severity === 2) errors++;
    else warnings++;
    console.log(`${rel}:${m.line}:${m.column}  ${m.severity === 2 ? "error" : "warning"}  ${m.message}  ${m.ruleId ?? ""}`);
  }
}
console.log(`lint:new: ${errors} error(s), ${warnings} warning(s), ${ignored} known baseline error(s) ignored`);
process.exit(errors > 0 ? 1 : 0);
