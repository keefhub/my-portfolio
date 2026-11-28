import { generateRssFeed } from "@/lib/blog/rss";
import { loadPublishedPosts } from "@/lib/server/publicPosts";
import { SITE_URL } from "@/lib/site";

/**
 * A kept static copy of the feed. It lists the published posts from the same
 * snapshot the blog page uses, and is renewed only by Publish or a deploy.
 */
export const dynamic = "force-static";

export async function GET(): Promise<Response> {
  const posts = await loadPublishedPosts();

  return new Response(
    generateRssFeed(
      posts.map((p) => ({
        title: p.title,
        excerpt: p.excerpt,
        date: p.date,
        slug: p.slug,
      })),
      SITE_URL,
    ),
    {
      headers: {
        "Content-Type": "application/rss+xml; charset=utf-8",
      },
    },
  );
}
