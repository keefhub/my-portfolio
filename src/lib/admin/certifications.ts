import type { ListCheck } from "./list";

export const CERTIFICATIONS_COLLECTION: string = "certifications";

export type CertificationContent = {
  name: string;
  icon: string;
  url: string;
};

export const CERT_MESSAGES = {
  nameRequired: "Enter a name",
  iconRequired: "Pick an uploaded image or enter a badge image path that starts with /",
  iconInvalid: "Enter a badge image path that starts with /",
  urlInvalid: "Enter a link that starts with https://",
  emptyList: "No certifications yet.",
  listLabel: "Certifications list",
  addLabel: "Add certification",
  imagesFailed: "The uploaded images could not be loaded.",
};

const LINK = /^https:\/\/\S+$/i;
const BADGE_PATH = /^\/(?!\/)\S+$/;
const BADGE_ADDRESS = /^https?:\/\/\S+$/i;

export function emptyCertification(): CertificationContent {
  return { name: "", icon: "", url: "" };
}

export function checkCertification(input: CertificationContent): ListCheck<CertificationContent> {
  const content: CertificationContent = {
    name: input.name.trim(),
    icon: input.icon.trim(),
    url: input.url.trim(),
  };
  const errors: Record<string, string> = {};
  if (content.name === "") errors.name = CERT_MESSAGES.nameRequired;
  if (content.icon === "") {
    errors.icon = CERT_MESSAGES.iconRequired;
  } else if (!BADGE_PATH.test(content.icon) && !BADGE_ADDRESS.test(content.icon)) {
    errors.icon = CERT_MESSAGES.iconInvalid;
  }
  if (!LINK.test(content.url)) errors.url = CERT_MESSAGES.urlInvalid;
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, content };
}

export function certificationShape(input: unknown): CertificationContent | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
  const d = input as Record<string, unknown>;
  const text = (v: unknown): string | null => {
    if (v === undefined) return "";
    return typeof v === "string" ? v : null;
  };
  const name = text(d.name);
  const icon = text(d.icon);
  const url = text(d.url);
  if (name === null || icon === null || url === null) return null;
  return { name, icon, url };
}

export function certificationFromData(data: unknown): CertificationContent {
  if (typeof data !== "object" || data === null) return emptyCertification();
  const d = data as Record<string, unknown>;
  const text = (v: unknown): string => (typeof v === "string" ? v : "");
  return { name: text(d.name), icon: text(d.icon), url: text(d.url) };
}

export function certificationToData(content: CertificationContent): Record<string, unknown> {
  return { name: content.name, icon: content.icon, url: content.url };
}

export function certificationLabel(content: CertificationContent): string {
  return content.name;
}
