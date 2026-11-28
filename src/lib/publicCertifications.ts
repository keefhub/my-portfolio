export type PublicCertification = {
  name: string;
  icon: string;
  url: string;
};

const ICON = /^\/(?!\/)\S+$|^https?:\/\/\S+$/i;
const LINK = /^https:\/\/\S+$/i;

function clean(value: unknown, pattern: RegExp): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return pattern.test(trimmed) ? trimmed : "";
}

export function publicCertificationsFrom(
  records: readonly { data: unknown }[],
): PublicCertification[] {
  const certifications: PublicCertification[] = [];
  for (const record of records) {
    const data = record?.data;
    if (typeof data !== "object" || data === null || Array.isArray(data)) continue;
    const stored = data as Record<string, unknown>;
    const name = typeof stored.name === "string" ? stored.name : "";
    if (name.trim() === "") continue;
    certifications.push({
      name,
      icon: clean(stored.icon, ICON),
      url: clean(stored.url, LINK),
    });
  }
  return certifications;
}
