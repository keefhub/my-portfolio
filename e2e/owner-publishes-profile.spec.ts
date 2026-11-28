import fs from "node:fs";
import path from "node:path";
import { expect, request as playwrightRequest, test, type APIRequestContext } from "@playwright/test";
import { encode } from "next-auth/jwt";

test.describe.configure({ mode: "default" });

// The tests of this file share one stand-in database file, so every test starts by resetting it.

const STAND_IN_PREFIX = "stand-in:";
const DB_URL = process.env.SUPABASE_DB_URL ?? "";
const DB_FILE = DB_URL.startsWith(STAND_IN_PREFIX) ? DB_URL.slice(STAND_IN_PREFIX.length) : "";

function dbReset(): void {
  if (DB_FILE !== "" && fs.existsSync(DB_FILE)) fs.rmSync(DB_FILE, { force: true });
}

const PUBLISH = "/api/admin/publish/";
const SESSION_COOKIE = "authjs.session-token";
type Claims = { sub: string; email: string; name: string; emailVerified: boolean };
const setting = (name: string): string => process.env[name] ?? "";
const OWNER = (): Claims => ({ sub: "owner-1", email: setting("ADMIN_EMAIL"), name: "Owner Test", emailVerified: true });

async function cookieOf(claims: Claims): Promise<string> {
  const value = await encode({
    token: { ...claims },
    secret: setting("AUTH_SECRET"),
    salt: SESSION_COOKIE,
    maxAge: 3600,
  });
  return SESSION_COOKIE + "=" + value;
}

async function ownerPost(request: APIRequestContext, options: { data?: string; json?: boolean } = {}) {
  const headers: Record<string, string> = { cookie: await cookieOf(OWNER()) };
  if (options.json) headers["content-type"] = "application/json";
  return request.post(PUBLISH, { headers, data: options.data, maxRedirects: 0 });
}

test("E2E-09: the publish route checks the owner first, reads once, and invalidates only the landing page", async () => {
  const source = fs.readFileSync(path.join(process.cwd(), "src/app/api/admin/publish/route.ts"), "utf8");

  expect(source).toContain("export async function POST");
  expect(source.split("revalidatePath(").length - 1).toBe(1);
  expect(source).toContain('revalidatePath("/")');

  const panel = source.indexOf("getPanelState(");
  const load = source.indexOf("loadProfile(");
  const revalidate = source.indexOf("revalidatePath(");
  expect(panel).toBeGreaterThanOrEqual(0);
  expect(panel).toBeLessThan(load);
  expect(load).toBeLessThan(revalidate);

  const forbidden = [
    "fetch(",
    "http",
    "process." + "env",
    "request.",
    "cookies(",
    "headers(",
    "export async function GET",
    "export async function PUT",
  ];
  for (const text of forbidden) expect(source, "must not contain " + text).not.toContain(text);
});

test("E2E-19: the owner can publish and the reply is not cached", async ({ baseURL }) => {
  dbReset();
  const request = await playwrightRequest.newContext({ baseURL });
  try {
    const response = await ownerPost(request);
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ published: true });
    expect(response.headers()["cache-control"]).toContain("no-store");
  } finally {
    await request.dispose();
  }
});

test("E2E-20: publish takes no input and no other method", async ({ baseURL }) => {
  dbReset();
  const request = await playwrightRequest.newContext({ baseURL });
  try {
    const ownerGet = await request.get(PUBLISH, { headers: { cookie: await cookieOf(OWNER()) }, maxRedirects: 0 });
    expect(ownerGet.status()).toBe(405);
    const ownerGetBody = await ownerGet.text();
    expect(ownerGetBody).not.toContain("Keith");
    expect(ownerGetBody).not.toContain("published");

    const withBody = await ownerPost(request, { data: JSON.stringify({ unexpected: true }), json: true });
    expect(withBody.status()).toBe(200);
    expect(await withBody.json()).toEqual({ published: true });

    const withBadBody = await ownerPost(request, { data: "not json {", json: true });
    expect(withBadBody.status()).toBe(200);
    expect(await withBadBody.json()).toEqual({ published: true });

    const anonymousGet = await request.get(PUBLISH, { maxRedirects: 0 });
    expect(anonymousGet.status()).toBe(405);
    const anonymousBody = await anonymousGet.text();
    expect(anonymousBody).not.toContain("Keith");
    expect(anonymousBody).not.toContain("published");
  } finally {
    await request.dispose();
  }
});
