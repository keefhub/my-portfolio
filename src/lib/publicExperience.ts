export type PublicExperienceEntry = {
  year: string;
  title: string;
  company: string;
  duration: string;
  description: string;
  details: string[];
};

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function publicExperienceFrom(
  records: readonly { data: unknown }[],
): PublicExperienceEntry[] {
  const entries: PublicExperienceEntry[] = [];
  for (const record of records) {
    const data = record?.data;
    if (typeof data !== "object" || data === null || Array.isArray(data)) continue;
    const stored = data as Record<string, unknown>;
    const title = text(stored.title);
    const company = text(stored.company);
    if (title.trim() === "" && company.trim() === "") continue;
    const details = Array.isArray(stored.details)
      ? stored.details.filter(
          (line): line is string => typeof line === "string" && line.trim() !== "",
        )
      : [];
    entries.push({
      year: text(stored.year),
      title,
      company,
      duration: text(stored.duration),
      description: text(stored.description),
      details,
    });
  }
  return entries;
}
