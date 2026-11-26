import { isEmulatorHost } from "../firebase/config";

export const OWNER_UID_PLACEHOLDER = "REPLACE_WITH_OWNER_UID";
// Also put this same user ID in firestore.rules and storage.rules (function ownerUid in each).
export const OWNER_UID: string = OWNER_UID_PLACEHOLDER;
export const OWNER_UID_OVERRIDE_KEY = "admin.ownerUid";

export type AccessState = "unfilled" | "owner" | "not-allowed";

export function getOwnerUid(): string {
  if (typeof window !== "undefined" && isEmulatorHost(window.location.hostname)) {
    try {
      const stored = window.localStorage.getItem(OWNER_UID_OVERRIDE_KEY);
      if (stored) return stored;
    } catch {
      return OWNER_UID;
    }
  }
  return OWNER_UID;
}

export function accessFor(uid: string, ownerUid: string): AccessState {
  if (ownerUid === "" || ownerUid === OWNER_UID_PLACEHOLDER) return "unfilled";
  return uid === ownerUid ? "owner" : "not-allowed";
}
