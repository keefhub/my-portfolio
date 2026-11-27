// Public web config: identifies a Firebase project to the browser and grants no access by itself.
// The security rules decide who may read and write. The panel picks the config from the page address.
export type FirebaseWebConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  storageBucket: string;
};

export type FirebaseEnvironment = "production" | "sit" | "local";

export const PRODUCTION_WEB_CONFIG: FirebaseWebConfig = {
  apiKey: "AIzaSyD2tbkbTU61DU6Jx8e-9w6rdaA8MTke0G0",
  authDomain: "thegoldenpothos-5b3a1.firebaseapp.com",
  projectId: "thegoldenpothos-5b3a1",
  appId: "1:118802075178:web:2aadd98f062a076b6b7d53",
  storageBucket: "thegoldenpothos-5b3a1.appspot.com",
};

export const SIT_WEB_CONFIG: FirebaseWebConfig = {
  apiKey: "AIzaSyDl34sdCNVymhLMI6xQoHHxTXBRNpKY3Wo",
  authDomain: "thegoldenpothos-sit.firebaseapp.com",
  projectId: "thegoldenpothos-sit",
  appId: "1:997284265022:web:8bd2d5a364762d08a0256f",
  storageBucket: "thegoldenpothos-sit.firebasestorage.app",
};

// The local stand-ins (emulators) accept any key; the project ID and bucket match playwright.config.ts.
export const LOCAL_WEB_CONFIG: FirebaseWebConfig = {
  apiKey: "emulator-only-api-key",
  authDomain: "thegoldenpothos-5b3a1.firebaseapp.com",
  projectId: "thegoldenpothos-5b3a1",
  appId: "1:0:web:emulator-only",
  storageBucket: "thegoldenpothos-5b3a1.firebasestorage.app",
};

export const PRODUCTION_HOSTS: readonly string[] = [
  "thegoldenpothos.xyz",
  "thegoldenpothos-5b3a1.web.app",
  "thegoldenpothos-5b3a1.firebaseapp.com",
];

export const SIT_HOSTS: readonly string[] = [
  "sit.thegoldenpothos.xyz",
  "thegoldenpothos-sit.web.app",
  "thegoldenpothos-sit.firebaseapp.com",
];

// Exact host match. Any address that is not local or production is SIT,
// so a preview link or a mistyped domain can never write live content.
export function environmentFor(hostname: string): FirebaseEnvironment {
  if (hostname === "127.0.0.1" || hostname === "localhost") return "local";
  if (PRODUCTION_HOSTS.includes(hostname)) return "production";
  return "sit";
}

export function webConfigFor(hostname: string): FirebaseWebConfig {
  const environment = environmentFor(hostname);
  if (environment === "production") return PRODUCTION_WEB_CONFIG;
  if (environment === "local") return LOCAL_WEB_CONFIG;
  return SIT_WEB_CONFIG;
}

export const AUTH_EMULATOR_URL: string = "http://127.0.0.1:9099";

export const FIRESTORE_EMULATOR: { host: string; port: number } = { host: "127.0.0.1", port: 8080 };

export const STORAGE_EMULATOR: { host: string; port: number } = { host: "127.0.0.1", port: 9199 };

export function isEmulatorHost(hostname: string): boolean {
  return environmentFor(hostname) === "local";
}
