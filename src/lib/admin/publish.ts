export const PUBLISH_URL: string = "/api/admin/publish/";

export const PUBLISH_MESSAGES = {
  publishing: "Publishing…",
  published: "Published. Visitors will see the profile within a minute.",
  failed:
    "The site could not be published because the database could not be reached. Try again later.",
  refused: "The site was not published. Check that you are signed in as the owner.",
};

export type PublishOutcome = "published" | "failed" | "refused";

export async function publishSite(): Promise<PublishOutcome> {
  try {
    const response = await fetch(PUBLISH_URL, {
      method: "POST",
      signal: AbortSignal.timeout(15000),
    });
    if (response.status === 401 || response.status === 403) return "refused";
    if (response.status !== 200) return "failed";
    const body: unknown = await response.json();
    if (typeof body === "object" && body !== null && (body as { published?: unknown }).published === true) {
      return "published";
    }
    return "failed";
  } catch {
    return "failed";
  }
}
