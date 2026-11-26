import {
  collection,
  deleteDoc,
  doc,
  getDocsFromServer,
  runTransaction,
  updateDoc,
} from "firebase/firestore";
import { getFirebaseDb } from "./client";
import { withTimeout, type ListStore } from "./list";
import {
  BLOG_MESSAGES,
  BLOG_POSTS_COLLECTION,
  blogPostFromData,
  blogPostToData,
  sortBlogPosts,
  type BlogPostContent,
} from "../admin/blogposts";

export class SlugTakenError extends Error {
  constructor() {
    super(BLOG_MESSAGES.slugTaken);
    this.name = "SlugTakenError";
  }
}

export const blogPostsStore: ListStore<BlogPostContent> = {
  async load() {
    const snap = await getDocsFromServer(collection(getFirebaseDb(), BLOG_POSTS_COLLECTION));
    return sortBlogPosts(
      snap.docs.map((d) => ({
        id: d.id,
        position: 0,
        content: blogPostFromData(d.data(), d.id),
      })),
    );
  },
  async add(content) {
    const db = getFirebaseDb();
    const ref = doc(db, BLOG_POSTS_COLLECTION, content.slug);
    const now = Date.now();
    await withTimeout(
      runTransaction(db, async (tx) => {
        const existing = await tx.get(ref);
        if (existing.exists()) throw new SlugTakenError();
        tx.set(ref, { ...blogPostToData(content), createdAt: now, updatedAt: now });
      }),
    );
    return content.slug;
  },
  async update(id, content) {
    const ref = doc(getFirebaseDb(), BLOG_POSTS_COLLECTION, id);
    await withTimeout(updateDoc(ref, { ...blogPostToData(content), updatedAt: Date.now() }));
  },
  async reorder() {
    // Posts are ordered by date, so there is nothing to write.
  },
  async remove(id) {
    await withTimeout(deleteDoc(doc(getFirebaseDb(), BLOG_POSTS_COLLECTION, id)));
  },
};
