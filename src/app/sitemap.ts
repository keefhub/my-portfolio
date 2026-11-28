import type { MetadataRoute } from "next";
import { loadPublishedPosts } from "@/lib/server/publicPosts";
import { absoluteUrl } from "@/lib/site";

export const dynamic = "force-static";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const posts = await loadPublishedPosts();

  return [
    {
      url: absoluteUrl("/"),
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 1,
    },
    {
      url: absoluteUrl("/blog"),
      lastModified: posts.length ? posts[0].date : new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    ...posts.map((p) => ({
      url: absoluteUrl("/blog/" + p.slug),
      lastModified: p.date,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
  ];
}
