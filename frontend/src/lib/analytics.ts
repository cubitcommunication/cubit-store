import { brand } from "@/config/brand";
/**
 * Shop events for Google Analytics 4, Google Tag Manager and the Meta Pixel.
 *
 * The tools themselves are loaded by the server (Admin → Integrations). This file only reports what visitors
 * do — look at a product, add to cart, start checkout, buy, ask on WhatsApp — in Google's standard GA4 shape,
 * so the standard ecommerce reports work without any setup:
 *   - gtag.js (Analytics added directly) receives  gtag('event', name, params)
 *   - Tag Manager receives                           dataLayer.push({ event: name, ecommerce: params })
 *   - the Meta Pixel receives its own standard events (ViewContent, AddToCart, InitiateCheckout, Purchase, Lead)
 * Nothing happens when none of them is installed (for example on the owner's local copy).
 */
declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
  }
}

export type TrackedItem = {
  item_id: string;
  item_name: string;
  price: number;
  quantity: number;
  item_brand: string;
  item_category?: string;
  item_variant?: string;
};

const ECOMMERCE = new Set(["view_item", "add_to_cart", "remove_from_cart", "view_cart", "begin_checkout", "purchase", "add_to_wishlist"]);
const META: Record<string, string> = {
  view_item: "ViewContent",
  add_to_cart: "AddToCart",
  begin_checkout: "InitiateCheckout",
  purchase: "Purchase",
  add_to_wishlist: "AddToWishlist",
  generate_lead: "Lead",
};

type Params = Record<string, unknown>;

export function track(event: string, params: Params = {}): void {
  if (typeof window === "undefined") return;
  try {
    // 1) Analytics added directly (gtag.js)
    window.gtag?.("event", event, params);
    // 2) Tag Manager: the data layer. Ecommerce events use the GA4 { ecommerce } object, and the
    //    previous ecommerce object is cleared first so values never leak between events.
    if (Array.isArray(window.dataLayer)) {
      if (ECOMMERCE.has(event)) {
        window.dataLayer.push({ ecommerce: null });
        window.dataLayer.push({ event, ecommerce: params });
      } else {
        window.dataLayer.push({ event, ...params });
      }
    }
    // 3) Meta Pixel
    const standard = META[event];
    if (standard && window.fbq) {
      const items = (params["items"] as TrackedItem[] | undefined) ?? [];
      window.fbq("track", standard, {
        ...(typeof params["value"] === "number" ? { value: params["value"], currency: "INR" } : {}),
        ...(items.length ? { content_ids: items.map((i) => i.item_id), content_type: "product", num_items: items.reduce((n, i) => n + i.quantity, 0) } : {}),
      });
    }
  } catch {
    /* analytics must never break the shop */
  }
}

/** A page change inside the app (the browser does not reload). The first page is reported by the page's own tags. */
export function trackPageView(path: string, title: string): void {
  if (typeof window === "undefined") return;
  try {
    if (Array.isArray(window.dataLayer)) window.dataLayer.push({ event: "virtual_page_view", page_path: path, page_title: title });
    window.fbq?.("track", "PageView");
  } catch {
    /* ignore */
  }
}

const rupees = (n: number) => Math.round(n * 100) / 100;

export function item(i: { id?: string | undefined; sku?: string | null | undefined; name: string; price: number; qty?: number | undefined; variant?: string | null | undefined; category?: string | null | undefined }): TrackedItem {
  return {
    item_id: (i.sku || i.id || i.name).toString(),
    item_name: i.name,
    price: rupees(i.price),
    quantity: i.qty ?? 1,
    item_brand: brand.name,
    ...(i.category ? { item_category: i.category } : {}),
    ...(i.variant ? { item_variant: i.variant } : {}),
  };
}

export const money = (items: TrackedItem[]) => rupees(items.reduce((sum, i) => sum + i.price * i.quantity, 0));

/** Reports something once per browser (for example one purchase per order, even if the page is reloaded). */
export function trackOnce(key: string, event: string, params: Params): void {
  const storageKey = `shop_tracked_${key}`;
  try {
    if (window.localStorage.getItem(storageKey)) return;
    window.localStorage.setItem(storageKey, "1");
  } catch {
    /* private mode: report anyway */
  }
  track(event, params);
}
