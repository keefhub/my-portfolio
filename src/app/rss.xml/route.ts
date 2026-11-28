import { generateRssFeed } from "@/lib/blog/rss";
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
  // owner-publishes-posts-to-feeds fills this list.
  const posts: { title: string; excerpt: string; date: string; slug: string }[] = [];

  return new Response(generateRssFeed(posts, SITE_URL), {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
    },
  });
}
