export const PROFILE_COLLECTION: string = "profile";
export const PROFILE_DOC_ID: string = "main";

export type SocialLink = { label: string; url: string };

export type ProfileContent = {
  name: string;
  headline: string;
  about: string[];
  photo: string;
  email: string;
  resumeLink: string;
  socialLinks: SocialLink[];
};

export type ProfileErrors = {
  name?: string;
  headline?: string;
  email?: string;
  resumeLink?: string;
  socialLinks: (string | undefined)[];
};

export type ProfileCheck = { ok: true; content: ProfileContent } | { ok: false; errors: ProfileErrors };

export const PROFILE_MESSAGES = {
  nameRequired: "Name is required",
  headlineRequired: "Headline is required",
  emailInvalid: "Enter an email address like name@site.com",
  resumeInvalid: "Enter a web address or a path starting with /",
  socialInvalid: "Enter a full web address starting with https://",
  saved: "Profile saved",
  saving: "Saving…",
  loading: "Loading profile…",
  loadFailed: "The profile could not be loaded.",
  imagesFailed: "The uploaded images could not be loaded.",
  notSavedOff: "The profile could not be saved. Saving is not switched on yet.",
  notSaved: "The profile could not be saved. Try again, and check that you are signed in as the owner.",
  noProfile: "No profile has been saved yet.",
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WEB_OR_PATH_PATTERN = /^https?:\/\/\S+$/;
const ROOT_PATH_PATTERN = /^\/(?!\/)\S*$/;
const HTTPS_PATTERN = /^https:\/\/\S+$/;

export function emptyProfile(): ProfileContent {
  return { name: "", headline: "", about: [], photo: "", email: "", resumeLink: "", socialLinks: [] };
}

export function checkProfile(input: ProfileContent): ProfileCheck {
  const name = input.name.trim();
  const headline = input.headline.trim();
  const photo = input.photo.trim();
  const email = input.email.trim();
  const resumeLink = input.resumeLink.trim();
  const about = input.about.map((p) => p.trim()).filter((p) => p !== "");
  const links = input.socialLinks.map((l) => ({ label: l.label.trim(), url: l.url.trim() }));

  const errors: ProfileErrors = { socialLinks: [] };
  let failed = false;

  if (name === "") {
    errors.name = PROFILE_MESSAGES.nameRequired;
    failed = true;
  }
  if (headline === "") {
    errors.headline = PROFILE_MESSAGES.headlineRequired;
    failed = true;
  }
  if (email !== "" && !EMAIL_PATTERN.test(email)) {
    errors.email = PROFILE_MESSAGES.emailInvalid;
    failed = true;
  }
  if (resumeLink !== "" && !WEB_OR_PATH_PATTERN.test(resumeLink) && !ROOT_PATH_PATTERN.test(resumeLink)) {
    errors.resumeLink = PROFILE_MESSAGES.resumeInvalid;
    failed = true;
  }
  errors.socialLinks = links.map((l) => {
    if (l.label === "" && l.url === "") return undefined;
    if (HTTPS_PATTERN.test(l.url)) return undefined;
    failed = true;
    return PROFILE_MESSAGES.socialInvalid;
  });

  if (failed) return { ok: false, errors };

  return {
    ok: true,
    content: {
      name,
      headline,
      about,
      photo,
      email,
      resumeLink,
      socialLinks: links.filter((l) => l.label !== "" || l.url !== ""),
    },
  };
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function profileFromData(data: unknown): ProfileContent {
  if (typeof data !== "object" || data === null) return emptyProfile();
  const d = data as Record<string, unknown>;
  const about = Array.isArray(d.about) ? d.about.filter((p): p is string => typeof p === "string") : [];
  const socialLinks: SocialLink[] = [];
  if (Array.isArray(d.socialLinks)) {
    for (const item of d.socialLinks) {
      if (typeof item === "object" && item !== null) {
        const l = item as Record<string, unknown>;
        socialLinks.push({ label: text(l.label), url: text(l.url) });
      }
    }
  }
  return {
    name: text(d.name),
    headline: text(d.headline),
    about,
    photo: text(d.photo),
    email: text(d.email),
    resumeLink: text(d.resumeLink),
    socialLinks,
  };
}

export function photoSelection(
  photo: string,
  images: readonly { id: string; url: string }[],
): { imageId: string; path: string } {
  if (photo !== "") {
    const match = images.find((i) => i.url === photo);
    if (match) return { imageId: match.id, path: "" };
  }
  return { imageId: "", path: photo };
}
