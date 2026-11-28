import "server-only";
import { publishedPostsFrom, type PublicBlogPost } from "@/lib/publicPosts";
import { readPostRecords } from "@/lib/server/database";
import { keptRead } from "@/lib/server/keptRead";

export async function loadPublishedPosts(): Promise<PublicBlogPost[]> {
  return keptRead(
    "published-blog-posts",
    async () => publishedPostsFrom(await readPostRecords(true)),
    [] as PublicBlogPost[],
  );
}
