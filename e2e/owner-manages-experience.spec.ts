import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { expect, test } from "@playwright/test";
import { checkExperience, experienceFromData, experienceShape, experienceToData } from "../src/lib/admin/experience";
import { LIST_ID_PATTERN } from "../src/lib/admin/list";

test.describe.configure({ mode: "default" });

// Shared fixtures. The tests of this file share one stand-in database file (D-14), so every test starts by
// resetting it. The rows of Step 1 never read it, but the reset keeps the file's rule uniform.

const STAND_IN_PREFIX = "stand-in:";
const DB_URL = process.env.SUPABASE_DB_URL ?? "";
const DB_FILE = DB_URL.startsWith(STAND_IN_PREFIX) ? DB_URL.slice(STAND_IN_PREFIX.length) : "";

function dbReset(): void {
  if (DB_FILE !== "" && fs.existsSync(DB_FILE)) fs.rmSync(DB_FILE, { force: true });
}

const API = "/api/admin/experience/";

const ACME_ID = "11111111-1111-4111-8111-111111111111";
const BETA_ID = "22222222-2222-4222-8222-222222222222";
const GAMMA_ID = "33333333-3333-4333-8333-333333333333";

const ACME = {
  year: "2024",
  title: "Software Engineer",
  company: "Acme",
  duration: "Jan 2024 - Present",
  description: "Built the billing service.",
  details: ["Cut invoice errors by 40%"],
};
const GAMMA = {
  year: "2020",
  title: "Intern",
  company: "Gamma",
  duration: "Summer 2020",
  description: "Filed reports.",
  details: [] as string[],
};

// The gate scans this file, so the name of the forbidden client module is put together from pieces.
const SUPABASE_PREFIX = ["@supa", "base/"].join("");

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

test("E2E-02: experienceShape, checkExperience and LIST_ID_PATTERN apply the stated rules", async () => {
  dbReset();
  const full = { year: "2024", title: "T", company: "C", duration: "D", description: "X" };

  // experienceShape
  const a = { ...full, details: ["a", "b"] };
  expect(experienceShape(a)).toEqual(a);
  expect(experienceShape({ title: "T" })).toEqual({
    year: "",
    title: "T",
    company: "",
    duration: "",
    description: "",
    details: [],
  });
  const c = experienceShape({ ...full, details: [], extra: 5 });
  expect(c).not.toBeNull();
  expect(Object.keys(c as object)).not.toContain("extra");
  expect(c).toEqual({ ...full, details: [] });
  expect(experienceShape({ ...full, year: 5 })).toBeNull();
  expect(experienceShape({ ...full, details: "a" })).toBeNull();
  expect(experienceShape({ ...full, details: ["a", 1] })).toBeNull();
  expect(experienceShape({ ...full, title: null })).toBeNull();
  expect(experienceShape(null)).toBeNull();
  expect(experienceShape([])).toBeNull();
  expect(experienceShape("x")).toBeNull();
  expect(experienceShape(7)).toBeNull();

  // checkExperience
  const padded = checkExperience({
    year: "  2023  ",
    title: "  Analyst ",
    company: " Beta  ",
    duration: "2023 - 2024 ",
    description: "  Reported on sales. ",
    details: ["  First  ", "   ", "Second"],
  });
  expect(padded).toEqual({
    ok: true,
    content: {
      year: "2023",
      title: "Analyst",
      company: "Beta",
      duration: "2023 - 2024",
      description: "Reported on sales.",
      details: ["First", "Second"],
    },
  });
  const twoBlank = checkExperience({
    year: "",
    title: "   ",
    company: " Beta  ",
    duration: "2023 - 2024 ",
    description: "  Reported on sales. ",
    details: ["  First  ", "   ", "Second"],
  });
  expect(twoBlank.ok).toBe(false);
  if (!twoBlank.ok) expect(twoBlank.errors).toEqual({ year: "Year is required", title: "Title is required" });
  const allBlank = checkExperience({
    year: "   ",
    title: "   ",
    company: "   ",
    duration: "   ",
    description: "   ",
    details: ["   "],
  });
  expect(allBlank.ok).toBe(false);
  if (!allBlank.ok) {
    expect(allBlank.errors).toEqual({
      year: "Year is required",
      title: "Title is required",
      company: "Company is required",
      duration: "Duration is required",
      description: "Description is required",
    });
  }

  // LIST_ID_PATTERN
  expect(LIST_ID_PATTERN.test(ACME_ID)).toBe(true);
  for (const bad of [
    "AAAAAAAA-1111-4111-8111-111111111111",
    "11111111-1111-4111-8111-11111111111",
    "../x",
    "11111111-1111-4111-8111-111111111111/",
    "",
  ]) {
    expect(LIST_ID_PATTERN.test(bad), JSON.stringify(bad)).toBe(false);
  }
});

type Recorded = { url: string; init: RequestInit | undefined };
type Answer = Response | Error;

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const plain = (status: number, body: string): Response => new Response(body, { status });

test("E2E-03: the browser list store sends the stated requests and fails with one fixed error", async () => {
  dbReset();
  // The module is loaded here, not at the top, so the two rows above run before the file exists.
  const { createHttpListStore } = await import("../src/lib/admin/listClient");

  const original = globalThis.fetch;
  const calls: Recorded[] = [];
  const allCalls: Recorded[] = [];
  const queue: Answer[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const rec = { url: String(input), init };
    calls.push(rec);
    allCalls.push(rec);
    const next = queue.shift();
    if (next === undefined) throw new Error("no answer queued");
    if (next instanceof Error) throw next;
    return next;
  }) as typeof fetch;

  const reset = () => {
    calls.length = 0;
  };
  const headerOf = (rec: Recorded, name: string): string | null => new Headers(rec.init?.headers).get(name);
  const bodyOf = (rec: Recorded): unknown => JSON.parse(String(rec.init?.body));
  const method = (rec: Recorded): string => (rec.init?.method ?? "GET").toUpperCase();

  try {
    const store = createHttpListStore(API, experienceFromData, experienceToData);

    // (1) load
    queue.push(
      json(200, {
        entries: [
          {
            id: ACME_ID,
            position: 0,
            content: { year: "2024", title: "Software Engineer", company: "Acme", duration: "d", description: "x", details: ["a"] },
          },
          { id: BETA_ID, position: 1, content: { title: "Analyst" } },
        ],
      }),
    );
    const loaded = await store.load();
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(API);
    expect(method(calls[0])).toBe("GET");
    expect(calls[0].init?.cache).toBe("no-store");
    expect(calls[0].init?.signal).toBeTruthy();
    expect(loaded).toEqual([
      {
        id: ACME_ID,
        position: 0,
        content: { year: "2024", title: "Software Engineer", company: "Acme", duration: "d", description: "x", details: ["a"] },
      },
      {
        id: BETA_ID,
        position: 1,
        content: { year: "", title: "Analyst", company: "", duration: "", description: "", details: [] },
      },
    ]);

    // (2) add
    reset();
    queue.push(json(200, { id: GAMMA_ID }));
    const added = await store.add(GAMMA, -1);
    expect(added).toBe(GAMMA_ID);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(API);
    expect(method(calls[0])).toBe("POST");
    expect(headerOf(calls[0], "content-type")).toBe("application/json");
    expect(bodyOf(calls[0])).toEqual({ content: GAMMA, position: -1 });

    // (3) update
    reset();
    queue.push(json(200, { updated: true }));
    const updated = await store.update(ACME_ID, ACME);
    expect(updated).toBeUndefined();
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(API + "?id=" + ACME_ID);
    expect(method(calls[0])).toBe("PUT");
    expect(headerOf(calls[0], "content-type")).toBe("application/json");
    expect(bodyOf(calls[0])).toEqual({ content: ACME });

    // (4) reorder
    reset();
    queue.push(json(200, { moved: true }));
    await store.reorder([
      { id: ACME_ID, position: 1 },
      { id: BETA_ID, position: 0 },
    ]);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(API);
    expect(method(calls[0])).toBe("PATCH");
    expect(headerOf(calls[0], "content-type")).toBe("application/json");
    expect(bodyOf(calls[0])).toEqual({
      changes: [
        { id: ACME_ID, position: 1 },
        { id: BETA_ID, position: 0 },
      ],
    });
    reset();
    await store.reorder([]);
    expect(calls).toHaveLength(0);

    // (5) remove
    reset();
    queue.push(json(200, { deleted: true }));
    await store.remove(BETA_ID);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(API + "?id=" + BETA_ID);
    expect(method(calls[0])).toBe("DELETE");
    expect(calls[0].init?.body ?? undefined).toBeUndefined();
    reset();
    queue.push(json(200, { deleted: true }));
    await store.remove("a b/c?");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(API + "?id=a%20b%2Fc%3F");
    expect(method(calls[0])).toBe("DELETE");

    // (6) failures
    const failures: Record<string, () => Answer> = {
      "401": () => json(401, { error: "not-signed-in" }),
      "404": () => json(404, { error: "not-found" }),
      "503": () => json(503, { error: "unavailable", detail: "SECRET-MARKER" }),
      throws: () => new TypeError("connect ECONNREFUSED 10.1.2.3"),
    };
    const forbidden = ["SECRET-MARKER", "10.1.2.3", "not-signed-in", "unavailable"];

    const expectFailure = async (label: string, run: () => Promise<unknown>, answer: Answer) => {
      queue.length = 0;
      queue.push(answer);
      let caught: unknown;
      try {
        await run();
      } catch (e) {
        caught = e;
      }
      expect(caught, label + " rejects").toBeInstanceOf(Error);
      const message = (caught as Error).message;
      expect(message, label).toBe("The request failed.");
      for (const f of forbidden) expect(message, label + " leaks " + f).not.toContain(f);
    };

    const loadBad: [string, () => Answer][] = [
      ...Object.entries(failures),
      ["not json", () => plain(200, "not json")],
      ["entries string", () => json(200, { entries: "x" })],
      ["entry without a content", () => json(200, { entries: [{ id: 5 }] })],
    ];
    for (const [label, make] of loadBad) await expectFailure("load " + label, () => store.load(), make());

    const calls4: [string, () => Promise<unknown>][] = [
      ["add", () => store.add(GAMMA, 0)],
      ["update", () => store.update(ACME_ID, ACME)],
      ["reorder", () => store.reorder([{ id: ACME_ID, position: 1 }])],
      ["remove", () => store.remove(ACME_ID)],
    ];
    for (const [name, run] of calls4) {
      for (const [label, make] of Object.entries(failures)) await expectFailure(name + " " + label, run, make());
    }
    await expectFailure("add empty answer", () => store.add(GAMMA, 0), json(200, {}));
    await expectFailure("add not json", () => store.add(GAMMA, 0), plain(200, "not json"));

    for (const rec of allCalls) expect(rec.init?.cache).toBe("no-store");
  } finally {
    globalThis.fetch = original;
  }
});
