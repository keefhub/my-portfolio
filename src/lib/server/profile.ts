import "server-only";
import { checkProfile, profileFromData, type ProfileContent, type SocialLink } from "@/lib/admin/profile";
import { readProfileRecord, writeProfileRecord } from "@/lib/server/database";

export async function loadProfile(): Promise<ProfileContent | null> {
  const record = await readProfileRecord();
  return record === null ? null : profileFromData(record);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalText(value: unknown): string | null {
  if (value === undefined) return "";
  return typeof value === "string" ? value : null;
}

function shapeOf(input: unknown): ProfileContent | null {
  if (!isObject(input)) return null;
  const name = optionalText(input.name);
  const headline = optionalText(input.headline);
  const photo = optionalText(input.photo);
  const email = optionalText(input.email);
  const resumeLink = optionalText(input.resumeLink);
  if (name === null || headline === null || photo === null || email === null || resumeLink === null) return null;

  let about: string[] = [];
  if (input.about !== undefined) {
    if (!Array.isArray(input.about) || !input.about.every((p) => typeof p === "string")) return null;
    about = input.about as string[];
  }

  const socialLinks: SocialLink[] = [];
  if (input.socialLinks !== undefined) {
    if (!Array.isArray(input.socialLinks)) return null;
    for (const item of input.socialLinks) {
      if (!isObject(item)) return null;
      const label = optionalText(item.label);
      const url = optionalText(item.url);
      if (label === null || url === null) return null;
      socialLinks.push({ label, url });
    }
  }

  return { name, headline, about, photo, email, resumeLink, socialLinks };
}

export async function saveProfile(
  input: unknown,
): Promise<{ ok: true; profile: ProfileContent } | { ok: false }> {
  const shaped = shapeOf(input);
  if (shaped === null) return { ok: false };
  const checked = checkProfile(shaped);
  if (!checked.ok) return { ok: false };
  await writeProfileRecord(checked.content);
  return { ok: true, profile: checked.content };
}
