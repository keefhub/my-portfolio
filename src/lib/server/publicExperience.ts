import "server-only";
import {
  publicExperienceFrom,
  type PublicExperienceEntry,
} from "@/lib/publicExperience";
import { readListRecords } from "@/lib/server/database";
import { keptRead } from "@/lib/server/keptRead";

export async function loadPublishedExperience(): Promise<PublicExperienceEntry[]> {
  return keptRead<PublicExperienceEntry[]>(
    "experience",
    async () => publicExperienceFrom(await readListRecords("experience")),
    [],
  );
}
