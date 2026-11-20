import { api } from "./api";

/**
 * Image writes. Only a signed-in admin may upload or delete; the API checks
 * the session on every call. Reads happen through the public /api/public/img/*
 * route, so `<img src>` works without credentials.
 */
type UploadInput = { path: string; contentType: string; data: string };

export const putImage = ({ data }: { data: UploadInput }) =>
  api<{ path: string }>("/admin/images", { method: "POST", body: data });

export const removeImage = ({ data }: { data: { path: string } }) =>
  api<{ ok: boolean }>("/admin/images/delete", { method: "POST", body: data });

/** Deletes the file only when no product, banner, collection or category still uses it. */
export const removeImageIfUnreferenced = ({ data }: { data: { url: string } }) =>
  api<{ deleted: boolean }>("/admin/images/delete-if-unreferenced", { method: "POST", body: data });
