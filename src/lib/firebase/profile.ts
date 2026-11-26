import { doc, getDocFromServer, setDoc } from "firebase/firestore";
import { getFirebaseDb } from "./client";
import {
  PROFILE_COLLECTION,
  PROFILE_DOC_ID,
  profileFromData,
  type ProfileContent,
} from "../admin/profile";

export const SAVE_TIMEOUT_MS: number = 10000;

export async function loadProfile(): Promise<ProfileContent | null> {
  const snap = await getDocFromServer(doc(getFirebaseDb(), PROFILE_COLLECTION, PROFILE_DOC_ID));
  if (!snap.exists()) return null;
  return profileFromData(snap.data());
}

export async function saveProfile(content: ProfileContent): Promise<void> {
  const write = setDoc(doc(getFirebaseDb(), PROFILE_COLLECTION, PROFILE_DOC_ID), {
    name: content.name,
    headline: content.headline,
    about: content.about,
    photo: content.photo,
    email: content.email,
    resumeLink: content.resumeLink,
    socialLinks: content.socialLinks.map((l) => ({ label: l.label, url: l.url })),
    updatedAt: Date.now(),
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("The profile write timed out.")), SAVE_TIMEOUT_MS);
  });
  try {
    await Promise.race([write, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
