import {
  collection,
  deleteDoc,
  doc,
  getDocFromServer,
  getDocs,
  orderBy,
  query,
  setDoc,
} from "firebase/firestore";
import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { getFirebaseDb, getFirebaseStorage } from "./client";
import { storagePathFor, type ImageRecord } from "../admin/images";

export class ImageGoneError extends Error {
  constructor() {
    super("That image was already deleted.");
    this.name = "ImageGoneError";
  }
}

export async function listImages(): Promise<ImageRecord[]> {
  const snap = await getDocs(query(collection(getFirebaseDb(), "images"), orderBy("createdAt", "desc")));
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      name: data.name,
      storagePath: data.storagePath,
      url: data.url,
      contentType: data.contentType,
      size: data.size,
      createdAt: data.createdAt,
    };
  });
}

export async function uploadImage(file: File): Promise<ImageRecord> {
  const id = crypto.randomUUID();
  const storagePath = storagePathFor(id, file.type);
  const fileRef = ref(getFirebaseStorage(), storagePath);
  await uploadBytes(fileRef, file, { contentType: file.type });
  try {
    const url = await getDownloadURL(fileRef);
    const record: ImageRecord = {
      id,
      name: file.name,
      storagePath,
      url,
      contentType: file.type,
      size: file.size,
      createdAt: Date.now(),
    };
    const { id: _id, ...fields } = record;
    void _id;
    await setDoc(doc(getFirebaseDb(), "images", id), fields);
    return record;
  } catch (err) {
    try {
      await deleteObject(fileRef);
    } catch {
      // ignored: the original error is what the caller needs
    }
    throw err;
  }
}

export async function deleteImage(image: ImageRecord): Promise<void> {
  const entry = doc(getFirebaseDb(), "images", image.id);
  const snap = await getDocFromServer(entry);
  if (!snap.exists()) throw new ImageGoneError();
  try {
    await deleteObject(ref(getFirebaseStorage(), image.storagePath));
  } catch (err) {
    if ((err as { code?: string }).code !== "storage/object-not-found") throw err;
  }
  await deleteDoc(entry);
}
