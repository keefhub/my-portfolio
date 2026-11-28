import { getPanelState } from "@/lib/auth";
import { refreshPublishedSite } from "@/lib/server/keptRead";
import { loadProfile } from "@/lib/server/profile";

export const dynamic = "force-dynamic";

function reply(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(): Promise<Response> {
  const state = await getPanelState();
  if (state === "signed-out") return reply({ error: "not-signed-in" }, 401);
  if (state === "not-allowed") return reply({ error: "not-allowed" }, 403);
  try {
    await loadProfile();
    refreshPublishedSite();
    return reply({ published: true }, 200);
  } catch {
    return reply({ error: "unavailable" }, 503);
  }
}
