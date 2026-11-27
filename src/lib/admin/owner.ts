import { environmentFor, isEmulatorHost } from "../firebase/config";

export const OWNER_UID_PLACEHOLDER = "REPLACE_WITH_OWNER_UID";
// Production owner. Also put this same user ID in firestore.rules and storage.rules (function ownerUid in each).
export const OWNER_UID: string = OWNER_UID_PLACEHOLDER;
// SIT owner. Firebase user IDs are per project, so the SIT project has its own ID for the same person.
// Also put this same user ID in firestore.rules and storage.rules (function sitOwnerUid in each).
export const SIT_OWNER_UID: string = "WLkxsNcmo6MYOiWlODYiHxQVz7q2";
export const OWNER_UID_OVERRIDE_KEY = "admin.ownerUid";

export type AccessState = "unfilled" | "owner" | "not-allowed";

export function getOwnerUid(): string {
  if (typeof window !== "undefined" && isEmulatorHost(window.location.hostname)) {
    try {
      const stored = window.localStorage.getItem(OWNER_UID_OVERRIDE_KEY);
      if (stored) return stored;
    } catch {
      return ownerUidFor(window.location.hostname);
    }
  }
  if (typeof window === "undefined") return OWNER_UID;
  return ownerUidFor(window.location.hostname);
}

// The same page-address rule as webConfigFor: production keeps OWNER_UID, any other non-local address is SIT.
export function ownerUidFor(hostname: string): string {
  return environmentFor(hostname) === "sit" ? SIT_OWNER_UID : OWNER_UID;
}

export function accessFor(uid: string, ownerUid: string): AccessState {
  if (ownerUid === "" || ownerUid === OWNER_UID_PLACEHOLDER) return "unfilled";
  return uid === ownerUid ? "owner" : "not-allowed";
}
