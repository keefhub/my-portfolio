import "server-only";
import {
  publicCertificationsFrom,
  type PublicCertification,
} from "@/lib/publicCertifications";
import { readListRecords } from "@/lib/server/database";
import { keptRead } from "@/lib/server/keptRead";

export async function loadPublishedCertifications(): Promise<PublicCertification[]> {
  return keptRead<PublicCertification[]>(
    "certifications",
    async () => publicCertificationsFrom(await readListRecords("certifications")),
    [],
  );
}
