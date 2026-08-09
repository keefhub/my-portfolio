/**
 * Barrel for the blog library.
 *
 * Note: `posts.ts` is server-only (it reads the filesystem). Client components
 * must import types from "@/lib/blog/types" directly rather than from here.
 */
export type { BlogPost, BlogPostLite, BlogFrontmatter } from "./types";
export { formatDate } from "./types";
export {
  getPublishedPosts,
  getPostBySlug,
  getFeaturedPosts,
  estimateReadingTime,
} from "./posts";
export { markdownToHtml } from "./markdown";
export { generateRssFeed } from "./rss";
