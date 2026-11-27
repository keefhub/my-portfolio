import { getPanelState } from "@/lib/auth";
import { loadProfile, saveProfile } from "@/lib/server/profile";

export const dynamic = "force-dynamic";

const HEADERS = { "Cache-Control": "no-store" };

function reply(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: HEADERS });
}

async function refusal(): Promise<Response | null> {
  const state = await getPanelState();
  if (state === "signed-out") return reply({ error: "not-signed-in" }, 401);
  if (state === "not-allowed") return reply({ error: "not-allowed" }, 403);
  return null;
}

export async function GET(): Promise<Response> {
  const refused = await refusal();
  if (refused) return refused;
  try {
    return reply({ profile: await loadProfile() }, 200);
  } catch {
    return reply({ error: "unavailable" }, 503);
  }
}

export async function PUT(request: Request): Promise<Response> {
  const refused = await refusal();
  if (refused) return refused;
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      body = undefined;
    }
    const result = await saveProfile(body);
    if (!result.ok) return reply({ error: "invalid" }, 400);
    return reply({ profile: result.profile }, 200);
  } catch {
    return reply({ error: "unavailable" }, 503);
  }
}
