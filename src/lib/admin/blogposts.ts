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
  postGone: "This post no longer exists.",
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

export type BlogPostWire = {
  title: string;
  excerpt: string;
  date: string;
  slug: string;
  tags: string[];
  draft: boolean;
  featured: boolean;
  coverImage: string;
  coverAlt: string;
  body: string;
};

export function blogPostFromData(data: unknown, id?: string): BlogPostContent {
  const fallbackSlug = id ?? "";
  if (typeof data !== "object" || data === null) return { ...emptyBlogPost(), slug: fallbackSlug };
  const d = data as Record<string, unknown>;
  const text = (v: unknown): string => (typeof v === "string" ? v : "");
  const tags = Array.isArray(d.tags)
    ? d.tags.filter((t): t is string => typeof t === "string" && t !== "").join(", ")
    : "";
  return {
    title: text(d.title),
    excerpt: text(d.excerpt),
    date: text(d.date),
    slug: typeof d.slug === "string" && d.slug !== "" ? d.slug : fallbackSlug,
    tags,
    coverImage: text(d.coverImage),
    coverAlt: text(d.coverAlt),
    body: text(d.body),
    featured: d.featured === true,
    status: d.draft === false ? "Published" : "Draft",
  };
}

export function blogPostToData(content: BlogPostContent): BlogPostWire {
  return {
    title: content.title,
    excerpt: content.excerpt,
    date: content.date,
    slug: content.slug,
    tags: parseTags(content.tags),
    draft: content.status !== "Published",
    featured: content.featured,
    coverImage: content.coverImage,
    coverAlt: content.coverAlt,
    body: content.body,
  };
}

export function blogPostShape(input: unknown): BlogPostContent | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
  const d = input as Record<string, unknown>;
  const textOf = (v: unknown): string | null => {
    if (v === undefined) return "";
    return typeof v === "string" ? v : null;
  };
  const title = textOf(d.title);
  const excerpt = textOf(d.excerpt);
  const date = textOf(d.date);
  const slug = textOf(d.slug);
  const coverImage = textOf(d.coverImage);
  const coverAlt = textOf(d.coverAlt);
  const body = textOf(d.body);
  if (
    title === null ||
    excerpt === null ||
    date === null ||
    slug === null ||
    coverImage === null ||
    coverAlt === null ||
    body === null
  ) {
    return null;
  }
  let tags = "";
  if (d.tags !== undefined) {
    if (!Array.isArray(d.tags) || !d.tags.every((t) => typeof t === "string")) return null;
    tags = (d.tags as string[]).join(", ");
  }
  if (d.draft !== undefined && typeof d.draft !== "boolean") return null;
  if (d.featured !== undefined && typeof d.featured !== "boolean") return null;
  const draft = d.draft === undefined ? true : d.draft;
  return {
    title,
    excerpt,
    date,
    slug,
    tags,
    coverImage,
    coverAlt,
    body,
    featured: d.featured === true,
    status: draft === false ? "Published" : "Draft",
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
