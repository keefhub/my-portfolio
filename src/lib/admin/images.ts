export const MAX_IMAGE_BYTES: number = 5 * 1024 * 1024;

export const ALLOWED_IMAGE_TYPES: readonly string[] = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
];

export const IMAGE_MESSAGES = {
  tooBig: "That image is over 5 MB",
  wrongType: "Only PNG, JPEG, WebP or SVG images can be uploaded",
  empty: "That file is empty",
  noFile: "Choose an image first.",
  uploadFailed: "The image could not be uploaded.",
  loadFailed: "The images could not be loaded.",
  deleteFailed: "That image could not be deleted.",
  alreadyDeleted: "That image was already deleted.",
  copied: "Address copied",
  copyFailed: "The address could not be copied.",
  loading: "Loading images…",
  uploading: "Uploading…",
  deleting: "Deleting…",
  emptyList: "No images uploaded yet",
};

export function validateImageFile(file: { name: string; size: number; type: string }): string | null {
  if (file.size === 0) return IMAGE_MESSAGES.empty;
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) return IMAGE_MESSAGES.wrongType;
  if (file.size > MAX_IMAGE_BYTES) return IMAGE_MESSAGES.tooBig;
  return null;
}

function trimmed(value: number): string {
  return String(Math.round(value * 10) / 10);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${trimmed(bytes / 1024)} KB`;
  return `${trimmed(bytes / 1048576)} MB`;
}

export type UploadedImage = { id: string; name: string; url: string; contentType: string; size: number };

export type ImageInput = { name: string; type: string; size: number };

export type ImageRefusal = "invalid" | "empty" | "wrong-type" | "too-big";

export type ImageInputCheck = { ok: true; value: ImageInput } | { ok: false; reason: ImageRefusal };

export const MAX_IMAGE_NAME_LENGTH: number = 255;

export const IMAGE_ID_PATTERN: RegExp =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp|svg)$/;

export function imageExtension(contentType: string): "png" | "jpg" | "webp" | "svg" | null {
  switch (contentType) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/svg+xml":
      return "svg";
    default:
      return null;
  }
}

export function checkImageInput(input: unknown): ImageInputCheck {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, reason: "invalid" };
  }
  const { name, type, size } = input as { name?: unknown; type?: unknown; size?: unknown };
  if (typeof name !== "string") return { ok: false, reason: "invalid" };
  const trimmedName = name.trim();
  if (trimmedName.length < 1 || trimmedName.length > MAX_IMAGE_NAME_LENGTH) {
    return { ok: false, reason: "invalid" };
  }
  if (typeof type !== "string") return { ok: false, reason: "invalid" };
  if (typeof size !== "number" || !Number.isSafeInteger(size) || size < 0) {
    return { ok: false, reason: "invalid" };
  }
  if (size === 0) return { ok: false, reason: "empty" };
  if (!ALLOWED_IMAGE_TYPES.includes(type)) return { ok: false, reason: "wrong-type" };
  if (size > MAX_IMAGE_BYTES) return { ok: false, reason: "too-big" };
  return { ok: true, value: { name: trimmedName, type, size } };
}
