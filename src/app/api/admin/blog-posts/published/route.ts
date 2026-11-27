import { createPostService } from "@/lib/server/postStore";

export const dynamic = "force-dynamic";

const HEADERS = { "Cache-Control": "no-store" };

const service = createPostService();

function reply(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: HEADERS });
}

export async function GET(request: Request): Promise<Response> {
  try {
    const params = new URL(request.url).searchParams;
    if (!params.has("slug")) return reply({ posts: await service.listPublished() }, 200);
    const result = await service.getPublished(params.get("slug"));
    if (result === "invalid") return reply({ error: "invalid" }, 400);
    if (result === "not-found") return reply({ error: "not-found" }, 404);
    return reply({ post: result }, 200);
  } catch {
    return reply({ error: "unavailable" }, 503);
  }
}
