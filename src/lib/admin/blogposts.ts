import type { ListCheck, ListEntry } from "./list";
import { formatDate } from "../blog/types";

export const BLOG_POSTS_COLLECTION: string = "blogPosts";

export type BlogStatus = "Draft" | "Published";

export type BlogPostContent = {
  title: string;
  excerpt: string;
  date: string;
  slug: string;
  tags: string;
  coverImage: string;
  coverAlt: string;
  body: string;
  featured: boolean;
  status: BlogStatus;
};

export const BLOG_MESSAGES = {
  titleRequired: "Enter a title",
  excerptRequired: "Enter an excerpt",
  dateInvalid: "Enter a date as YYYY-MM-DD that is a real day",
  slugInvalid: "Enter a slug of lowercase letters, digits and hyphens",
  bodyRequired: "Enter the post body",
  slugTaken: "A post with this slug already exists",
  slugFixed: "The slug cannot be changed after the first save.",
  emptyList: "No posts yet.",
  listLabel: "Blog posts list",
  addLabel: "Add post",
  imagesFailed: "The uploaded images could not be loaded.",
};

const DATE_SHAPE = /^[1-9]\d{3}-\d{2}-\d{2}$/;
const SLUG_SHAPE = /^[a-z0-9-]+$/;

export function emptyBlogPost(): BlogPostContent {
  return {
    title: "",
    excerpt: "",
    date: "",
    slug: "",
    tags: "",
    coverImage: "",
    coverAlt: "",
    body: "",
    featured: false,
    status: "Draft",
  };
}

export function parseTags(text: string): string[] {
  return text
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "");
}

export function isRealDate(text: string): boolean {
  if (!DATE_SHAPE.test(text)) return false;
  const year = Number(text.slice(0, 4));
  const month = Number(text.slice(5, 7));
  const day = Number(text.slice(8, 10));
  if (month < 1 || month > 12 || day < 1) return false;
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const lengths = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= lengths[month - 1];
}

export function checkBlogPost(input: BlogPostContent): ListCheck<BlogPostContent> {
  const content: BlogPostContent = {
    title: input.title.trim(),
    excerpt: input.excerpt.trim(),
    date: input.date.trim(),
    slug: input.slug.trim(),
    tags: parseTags(input.tags).join(", "),
    coverImage: input.coverImage.trim(),
    coverAlt: input.coverAlt.trim(),
    body: input.body,
    featured: input.featured,
    status: input.status,
  };
  const errors: Record<string, string> = {};
  if (content.title === "") errors.title = BLOG_MESSAGES.titleRequired;
  if (content.excerpt === "") errors.excerpt = BLOG_MESSAGES.excerptRequired;
  if (!isRealDate(content.date)) errors.date = BLOG_MESSAGES.dateInvalid;
  if (!SLUG_SHAPE.test(content.slug)) errors.slug = BLOG_MESSAGES.slugInvalid;
  if (input.body.trim() === "") errors.body = BLOG_MESSAGES.bodyRequired;
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, content };
}

export function blogPostFromData(data: unknown, id: string): BlogPostContent {
  if (typeof data !== "object" || data === null) return { ...emptyBlogPost(), slug: id };
  const d = data as Record<string, unknown>;
  const text = (v: unknown): string => (typeof v === "string" ? v : "");
  const tags = Array.isArray(d.tags)
    ? d.tags.filter((t): t is string => typeof t === "string" && t !== "").join(", ")
    : "";
  return {
    title: text(d.title),
    excerpt: text(d.excerpt),
    date: text(d.date),
    slug: id,
    tags,
    coverImage: text(d.coverImage),
    coverAlt: text(d.coverAlt),
    body: text(d.body),
    featured: d.featured === true,
    status: d.draft === false ? "Published" : "Draft",
  };
}

export function blogPostToData(content: BlogPostContent): Record<string, unknown> {
  return {
    title: content.title,
    excerpt: content.excerpt,
    date: content.date,
    tags: parseTags(content.tags),
    draft: content.status !== "Published",
    featured: content.featured,
    coverImage: content.coverImage,
    coverAlt: content.coverAlt,
    body: content.body,
  };
}

export function blogPostLabel(content: BlogPostContent): string {
  return content.title.trim() === "" ? content.slug : content.title;
}

export function blogPostLines(content: BlogPostContent): string[] {
  return [
    `Slug: ${content.slug}`,
    `Date: ${isRealDate(content.date) ? formatDate(content.date) : "No date"}`,
    `Status: ${content.status}`,
  ];
}

export function sortBlogPosts(
  entries: readonly ListEntry<BlogPostContent>[],
): ListEntry<BlogPostContent>[] {
  return [...entries].sort((a, b) => {
    if (a.content.date !== b.content.date) return a.content.date < b.content.date ? 1 : -1;
    if (a.content.title !== b.content.title) return a.content.title < b.content.title ? -1 : 1;
    if (a.id === b.id) return 0;
    return a.id < b.id ? -1 : 1;
  });
}
