import fs from "node:fs";
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
