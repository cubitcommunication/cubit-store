import { queryOptions } from "@tanstack/react-query";
import { useLoaderData } from "@tanstack/react-router";
import { settingsToMap, type SiteSetting } from "@/lib/site-settings";
import { db } from "@/lib/data";
import { putImage } from "@/lib/storage.functions";
import { storageUrl } from "@/lib/storage";

/** A reel shown in the home page "Follow our journey" section. */
export type Reel = {
  id: string;
  title: string | null;
  video_url: string;
  poster_url: string | null;
  product_id: string | null;
  link_url: string | null;
  link_label: string;
  active: boolean;
  sort_order: number;
};

export const REEL_FIELDS = "id,title,video_url,poster_url,product_id,link_url,link_label,active,sort_order";

/** Only addresses that are safe to put in a link: a site path or https. */
export function safeLink(url: string | null | undefined): string | null {
  const v = (url ?? "").trim();
  if (/^\/(?!\/)/.test(v) || /^https:\/\//i.test(v)) return v;
  return null;
}

export const reelsQuery = () =>
  queryOptions({
    queryKey: ["reels"],
    queryFn: async () => {
      const { data, error } = await db.from("reels").select(REEL_FIELDS).eq("active", true).order("sort_order", { ascending: true });
      if (error) throw new Error("REELS_UNAVAILABLE");
      return (data ?? []) as unknown as Reel[];
    },
    staleTime: 60 * 1000,
  });

export const MAX_VIDEO_BYTES = 40 * 1024 * 1024;

/** Uploads a reel video (multipart, with progress). Resolves to the stored URL. */
export function uploadReelVideo(file: File, onProgress?: (percent: number) => void, folder: "reels" | "products" = "reels"): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!/^video\/(mp4|webm)$/.test(file.type) && !/\.(mp4|webm)$/i.test(file.name)) {
      reject(new Error("Please choose an MP4 or WebM video."));
      return;
    }
    if (file.size > MAX_VIDEO_BYTES) {
      reject(new Error("That video is larger than 40 MB. Please compress or trim it."));
      return;
    }
    const form = new FormData();
    form.append("video", file);
    form.append("folder", folder);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/admin/reels/video");
    xhr.withCredentials = true;
    xhr.setRequestHeader("Accept", "application/json");
    xhr.setRequestHeader("X-Requested-With", "XMLHttpRequest");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onerror = () => reject(new Error("Upload failed. Please check your connection and try again."));
    xhr.onload = () => {
      let body: { url?: string; message?: string } = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* non-JSON */
      }
      if (xhr.status >= 200 && xhr.status < 300 && body.url) resolve(body.url);
      else reject(new Error(body.message || (xhr.status === 413 ? "The server rejected a file this large." : `Upload failed (${xhr.status}).`)));
    };
    xhr.send(form);
  });
}

/** Grabs a still frame from the video in the browser and uploads it as the cover image. Best effort. */
export function uploadReelPoster(file: File): Promise<string | null> {
  // Never let a stubborn video hold up the upload: give up on the cover image after 8 seconds.
  return Promise.race([grabPoster(file), new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000))]);
}

async function grabPoster(file: File): Promise<string | null> {
  const src = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = src;
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error("unreadable"));
    });
    video.currentTime = Math.min(1, (video.duration || 2) / 3);
    await new Promise<void>((resolve) => {
      video.onseeked = () => resolve();
      setTimeout(resolve, 2500);
    });
    const scale = Math.min(1, 720 / Math.max(video.videoWidth, video.videoHeight, 1));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/webp", 0.82));
    if (!blob) return null;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    const path = `reels/${crypto.randomUUID()}.webp`;
    const saved = await putImage({ data: { path, contentType: "image/webp", data: btoa(binary) } });
    return storageUrl(saved.path);
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(src);
  }
}

/* ------------------------------------------------------------ how many reels show at once */

/** Reels visible at the same time on each screen size (Admin → Reels → Reel layout). */
export type ReelsLayout = { desktop: number; tablet: number; mobile: number };
export const REELS_LAYOUT_DEFAULTS: ReelsLayout = { desktop: 4, tablet: 3, mobile: 1 };
export const REELS_LAYOUT_KEYS = { desktop: "ui_reels_desktop", tablet: "ui_reels_tablet", mobile: "ui_reels_mobile" } as const;
export const REELS_PER_VIEW = [1, 2, 3, 4, 5, 6] as const;

const clampCount = (raw: string | undefined, fallback: number) => {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= 6 ? n : fallback;
};

export function reelsLayoutFromSettings(rows: SiteSetting[] | undefined): ReelsLayout {
  const map = settingsToMap(rows);
  return {
    desktop: clampCount(map[REELS_LAYOUT_KEYS.desktop], REELS_LAYOUT_DEFAULTS.desktop),
    tablet: clampCount(map[REELS_LAYOUT_KEYS.tablet], REELS_LAYOUT_DEFAULTS.tablet),
    mobile: clampCount(map[REELS_LAYOUT_KEYS.mobile], REELS_LAYOUT_DEFAULTS.mobile),
  };
}

export function useReelsLayout(): ReelsLayout {
  const data = useLoaderData({ from: "__root__" }) as { siteSettings?: SiteSetting[] } | undefined;
  return reelsLayoutFromSettings(data?.siteSettings);
}
