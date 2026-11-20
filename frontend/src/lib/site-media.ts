import { brand } from "@/config/brand";
import { queryOptions } from "@tanstack/react-query";
import { useLoaderData } from "@tanstack/react-router";
import { useContext } from "react";
import { SectionCtx } from "@/lib/section-ctx";
import { db } from "@/lib/data";
import { safeImage } from "@/lib/catalog";

/**
 * Website (non-product) images: hero banners, category tiles, editorial
 * images. Slots live in the `site_media` table and are edited from
 * Admin → Website content. The frontend never hardcodes these URLs; the
 * fallbacks below only cover the first paint before the database answers,
 * and are the shipped defaults for a brand-new install.
 */

export type SiteMedia = {
  id: string;
  key: string;
  title: string;
  description: string | null;
  image_url: string | null;
  mobile_image_url: string | null;
  alt_text: string;
  active: boolean;
  sort_order: number;
  updated_at: string;
};

export const SITE_MEDIA_FIELDS =
  "id,key,title,description,image_url,mobile_image_url,alt_text,active,sort_order,updated_at";

/** Shipped defaults, used only until the database responds. */
const FALLBACKS: Record<string, { src: string | null; mobile?: string; alt: string }> = {
  homepage_hero: {
    src: null,
    alt: `${brand.name}`,
  },
  diwali_banner: { src: null, alt: `${brand.name}` },
  about_story: { src: null, alt: `${brand.name}` },
  earrings_section: { src: null, alt: `${brand.name}` },
  necklaces_section: { src: null, alt: `${brand.name}` },
  rings_section: { src: null, alt: `${brand.name}` },
  bracelets_section: { src: null, alt: `${brand.name}` },
  anti_tarnish_section: { src: null, alt: `${brand.name}` },
  oxidised_section: { src: null, alt: `${brand.name}` },
  german_silver_section: { src: null, alt: `${brand.name}` },
  ad_section: { src: null, alt: `${brand.name}` },
  contact_image: { src: null, alt: `${brand.name}` },
};

export type ResolvedMedia = {
  src: string | null;
  mobileSrc: string | null;
  alt: string;
};

export async function fetchSiteMedia(): Promise<SiteMedia[]> {
  const { data, error } = await db
    .from("site_media")
    .select(SITE_MEDIA_FIELDS)
    .eq("active", true)
    .order("sort_order", { ascending: true });
  if (error) throw new Error("SITE_MEDIA_UNAVAILABLE");
  return (data ?? []) as SiteMedia[];
}

export const siteMediaQuery = () =>
  queryOptions({
    queryKey: ["site-media"],
    queryFn: fetchSiteMedia,
    staleTime: 60 * 1000,
  });

export function resolveMedia(
  rows: SiteMedia[] | undefined,
  key: string,
): ResolvedMedia {
  const fallback = FALLBACKS[key];
  const row = rows?.find((r) => r.key === key && r.active);
  const src = safeImage(row?.image_url) ?? fallback?.src ?? null;
  const mobileSrc = safeImage(row?.mobile_image_url) ?? fallback?.mobile ?? null;
  const alt = (row?.alt_text || fallback?.alt || brand.name).trim();
  return { src, mobileSrc, alt };
}

/**
 * Rows loaded once by the root route loader, so the server-rendered HTML and
 * the first client render always agree on the active image.
 */
export function useSiteMediaRows(): SiteMedia[] {
  const data = useLoaderData({ from: "__root__" }) as
    | { siteMedia?: SiteMedia[] }
    | undefined;
  return data?.siteMedia ?? [];
}

/** Reads one website image slot. Falls back to the shipped default. */
export function useSiteMedia(key: string): ResolvedMedia {
  const base = resolveMedia(useSiteMediaRows(), key);
  const own = useContext(SectionCtx);
  // A picture the page itself holds (a section block) wins over the shared slot.
  if (own && `img:${key}` in own) {
    return { src: safeImage(own[`img:${key}`]) ?? null, mobileSrc: safeImage(own[`imgm:${key}`]) ?? null, alt: base.alt };
  }
  // A picture address used directly instead of a slot name (blocks that store their own pictures).
  if (key.startsWith("/") || key.startsWith("http")) return { src: safeImage(key) ?? null, mobileSrc: null, alt: base.alt };
  return base;
}
