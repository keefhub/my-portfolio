import "server-only";
import { publicProjectsFrom, type PublicProject } from "@/lib/publicProjects";
import { readListRecords } from "@/lib/server/database";

export async function loadPublishedProjects(): Promise<PublicProject[]> {
  if (process.env.NEXT_PHASE === "phase-production-build") {
    const setting = process.env.SUPABASE_DB_URL;
    if (setting === undefined || setting.trim() === "") return [];
  }
  return publicProjectsFrom(await readListRecords("projects"));
}
