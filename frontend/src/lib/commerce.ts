import { useLoaderData } from "@tanstack/react-router";
import { settingsToMap, type SiteSetting } from "@/lib/site-settings";

/**
 * Store switches, edited in Admin → Settings → Store features. Everything
 * defaults to OFF, so until the owner turns them on the site behaves exactly
 * like the enquiry-only catalogue (WhatsApp buttons, no cart, no accounts).
 */
export type CommerceFlags = {
  cart: boolean;
  /** Checkout needs the cart too, so this is only ever true when both are on. */
  checkout: boolean;
  wishlist: boolean;
  accounts: boolean;
  guestCheckout: boolean;
  cod: boolean;
  online: boolean;
  shippingFlat: number;
  freeShippingOver: number;
  /** "Spend X, get a free gift" steps, lowest amount first. */
  gifts: Gift[];
  codFee: number;
  maxQty: number;
};

export type Gift = { amount: number; label: string };

/** A step on the cart meter: free shipping or a free gift at an amount. */
export type Milestone = { amount: number; kind: "shipping" | "gift"; label: string };

export function parseGifts(raw: string | undefined): Gift[] {
  try {
    const list = JSON.parse(raw || "[]") as unknown;
    if (!Array.isArray(list)) return [];
    return list
      .map((g) => ({ amount: Number((g as Gift)?.amount), label: String((g as Gift)?.label ?? "").trim() }))
      .filter((g) => g.amount > 0 && g.label !== "")
      .sort((a, b) => a.amount - b.amount)
      .slice(0, 10);
  } catch {
    return [];
  }
}

export function buildMilestones(freeShippingOver: number, gifts: Gift[]): Milestone[] {
  const steps: Milestone[] = gifts.map((g) => ({ amount: g.amount, kind: "gift", label: g.label }));
  if (freeShippingOver > 0) steps.push({ amount: freeShippingOver, kind: "shipping", label: "Free shipping" });
  return steps.sort((a, b) => a.amount - b.amount || (a.kind === "shipping" ? -1 : 1));
}

export function flagsFromSettings(rows: SiteSetting[] | undefined): CommerceFlags {
  const map = settingsToMap(rows);
  const on = (key: string, fallback = "0") => (map[key] ?? fallback) === "1";
  const num = (key: string, fallback: number) => {
    const value = Number(map[key]);
    return Number.isFinite(value) ? value : fallback;
  };
  const cart = on("commerce_cart_enabled");
  return {
    cart,
    checkout: cart && on("commerce_checkout_enabled"),
    wishlist: on("commerce_wishlist_enabled"),
    accounts: on("commerce_accounts_enabled"),
    guestCheckout: on("commerce_guest_checkout", "1"),
    cod: on("commerce_cod_enabled", "1"),
    online: on("commerce_online_enabled"),
    shippingFlat: num("commerce_shipping_flat", 99),
    freeShippingOver: num("commerce_free_shipping_over", 1999),
    gifts: parseGifts(map["commerce_gifts"]),
    codFee: num("commerce_cod_fee", 0),
    maxQty: Math.max(1, num("commerce_max_qty", 10)),
  };
}

export function useCommerce(): CommerceFlags {
  const data = useLoaderData({ from: "__root__" }) as { siteSettings?: SiteSetting[] } | undefined;
  return flagsFromSettings(data?.siteSettings);
}

export type QuoteLine = {
  id: string;
  variantId: string | null;
  variantTitle: string | null;
  slug: string;
  name: string;
  sku: string;
  price: number;
  compareAt: number | null;
  qty: number;
  stock: number | null;
  image: string | null;
  lineTotal: number;
  issue: string | null;
};

export type AppliedCoupon = { id: string; code: string; title: string | null; label: string; type: "percentage" | "fixed" | "free_shipping" };

/** An offer the store promotes (Admin → Discounts → Show on website). */
export type Promotion = { code: string; title: string | null; label: string; type: string; description: string; terms: string; minSubtotal: number | null };

export type Quote = {
  lines: QuoteLine[];
  subtotal: number;
  discount: number;
  coupon: AppliedCoupon | null;
  couponError: string | null;
  shipping: number;
  codFee: number;
  total: number;
  problems: string[];
  checkoutEnabled: boolean;
  paymentMethods: ("cod" | "razorpay")[];
  /** Free-shipping amount for the delivery state (a shipping zone can change it); 0 = never free. */
  freeShippingOver: number;
  shippingZone: string | null;
  /** Free gifts the basket has already earned. */
  gifts: Gift[];
};

export type OrderAddress = {
  name: string;
  phone: string;
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  pincode: string;
  country?: string;
};

export type OrderView = {
  number: number;
  status: "open" | "cancelled";
  paymentStatus: "pending" | "paid" | "failed" | "refunded";
  paymentMethod: "cod" | "razorpay";
  fulfillmentStatus: "unfulfilled" | "fulfilled";
  /** Courier and tracking, once a courier is booked. */
  delivery?: { courier: string | null; awb: string | null; status: string | null; trackingUrl: string | null } | null;
  name: string;
  email: string;
  phone: string;
  subtotal: number;
  discount?: number;
  couponCode?: string | null;
  shipping: number;
  codFee: number;
  total: number;
  address: OrderAddress;
  createdAt: string;
  items: { productId: string | null; name: string; variantTitle?: string | null; sku: string; price: number; qty: number; lineTotal: number; image: string | null }[];
  events?: { message: string; at: string }[];
  returns?: ReturnsInfo;
};

export type ReturnRequest = {
  id: string;
  orderNumber: number;
  status: "requested" | "approved" | "rejected" | "received" | "refunded" | "closed";
  reasonLabel: string;
  details: string | null;
  items: { name: string; qty: number }[];
  adminNote: string | null;
  refundAmount: number | null;
  createdAt: string;
};

/** What the order page needs to offer returns: whether to show the form, which pieces, and the requests already made. */
export type ReturnsInfo = {
  enabled: boolean;
  canRequest: boolean;
  message: string | null;
  days: number;
  reasons: Record<string, string>;
  items: { id: string; name: string; max: number }[];
  requests: ReturnRequest[];
};

export const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana",
  "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur",
  "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana",
  "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal", "Andaman and Nicobar Islands", "Chandigarh",
  "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Jammu and Kashmir", "Ladakh", "Lakshadweep", "Puducherry",
] as const;

/** Shared storefront form styling. */
export const inputClass =
  "w-full border border-border bg-background px-3 py-3 text-sm focus:border-brand-red focus:outline-none";
export const labelClass = "eyebrow block text-muted-foreground";
export const primaryButton =
  "eyebrow inline-flex items-center justify-center gap-2 bg-foreground px-8 py-4 text-background transition-colors hover:bg-brand-red disabled:cursor-not-allowed disabled:opacity-50";
export const outlineButton =
  "eyebrow inline-flex items-center justify-center gap-2 border border-foreground px-8 py-4 transition-colors hover:border-brand-red hover:text-brand-red disabled:cursor-not-allowed disabled:opacity-50";

/** Only same-site paths are accepted as a post-login destination. */
export function safeRedirect(value: string | undefined, fallback = "/account"): string {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : fallback;
}

/** Identifies one cart line: the product plus the chosen variant. */
export const lineKey = (id: string, variantId?: string | null): string => (variantId ? `${id}:${variantId}` : id);
