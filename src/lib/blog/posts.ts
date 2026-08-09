import "server-only";

import fs from "fs";
import path from "path";
import matter from "gray-matter";
import type { BlogPost, BlogPostLite, BlogFrontmatter } from "./types";

const BLOG_DIR = path.join(process.cwd(), "content", "blog");

export type { BlogPostLite };

/* ------------------------------------------------------------------ */
/*  Validation                                                         */
/* ------------------------------------------------------------------ */

const REQUIRED_FIELDS: (keyof BlogFrontmatter)[] = [
  "title",
  "excerpt",
  "date",
  "slug",
];

export function validateFrontmatter(
  fm: Record<string, unknown>,
  filePath: string,
): boolean {
  const fileName = path.basename(filePath);

  for (const field of REQUIRED_FIELDS) {
    const value = fm[field];

    if (value === undefined || value === null) {
      throw new Error(
        `[blog] Missing required field "${field}" in ${fileName}`,
      );
    }
    if (typeof value !== "string") {
      throw new Error(
        `[blog] Field "${field}" in ${fileName} must be a string, got ${typeof value}`,
      );
    }
    if (value.trim() === "") {
      throw new Error(`[blog] Field "${field}" in ${fileName} is empty`);
    }
  }

  const date = fm.date as string;
  if (Number.isNaN(new Date(date).getTime())) {
    throw new Error(
      `[blog] Invalid date "${date}" in ${fileName}. Use YYYY-MM-DD.`,
    );
  }

  return true;
}

/* ------------------------------------------------------------------ */
/*  Reading time                                                       */
/*  Computed from the body so it can never drift from the content.     */
/* ------------------------------------------------------------------ */

const WORDS_PER_MINUTE = 200;

export function estimateReadingTime(markdown: string): number {
  const words = markdown
    .replace(/```[\s\S]*?```/g, " ") // drop fenced code blocks
    .replace(/[#>*_`~\-[\]()]/g, " ") // drop markdown punctuation
    .split(/\s+/)
    .filter(Boolean).length;

  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

/* ------------------------------------------------------------------ */
/*  Memoized all-posts loader                                          */
/*  Reads every .md file once and caches the result.                   */
/* ------------------------------------------------------------------ */

/**
 * Cache is production-only. In `next dev` the markdown files are not module
 * dependencies, so Next has no reason to re-evaluate this module when you edit
 * a post — caching there would serve stale content until a server restart.
 */
const CACHE_ENABLED = process.env.NODE_ENV === "production";

let _allPostsCache: BlogPost[] | null = null;

function getAllPostsInternal(): BlogPost[] {
  if (CACHE_ENABLED && _allPostsCache) return _allPostsCache;

  if (!fs.existsSync(BLOG_DIR)) {
    _allPostsCache = [];
    return _allPostsCache;
  }

  const fileNames = fs.readdirSync(BLOG_DIR).filter((f) => f.endsWith(".md"));
  const seenSlugs = new Set<string>();
  const posts: BlogPost[] = [];

  for (const fileName of fileNames) {
    const filePath = path.join(BLOG_DIR, fileName);
    const raw = fs.readFileSync(filePath, "utf-8");
    const { data, content } = matter(raw);

    validateFrontmatter(data, filePath);

    if (seenSlugs.has(data.slug)) {
      throw new Error(
        `[blog] Duplicate slug "${data.slug}" in ${fileName}. Build will fail.`,
      );
    }
    seenSlugs.add(data.slug);

    posts.push({
      title: data.title,
      excerpt: data.excerpt,
      date: data.date,
      slug: data.slug,
      updated: data.updated,
      tags: data.tags,
      draft: data.draft,
      featured: data.featured,
      coverImage: data.coverImage,
      coverAlt: data.coverAlt,
      readingTime: data.readingTime ?? estimateReadingTime(content),
      content,
    });
  }

  // Sort newest first
  posts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  _allPostsCache = posts;
  return _allPostsCache;
}

/* ------------------------------------------------------------------ */
/*  Get published posts WITHOUT content (list-safe)                    */
/* ------------------------------------------------------------------ */

export function getPublishedPosts(): BlogPostLite[] {
  return getAllPostsInternal()
    .filter((p) => !p.draft)
    .map(({ content: _, ...rest }) => rest);
}

/* ------------------------------------------------------------------ */
/*  Get single post WITH content (detail page only)                    */
/* ------------------------------------------------------------------ */

export function getPostBySlug(slug: string): BlogPost | undefined {
  return getAllPostsInternal().find((p) => p.slug === slug && !p.draft);
}

/* ------------------------------------------------------------------ */
/*  Get featured posts WITHOUT content (list-safe)                     */
/* ------------------------------------------------------------------ */

export function getFeaturedPosts(): BlogPostLite[] {
  return getAllPostsInternal()
    .filter((p) => !p.draft && p.featured)
    .map(({ content: _, ...rest }) => rest);
}
