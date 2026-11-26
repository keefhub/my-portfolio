import { getApp, getApps, initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import { AUTH_EMULATOR_URL, firebaseWebConfig, isEmulatorHost } from "./config";

let cached: Auth | null = null;

export function getFirebaseAuth(): Auth {
  if (typeof window === "undefined") {
    throw new Error("Firebase Auth is only available in the browser.");
  }
  if (cached) return cached;
  const app = getApps().length > 0 ? getApp() : initializeApp(firebaseWebConfig);
  const auth = getAuth(app);
  if (isEmulatorHost(window.location.hostname)) {
    connectAuthEmulator(auth, AUTH_EMULATOR_URL, { disableWarnings: true });
  }
  cached = auth;
  return auth;
}
