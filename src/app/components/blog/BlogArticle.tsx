import Link from "next/link";
import type { BlogPost } from "@/lib/blog/types";
import { formatDate } from "@/lib/blog/types";

interface BlogArticleProps {
  post: BlogPost;
  htmlContent: string;
}

export default function BlogArticle({ post, htmlContent }: BlogArticleProps) {
  return (
    <article className="max-w-3xl mx-auto px-4 sm:px-6 py-16 md:py-24">
      {/* Back link */}
      <Link
        href="/blog"
        className="inline-flex items-center gap-2 text-sm text-[var(--muted)] hover:text-[var(--accent-blue)] transition-colors duration-300 mb-8"
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
        All posts
      </Link>

      {/* Header */}
      <header className="mb-10">
        {/* Tags */}
        {post.tags && post.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {post.tags.map((tag) => (
              <span
                key={tag}
                className="text-xs font-medium px-2.5 py-1 rounded-full bg-[var(--accent-blue-subtle)] text-[var(--accent-blue)]"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-[var(--foreground)] mb-4 leading-tight gradient-text">
          {post.title}
        </h1>

        <div className="flex flex-wrap items-center gap-3 text-sm text-[var(--muted-soft)]">
          <time dateTime={post.date}>{formatDate(post.date)}</time>
          {post.updated && (
            <>
              <span aria-hidden="true">·</span>
              <span>
                Updated{" "}
                <time dateTime={post.updated}>{formatDate(post.updated)}</time>
              </span>
            </>
          )}
          {(post.readingTime ?? 0) > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <span>{post.readingTime} min read</span>
            </>
          )}
        </div>
      </header>

      {/* Content */}
      {/* Colours, code tokens and element tweaks live in globals.css under
          "Blog — Prose Theming", driven by the site design tokens. */}
      <div
        className="prose prose-lg max-w-none prose-a:no-underline hover:prose-a:underline"
        dangerouslySetInnerHTML={{ __html: htmlContent }}
      />

      {/* Footer */}
      <footer className="mt-16 pt-8 border-t border-[var(--border)]">
        <Link
          href="/blog"
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
          Back to all posts
        </Link>
      </footer>
    </article>
  );
}
