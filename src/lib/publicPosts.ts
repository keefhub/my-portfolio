export type PublicBlogPost = {
  slug: string;
  title: string;
  excerpt: string;
  date: string;
  tags: string[];
  featured: boolean;
  coverImage: string;
  coverAlt: string;
  readingTime: number;
  content: string;
};

export function readingMinutes(markdown: string): number {
  const text = markdown.replace(/```[\s\S]*?```/g, " ").replace(/[#>*_`~\-[\]()]/g, " ");
  const words = text.split(/\s+/).filter((piece) => piece !== "").length;
  return Math.max(1, Math.round(words / 200));
}

function plainObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function realDay(date: unknown): date is string {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(date + "T00:00:00Z");
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function publishedPostsFrom(
  records: readonly { slug: string; published: boolean; data: unknown }[],
): PublicBlogPost[] {
  const posts: PublicBlogPost[] = [];
  for (const record of records) {
    if (record.published !== true) continue;
    if (!/^[a-z0-9-]+$/.test(record.slug)) continue;
    const data = plainObject(record.data);
    if (data === null) continue;
    if (typeof data.title !== "string" || data.title.trim() === "") continue;
    if (!realDay(data.date)) continue;
    const cover = typeof data.coverImage === "string" ? data.coverImage.trim() : "";
    const content = text(data.body);
    posts.push({
      slug: record.slug,
      title: data.title,
      excerpt: text(data.excerpt),
      date: data.date,
      tags: Array.isArray(data.tags)
        ? data.tags
            .filter((tag): tag is string => typeof tag === "string" && tag.trim() !== "")
            .map((tag) => tag.trim())
        : [],
      featured: data.featured === true,
      coverImage: /^\/(?!\/)\S+$|^https?:\/\/\S+$/i.test(cover) ? cover : "",
      coverAlt: text(data.coverAlt),
      readingTime: readingMinutes(content),
      content,
    });
  }
  return posts.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    if (a.title !== b.title) return a.title < b.title ? -1 : 1;
    if (a.slug !== b.slug) return a.slug < b.slug ? -1 : 1;
    return 0;
  });
}
