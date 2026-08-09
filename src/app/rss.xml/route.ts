import { getPublishedPosts, generateRssFeed } from "@/lib/blog";
import { SITE_URL } from "@/lib/site";

/**
 * Statically generated at build time and emitted as /rss.xml by the export.
 *
 * This replaces an earlier approach that wrote public/rss.xml as a side effect
 * of importing the blog page module — that mutated the source tree on every dev
 * compile and depended on build step ordering to land in the output.
 */
export const dynamic = "force-static";

export function GET() {
  const posts = getPublishedPosts().map((p) => ({
    title: p.title,
    excerpt: p.excerpt,
    date: p.date,
    slug: p.slug,
  }));

  return new Response(generateRssFeed(posts, SITE_URL), {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
    },
  });
}
