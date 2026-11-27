import type { UploadedImage } from "@/lib/admin/images";

const FAILED = "The request failed.";
const API = "/api/admin/images/";

export class ImageGoneError extends Error {
  constructor() {
    super("That image was already deleted.");
    this.name = "ImageGoneError";
  }
}

function failure(): Error {
  return new Error(FAILED);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isImage(value: unknown): value is UploadedImage {
  return (
    isObject(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.url === "string" &&
    typeof value.contentType === "string" &&
    typeof value.size === "number"
  );
}

async function send(url: string, init: RequestInit, timeout = 15000): Promise<Response> {
  try {
    return await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(timeout) });
  } catch {
    throw failure();
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw failure();
  }
}

export async function listImages(): Promise<UploadedImage[]> {
  const response = await send(API, { method: "GET" });
  if (!response.ok) throw failure();
  const body = await readJson(response);
  if (!isObject(body) || !Array.isArray(body.images) || !body.images.every(isImage)) throw failure();
  return body.images;
}

export async function uploadImage(file: File): Promise<UploadedImage> {
  const details = { name: file.name, type: file.type, size: file.size };

  const issued = await send(API + "upload/", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(details),
  });
  if (!issued.ok) throw failure();
  const address = await readJson(issued);
  if (!isObject(address) || typeof address.id !== "string" || typeof address.uploadUrl !== "string") {
    throw failure();
  }
  const { id, uploadUrl } = address;

  const stored = await send(
    uploadUrl,
    { method: "PUT", headers: { "content-type": file.type }, credentials: "omit", body: file },
    60000,
  );
  if (!stored.ok) throw failure();

  const registered = await send(API, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id, ...details }),
  });
  if (!registered.ok) throw failure();
  const body = await readJson(registered);
  if (!isObject(body) || !isImage(body.image)) throw failure();
  return body.image;
}

export async function deleteImage(id: string): Promise<void> {
  const response = await send(API + "?id=" + encodeURIComponent(id), { method: "DELETE" });
  if (response.status === 404) throw new ImageGoneError();
  if (!response.ok) throw failure();
}
