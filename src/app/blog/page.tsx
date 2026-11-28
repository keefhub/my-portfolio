import type { Metadata } from "next";
import { loadPublishedPosts } from "@/lib/server/publicPosts";
import { absoluteUrl, SITE_NAME } from "@/lib/site";
import BlogIndex from "../components/blog/BlogIndex";

export const metadata: Metadata = {
  title: "Blog",
  description:
    "Thoughts on software engineering, plants, coffee, and photography by Keith Lim.",
  alternates: {
    canonical: absoluteUrl("/blog"),
    types: {
      "application/rss+xml": absoluteUrl("/rss.xml"),
    },
  },
  openGraph: {
    title: `Blog | ${SITE_NAME}`,
    description:
      "Thoughts on software engineering, plants, coffee, and photography.",
    url: absoluteUrl("/blog"),
  },
};

export const revalidate = false;

export default async function BlogPage() {
  const posts = await loadPublishedPosts();

  return <BlogIndex posts={posts} featuredPosts={posts.filter((p) => p.featured)} />;
}
