/** Shared frontmatter shape — safe to import from any component */
export interface BlogFrontmatter {
  title: string;
  excerpt: string;
  date: string;
  slug: string;
  updated?: string;
  tags?: string[];
  draft?: boolean;
  featured?: boolean;
  coverImage?: string;
  coverAlt?: string;
  readingTime?: number;
}

/** Parsed blog post with frontmatter + raw markdown body */
export interface BlogPost extends BlogFrontmatter {
  content: string;
}

/**
 * A post without its markdown body — what list views receive.
 * Declared here rather than alongside the loader so components can import it
 * without reaching into a module that pulls in `fs`.
 */
export type BlogPostLite = Omit<BlogPost, "content">;

/**
 * Format an ISO date string for display.
 *
 * `timeZone: "UTC"` is required, not cosmetic: "2026-05-15" parses as UTC
 * midnight, so formatting in the local zone renders a different day either
 * side of UTC. Without it, HTML baked at build time disagrees with a client
 * re-render in another timezone and React reports a hydration mismatch.
 */
export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-SG", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}
