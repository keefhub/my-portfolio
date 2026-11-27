import "server-only";
import {
  blogPostFromData,
  blogPostShape,
  blogPostToData,
  checkBlogPost,
  parseTags,
  sortBlogPosts,
  type BlogPostContent,
  type BlogPostWire,
} from "@/lib/admin/blogposts";
import type { ListEntry } from "@/lib/admin/list";
import {
  deletePostRecord,
  insertPostRecord,
  readPostRecord,
  readPostRecords,
  updatePostRecord,
  type StoredPost,
} from "@/lib/server/database";

export type PostEntry = { id: string; position: number; content: BlogPostWire };

export type PublicPost = {
  title: string;
  excerpt: string;
  date: string;
  slug: string;
  tags: string[];
  coverImage: string;
  coverAlt: string;
  body: string;
  featured: boolean;
};

export type PostService = {
  list(): Promise<PostEntry[]>;
  get(slug: unknown): Promise<PostEntry | "invalid" | "not-found">;
  listPublished(): Promise<PublicPost[]>;
  getPublished(slug: unknown): Promise<PublicPost | "invalid" | "not-found">;
  add(body: unknown): Promise<{ ok: true; id: string } | { ok: false; reason: "invalid" | "slug-taken" }>;
  update(id: unknown, body: unknown): Promise<"updated" | "not-found" | "invalid">;
  remove(id: unknown): Promise<"deleted" | "not-found" | "invalid">;
};

const SLUG_PATTERN = /^[a-z0-9-]+$/;

function validSlug(value: unknown): value is string {
  return typeof value === "string" && SLUG_PATTERN.test(value);
}

function plainObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function checkedContent(body: unknown): BlogPostContent | null {
  const object = plainObject(body);
  if (object === null) return null;
  const shaped = blogPostShape(object.content);
  if (shaped === null) return null;
  const checked = checkBlogPost(shaped);
  return checked.ok ? checked.content : null;
}

function recordOf(content: BlogPostContent): StoredPost {
  return {
    slug: content.slug,
    published: content.status === "Published",
    data: {
      title: content.title,
      excerpt: content.excerpt,
      date: content.date,
      tags: parseTags(content.tags),
      featured: content.featured,
      coverImage: content.coverImage,
      coverAlt: content.coverAlt,
      body: content.body,
    },
  };
}

function contentOf(record: StoredPost): BlogPostContent {
  const data = plainObject(record.data) ?? {};
  return blogPostFromData({ ...data, slug: record.slug, draft: !record.published });
}

function entryOf(record: StoredPost): ListEntry<BlogPostContent> {
  return { id: record.slug, position: 0, content: contentOf(record) };
}

function toPostEntry(entry: ListEntry<BlogPostContent>): PostEntry {
  return { id: entry.id, position: 0, content: blogPostToData(entry.content) };
}

function toPublicPost(content: BlogPostContent): PublicPost {
  return {
    title: content.title,
    excerpt: content.excerpt,
    date: content.date,
    slug: content.slug,
    tags: parseTags(content.tags),
    coverImage: content.coverImage,
    coverAlt: content.coverAlt,
    body: content.body,
    featured: content.featured,
  };
}

export function createPostService(): PostService {
  return {
    async list() {
      const records = await readPostRecords(false);
      return sortBlogPosts(records.map(entryOf)).map(toPostEntry);
    },

    async get(slug) {
      if (!validSlug(slug)) return "invalid";
      const record = await readPostRecord(slug, false);
      if (record === null) return "not-found";
      return toPostEntry(entryOf(record));
    },

    async listPublished() {
      const records = await readPostRecords(true);
      return sortBlogPosts(records.map(entryOf)).map((entry) => toPublicPost(entry.content));
    },

    async getPublished(slug) {
      if (!validSlug(slug)) return "invalid";
      const record = await readPostRecord(slug, true);
      if (record === null || !record.published) return "not-found";
      return toPublicPost(contentOf(record));
    },

    async add(body) {
      const content = checkedContent(body);
      if (content === null) return { ok: false, reason: "invalid" };
      const inserted = await insertPostRecord(recordOf(content));
      if (!inserted) return { ok: false, reason: "slug-taken" };
      return { ok: true, id: content.slug };
    },

    async update(id, body) {
      if (!validSlug(id)) return "invalid";
      const content = checkedContent(body);
      if (content === null || content.slug !== id) return "invalid";
      const updated = await updatePostRecord(recordOf(content));
      return updated ? "updated" : "not-found";
    },

    async remove(id) {
      if (!validSlug(id)) return "invalid";
      const deleted = await deletePostRecord(id);
      return deleted ? "deleted" : "not-found";
    },
  };
}
