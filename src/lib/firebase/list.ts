import {
  collection,
  deleteDoc,
  doc,
  getDocsFromServer,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { getFirebaseDb } from "./client";
import { UNPOSITIONED, sortEntries, type ListEntry, type ListStore } from "../admin/list";

export type { ListStore };

export const LIST_TIMEOUT_MS: number = 10000;

export async function withTimeout<R>(write: Promise<R>): Promise<R> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("The write timed out.")), LIST_TIMEOUT_MS);
  });
  try {
    return await Promise.race([write, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export function createListStore<T>(
  collectionName: string,
  fromData: (data: unknown) => T,
  toData: (content: T) => Record<string, unknown>,
): ListStore<T> {
  return {
    async load() {
      const snap = await getDocsFromServer(collection(getFirebaseDb(), collectionName));
      const entries = snap.docs.map((d): ListEntry<T> => {
        const data = d.data();
        const p = (data as Record<string, unknown>).position;
        return {
          id: d.id,
          position: typeof p === "number" && Number.isFinite(p) ? p : UNPOSITIONED,
          content: fromData(data),
        };
      });
      return sortEntries(entries);
    },
    async add(content, position) {
      const ref = doc(collection(getFirebaseDb(), collectionName));
      await withTimeout(setDoc(ref, { ...toData(content), position, updatedAt: Date.now() }));
      return ref.id;
    },
    async update(id, content) {
      const ref = doc(getFirebaseDb(), collectionName, id);
      await withTimeout(updateDoc(ref, { ...toData(content), updatedAt: Date.now() }));
    },
    async reorder(changes) {
      if (changes.length === 0) return;
      const db = getFirebaseDb();
      const batch = writeBatch(db);
      const now = Date.now();
      for (const c of changes) {
        batch.update(doc(db, collectionName, c.id), { position: c.position, updatedAt: now });
      }
      await withTimeout(batch.commit());
    },
    async remove(id) {
      await withTimeout(deleteDoc(doc(getFirebaseDb(), collectionName, id)));
    },
  };
}
