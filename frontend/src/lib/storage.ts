import { putImage, removeImageIfUnreferenced } from "@/lib/storage.functions";

/** Encodes a blob for the upload server function. */
async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * Image storage abstraction. Writes go to the Cloudflare R2 bucket bound as
 * MEDIA through the admin-only server functions, and reads happen through
 * /api/public/img/*. The database only ever stores URL references, never
 * binary data.
 */
export const IMAGE_BUCKET = "shop-media";
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
];

export function storageUrl(path: string): string {
  return `/api/public/img/${path}`;
}

export function validateImageFile(file: File): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return "Please choose a JPG, PNG, WebP or AVIF image.";
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return "That image is larger than 8 MB. Please use a smaller file.";
  }
  return null;
}

/** Re-encodes to WebP in the browser so we never upload huge originals. */
async function toWebp(file: File): Promise<{ blob: Blob; ext: string }> {
  if (file.type === "image/avif" || file.type === "image/webp") {
    return { blob: file, ext: file.type === "image/avif" ? "avif" : "webp" };
  }
  try {
    const bitmap = await createImageBitmap(file);
    const maxEdge = 1600;
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", 0.86),
    );
    if (!blob) throw new Error("encode failed");
    return { blob, ext: "webp" };
  } catch {
    return { blob: file, ext: file.name.split(".").pop() || "jpg" };
  }
}

/** Uploads one image and returns the stored URL reference. */
export async function uploadProductImage(file: File): Promise<string> {
  const invalid = validateImageFile(file);
  if (invalid) throw new Error(invalid);

  const { blob, ext } = await toWebp(file);
  const path = `products/${crypto.randomUUID()}.${ext}`;
  try {
    const saved = await putImage({
      data: {
        path,
        contentType: blob.type || file.type || "image/webp",
        data: await toBase64(blob),
      },
    });
    return storageUrl(saved.path);
  } catch {
    throw new Error("Upload failed. Please try again.");
  }
}

/**
 * Deletes a stored image only when no database record references it any more,
 * so an image shared by several products or banners is never pulled out from
 * under the others.
 */
export async function deleteStoredImage(url: string): Promise<void> {
  const prefix = "/api/public/img/";
  if (!url.startsWith(prefix)) return;
  try {
    await removeImageIfUnreferenced({ data: { url } });
  } catch {
    /* the reference is removed from the database either way */
  }
}

/* ------------------------------------------------------- website (non-product) media */

/** Re-encodes to WebP with a larger max edge, since banners are full-bleed. */
async function toWebpWide(file: File, maxEdge: number): Promise<{ blob: Blob; ext: string }> {
  if (file.type === "image/avif" || file.type === "image/webp") {
    return { blob: file, ext: file.type === "image/avif" ? "avif" : "webp" };
  }
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", 0.88),
    );
    if (!blob) throw new Error("encode failed");
    return { blob, ext: "webp" };
  } catch {
    return { blob: file, ext: file.name.split(".").pop() || "jpg" };
  }
}

/** Reads pixel dimensions in the browser, for the admin preview. */
export async function readImageDimensions(
  file: File,
): Promise<{ width: number; height: number } | null> {
  try {
    const bitmap = await createImageBitmap(file);
    return { width: bitmap.width, height: bitmap.height };
  } catch {
    return null;
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Uploads a website banner / editorial image and reports progress.
 * The database only ever stores the returned URL reference.
 */
export async function uploadSiteImage(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<string> {
  const invalid = validateImageFile(file);
  if (invalid) throw new Error(invalid);

  const { blob, ext } = await toWebpWide(file, 2400);
  const path = `site/${crypto.randomUUID()}.${ext}`;

  onProgress?.(15);
  const encoded = await toBase64(blob);
  onProgress?.(45);

  let saved: { path: string };
  try {
    saved = await putImage({
      data: {
        path,
        contentType: blob.type || file.type || "image/webp",
        data: encoded,
      },
    });
  } catch {
    throw new Error("Upload failed. Please try again.");
  }

  onProgress?.(100);
  return storageUrl(saved.path);
}
