import type { ListCheck } from "./list";

export const EXPERIENCE_COLLECTION: string = "experience";

export type ExperienceContent = {
  year: string;
  title: string;
  company: string;
  duration: string;
  description: string;
  details: string[];
};

export const EXPERIENCE_MESSAGES = {
  yearRequired: "Year is required",
  titleRequired: "Title is required",
  companyRequired: "Company is required",
  durationRequired: "Duration is required",
  descriptionRequired: "Description is required",
};

export function emptyExperience(): ExperienceContent {
  return { year: "", title: "", company: "", duration: "", description: "", details: [] };
}

export function checkExperience(input: ExperienceContent): ListCheck<ExperienceContent> {
  const content: ExperienceContent = {
    year: input.year.trim(),
    title: input.title.trim(),
    company: input.company.trim(),
    duration: input.duration.trim(),
    description: input.description.trim(),
    details: input.details.map((d) => d.trim()).filter((d) => d !== ""),
  };
  const errors: Record<string, string> = {};
  if (content.year === "") errors.year = EXPERIENCE_MESSAGES.yearRequired;
  if (content.title === "") errors.title = EXPERIENCE_MESSAGES.titleRequired;
  if (content.company === "") errors.company = EXPERIENCE_MESSAGES.companyRequired;
  if (content.duration === "") errors.duration = EXPERIENCE_MESSAGES.durationRequired;
  if (content.description === "") errors.description = EXPERIENCE_MESSAGES.descriptionRequired;
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, content };
}

export function experienceFromData(data: unknown): ExperienceContent {
  if (typeof data !== "object" || data === null) return emptyExperience();
  const d = data as Record<string, unknown>;
  const text = (v: unknown): string => (typeof v === "string" ? v : "");
  return {
    year: text(d.year),
    title: text(d.title),
    company: text(d.company),
    duration: text(d.duration),
    description: text(d.description),
    details: Array.isArray(d.details)
      ? d.details.filter((x): x is string => typeof x === "string")
      : [],
  };
}

export function experienceToData(content: ExperienceContent): Record<string, unknown> {
  return {
    year: content.year,
    title: content.title,
    company: content.company,
    duration: content.duration,
    description: content.description,
    details: [...content.details],
  };
}

export function experienceLabel(content: ExperienceContent): string {
  return `${content.title} at ${content.company}`;
}
