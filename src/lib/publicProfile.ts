export type SocialKind = "github" | "linkedin" | "mail" | "link";
export type ContactKind = SocialKind | "file";
export type PublicSocialLink = { label: string; url: string; kind: SocialKind };
export type ContactLink = { kind: ContactKind; href: string; label: string };
export type PublicProfile = {
  name: string;
  headline: string;
  about: string[];
  photo: string;
  email: string;
  resumeLink: string;
  socialLinks: PublicSocialLink[];
};

function parseUrl(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

export function socialKind(url: string): SocialKind {
  if (url.toLowerCase().startsWith("mailto:")) return "mail";
  const parsed = parseUrl(url);
  if (!parsed) return "link";
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return "link";
  const host = parsed.hostname.toLowerCase();
  if (host === "github.com") return "github";
  if (host === "linkedin.com" || host === "www.linkedin.com") return "linkedin";
  return "link";
}

export function publicProfileFrom(content: {
  name: string;
  headline: string;
  about: string[];
  photo: string;
  email: string;
  resumeLink: string;
  socialLinks: { label: string; url: string }[];
}): PublicProfile {
  const photoOk =
    content.photo.startsWith("/") || content.photo.startsWith("http://") || content.photo.startsWith("https://");
  return {
    name: content.name,
    headline: content.headline,
    about: content.about.filter((paragraph) => paragraph.trim() !== ""),
    photo: photoOk ? content.photo : "",
    email: content.email,
    resumeLink: content.resumeLink,
    socialLinks: content.socialLinks
      .filter((link) => link.url.trim() !== "")
      .map((link) => ({
        label: link.label.trim() !== "" ? link.label : (parseUrl(link.url)?.hostname ?? link.url),
        url: link.url,
        kind: socialKind(link.url),
      })),
  };
}

export function showsAbout(profile: PublicProfile): boolean {
  return profile.about.length > 0 || profile.photo !== "";
}

export function contactLinks(profile: PublicProfile, includeResume: boolean): ContactLink[] {
  const links: ContactLink[] = profile.socialLinks.map((link) => ({
    kind: link.kind,
    href: link.url,
    label: link.label,
  }));
  if (profile.email !== "") links.push({ kind: "mail", href: "mailto:" + profile.email, label: "Send email" });
  if (includeResume && profile.resumeLink !== "") {
    links.push({ kind: "file", href: profile.resumeLink, label: "Download resume" });
  }
  return links;
}
