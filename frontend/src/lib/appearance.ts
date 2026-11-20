import { useSyncExternalStore } from "react";
import { useLoaderData } from "@tanstack/react-router";
import { settingsToMap, type SiteSetting } from "@/lib/site-settings";
import { setThemePreview, type Theme } from "@/lib/theme";

/**
 * Storefront look: which product-card design to use and which hover actions to show.
 * Edited in Admin → Product cards. Stored in `site_settings` (group "appearance").
 */
export type CardStyle = "classic" | "overlay" | "minimal" | "elegant" | "quick";
export type CardRatio = "4/5" | "1/1" | "3/4";
/** Phone-only designs. "same" keeps the desktop design on phones too. */
export type MobileCardStyle = "same" | "bag" | "bar" | "float" | "price";

export type Appearance = {
  style: CardStyle;
  mobileStyle: MobileCardStyle;
  ratio: CardRatio;
  columns: 3 | 4 | 5;
  hoverImage: boolean;
  showCart: boolean;
  showEnquiry: boolean;
  showWishlist: boolean;
  showQuickView: boolean;
  showVariants: boolean;
  showMaterial: boolean;
};

export const APPEARANCE_DEFAULTS: Appearance = {
  style: "classic",
  mobileStyle: "bag",
  ratio: "4/5",
  columns: 4,
  hoverImage: true,
  showCart: true,
  showEnquiry: true,
  showWishlist: true,
  showQuickView: true,
  showVariants: true,
  showMaterial: true,
};

export const CARD_STYLES: { id: CardStyle; label: string; description: string }[] = [
  { id: "classic", label: "Classic", description: "Framed card. Details below, buttons at the bottom." },
  { id: "overlay", label: "Hover actions", description: "Round icon buttons slide up over the photo on hover." },
  { id: "minimal", label: "Minimal", description: "No frame, centred text, a pill button appears on hover." },
  { id: "elegant", label: "Elegant", description: "Name and price over the photo, actions appear on hover." },
  { id: "quick", label: "Quick add", description: "Option chips and an always-visible add button." },
];

export const MOBILE_CARD_STYLES: { id: MobileCardStyle; label: string; description: string }[] = [
  { id: "bag", label: "Round bag", description: "Price on the left, a round add-to-bag button on the right." },
  { id: "bar", label: "Full-width button", description: "Name and price, then one slim “Add to cart” button across the card." },
  { id: "float", label: "Floating bag", description: "A round bag button floats on the corner of the photo. Clean text below." },
  { id: "price", label: "Price button", description: "One pill button that holds the price: “Add · 1,299”." },
  { id: "same", label: "Same as desktop", description: "Phones use the desktop card design above." },
];

export const APPEARANCE_KEYS = {
  style: "ui_card_style",
  mobileStyle: "ui_card_mobile_style",
  ratio: "ui_card_ratio",
  columns: "ui_grid_columns",
  hoverImage: "ui_card_hover_image",
  showCart: "ui_card_show_cart",
  showEnquiry: "ui_card_show_enquiry",
  showWishlist: "ui_card_show_wishlist",
  showQuickView: "ui_card_show_quickview",
  showVariants: "ui_card_show_variants",
  showMaterial: "ui_card_show_material",
} as const;

export function appearanceFromSettings(rows: SiteSetting[] | undefined): Appearance {
  const map = settingsToMap(rows);
  const flag = (key: string, fallback: boolean) => (map[key] === undefined ? fallback : map[key] === "1");
  const style = map[APPEARANCE_KEYS.style] as CardStyle | undefined;
  const mobile = map[APPEARANCE_KEYS.mobileStyle] as MobileCardStyle | undefined;
  const ratio = map[APPEARANCE_KEYS.ratio] as CardRatio | undefined;
  const columns = Number(map[APPEARANCE_KEYS.columns]);
  return {
    style: CARD_STYLES.some((s) => s.id === style) ? style! : APPEARANCE_DEFAULTS.style,
    mobileStyle: MOBILE_CARD_STYLES.some((s) => s.id === mobile) ? mobile! : APPEARANCE_DEFAULTS.mobileStyle,
    ratio: ratio === "1/1" || ratio === "3/4" || ratio === "4/5" ? ratio : APPEARANCE_DEFAULTS.ratio,
    columns: columns === 3 || columns === 5 ? columns : 4,
    hoverImage: flag(APPEARANCE_KEYS.hoverImage, APPEARANCE_DEFAULTS.hoverImage),
    showCart: flag(APPEARANCE_KEYS.showCart, APPEARANCE_DEFAULTS.showCart),
    showEnquiry: flag(APPEARANCE_KEYS.showEnquiry, APPEARANCE_DEFAULTS.showEnquiry),
    showWishlist: flag(APPEARANCE_KEYS.showWishlist, APPEARANCE_DEFAULTS.showWishlist),
    showQuickView: flag(APPEARANCE_KEYS.showQuickView, APPEARANCE_DEFAULTS.showQuickView),
    showVariants: flag(APPEARANCE_KEYS.showVariants, APPEARANCE_DEFAULTS.showVariants),
    showMaterial: flag(APPEARANCE_KEYS.showMaterial, APPEARANCE_DEFAULTS.showMaterial),
  };
}

/* -------------------------------------------------------------- live preview
 * The admin's "Product cards" page shows the real shop inside an <iframe> and sends the draft
 * settings with postMessage. The storefront applies them on the fly (nothing is saved).
 */
type PreviewState = { appearance: Partial<Appearance>; demo: boolean } | null;
let previewState: PreviewState = null;
const previewListeners = new Set<() => void>();

export function setAppearancePreview(next: PreviewState) {
  previewState = next;
  previewListeners.forEach((l) => l());
}

const subscribePreview = (listener: () => void) => {
  previewListeners.add(listener);
  return () => void previewListeners.delete(listener);
};

export const usePreviewState = (): PreviewState => useSyncExternalStore(subscribePreview, () => previewState, () => null);

/** Called once at start-up. Only an embedded page (inside the admin) listens, and only to its own origin. */
export function installPreviewListener() {
  if (typeof window === "undefined" || window.parent === window) return;
  window.addEventListener("message", (event) => {
    if (event.origin !== window.location.origin) return;
    const data = event.data as { type?: string; appearance?: Partial<Appearance>; demo?: boolean; theme?: Theme } | null;
    if (data?.type === "shop-ui-preview") setAppearancePreview({ appearance: data.appearance ?? {}, demo: Boolean(data.demo) });
    if (data?.type === "shop-theme-preview" && data.theme) setThemePreview(data.theme);
  });
  window.parent.postMessage({ type: "shop-ui-preview-ready" }, window.location.origin);
}

export function useAppearance(): Appearance {
  const data = useLoaderData({ from: "__root__" }) as { siteSettings?: SiteSetting[] } | undefined;
  const preview = usePreviewState();
  return { ...appearanceFromSettings(data?.siteSettings), ...(preview?.appearance ?? {}) };
}

/** True on phones (under 640px wide). Cards use their phone design there. */
const PHONE_QUERY = "(max-width: 639px)";
const subscribePhone = (listener: () => void) => {
  const m = window.matchMedia(PHONE_QUERY);
  m.addEventListener("change", listener);
  return () => m.removeEventListener("change", listener);
};
export function useIsPhone(): boolean {
  return useSyncExternalStore(subscribePhone, () => window.matchMedia(PHONE_QUERY).matches, () => false);
}
