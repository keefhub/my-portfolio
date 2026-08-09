/**
 * Single source of truth for the site's public origin.
 *
 * Used for canonical URLs, Open Graph URLs, RSS links, and the sitemap.
 * Change it here only — never hardcode the origin in a page or component.
 */
export const SITE_URL = "https://thegoldenpothos.dev";

export const SITE_NAME = "thegoldenpothos";

/**
 * Absolute URL for a site-relative path, e.g. absoluteUrl("/blog").
 *
 * Always emits a trailing slash to match `trailingSlash: true` in
 * next.config.ts. Without it, canonical/OG/RSS/sitemap URLs would point at
 * addresses that 301-redirect to their slashed form.
 */
export function absoluteUrl(pathname: string): string {
  const withLeading = pathname.startsWith("/") ? pathname : `/${pathname}`;

  // File paths (/rss.xml, /sitemap.xml) are served as-is and must not be slashed.
  const lastSegment = withLeading.split("/").pop() ?? "";
  const isFile = lastSegment.includes(".");

  const needsSlash = !isFile && !withLeading.endsWith("/");
  return `${SITE_URL}${needsSlash ? `${withLeading}/` : withLeading}`;
}
