import "server-only";
import { createHash } from "node:crypto";
import { revalidatePath, revalidateTag, unstable_cache } from "next/cache";
import { publishedPostsFrom, type PublicBlogPost } from "@/lib/publicPosts";
import { readPostRecords } from "@/lib/server/database";

function cacheKey(): string {
  return createHash("sha256")
    .update(process.env.SUPABASE_DB_URL ?? "")
    .digest("hex")
    .slice(0, 16);
}

export async function loadPublishedPosts(): Promise<PublicBlogPost[]> {
  if (process.env.NEXT_PHASE === "phase-production-build") {
    const setting = process.env.SUPABASE_DB_URL;
    if (setting === undefined || setting.trim() === "") return [];
  }
  const key = cacheKey();
  return await unstable_cache(
    async () => publishedPostsFrom(await readPostRecords(true)),
    ["published-blog-posts", key],
    { tags: ["blog-posts-" + key] },
  )();
}

export function refreshPublishedPosts(): void {
  const key = cacheKey();
  revalidateTag("blog-posts-" + key, { expire: 0 });
  revalidatePath("/blog", "layout");
}
