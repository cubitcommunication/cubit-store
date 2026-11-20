import { CURRENCY } from "@/config/brand";
import { queryOptions } from "@tanstack/react-query";
import { useLoaderData } from "@tanstack/react-router";
import { useContext } from "react";
import { SectionCtx } from "@/lib/section-ctx";
import { db } from "@/lib/data";
import { brand, announcement, hero, navLinks } from "@/config/brand";

/**
 * Editable website text and navigation.
 *
 * Values live in the `site_settings` / `site_nav` tables and are edited from
 * Admin → Website content. The defaults below are the shipped copy and are
 * only used until the database answers (or if a key is missing), so the site
 * never renders empty text.
 */

export type SiteSetting = {
  id: string;
  key: string;
  value: string;
  group_name: string;
  label: string;
  help: string | null;
  multiline: boolean;
  sort_order: number;
};

export const SITE_SETTINGS_FIELDS =
  "id,key,value,group_name,label,help,multiline,sort_order";

export type NavItem = {
  id: string;
  label: string;
  path: string;
  sort_order: number;
  visible: boolean;
  system: boolean;
  /** Small tag after the name, e.g. NEW or ARCHIVE. */
  badge?: string | null;
  /** Set on sub-menu items: the id of the item they sit under. */
  parent_id?: string | null;
  new_tab?: boolean;
};

export type NavNode = NavItem & { children: NavItem[] };

export const SITE_NAV_FIELDS = "id,label,path,sort_order,visible,system,badge,parent_id,new_tab";

export const SETTING_DEFAULTS: Record<string, string> = {
  announcement,
  hero_title: hero.title,
  hero_subtitle: hero.subtitle,
  hero_primary_cta: hero.primaryCta.label,
  hero_secondary_cta: hero.secondaryCta.label,
  category_heading: "SHOP BY CATEGORY",
  featured_heading: "FEATURED PRODUCTS",
  featured_eyebrow: "Handpicked",
  occasion_heading: "SHOP BY OCCASION",
  story_heading: `DISCOVER ${brand.name}`,
  story_body:
    `${brand.name} started with a simple idea: sell things we love at honest prices, and look after every customer. Tell visitors your own story here.`,
  instagram_heading: `FOLLOW THE ${brand.name} JOURNEY`,
  instagram_body: "New pieces, styling and behind the scenes on Instagram.",
  phone_display: brand.phoneDisplay,
  phone_e164: brand.phoneE164,
  email: brand.email,
  instagram_handle: brand.instagramHandle,
  instagram_url: brand.instagramUrl,
  facebook_label: brand.facebookLabel,
  facebook_url: brand.facebookUrl,
  website_label: brand.websiteLabel,
  seo_site_name: brand.name,
  seo_canonical_domain: brand.siteUrl,
  seo_default_description:
    "Quality products, honest prices and fast delivery.",
  seo_default_image: "",
  // Seasonal content: the real values live in the database (Admin → Pages). These stay
  // empty so a field the owner clears really disappears instead of falling back to old text.
  season_enabled: "1",
  season_eyebrow: "",
  season_heading: "",
  season_description: "",
  season_cta_label: "",
  season_cta_url: "",
  hero_primary_url: "/shop",
  hero_secondary_url: "",
  announcement_url: "",
  announcement_2: "",
  announcement_2_url: "",
  category_link_label: "All collections",
  featured_link_label: "View all",
  story_link_label: "Read our story",
  highlight_1: "PREMIUM QUALITY",
  highlight_2: "UNIQUE DESIGNS",
  highlight_3: "EVERYDAY TO OCCASION",
};

export function settingValue(rows: SiteSetting[] | undefined, key: string, fallback = "") {
  const row = rows?.find((item) => item.key === key)?.value.trim();
  return row || SETTING_DEFAULTS[key] || fallback;
}

/** Fallback navigation, used only before the database answers. */
export const NAV_DEFAULTS: NavItem[] = navLinks.map((l, i) => ({
  id: `default-${i}`,
  label: l.label,
  path: l.to,
  sort_order: (i + 1) * 10,
  visible: true,
  system: l.to === "/" || l.to === "/shop" || l.to === "/collections" || l.to === "/contact",
}));

export async function fetchSiteSettings(): Promise<SiteSetting[]> {
  const { data, error } = await db
    .from("site_settings")
    .select(SITE_SETTINGS_FIELDS)
    .order("sort_order", { ascending: true });
  if (error) throw new Error("SITE_SETTINGS_UNAVAILABLE");
  return (data ?? []) as SiteSetting[];
}

async function fetchSiteNav(): Promise<NavItem[]> {
  const { data, error } = await db
    .from("site_nav")
    .select(SITE_NAV_FIELDS)
    .order("sort_order", { ascending: true });
  if (error) throw new Error("SITE_NAV_UNAVAILABLE");
  return (data ?? []) as NavItem[];
}

export const siteSettingsQuery = () =>
  queryOptions({
    queryKey: ["site-settings"],
    queryFn: fetchSiteSettings,
    staleTime: 60 * 1000,
  });

export const siteNavQuery = () =>
  queryOptions({
    queryKey: ["site-nav"],
    queryFn: fetchSiteNav,
    staleTime: 60 * 1000,
  });

export function settingsToMap(rows: SiteSetting[] | undefined): Record<string, string> {
  const map: Record<string, string> = { ...SETTING_DEFAULTS };
  for (const row of rows ?? []) {
    const value = (row.value ?? "").trim();
    if (value) map[row.key] = value;
  }
  return map;
}

type RootData = { siteSettings?: SiteSetting[]; siteNav?: NavItem[] };

function useRootData(): RootData {
  return (useLoaderData({ from: "__root__" }) as RootData | undefined) ?? {};
}

/** Reads one piece of editable website text. */
export function useSiteText(): (key: string) => string {
  const rows = useRootData().siteSettings;
  const own = useContext(SectionCtx);
  const map = settingsToMap(rows);
  return (key: string) => (own && key in own ? own[key]! : map[key] ?? "");
}

/**
 * Like useSiteText, but a field the owner emptied stays empty (so "hide this button" works).
 * Use it for text that is allowed to be blank.
 */
export function useSiteTextExact(): (key: string) => string {
  const rows = useRootData().siteSettings;
  const own = useContext(SectionCtx);
  return (key: string) => {
    if (own && key in own) return own[key]!.trim();
    const row = rows?.find((r) => r.key === key);
    return row ? (row.value ?? "").trim() : (SETTING_DEFAULTS[key] ?? "");
  };
}

/** The header/footer menu as a tree: top-level items, each with its visible sub-menu items. */
export function useNavTree(): NavNode[] {
  const flat = useSiteNav();
  const byId = new Set(flat.map((i) => i.id));
  const top = flat.filter((i) => !i.parent_id || !byId.has(i.parent_id));
  return top.map((item) => ({ ...item, children: flat.filter((c) => c.parent_id === item.id) }));
}

/** The header/footer menu, in admin order, hidden items removed. */
export function useSiteNav(): NavItem[] {
  const rows = useRootData().siteNav;
  const list = rows && rows.length ? rows : NAV_DEFAULTS;
  return list
    .filter((i) => i.visible)
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order);
}

export type ContactInfo = {
  phoneDisplay: string;
  phoneE164: string;
  email: string;
  instagramHandle: string;
  instagramUrl: string;
  facebookLabel: string;
  facebookUrl: string;
  pinterestUrl: string;
  youtubeUrl: string;
  websiteLabel: string;
  whatsappUrl: (message: string) => string;
  generalEnquiryUrl: string;
};

export function contactFromSettings(rows: SiteSetting[] | undefined): ContactInfo {
  const map = settingsToMap(rows);
  const get = (key: string) => map[key] ?? SETTING_DEFAULTS[key] ?? "";
  const digits = get("phone_e164").replace(/\D/g, "") || brand.phoneE164;
  const whatsapp = (message: string) =>
    `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
  return {
    phoneDisplay: get("phone_display"),
    phoneE164: digits,
    email: get("email"),
    instagramHandle: get("instagram_handle"),
    instagramUrl: get("instagram_url"),
    facebookLabel: get("facebook_label"),
    facebookUrl: get("facebook_url"),
    pinterestUrl: get("pinterest_url"),
    youtubeUrl: get("youtube_url"),
    websiteLabel: get("website_label"),
    whatsappUrl: whatsapp,
    generalEnquiryUrl: whatsapp(
      `Hi ${brand.name}, I would like to know more about your products.`,
    ),
  };
}

/** Contact + social details, editable from Admin → Website content. */
export function useContactInfo(): ContactInfo {
  const rows = useRootData().siteSettings;
  const own = useContext(SectionCtx);
  if (!own) return contactFromSettings(rows);
  // A section that carries its own contact details answers from them first.
  const mine = Object.entries(own).filter(([k]) => !k.includes(":")).map(([key, value]) => ({ key, value }) as SiteSetting);
  return contactFromSettings([...(rows ?? []), ...mine]);
}

/**
 * Product enquiry link built from the admin-managed WhatsApp number. A product
 * may carry its own enquiry message (set in the form or the CSV import);
 * otherwise the standard message is used.
 */
export function productEnquiryLink(
  contact: ContactInfo,
  product: {
    name: string;
    sku: string;
    price: number;
    specifications?: Record<string, string> | null;
  },
  variantTitle?: string | null,
): string {
  const custom = (product.specifications?.["whatsapp_message"] ?? "").trim();
  return contact.whatsappUrl(
    custom ||
      `Hi ${brand.name}, I am interested in ${product.name}${variantTitle ? ` (${variantTitle})` : ""}, SKU ${product.sku}, priced at ${CURRENCY}${Math.round(
        product.price,
      )}. Please let me know the availability and details.`,
  );
}
