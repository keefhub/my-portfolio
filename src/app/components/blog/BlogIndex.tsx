import Link from "next/link";
import type { BlogPostLite } from "@/lib/blog/types";
import BlogCard from "./BlogCard";

interface BlogIndexProps {
  posts: BlogPostLite[];
  featuredPosts: BlogPostLite[];
}

export default function BlogIndex({ posts, featuredPosts }: BlogIndexProps) {
  // Separate featured from regular
  const featuredSlugs = new Set(featuredPosts.map((p) => p.slug));
  const regularPosts = posts.filter((p) => !featuredSlugs.has(p.slug));

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-16 md:py-24">
      {/* Page header */}
      <div className="mb-12">
        <h1 className="text-4xl sm:text-5xl font-extrabold text-[var(--foreground)] mb-4 gradient-text">
          Blog
        </h1>
        <p className="text-lg text-[var(--muted)] max-w-2xl">
          Thoughts on software engineering, plants, coffee, and photography.
        </p>
      </div>

      {/* Featured posts */}
      {featuredPosts.length > 0 && (
        <section className="mb-16" aria-labelledby="featured-heading">
          <h2
            id="featured-heading"
            className="text-sm font-semibold uppercase tracking-widest text-[var(--accent-blue)] mb-6"
          >
            Featured
          </h2>
          <div className="grid gap-6 sm:grid-cols-2">
            {featuredPosts.map((post) => (
              <BlogCard key={post.slug} post={post} featured />
            ))}
          </div>
        </section>
      )}

      {/* All posts */}
      <section aria-labelledby="all-posts-heading">
        <h2
          id="all-posts-heading"
          className="text-sm font-semibold uppercase tracking-widest text-[var(--muted-soft)] mb-6"
        >
          All Posts
        </h2>
        {regularPosts.length > 0 ? (
          <div className="grid gap-6 sm:grid-cols-2">
            {regularPosts.map((post) => (
              <BlogCard key={post.slug} post={post} />
            ))}
          </div>
        ) : (
          <p className="text-[var(--muted)] italic">
            No posts yet — check back soon!
          </p>
        )}
      </section>

      {/* Back link */}
      <div className="mt-16 pt-8 border-t border-[var(--border)]">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-[var(--muted)] hover:text-[var(--accent-blue)] transition-colors duration-300"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Back to portfolio
        </Link>
      </div>
    </div>
  );
}
