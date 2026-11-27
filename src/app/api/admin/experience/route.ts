import { getPanelState } from "@/lib/auth";
import { createListService } from "@/lib/server/listStore";
import {
  checkExperience,
  experienceFromData,
  experienceShape,
  experienceToData,
  type ExperienceContent,
} from "@/lib/admin/experience";

export const dynamic = "force-dynamic";

const HEADERS = { "Cache-Control": "no-store" };

const service = createListService<ExperienceContent>({
  table: "experience",
  shape: experienceShape,
  check: checkExperience,
  fromData: experienceFromData,
  toData: experienceToData,
});

function reply(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: HEADERS });
}

async function refusal(): Promise<Response | null> {
  const state = await getPanelState();
  if (state === "signed-out") return reply({ error: "not-signed-in" }, 401);
  if (state === "not-allowed") return reply({ error: "not-allowed" }, 403);
  return null;
}

async function readBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

function idOf(request: Request): string | undefined {
  return new URL(request.url).searchParams.get("id") ?? undefined;
}

export async function GET(): Promise<Response> {
  const refused = await refusal();
  if (refused) return refused;
  try {
    return reply({ entries: await service.list() }, 200);
  } catch {
    return reply({ error: "unavailable" }, 503);
  }
}

export async function POST(request: Request): Promise<Response> {
  const refused = await refusal();
  if (refused) return refused;
  try {
    const result = await service.add(await readBody(request));
    if (!result.ok) return reply({ error: "invalid" }, 400);
    return reply({ id: result.id }, 200);
  } catch {
    return reply({ error: "unavailable" }, 503);
  }
}

export async function PUT(request: Request): Promise<Response> {
  const refused = await refusal();
  if (refused) return refused;
  try {
    const id = idOf(request);
    const result = await service.update(id, await readBody(request));
    if (result === "updated") return reply({ updated: true }, 200);
    if (result === "not-found") return reply({ error: "not-found" }, 404);
    return reply({ error: "invalid" }, 400);
  } catch {
    return reply({ error: "unavailable" }, 503);
  }
}

export async function PATCH(request: Request): Promise<Response> {
  const refused = await refusal();
  if (refused) return refused;
  try {
    const result = await service.reorder(await readBody(request));
    if (result === "moved") return reply({ moved: true }, 200);
    if (result === "not-found") return reply({ error: "not-found" }, 404);
    return reply({ error: "invalid" }, 400);
  } catch {
    return reply({ error: "unavailable" }, 503);
  }
}

export async function DELETE(request: Request): Promise<Response> {
  const refused = await refusal();
  if (refused) return refused;
  try {
    const result = await service.remove(idOf(request));
    if (result === "deleted") return reply({ deleted: true }, 200);
    if (result === "not-found") return reply({ error: "not-found" }, 404);
    return reply({ error: "invalid" }, 400);
  } catch {
    return reply({ error: "unavailable" }, 503);
  }
}
