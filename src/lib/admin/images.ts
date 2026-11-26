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

export type ImageRecord = {
  id: string;
  name: string;
  storagePath: string;
  url: string;
  contentType: string;
  size: number;
  createdAt: number;
};

const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
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

export function storagePathFor(id: string, contentType: string): string {
  const ext = Object.prototype.hasOwnProperty.call(EXTENSIONS, contentType)
    ? EXTENSIONS[contentType]
    : undefined;
  if (!ext) throw new Error("Unsupported image type.");
  return `images/${id}.${ext}`;
}
