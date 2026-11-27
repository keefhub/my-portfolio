import { getPanelState } from "@/lib/auth";
import { requestUpload } from "@/lib/server/imageStore";

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

export async function POST(request: Request): Promise<Response> {
  const refused = await refusal();
  if (refused) return refused;
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      body = undefined;
    }
    const result = await requestUpload(body);
    if (!result.ok) return reply({ error: result.reason }, 400);
    return reply({ id: result.id, uploadUrl: result.uploadUrl }, 200);
  } catch {
    return reply({ error: "unavailable" }, 503);
  }
}
