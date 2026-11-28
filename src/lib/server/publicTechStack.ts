import "server-only";
import {
  publicTechStackFrom,
  type PublicTechCategory,
} from "@/lib/publicTechStack";
import { readListRecords } from "@/lib/server/database";
import { keptRead } from "@/lib/server/keptRead";

export async function loadPublishedTechStack(): Promise<PublicTechCategory[]> {
  return keptRead<PublicTechCategory[]>(
    "tech-stack",
    async () => publicTechStackFrom(await readListRecords("tech_categories")),
    [],
  );
}
