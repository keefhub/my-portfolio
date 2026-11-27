import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { expect, test, type APIRequestContext, type APIResponse } from "@playwright/test";
import { encode } from "next-auth/jwt";

test.describe.configure({ mode: "default" });

// Shared fixtures. The tests of this file share one stand-in database file and one stand-in storage directory,
// so every test starts by resetting both.

// The gate scans this file, so the names of forbidden words and modules are put together from pieces.
const piece = (...parts: string[]): string => parts.join("");
const SUPABASE_PREFIX = piece("@supa", "base/");
const FIRE = piece("fire", "base");
const PG = piece("post", "gres");
const AUTH_MODULE = piece("@/lib/", "auth");
const SERVER_DIR = piece("lib/", "server");
const SERVER_PATH = piece("src/", SERVER_DIR);
const NEXT_HEADERS = piece("next/", "headers");
const COOKIES_CALL = piece("cook", "ies(");
const HEADERS_CALL = piece("head", "ers(");

const STAND_IN_PREFIX = "stand-in:";
const DB_URL = process.env.SUPABASE_DB_URL ?? "";
const DB_FILE = DB_URL.startsWith(STAND_IN_PREFIX) ? DB_URL.slice(STAND_IN_PREFIX.length) : "";
const STORE_URL = process.env.SUPABASE_URL ?? "";
const STORE_DIR = STORE_URL.startsWith(STAND_IN_PREFIX) ? STORE_URL.slice(STAND_IN_PREFIX.length) : "";

const API = "/api/admin/blog-posts/";
const PUB = "/api/admin/blog-posts/published/";
const TECH_API = "/api/admin/tech-stack/";
const EXPERIENCE_API = "/api/admin/experience/";

const IMG_DIAGRAM = "77777777-7777-4777-8777-777777777777.png";
const DIAGRAM_IMAGE = { id: IMG_DIAGRAM, name: "diagram.png", contentType: "image/png", size: 70 };

type PostData = {
  title: string;
  excerpt: string;
  date: string;
  tags: string[];
  featured: boolean;
  coverImage: string;
  coverAlt: string;
  body: string;
};

const MOVING_DATA: PostData = {
  title: "Notes on moving to Vercel",
  excerpt: "What changed and why",
  date: "2026-05-15",
  tags: ["nextjs", "vercel"],
  featured: false,
  coverImage: "/images/blog/vercel.png",
  coverAlt: "A diagram of the hosting move",
  body: "# Moving\n\nWe moved the site to Vercel.",
};
const DRAFT_DATA: PostData = {
  title: "Unfinished thoughts",
  excerpt: "Not ready yet",
  date: "2026-06-01",
  tags: [],
  featured: false,
  coverImage: "",
  coverAlt: "",
  body: "SECRET-DRAFT-BODY-9QX",
};
const MOVING = { slug: "moving-to-vercel", status: "published", data: MOVING_DATA };
const DRAFT = { slug: "unfinished-thoughts", status: "draft", data: DRAFT_DATA };
const EMPTY_DATA: PostData = {
  title: "",
  excerpt: "",
  date: "",
  tags: [],
  featured: false,
  coverImage: "",
  coverAlt: "",
  body: "",
};

const LEAKS = ["stand-in", "ECONNREFUSED", "password-marker-standin", "SUPABASE_DB_URL", PG];

const SESSION_COOKIE = "authjs.session-token";
type Claims = { sub: string; email: string; name: string; emailVerified: boolean };
const setting = (name: string): string => process.env[name] ?? "";
const OWNER = (): Claims => ({ sub: "owner-1", email: setting("ADMIN_EMAIL"), name: "Owner Test", emailVerified: true });
const OTHER = (): Claims => ({
  sub: "other-1",
  email: "someone-else@example.test",
  name: "Someone Else",
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

const cookieOf = async (claims: Claims, options: { secret?: string; maxAge?: number } = {}): Promise<string> =>
  SESSION_COOKIE + "=" + (await mint(claims, options));
const ownerCookie = (): Promise<string> => cookieOf(OWNER());

// The database stand-in file.
function dbReset(): void {
  if (DB_FILE !== "" && fs.existsSync(DB_FILE)) fs.rmSync(DB_FILE, { force: true });
}

function readDbFile(): Record<string, unknown> {
  if (DB_FILE === "" || !fs.existsSync(DB_FILE)) return {};
  return JSON.parse(fs.readFileSync(DB_FILE, "utf8")) as Record<string, unknown>;
}

function dbBreak(): void {
  fs.writeFileSync(DB_FILE, JSON.stringify({ ...readDbFile(), unreachable: true }));
}

function dbFix(): void {
  const { unreachable: _unreachable, ...rest } = readDbFile();
  void _unreachable;
  fs.writeFileSync(DB_FILE, JSON.stringify(rest));
}

function dbSeedWith(images: unknown[], posts: unknown[]): void {
  fs.writeFileSync(DB_FILE, JSON.stringify({ images, blog_posts: posts }));
}

function dbSeedAll(
  profile: unknown,
  images: unknown[],
  experience: unknown[],
  projects: unknown[],
  certs: unknown[],
  techs: unknown[],
  posts: unknown[],
): void {
  fs.writeFileSync(
    DB_FILE,
    JSON.stringify({
      profile,
      images,
      experience,
      projects,
      certifications: certs,
      tech_categories: techs,
      blog_posts: posts,
    }),
  );
}

type StoredPost = { slug: string; status: string; data: Record<string, unknown> };
function dbPosts(): StoredPost[] {
  const list = readDbFile().blog_posts;
  return Array.isArray(list) ? (list as StoredPost[]) : [];
}

// The storage stand-in directory.
function storeReset(): void {
  if (STORE_DIR !== "" && fs.existsSync(STORE_DIR)) fs.rmSync(STORE_DIR, { recursive: true, force: true });
}

const seedBoth = (): void => dbSeedWith([DIAGRAM_IMAGE], [MOVING, DRAFT]);

// Wire shapes.
const wireOf = (slug: string, draft: boolean, data: PostData) => ({
  title: data.title,
  excerpt: data.excerpt,
  date: data.date,
  slug,
  tags: data.tags,
  draft,
  featured: data.featured,
  coverImage: data.coverImage,
  coverAlt: data.coverAlt,
  body: data.body,
});
const entryOf = (slug: string, draft: boolean, data: PostData) => ({
  id: slug,
  position: 0,
  content: wireOf(slug, draft, data),
});
const publicOf = (slug: string, data: PostData) => ({
  title: data.title,
  excerpt: data.excerpt,
  date: data.date,
  slug,
  tags: data.tags,
  coverImage: data.coverImage,
  coverAlt: data.coverAlt,
  body: data.body,
  featured: data.featured,
});
const validWire = (slug: string): Record<string, unknown> => ({
  ...wireOf(slug, false, MOVING_DATA),
  title: "Post " + slug,
});

async function apiGet(request: APIRequestContext, cookie?: string, address: string = API): Promise<APIResponse> {
  return request.get(address, { headers: cookie === undefined ? {} : { cookie }, maxRedirects: 0 });
}

async function apiSend(
  request: APIRequestContext,
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  query: string,
  body: string | undefined,
  cookie?: string,
  address: string = API,
): Promise<APIResponse> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (cookie !== undefined) headers.cookie = cookie;
  return request.fetch(address + query, {
    method,
    headers,
    ...(body === undefined ? {} : { data: body }),
    maxRedirects: 0,
  });
}

function gitGrep(args: string[]): { stdout: string; status: number | null } {
  const result = spawnSync("git", ["grep", "--untracked", ...args], { cwd: process.cwd(), encoding: "utf8" });
  return { stdout: result.stdout ?? "", status: result.status };
}

async function expectAnswer(res: APIResponse, status: number, body: unknown, label: string): Promise<void> {
  expect(res.status(), label + " status").toBe(status);
  expect(await res.json(), label + " body").toEqual(body);
}

const postBody = (content: unknown, position: number = 0): string => JSON.stringify({ content, position });
const putBody = (content: unknown): string => JSON.stringify({ content });
const idQuery = (id: string): string => "?id=" + id;
const slugQuery = (slug: string): string => "?slug=" + slug;

const SECRET_WORDS = ["SECRET-DRAFT-BODY-9QX", "Unfinished thoughts", "Notes on moving to Vercel"];

// The eight requests that E2E-07 and E2E-08 send for every session.
type Sent = { label: string; send: (cookie: string | undefined, request: APIRequestContext) => Promise<APIResponse> };
const EIGHT_REQUESTS: Sent[] = [
  { label: "GET list", send: (c, r) => apiGet(r, c) },
  { label: "GET draft by slug", send: (c, r) => apiGet(r, c, API + slugQuery("unfinished-thoughts")) },
  { label: "POST valid", send: (c, r) => apiSend(r, "POST", "", postBody(validWire("new-post")), c) },
  {
    label: "PUT valid",
    send: (c, r) => apiSend(r, "PUT", idQuery("moving-to-vercel"), putBody(validWire("moving-to-vercel")), c),
  },
  { label: "DELETE", send: (c, r) => apiSend(r, "DELETE", idQuery("moving-to-vercel"), undefined, c) },
  { label: "POST raw", send: (c, r) => apiSend(r, "POST", "", "{bad", c) },
  { label: "PUT raw", send: (c, r) => apiSend(r, "PUT", idQuery("moving-to-vercel"), "{bad", c) },
  { label: "DELETE raw", send: (c, r) => apiSend(r, "DELETE", idQuery("moving-to-vercel"), "{bad", c) },
];

test("E2E-01: no dependency or setting name was added", async () => {
  dbReset();
  storeReset();
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

  expect(Object.keys(pkg.dependencies ?? {}).sort()).toEqual([
    FIRE,
    "framer-motion",
    "gray-matter",
    "lucide-react",
    "next",
    "next-auth",
    PG,
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
  expect(Object.keys(pkg.devDependencies ?? {}).sort()).toEqual([
    "@eslint/eslintrc",
    "@playwright/test",
    "@tailwindcss/postcss",
    "@tailwindcss/typography",
    "@types/node",
    "@types/react",
    "@types/react-dom",
    "eslint",
    "eslint-config-next",
    FIRE + "-tools",
    "tailwindcss",
    "tsx",
    "typescript",
  ]);

  const result = gitGrep(["-ohE", "process\\.env\\.[A-Za-z_]+", "--", "src", "playwright.config.ts"]);
  const names = [
    ...new Set(
      result.stdout
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

  const client = gitGrep(["-n", "-E", "[\"']" + SUPABASE_PREFIX + "[A-Za-z0-9._-]+[\"']", "--", "src", "e2e"]);
  expect(client.stdout).toBe("");
  expect(client.status).toBe(1);

  const config = fs.readFileSync("playwright.config.ts", "utf8");
  expect(config).toContain("SUPABASE_DB_URL");
  expect(config).toContain("SUPABASE_URL");

  const gate = fs.readFileSync("scripts/check-task.sh", "utf8");
  expect(gate).toContain("src/app/api/auth/*" + "|" + "src/app/api/admin/*) ;;");
});

test("E2E-02: the post SQL is exactly the proven text, the server files are marked server-only, and nothing names the old backend", async () => {
  dbReset();
  storeReset();
  const sql = fs.readFileSync("src/lib/server/postSql.ts", "utf8");
  const texts = [
    "create table if not exists blog_posts (slug text primary key, status text not null check (status in ('draft', 'published')), data jsonb not null, updated_at timestamptz not null default now())",
    "alter table blog_posts enable row level security",
    "select slug, status, data from blog_posts order by slug",
    "select slug, status, data from blog_posts where status = 'published' order by slug",
    "select slug, status, data from blog_posts where slug = $1",
    "select slug, status, data from blog_posts where slug = $1 and status = 'published'",
    "insert into blog_posts (slug, status, data) values ($1, $2, $3::text::jsonb) on conflict (slug) do nothing returning slug",
    "update blog_posts set status = $2, data = $3::text::jsonb, updated_at = now() where slug = $1 returning slug",
    "delete from blog_posts where slug = $1 returning slug",
  ];
  for (const text of texts) expect(sql, "postSql.ts holds " + text).toContain("`" + text + "`");
  expect(sql).not.toContain("drop ");
  expect(sql).not.toContain("truncate ");
  expect(sql.split("delete from").length - 1, "delete from count").toBe(1);

  const listSql = fs.readFileSync("src/lib/server/listSql.ts", "utf8");
  expect(listSql).toContain(
    'export const LIST_TABLES: readonly ListTable[] = ["experience", "projects", "certifications", "tech_categories"];',
  );
  expect(listSql).not.toContain("blog_posts");

  const files = fs.readdirSync("src/lib/server").filter((f) => f.endsWith(".ts"));
  expect(files).toContain("postSql.ts");
  expect(files).toContain("postStore.ts");
  for (const file of files) {
    const first = fs
      .readFileSync("src/lib/server/" + file, "utf8")
      .split("\n")
      .find((l) => l.trim() !== "");
    expect(first, file + " first line").toBe('import "server-only";');
  }

  const mentions = gitGrep(["-l", "-E", SERVER_DIR, "--", "src"]);
  const mentionFiles = mentions.stdout.split("\n").filter(Boolean);
  expect(mentionFiles.length).toBeGreaterThan(0);
  for (const file of mentionFiles) {
    expect(file.startsWith("src/app/api/admin/") || file.startsWith(SERVER_PATH + "/"), file).toBe(true);
  }

  const importers = gitGrep(["-l", "-E", "[\"']" + PG + "[\"']", "--", "src"]);
  expect(importers.stdout.split("\n").filter(Boolean)).toEqual(["src/lib/server/database.ts"]);

  const named = gitGrep([
    "-i",
    "-l",
    "-E",
    FIRE,
    "--",
    SERVER_PATH,
    "src/lib/admin/listClient.ts",
    "src/app/api/admin/blog-posts",
  ]);
  expect(named.stdout).toBe("");
  expect(named.status).toBe(1);
});

test("E2E-03: the owner lists, adds, replaces and removes a post through the route, with trimmed content", async ({
  request,
}) => {
  dbReset();
  storeReset();
  const owner = await ownerCookie();

  const first = await apiGet(request, owner);
  await expectAnswer(first, 200, { entries: [] }, "first GET");
  expect(first.headers()["cache-control"], "first GET cache-control").toBe("no-store");

  const addBody =
    '{"content":{"title":"  Notes on moving to Vercel ","excerpt":" What changed and why ","date":" 2026-05-15 ","slug":" moving-to-vercel ","tags":[" nextjs ","","vercel"],"draft":false,"featured":true,"coverImage":" /images/blog/vercel.png ","coverAlt":" A diagram of the hosting move ","body":"# Moving\\n\\nWe moved the site to Vercel.\\n","extra":1},"position":5}';
  const added = await apiSend(request, "POST", "", addBody, owner);
  expect(added.status(), "POST status").toBe(200);
  expect(added.headers()["cache-control"], "POST cache-control").toBe("no-store");
  const addedBody = (await added.json()) as Record<string, unknown>;
  expect(Object.keys(addedBody)).toEqual(["id"]);
  expect(addedBody.id).toBe("moving-to-vercel");
  const stored = {
    title: "Notes on moving to Vercel",
    excerpt: "What changed and why",
    date: "2026-05-15",
    tags: ["nextjs", "vercel"],
    featured: true,
    coverImage: "/images/blog/vercel.png",
    coverAlt: "A diagram of the hosting move",
    body: "# Moving\n\nWe moved the site to Vercel.\n",
  };
  expect(dbPosts()).toEqual([{ slug: "moving-to-vercel", status: "published", data: stored }]);
  expect(Object.keys(dbPosts()[0].data).sort()).toEqual([
    "body",
    "coverAlt",
    "coverImage",
    "date",
    "excerpt",
    "featured",
    "tags",
    "title",
  ]);

  const second = await apiGet(request, owner);
  await expectAnswer(
    second,
    200,
    {
      entries: [
        {
          id: "moving-to-vercel",
          position: 0,
          content: {
            title: "Notes on moving to Vercel",
            excerpt: "What changed and why",
            date: "2026-05-15",
            slug: "moving-to-vercel",
            tags: ["nextjs", "vercel"],
            draft: false,
            featured: true,
            coverImage: "/images/blog/vercel.png",
            coverAlt: "A diagram of the hosting move",
            body: "# Moving\n\nWe moved the site to Vercel.\n",
          },
        },
      ],
    },
    "second GET",
  );
  expect(second.headers()["cache-control"], "second GET cache-control").toBe("no-store");

  const replaced = await apiSend(
    request,
    "PUT",
    idQuery("moving-to-vercel"),
    putBody({
      title: "Notes on moving to Vercel 2",
      excerpt: "What changed and why",
      date: "2026-05-15",
      slug: "moving-to-vercel",
      tags: ["nextjs"],
      draft: true,
      featured: false,
      coverImage: "",
      coverAlt: "",
      body: "Second body",
    }),
    owner,
  );
  await expectAnswer(replaced, 200, { updated: true }, "PUT");
  expect(replaced.headers()["cache-control"], "PUT cache-control").toBe("no-store");
  const afterPut = dbPosts();
  expect(afterPut).toHaveLength(1);
  expect(afterPut[0].status).toBe("draft");
  expect(afterPut[0].slug).toBe("moving-to-vercel");
  expect(afterPut[0].data.title).toBe("Notes on moving to Vercel 2");
  expect(afterPut[0].data.body).toBe("Second body");
  expect(afterPut[0].data.tags).toEqual(["nextjs"]);

  const third = await apiGet(request, owner);
  expect(third.status()).toBe(200);
  const thirdBody = (await third.json()) as { entries: { content: { draft: boolean } }[] };
  expect(thirdBody.entries[0].content.draft).toBe(true);
  expect(third.headers()["cache-control"], "third GET cache-control").toBe("no-store");

  const removed = await apiSend(request, "DELETE", idQuery("moving-to-vercel"), undefined, owner);
  await expectAnswer(removed, 200, { deleted: true }, "DELETE");
  expect(removed.headers()["cache-control"], "DELETE cache-control").toBe("no-store");
  expect(dbPosts()).toEqual([]);

  const last = await apiGet(request, owner);
  await expectAnswer(last, 200, { entries: [] }, "last GET");
  expect(last.headers()["cache-control"], "last GET cache-control").toBe("no-store");
});

test("E2E-04: a taken slug is refused with 409 and stores nothing, and two adds of one slug store one", async ({
  request,
}) => {
  dbReset();
  storeReset();
  seedBoth();
  const owner = await ownerCookie();

  const taken = await apiSend(
    request,
    "POST",
    "",
    postBody({ ...validWire("moving-to-vercel"), title: "A different post", draft: true }, 0),
    owner,
  );
  expect(taken.status(), "taken status").toBe(409);
  expect(await taken.text(), "taken body").toBe('{"error":"slug-taken"}');
  expect(dbPosts()).toEqual([MOVING, DRAFT]);

  dbReset();
  dbSeedWith([], []);
  const racers = ["First racer", "Second racer"];
  const answers = await Promise.all(
    racers.map((title) =>
      apiSend(request, "POST", "", postBody({ ...validWire("race-post"), title }, 0), owner),
    ),
  );
  const statuses = answers.map((a) => a.status()).sort();
  expect(statuses).toEqual([200, 409]);
  const winner = racers[answers.findIndex((a) => a.status() === 200)];
  const stored = dbPosts();
  expect(stored).toHaveLength(1);
  expect(stored[0].slug).toBe("race-post");
  expect(stored[0].data.title).toBe(winner);
});

test("E2E-05: the route refuses every invalid add and replace with 400 and stores nothing, and a missing draft counts as a draft", async ({
  request,
}) => {
  test.setTimeout(120000);
  dbReset();
  storeReset();
  seedBoth();
  const owner = await ownerCookie();
  const base = validWire("moving-to-vercel");

  const changes: [string, Record<string, unknown>][] = [
    ["title empty", { title: "" }],
    ["title blank", { title: "   " }],
    ["excerpt blank", { excerpt: "   " }],
    ["date words", { date: "15 May 2026" }],
    ["date not a day", { date: "2026-02-30" }],
    ["slug capitals", { slug: "Moving To Vercel" }],
    ["slug empty", { slug: "" }],
    ["slug space", { slug: "has space" }],
    ["body blank", { body: "   " }],
    ["title number", { title: 5 }],
    ["tags text", { tags: "nextjs" }],
    ["tags mixed", { tags: ["a", 1] }],
    ["draft text", { draft: "no" }],
    ["featured number", { featured: 1 }],
  ];
  type Bad = { label: string; body: string };
  const bodies: Bad[] = changes.map(([label, change]) => ({
    label,
    body: JSON.stringify({ content: { ...base, ...change }, position: 0 }),
  }));
  bodies.push(
    { label: "content list", body: JSON.stringify({ content: [], position: 0 }) },
    { label: "content text", body: JSON.stringify({ content: "text", position: 0 }) },
    { label: "content null", body: JSON.stringify({ content: null, position: 0 }) },
    { label: "raw brace", body: "{bad" },
    { label: "raw list", body: "[]" },
    { label: "raw text", body: '"x"' },
    { label: "raw empty object", body: "{}" },
    { label: "raw position only", body: '{"position":0}' },
  );

  for (const bad of bodies) {
    for (const method of ["POST", "PUT"] as const) {
      const label = method + " " + bad.label;
      const res = await apiSend(request, method, method === "PUT" ? idQuery("moving-to-vercel") : "", bad.body, owner);
      expect(res.status(), label + " status").toBe(400);
      expect(await res.text(), label + " body").toBe('{"error":"invalid"}');
      expect(dbPosts(), label + " stored").toEqual([MOVING, DRAFT]);
    }
  }

  const mismatch = await apiSend(
    request,
    "PUT",
    idQuery("moving-to-vercel"),
    putBody(validWire("other-slug")),
    owner,
  );
  expect(mismatch.status(), "slug differs from id status").toBe(400);
  expect(await mismatch.text(), "slug differs from id body").toBe('{"error":"invalid"}');
  expect(dbPosts()).toEqual([MOVING, DRAFT]);

  for (const query of ["?id=", "?id=UPPER", "?id=a%2Fb", "?id=has%20space"]) {
    const res = await apiSend(request, "PUT", query, putBody(validWire("moving-to-vercel")), owner);
    expect(res.status(), "PUT " + query + " status").toBe(400);
    expect(await res.text(), "PUT " + query + " body").toBe('{"error":"invalid"}');
    expect(dbPosts(), "PUT " + query + " stored").toEqual([MOVING, DRAFT]);
  }

  const { draft: _draft, ...noDraft } = validWire("no-draft-key");
  void _draft;
  const last = await apiSend(request, "POST", "", postBody(noDraft, 0), owner);
  expect(last.status(), "no draft key status").toBe(200);
  const stored = dbPosts();
  expect(stored).toHaveLength(3);
  const added = stored.find((p) => p.slug === "no-draft-key");
  expect(added?.status).toBe("draft");
});

test("E2E-06: a replace or remove of a post that is not stored answers 404 and stores nothing", async ({ request }) => {
  dbReset();
  storeReset();
  seedBoth();
  const owner = await ownerCookie();

  const missingPut = await apiSend(request, "PUT", idQuery("gone-post"), putBody(validWire("gone-post")), owner);
  expect(missingPut.status(), "PUT missing status").toBe(404);
  expect(await missingPut.text(), "PUT missing body").toBe('{"error":"not-found"}');
  expect(dbPosts()).toEqual([MOVING, DRAFT]);

  const missingDelete = await apiSend(request, "DELETE", idQuery("gone-post"), undefined, owner);
  expect(missingDelete.status(), "DELETE missing status").toBe(404);
  expect(await missingDelete.text(), "DELETE missing body").toBe('{"error":"not-found"}');
  expect(dbPosts()).toEqual([MOVING, DRAFT]);

  const removed = await apiSend(request, "DELETE", idQuery("moving-to-vercel"), undefined, owner);
  expect(removed.status(), "DELETE status").toBe(200);
  const removedAgain = await apiSend(request, "DELETE", idQuery("moving-to-vercel"), undefined, owner);
  expect(removedAgain.status(), "second DELETE status").toBe(404);
  const revive = await apiSend(
    request,
    "PUT",
    idQuery("moving-to-vercel"),
    putBody(validWire("moving-to-vercel")),
    owner,
  );
  expect(revive.status(), "PUT after delete status").toBe(404);
  expect(dbPosts()).toEqual([DRAFT]);
});

test("E2E-07: without a session every request is refused with 401 and touches nothing", async ({ request }) => {
  test.setTimeout(120000);
  dbReset();
  storeReset();
  seedBoth();

  const sessions: { label: string; cookie: string | undefined }[] = [
    { label: "no cookie", cookie: undefined },
    { label: "garbled", cookie: SESSION_COOKIE + "=garbled-value" },
    { label: "expired", cookie: await cookieOf(OWNER(), { maxAge: -3600 }) },
    {
      label: "wrong secret",
      cookie: await cookieOf(OWNER(), { secret: "another-secret-value-for-the-test-0123456789" }),
    },
  ];

  for (const s of sessions) {
    for (const call of EIGHT_REQUESTS) {
      const label = s.label + " " + call.label;
      const res = await call.send(s.cookie, request);
      expect(res.status(), label + " status").toBe(401);
      const text = await res.text();
      expect(JSON.parse(text), label + " body").toEqual({ error: "not-signed-in" });
      for (const word of SECRET_WORDS) expect(text, label + " leaks " + word).not.toContain(word);
      expect(dbPosts(), label + " stored").toEqual([MOVING, DRAFT]);
    }
  }
});

test("E2E-08: another account and an unverified owner address are refused with 403 and touch nothing", async ({
  request,
}) => {
  test.setTimeout(120000);
  dbReset();
  storeReset();
  seedBoth();

  const sessions: { label: string; cookie: string }[] = [
    { label: "other account", cookie: await cookieOf(OTHER()) },
    { label: "unverified owner", cookie: await cookieOf(UNVERIFIED()) },
  ];

  for (const s of sessions) {
    for (const call of EIGHT_REQUESTS) {
      const label = s.label + " " + call.label;
      const res = await call.send(s.cookie, request);
      expect(res.status(), label + " status").toBe(403);
      const text = await res.text();
      expect(JSON.parse(text), label + " body").toEqual({ error: "not-allowed" });
      for (const word of SECRET_WORDS) expect(text, label + " leaks " + word).not.toContain(word);
      expect(dbPosts(), label + " stored").toEqual([MOVING, DRAFT]);
    }
  }
});

test("E2E-09: the owner reads the list, a draft by its slug, and gets 404 or 400 for a missing or bad slug", async ({
  request,
}) => {
  dbReset();
  storeReset();
  seedBoth();
  const owner = await ownerCookie();

  const list = await apiGet(request, owner);
  await expectAnswer(
    list,
    200,
    { entries: [entryOf("unfinished-thoughts", true, DRAFT_DATA), entryOf("moving-to-vercel", false, MOVING_DATA)] },
    "GET list",
  );
  const listBody = (await list.json()) as { entries: { content: { body: string } }[] };
  expect(listBody.entries[0].content.body).toBe("SECRET-DRAFT-BODY-9QX");

  const draft = await apiGet(request, owner, API + slugQuery("unfinished-thoughts"));
  await expectAnswer(draft, 200, { entry: entryOf("unfinished-thoughts", true, DRAFT_DATA) }, "GET draft");

  const missing = await apiGet(request, owner, API + slugQuery("missing-post"));
  await expectAnswer(missing, 404, { error: "not-found" }, "GET missing");

  for (const query of ["?slug=Bad%20Slug", "?slug="]) {
    const bad = await apiGet(request, owner, API + query);
    await expectAnswer(bad, 400, { error: "invalid" }, "GET " + query);
  }
});

test("E2E-10: the published read answers every requester alike with published posts only, and takes no writes", async ({
  request,
}) => {
  test.setTimeout(90000);
  dbReset();
  storeReset();
  seedBoth();

  const requesters: { label: string; cookie: string | undefined }[] = [
    { label: "no cookie", cookie: undefined },
    { label: "other account", cookie: await cookieOf(OTHER()) },
    { label: "owner", cookie: await ownerCookie() },
  ];

  for (const who of requesters) {
    const texts: string[] = [];
    const reads: [string, APIResponse][] = [];
    const get = async (query: string): Promise<APIResponse> => {
      const res = await apiGet(request, who.cookie, PUB + query);
      reads.push([who.label + " GET " + query, res]);
      texts.push(await res.text());
      return res;
    };

    const all = await get("");
    expect(all.status(), who.label + " list status").toBe(200);
    expect(JSON.parse(texts[0]), who.label + " list body").toEqual({
      posts: [publicOf("moving-to-vercel", MOVING_DATA)],
    });
    expect(Object.keys((JSON.parse(texts[0]) as { posts: Record<string, unknown>[] }).posts[0]).sort()).toEqual([
      "body",
      "coverAlt",
      "coverImage",
      "date",
      "excerpt",
      "featured",
      "slug",
      "tags",
      "title",
    ]);

    const one = await get(slugQuery("moving-to-vercel"));
    expect(one.status(), who.label + " one status").toBe(200);
    expect(JSON.parse(texts[1]), who.label + " one body").toEqual({ post: publicOf("moving-to-vercel", MOVING_DATA) });

    const draft = await get(slugQuery("unfinished-thoughts"));
    expect(draft.status(), who.label + " draft status").toBe(404);
    const missing = await get(slugQuery("missing-post"));
    expect(missing.status(), who.label + " missing status").toBe(404);
    expect(JSON.parse(texts[2]), who.label + " draft body").toEqual({ error: "not-found" });
    expect(JSON.parse(texts[3]), who.label + " missing body").toEqual({ error: "not-found" });
    expect(JSON.parse(texts[2])).toEqual(JSON.parse(texts[3]));

    const bad = await get(slugQuery("Bad%20Slug"));
    expect(bad.status(), who.label + " bad slug status").toBe(400);
    expect(JSON.parse(texts[4]), who.label + " bad slug body").toEqual({ error: "invalid" });

    for (const text of texts) {
      for (const word of ["SECRET-DRAFT-BODY-9QX", "Unfinished thoughts", "unfinished"]) {
        expect(text, who.label + " leaks " + word).not.toContain(word);
      }
    }
    for (const [label, res] of reads) {
      expect(res.headers()["set-cookie"], label + " set-cookie").toBeUndefined();
      expect(res.headers()["cache-control"], label + " cache-control").toBe("no-store");
    }
  }

  for (const cookie of [await ownerCookie(), undefined]) {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"] as const) {
      const res = await apiSend(request, method, "", "{}", cookie, PUB);
      expect(res.status(), (cookie === undefined ? "no cookie " : "owner ") + method + " status").toBe(405);
      expect(dbPosts()).toEqual([MOVING, DRAFT]);
    }
  }
});

test("E2E-11: an unreachable database gives a fixed 503 to the owner and to the public read, refusals do not depend on it, and it recovers", async ({
  request,
}) => {
  dbReset();
  storeReset();
  seedBoth();
  dbBreak();
  const owner = await ownerCookie();

  const sent: [string, APIResponse][] = [
    ["owner GET", await apiGet(request, owner)],
    ["owner POST", await apiSend(request, "POST", "", postBody(validWire("new-post")), owner)],
    [
      "owner PUT",
      await apiSend(request, "PUT", idQuery("moving-to-vercel"), putBody(validWire("moving-to-vercel")), owner),
    ],
    ["owner DELETE", await apiSend(request, "DELETE", idQuery("moving-to-vercel"), undefined, owner)],
    ["public GET", await apiGet(request, undefined, PUB)],
    ["public GET one", await apiGet(request, undefined, PUB + slugQuery("moving-to-vercel"))],
  ];
  for (const [label, res] of sent) {
    expect(res.status(), label + " status").toBe(503);
    const text = await res.text();
    expect(text, label + " body").toBe('{"error":"unavailable"}');
    for (const leak of LEAKS) expect(text, label + " leaks " + leak).not.toContain(leak);
  }

  const signedOut = await apiGet(request);
  expect(signedOut.status(), "signed-out GET status").toBe(401);
  const otherDelete = await apiSend(
    request,
    "DELETE",
    idQuery("moving-to-vercel"),
    undefined,
    await cookieOf(OTHER()),
  );
  expect(otherDelete.status(), "other DELETE status").toBe(403);

  dbFix();
  const fixed = await apiGet(request, owner);
  expect(fixed.status(), "GET after recovery status").toBe(200);
  expect(((await fixed.json()) as { entries: unknown[] }).entries).toHaveLength(2);
  const fixedPublic = await apiGet(request, undefined, PUB);
  expect(fixedPublic.status(), "public GET after recovery status").toBe(200);
  expect(((await fixedPublic.json()) as { posts: unknown[] }).posts).toHaveLength(1);
  expect(dbPosts()).toEqual([MOVING, DRAFT]);
});

test("E2E-12: no public page or script carries the routes or the database, and the routes stay dynamic and server-only", async ({
  request,
}) => {
  dbReset();
  storeReset();
  seedBoth();
  const manifest = JSON.parse(fs.readFileSync(".next/prerender-manifest.json", "utf8")) as {
    routes: Record<string, unknown>;
  };
  const keys = Object.keys(manifest.routes);
  expect(keys.filter((k) => k.startsWith("/api/admin"))).toEqual([]);
  for (const key of ["/", "/blog", "/blog/hello-world", "/blog/building-portfolio-nextjs", "/robots.txt", "/rss.xml", "/sitemap.xml"]) {
    expect(keys, key).toContain(key);
  }

  const forbidden = ["api/admin/blog-posts", "blog_posts", "SUPABASE_DB_URL", "stand-in:", "DatabaseUnavailable"];
  const noPost = ["Notes on moving to Vercel", "moving-to-vercel"];
  let fetched = 0;
  for (const path of ["/", "/blog/", "/blog/hello-world/", "/blog/building-portfolio-nextjs/", "/rss.xml", "/sitemap.xml"]) {
    const page = await request.get(path);
    expect(page.status(), path).toBe(200);
    const html = await page.text();
    for (const text of forbidden) expect(html, path + " carries " + text).not.toContain(text);
    if (path === "/blog/" || path === "/rss.xml" || path === "/sitemap.xml") {
      for (const text of noPost) expect(html, path + " carries " + text).not.toContain(text);
    }

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

  const ownerRoute = fs.readFileSync("src/app/api/admin/blog-posts/route.ts", "utf8");
  const publicRoute = fs.readFileSync("src/app/api/admin/blog-posts/published/route.ts", "utf8");
  expect(publicRoute).toContain("force-dynamic");
  for (const text of [AUTH_MODULE, NEXT_HEADERS, COOKIES_CALL, HEADERS_CALL]) {
    expect(publicRoute, "published route carries " + text).not.toContain(text);
  }
  expect(ownerRoute).toContain("force-dynamic");
  expect(ownerRoute).toContain(AUTH_MODULE);

  const authImporters = gitGrep(["-l", "-E", AUTH_MODULE + "\\b", "--", "src"]);
  const authFiles = authImporters.stdout.split("\n").filter(Boolean);
  expect(authFiles.length).toBeGreaterThan(0);
  for (const file of authFiles) {
    expect(
      file.startsWith("src/app/api/auth/") ||
        file.startsWith("src/app/api/admin/") ||
        file.startsWith("src/app/bright-warm-greenhouse/"),
      file,
    ).toBe(true);
  }

  const serverMentions = gitGrep(["-l", "-E", SERVER_DIR, "--", "src", ":(exclude)" + SERVER_PATH, ":(exclude)src/app/api/admin"]);
  expect(serverMentions.stdout).toBe("");
  expect(serverMentions.status).toBe(1);
});

test("E2E-13: the post store reads the stand-in file tolerantly and leaves every other list alone", async ({ request }) => {
  test.setTimeout(90000);
  dbReset();
  storeReset();
  const profile = { name: "Keith Lim" };
  const odd = { slug: "odd-one", status: "published", data: { title: 5, tags: "x", date: null } };
  const noData = { slug: "no-data", status: "draft" };
  const noSlug = { status: "draft", data: { title: "No slug" } };
  dbSeedAll(profile, [DIAGRAM_IMAGE], [], [], [], [], [DRAFT, odd, noData, noSlug, "not an object"]);
  const owner = await ownerCookie();

  const list = await apiGet(request, owner);
  expect(list.status(), "GET list status").toBe(200);
  const entries = ((await list.json()) as { entries: { id: string; content: Record<string, unknown> }[] }).entries;
  expect(entries.map((e) => e.id)).toEqual(["unfinished-thoughts", "no-data", "odd-one"]);
  expect(entries[2].content).toEqual({
    title: "",
    excerpt: "",
    date: "",
    slug: "odd-one",
    tags: [],
    draft: false,
    featured: false,
    coverImage: "",
    coverAlt: "",
    body: "",
  });
  expect(entries[1].content).toEqual({ ...wireOf("no-data", true, EMPTY_DATA) });

  const published = await apiGet(request, undefined, PUB);
  await expectAnswer(published, 200, { posts: [publicOf("odd-one", EMPTY_DATA)] }, "GET published");

  const added = await apiSend(request, "POST", "", postBody(validWire("fresh-post")), owner);
  expect(added.status(), "POST status").toBe(200);
  const replaced = await apiSend(request, "PUT", idQuery("odd-one"), putBody(validWire("odd-one")), owner);
  expect(replaced.status(), "PUT status").toBe(200);
  const removed = await apiSend(request, "DELETE", idQuery("no-data"), undefined, owner);
  expect(removed.status(), "DELETE status").toBe(200);

  const file = readDbFile();
  expect(file.profile).toEqual(profile);
  expect(file.images).toEqual([DIAGRAM_IMAGE]);
  expect(file.experience).toEqual([]);
  expect(file.projects).toEqual([]);
  expect(file.certifications).toEqual([]);
  expect(file.tech_categories).toEqual([]);
  expect(dbPosts()).toContainEqual(noSlug);
  expect(dbPosts()).toContainEqual("not an object");

  const before = dbPosts();
  const tech = await apiSend(
    request,
    "POST",
    "",
    '{"content":{"category":"Cloud","tools":[]},"position":0}',
    owner,
    TECH_API,
  );
  expect(tech.status(), "tech POST status").toBe(200);
  const experience = await apiSend(
    request,
    "POST",
    "",
    '{"content":{"year":"2024","title":"Software Engineer","company":"Acme","duration":"Jan 2024 - Present","description":"Built the billing service.","details":["Cut invoice errors by 40%"]},"position":0}',
    owner,
    EXPERIENCE_API,
  );
  expect(experience.status(), "experience POST status").toBe(200);
  expect(dbPosts()).toEqual(before);
});

test("E2E-14: a post is public exactly while it is published, and saving it as a draft or as published changes that at once", async ({
  request,
}) => {
  dbReset();
  storeReset();
  seedBoth();
  const owner = await ownerCookie();
  const readyData: PostData = { ...DRAFT_DATA, body: "Now ready" };

  const first = await apiGet(request, undefined, PUB);
  await expectAnswer(first, 200, { posts: [publicOf("moving-to-vercel", MOVING_DATA)] }, "first GET PUB");

  const hide = await apiSend(
    request,
    "PUT",
    idQuery("moving-to-vercel"),
    putBody(wireOf("moving-to-vercel", true, MOVING_DATA)),
    owner,
  );
  expect(hide.status(), "hide status").toBe(200);
  await expectAnswer(await apiGet(request, undefined, PUB), 200, { posts: [] }, "GET PUB after hide");
  await expectAnswer(
    await apiGet(request, undefined, PUB + slugQuery("moving-to-vercel")),
    404,
    { error: "not-found" },
    "GET PUB one after hide",
  );
  expect(dbPosts().find((p) => p.slug === "moving-to-vercel")?.status).toBe("draft");

  const publish = await apiSend(
    request,
    "PUT",
    idQuery("unfinished-thoughts"),
    putBody(wireOf("unfinished-thoughts", false, readyData)),
    owner,
  );
  expect(publish.status(), "publish status").toBe(200);
  await expectAnswer(
    await apiGet(request, undefined, PUB),
    200,
    { posts: [publicOf("unfinished-thoughts", readyData)] },
    "GET PUB after publish",
  );
  await expectAnswer(
    await apiGet(request, undefined, PUB + slugQuery("unfinished-thoughts")),
    200,
    { post: publicOf("unfinished-thoughts", readyData) },
    "GET PUB one after publish",
  );
  const stored = dbPosts();
  expect(stored.find((p) => p.slug === "moving-to-vercel")?.status).toBe("draft");
  expect(stored.find((p) => p.slug === "unfinished-thoughts")?.status).toBe("published");
});
