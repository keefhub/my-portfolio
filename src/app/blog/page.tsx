import type { Metadata } from "next";
import { getPublishedPosts, getFeaturedPosts } from "@/lib/blog";
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

export default function BlogPage() {
  const allPosts = getPublishedPosts();
  const featuredPosts = getFeaturedPosts();

  return <BlogIndex posts={allPosts} featuredPosts={featuredPosts} />;
}
