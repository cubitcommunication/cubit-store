import { queryOptions } from "@tanstack/react-query";
import { api } from "@/lib/api";

/** One file in Admin → Media (everything in the uploads folder). */
export type MediaItem = {
  key: string;
  url: string;
  name: string;
  folder: string;
  kind: "image" | "video" | "pdf" | "audio" | "other";
  ext: string;
  size: number;
  modified: number;
  /** Where it is used: products, reels, blog, pages, page:<id>, website, collections, orders, or unused. */
  uses: string[];
  width: number | null;
  height: number | null;
};

export type MediaStats = {
  files: number;
  bytes: number;
  kinds: Record<MediaItem["kind"], number>;
  folders: Record<string, number>;
  uses: Record<string, number>;
  pages: { id: string; title: string }[];
};

export type MissingFile = { url: string; name: string; uses: string[] };
export type StorageInfo = { root: string; exists: boolean; writable: boolean; insideApp: boolean; configuredByEnv: boolean; documentRoot: string | null };
export type MediaPage = { items: MediaItem[]; total: number; page: number; pages: number; stats: MediaStats; missing: MissingFile[]; storage: StorageInfo | null };
export type MediaUse = { label: string; count: number };

export type MediaQuery = { q: string; kind: string; usage: string; folder: string; sort: string; page: number };

export const mediaListQuery = (p: MediaQuery) =>
  queryOptions({
    queryKey: ["admin", "media", p],
    queryFn: () => {
      const qs = new URLSearchParams({ sort: p.sort, page: String(p.page) });
      if (p.q) qs.set("q", p.q);
      if (p.kind) qs.set("kind", p.kind);
      if (p.usage) qs.set("usage", p.usage);
      if (p.folder) qs.set("folder", p.folder);
      return api<MediaPage>(`/admin/media?${qs}`);
    },
    placeholderData: (previous) => previous,
  });

export const ACCEPT = "image/jpeg,image/png,image/webp,image/avif,image/gif,image/svg+xml,application/pdf,video/mp4,video/webm,video/quicktime,audio/mpeg,.svg,.pdf,.mov,.mp3";

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1048576).toFixed(bytes < 10485760 ? 1 : 0)} MB`;
  return `${(bytes / 1073741824).toFixed(1)} GB`;
}

export const KIND_LABEL: Record<MediaItem["kind"], string> = { image: "Images", video: "Videos", pdf: "PDFs", audio: "Audio", other: "Other" };

/** The "Used in" filter: which part of the website a file belongs to. */
export const USAGE_LABEL: Record<string, string> = {
  products: "Product photos",
  reels: "Reels",
  blog: "Blog posts",
  pages: "All pages (Home, About…)",
  website: "Website pictures",
  collections: "Collections & categories",
  orders: "Past orders",
  unused: "Not used anywhere",
};

/** Friendly names for the folders the site writes to. */
export const FOLDER_LABEL: Record<string, string> = {
  library: "Added in Media",
  products: "Products",
  reels: "Reels",
  banners: "Banners",
  collections: "Collections",
  categories: "Categories",
  pages: "Pages",
  site: "Website pictures",
  media: "Original catalogue",
  "": "Other",
};

/** Uploads one file (multipart, with progress). Resolves to the stored address. */
export function uploadToLibrary(file: File, onProgress?: (percent: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/admin/media/upload");
    xhr.withCredentials = true;
    xhr.setRequestHeader("Accept", "application/json");
    xhr.setRequestHeader("X-Requested-With", "XMLHttpRequest");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onerror = () => reject(new Error("Upload failed. Please check your connection and try again."));
    xhr.onload = () => {
      let body: { url?: string; message?: string; errors?: Record<string, string[]> } = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* non-JSON */
      }
      if (xhr.status >= 200 && xhr.status < 300 && body.url) resolve(body.url);
      else {
        const first = body.errors ? Object.values(body.errors)[0]?.[0] : undefined;
        reject(new Error(body.message || first || (xhr.status === 413 ? "The server rejected a file this large." : `Upload failed (${xhr.status}).`)));
      }
    };
    xhr.send(form);
  });
}
