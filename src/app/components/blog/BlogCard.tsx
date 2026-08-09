import Link from "next/link";
import type { BlogPostLite } from "@/lib/blog/types";
import { formatDate } from "@/lib/blog/types";

interface BlogCardProps {
  post: BlogPostLite;
  featured?: boolean;
}

export default function BlogCard({ post, featured }: BlogCardProps) {
  return (
    <article
      className={`group relative rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface)] transition-all duration-300 hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5 ${
        featured ? "ring-2 ring-[var(--accent-blue)]/30" : ""
      }`}
    >
      <Link
        href={`/blog/${post.slug}`}
        className="block p-6 sm:p-8"
        aria-label={`Read "${post.title}"`}
      >
        {/* Tags */}
        {post.tags && post.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {post.tags.map((tag) => (
              <span
                key={tag}
                className="text-xs font-medium px-2.5 py-1 rounded-full bg-[var(--accent-blue-subtle)] text-[var(--accent-blue)]"
              >
                {tag}
              </span>
            ))}
            {featured && (
              <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-[var(--accent-rose-subtle)] text-[var(--accent-rose)]">
                Featured
              </span>
            )}
          </div>
        )}

        {/* Title */}
        <h2 className="text-xl sm:text-2xl font-bold text-[var(--foreground)] mb-2 group-hover:text-[var(--accent-blue)] transition-colors duration-300">
          {post.title}
        </h2>

        {/* Excerpt */}
        <p className="text-[var(--muted)] text-sm sm:text-base leading-relaxed mb-4 line-clamp-3">
          {post.excerpt}
        </p>

        {/* Meta */}
        <div className="flex items-center gap-3 text-xs text-[var(--muted-soft)]">
          <time dateTime={post.date}>{formatDate(post.date)}</time>
          {(post.readingTime ?? 0) > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <span>{post.readingTime} min read</span>
            </>
          )}
        </div>
      </Link>
    </article>
  );
}
