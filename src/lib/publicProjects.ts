export type PublicProject = {
  title: string;
  shortDesc: string;
  description: string[];
  tech: string[];
  github: string;
  demo: string;
};

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function lines(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter(
        (line): line is string => typeof line === "string" && line.trim() !== "",
      )
    : [];
}

function link(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : "";
}

export function publicProjectsFrom(
  records: readonly { data: unknown }[],
): PublicProject[] {
  const projects: PublicProject[] = [];
  for (const record of records) {
    const data = record?.data;
    if (typeof data !== "object" || data === null || Array.isArray(data)) continue;
    const stored = data as Record<string, unknown>;
    const title = text(stored.title);
    if (title.trim() === "") continue;
    projects.push({
      title,
      shortDesc: text(stored.shortDesc),
      description: lines(stored.description),
      tech: lines(stored.tech),
      github: link(stored.github),
      demo: link(stored.demo),
    });
  }
  return projects;
}
