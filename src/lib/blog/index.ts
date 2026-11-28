/**
 * Barrel for the blog library: types, date formatting, the markdown pipeline
 * and the RSS generator. It reads no files. Client components import types
 * from "@/lib/blog/types" directly rather than from here.
 */
export type { BlogPost, BlogPostLite, BlogFrontmatter } from "./types";
export { formatDate } from "./types";
export { markdownToHtml } from "./markdown";
export { generateRssFeed } from "./rss";
