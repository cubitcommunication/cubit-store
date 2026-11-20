import { useLoaderData } from "@tanstack/react-router";
import { settingsToMap, type SiteSetting } from "@/lib/site-settings";

/**
 * The brand logo, set in Admin → Settings → Store details. One main logo (for light backgrounds, also used
 * in e-mails) and an optional light version for the dark footer. Empty = the logo that ships with the site.
 */
export const BRAND_KEYS = { logo: "brand_logo_url", dark: "brand_logo_dark_url" } as const;

const SAFE_URL = /^\/[\w\-./]*$|^https:\/\/[\w\-./%?=&:]+$/;
const safe = (v: string | undefined) => (v && SAFE_URL.test(v) ? v : null);

export function brandLogosFromSettings(rows: SiteSetting[] | undefined): { logo: string | null; dark: string | null } {
  const map = settingsToMap(rows);
  return { logo: safe(map[BRAND_KEYS.logo]), dark: safe(map[BRAND_KEYS.dark]) };
}

export function useBrandLogos(): { logo: string | null; dark: string | null } {
  const data = useLoaderData({ from: "__root__" }) as { siteSettings?: SiteSetting[] } | undefined;
  return brandLogosFromSettings(data?.siteSettings);
}
