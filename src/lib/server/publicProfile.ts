import "server-only";
import { publicProfileFrom, type PublicProfile } from "@/lib/publicProfile";
import { keptRead } from "@/lib/server/keptRead";
import { loadProfile } from "@/lib/server/profile";

export async function loadPublishedProfile(): Promise<PublicProfile | null> {
  return keptRead<PublicProfile | null>(
    "profile",
    async () => {
      const content = await loadProfile();
      if (content === null) return null;
      if (content.name.trim() === "") return null;
      return publicProfileFrom(content);
    },
    null,
  );
}
