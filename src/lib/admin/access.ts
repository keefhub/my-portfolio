export type PanelState = "signed-out" | "owner" | "not-allowed";

export function accessFor(
  email: string | null | undefined,
  emailVerified: boolean | undefined,
  adminEmail: string | undefined,
): "owner" | "not-allowed" {
  if (emailVerified !== true) return "not-allowed";
  if (typeof adminEmail !== "string" || adminEmail.trim() === "") return "not-allowed";
  if (typeof email !== "string") return "not-allowed";
  return email.trim().toLowerCase() === adminEmail.trim().toLowerCase() ? "owner" : "not-allowed";
}

export function verifiedClaim(profile: { email_verified?: unknown } | null | undefined): boolean {
  return profile?.email_verified === true;
}

export function authLogLine(error: unknown): string {
  let type = "Error";
  if (typeof error === "object" && error !== null) {
    const candidate = error as { type?: unknown; name?: unknown };
    if (typeof candidate.type === "string" && candidate.type !== "") type = candidate.type;
    else if (typeof candidate.name === "string" && candidate.name !== "") type = candidate.name;
  }
  return "[auth] " + type;
}
