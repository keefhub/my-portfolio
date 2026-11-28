import "server-only";
import { createHash } from "node:crypto";
import { revalidateTag, unstable_cache } from "next/cache";

function keyOf(setting: string | undefined): string {
  return createHash("sha256")
    .update(setting ?? "")
    .digest("hex")
    .slice(0, 16);
}

export function keptRead<T>(
  name: string,
  read: () => Promise<T>,
  valueWithoutSetting: T,
): Promise<T> {
  const setting = process.env.SUPABASE_DB_URL;
  const key = keyOf(setting);
  const withoutSetting =
    process.env.NEXT_PHASE === "phase-production-build" &&
    (setting === undefined || setting.trim() === "");
  const fn = withoutSetting
    ? async (): Promise<T> => valueWithoutSetting
    : read;
  return unstable_cache(fn, ["kept-read", name, key], {
    tags: ["site-" + key],
  })();
}

export function refreshPublishedSite(): void {
  const key = keyOf(process.env.SUPABASE_DB_URL);
  const emptyKey = keyOf("");
  revalidateTag("site-" + key, "max");
  if (emptyKey !== key) revalidateTag("site-" + emptyKey, "max");
}
