import "server-only";
import { publicProfileFrom, type PublicProfile } from "@/lib/publicProfile";
import { loadProfile } from "@/lib/server/profile";

export async function loadPublishedProfile(): Promise<PublicProfile | null> {
  if (process.env.NEXT_PHASE === "phase-production-build") {
    const setting = process.env.SUPABASE_DB_URL;
    if (setting === undefined || setting.trim() === "") return null;
  }
  const content = await loadProfile();
  if (content === null) return null;
  if (content.name.trim() === "") return null;
  return publicProfileFrom(content);
}
