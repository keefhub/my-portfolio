import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { getFirebaseAuth } from "./client";

export type AdminUser = { uid: string };

export function watchAuth(onChange: (user: AdminUser | null) => void): () => void {
  return onAuthStateChanged(getFirebaseAuth(), (user) => {
    onChange(user ? { uid: user.uid } : null);
  });
}

export async function signInWithGoogle(): Promise<void> {
  await signInWithPopup(getFirebaseAuth(), new GoogleAuthProvider());
}

export async function signOutUser(): Promise<void> {
  await signOut(getFirebaseAuth());
}
