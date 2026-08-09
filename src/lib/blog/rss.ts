import { absoluteUrl } from "../site";

/**
 * Generate an RSS 2.0 XML string for published blog posts.
 * Rendered by the static /rss.xml route handler at build time.
 *
 * Post URLs go through absoluteUrl so they match the canonical (trailing-slash)
 * form used by the pages and the sitemap.
 */
export function generateRssFeed(
  posts: {
    title: string;
    excerpt: string;
    date: string;
    slug: string;
  }[],
  baseUrl: string,
): string {
  const items = posts
    .map((p) => {
      const url = absoluteUrl(`/blog/${p.slug}`);
      return `    <item>
      <title><![CDATA[${p.title}]]></title>
      <description><![CDATA[${p.excerpt}]]></description>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <pubDate>${new Date(p.date).toUTCString()}</pubDate>
    </item>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>thegoldenpothos — Blog</title>
    <description>Keith Lim's blog on software, plants, coffee, and photography.</description>
    <link>${absoluteUrl("/blog")}</link>
    <language>en-sg</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${baseUrl}/rss.xml" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>`;
}
