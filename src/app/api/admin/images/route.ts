import { getPanelState } from "@/lib/auth";
import { deleteUploadedImage, listUploadedImages, registerUpload } from "@/lib/server/imageStore";

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
    return reply({ images: await listUploadedImages() }, 200);
  } catch {
    return reply({ error: "unavailable" }, 503);
  }
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
    const result = await registerUpload(body);
    if (!result.ok) return reply({ error: result.reason }, 400);
    return reply({ image: result.image }, 200);
  } catch {
    return reply({ error: "unavailable" }, 503);
  }
}

export async function DELETE(request: Request): Promise<Response> {
  const refused = await refusal();
  if (refused) return refused;
  try {
    const id = new URL(request.url).searchParams.get("id") ?? undefined;
    const result = await deleteUploadedImage(id);
    if (result === "deleted") return reply({ deleted: true }, 200);
    if (result === "not-found") return reply({ error: "not-found" }, 404);
    return reply({ error: "invalid" }, 400);
  } catch {
    return reply({ error: "unavailable" }, 503);
  }
}
