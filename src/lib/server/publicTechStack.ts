import "server-only";
import {
  publicTechStackFrom,
  type PublicTechCategory,
} from "@/lib/publicTechStack";
import { readListRecords } from "@/lib/server/database";

export async function loadPublishedTechStack(): Promise<PublicTechCategory[]> {
  if (process.env.NEXT_PHASE === "phase-production-build") {
    const setting = process.env.SUPABASE_DB_URL;
    if (setting === undefined || setting.trim() === "") return [];
  }
  return publicTechStackFrom(await readListRecords("tech_categories"));
}
