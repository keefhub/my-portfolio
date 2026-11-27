import type { ListCheck } from "./list";

export const PROJECTS_COLLECTION: string = "projects";

export type ProjectContent = {
  title: string;
  shortDesc: string;
  description: string[];
  tech: string[];
  github: string;
  demo: string;
};

export const PROJECT_MESSAGES = {
  titleRequired: "Title is required",
  githubInvalid: "GitHub link must start with https:// or http://",
  demoInvalid: "Demo link must start with https:// or http://",
  emptyList: "No projects yet.",
  listLabel: "Projects list",
};

const LINK_PREFIX = /^https?:\/\//i;

export function emptyProject(): ProjectContent {
  return { title: "", shortDesc: "", description: [], tech: [], github: "", demo: "" };
}

export function checkProject(input: ProjectContent): ListCheck<ProjectContent> {
  const keep = (items: string[]): string[] => items.map((x) => x.trim()).filter((x) => x !== "");
  const content: ProjectContent = {
    title: input.title.trim(),
    shortDesc: input.shortDesc.trim(),
    description: keep(input.description),
    tech: keep(input.tech),
    github: input.github.trim(),
    demo: input.demo.trim(),
  };
  const errors: Record<string, string> = {};
  if (content.title === "") errors.title = PROJECT_MESSAGES.titleRequired;
  if (content.github !== "" && !LINK_PREFIX.test(content.github)) {
    errors.github = PROJECT_MESSAGES.githubInvalid;
  }
  if (content.demo !== "" && !LINK_PREFIX.test(content.demo)) {
    errors.demo = PROJECT_MESSAGES.demoInvalid;
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, content };
}

export function projectShape(input: unknown): ProjectContent | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
  const d = input as Record<string, unknown>;
  const text = (v: unknown): string | null => {
    if (v === undefined) return "";
    return typeof v === "string" ? v : null;
  };
  const strings = (v: unknown): string[] | null => {
    if (v === undefined) return [];
    if (!Array.isArray(v) || !v.every((x) => typeof x === "string")) return null;
    return [...(v as string[])];
  };
  const title = text(d.title);
  const shortDesc = text(d.shortDesc);
  const github = text(d.github);
  const demo = text(d.demo);
  const description = strings(d.description);
  const tech = strings(d.tech);
  if (
    title === null ||
    shortDesc === null ||
    github === null ||
    demo === null ||
    description === null ||
    tech === null
  ) {
    return null;
  }
  return { title, shortDesc, description, tech, github, demo };
}

export function projectFromData(data: unknown): ProjectContent {
  if (typeof data !== "object" || data === null) return emptyProject();
  const d = data as Record<string, unknown>;
  const text = (v: unknown): string => (typeof v === "string" ? v : "");
  const strings = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  return {
    title: text(d.title),
    shortDesc: text(d.shortDesc),
    description: strings(d.description),
    tech: strings(d.tech),
    github: text(d.github),
    demo: text(d.demo),
  };
}

export function projectToData(content: ProjectContent): Record<string, unknown> {
  return {
    title: content.title,
    shortDesc: content.shortDesc,
    description: [...content.description],
    tech: [...content.tech],
    github: content.github,
    demo: content.demo,
  };
}

export function projectLabel(content: ProjectContent): string {
  return content.title;
}
