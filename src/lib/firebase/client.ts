import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore, type Firestore } from "firebase/firestore";
import { connectStorageEmulator, getStorage, type FirebaseStorage } from "firebase/storage";
import {
  AUTH_EMULATOR_URL,
  FIRESTORE_EMULATOR,
  STORAGE_EMULATOR,
  firebaseWebConfig,
  isEmulatorHost,
} from "./config";

let cached: Auth | null = null;
let cachedDb: Firestore | null = null;
let cachedStorage: FirebaseStorage | null = null;

function sharedApp(): FirebaseApp {
  return getApps().length > 0 ? getApp() : initializeApp(firebaseWebConfig);
}

export function getFirebaseAuth(): Auth {
  if (typeof window === "undefined") {
    throw new Error("Firebase Auth is only available in the browser.");
  }
  if (cached) return cached;
  const app = sharedApp();
  const auth = getAuth(app);
  if (isEmulatorHost(window.location.hostname)) {
    connectAuthEmulator(auth, AUTH_EMULATOR_URL, { disableWarnings: true });
  }
  cached = auth;
  return auth;
}

export function getFirebaseDb(): Firestore {
  if (typeof window === "undefined") {
    throw new Error("Firestore is only available in the browser.");
  }
  if (cachedDb) return cachedDb;
  const db = getFirestore(sharedApp());
  if (isEmulatorHost(window.location.hostname)) {
    connectFirestoreEmulator(db, FIRESTORE_EMULATOR.host, FIRESTORE_EMULATOR.port);
  }
  cachedDb = db;
  return db;
}

export function getFirebaseStorage(): FirebaseStorage {
  if (typeof window === "undefined") {
    throw new Error("Cloud Storage is only available in the browser.");
  }
  if (cachedStorage) return cachedStorage;
  const storage = getStorage(sharedApp());
  if (isEmulatorHost(window.location.hostname)) {
    connectStorageEmulator(storage, STORAGE_EMULATOR.host, STORAGE_EMULATOR.port);
  }
  storage.maxUploadRetryTime = 10000;
  storage.maxOperationRetryTime = 10000;
  cachedStorage = storage;
  return storage;
}
