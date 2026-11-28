import "server-only";
import {
  publicCertificationsFrom,
  type PublicCertification,
} from "@/lib/publicCertifications";
import { readListRecords } from "@/lib/server/database";

export async function loadPublishedCertifications(): Promise<PublicCertification[]> {
  if (process.env.NEXT_PHASE === "phase-production-build") {
    const setting = process.env.SUPABASE_DB_URL;
    if (setting === undefined || setting.trim() === "") return [];
  }
  return publicCertificationsFrom(await readListRecords("certifications"));
}
