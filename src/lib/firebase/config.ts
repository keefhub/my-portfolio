// Public web config: identifies the Firebase project, grants no access by itself.
// Replace the two placeholders with the values from the Firebase console.
export const firebaseWebConfig: {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
} = {
  apiKey: "REPLACE_WITH_FIREBASE_WEB_API_KEY",
  authDomain: "thegoldenpothos-5b3a1.firebaseapp.com",
  projectId: "thegoldenpothos-5b3a1",
  appId: "REPLACE_WITH_FIREBASE_WEB_APP_ID",
};

export const AUTH_EMULATOR_URL: string = "http://127.0.0.1:9099";

export function isEmulatorHost(hostname: string): boolean {
  return hostname === "127.0.0.1" || hostname === "localhost";
}
