import "server-only";
import {
  ALLOWED_IMAGE_TYPES,
  IMAGE_ID_PATTERN,
  MAX_IMAGE_BYTES,
  checkImageInput,
  imageExtension,
  type ImageRefusal,
  type UploadedImage,
} from "@/lib/admin/images";
import {
  deleteImageRecord,
  imageRecordExists,
  insertImageRecord,
  listImageRecords,
} from "@/lib/server/database";
import {
  createUploadAddress,
  deleteStoredImage,
  ensureBucket,
  publicImageUrl,
  statStoredImage,
} from "@/lib/server/storage";

export async function listUploadedImages(): Promise<UploadedImage[]> {
  await ensureBucket();
  const records = await listImageRecords();
  return records.map((record) => ({
    id: record.id,
    name: record.name,
    url: publicImageUrl(record.id),
    contentType: record.contentType,
    size: record.size,
  }));
}

export async function requestUpload(
  input: unknown,
): Promise<{ ok: true; id: string; uploadUrl: string } | { ok: false; reason: ImageRefusal }> {
  const checked = checkImageInput(input);
  if (!checked.ok) return { ok: false, reason: checked.reason };
  await ensureBucket();
  const extension = imageExtension(checked.value.type);
  const id = `${crypto.randomUUID()}.${extension}`;
  const uploadUrl = await createUploadAddress(id);
  return { ok: true, id, uploadUrl };
}

export async function registerUpload(
  input: unknown,
): Promise<{ ok: true; image: UploadedImage } | { ok: false; reason: ImageRefusal | "missing" | "rejected" }> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, reason: "invalid" };
  }
  const id = (input as { id?: unknown }).id;
  if (typeof id !== "string" || !IMAGE_ID_PATTERN.test(id)) return { ok: false, reason: "invalid" };
  const checked = checkImageInput(input);
  if (!checked.ok) return { ok: false, reason: checked.reason };
  const declared = checked.value;

  await ensureBucket();
  const stored = await statStoredImage(id);
  if (stored === null) return { ok: false, reason: "missing" };

  const size = stored.size !== null ? stored.size : declared.size;
  const type = stored.contentType !== null ? stored.contentType : declared.type;
  const extension = imageExtension(type);
  const rejected =
    size === 0 ||
    size > MAX_IMAGE_BYTES ||
    !ALLOWED_IMAGE_TYPES.includes(type) ||
    (stored.contentType !== null && stored.contentType !== declared.type) ||
    extension === null ||
    !id.endsWith(`.${extension}`);
  if (rejected) {
    try {
      await deleteStoredImage(id);
    } catch {
      // The removal is best effort; the rejected file is never listed.
    }
    return { ok: false, reason: "rejected" };
  }

  await insertImageRecord({ id, name: declared.name, contentType: type, size });
  return {
    ok: true,
    image: { id, name: declared.name, url: publicImageUrl(id), contentType: type, size },
  };
}

export async function deleteUploadedImage(input: unknown): Promise<"deleted" | "not-found" | "invalid"> {
  if (typeof input !== "string" || !IMAGE_ID_PATTERN.test(input)) return "invalid";
  if (!(await imageRecordExists(input))) return "not-found";
  await deleteStoredImage(input);
  return (await deleteImageRecord(input)) ? "deleted" : "not-found";
}
