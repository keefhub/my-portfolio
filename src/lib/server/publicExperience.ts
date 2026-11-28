import "server-only";
import {
  publicExperienceFrom,
  type PublicExperienceEntry,
} from "@/lib/publicExperience";
import { readListRecords } from "@/lib/server/database";

export async function loadPublishedExperience(): Promise<PublicExperienceEntry[]> {
  if (process.env.NEXT_PHASE === "phase-production-build") {
    const setting = process.env.SUPABASE_DB_URL;
    if (setting === undefined || setting.trim() === "") return [];
  }
  return publicExperienceFrom(await readListRecords("experience"));
}
