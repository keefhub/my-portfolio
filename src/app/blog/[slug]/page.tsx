import type { Metadata } from "next";
import { markdownToHtml } from "@/lib/markdown";
import { loadPublishedPosts } from "@/lib/server/publicPosts";
import { absoluteUrl, SITE_NAME } from "@/lib/site";
import BlogArticle from "../../components/blog/BlogArticle";
import { notFound } from "next/navigation";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export const revalidate = false;

export async function generateStaticParams(): Promise<{ slug: string }[]> {
  return [];
}

/* ------------------------------------------------------------------ */
/*  Dynamic metadata                                                   */
/* ------------------------------------------------------------------ */
export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = (await loadPublishedPosts()).find((p) => p.slug === slug);
  if (!post) return { title: "Post Not Found" };

  return {
    title: post.title,
    description: post.excerpt,
    alternates: { canonical: absoluteUrl(`/blog/${slug}`) },
    openGraph: {
      title: `${post.title} | ${SITE_NAME}`,
      description: post.excerpt,
      url: absoluteUrl(`/blog/${slug}`),
      type: "article",
      publishedTime: post.date,
      tags: post.tags,
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.excerpt,
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Page component                                                     */
/* ------------------------------------------------------------------ */
export default async function BlogArticlePage({ params }: PageProps) {
  const { slug } = await params;
  const post = (await loadPublishedPosts()).find((p) => p.slug === slug);
  if (!post) notFound();

  const htmlContent = await markdownToHtml(post.content);

  return <BlogArticle post={post} htmlContent={htmlContent} />;
}
