import "server-only";
import {
  publicProjectsFrom,
  type PublicProject,
} from "@/lib/publicProjects";
import { readListRecords } from "@/lib/server/database";
import { keptRead } from "@/lib/server/keptRead";

export async function loadPublishedProjects(): Promise<PublicProject[]> {
  return keptRead<PublicProject[]>(
    "projects",
    async () => publicProjectsFrom(await readListRecords("projects")),
    [],
  );
}
