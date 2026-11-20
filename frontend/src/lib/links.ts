import { brand } from "@/config/brand";
/**
 * Links the owner can type or pick in the admin (menu items, hero buttons, the seasonal banner,
 * announcement lines, occasion buttons...). Only two shapes are accepted, so a typo or a
 * `javascript:` address can never reach a visitor:
 *   - a page on this site:  /shop   /collection/wedding-season   /shop?q=Bridal
 *   - a secure outside address:  https://example.com/page
 */
export type ParsedLink =
  | { kind: "internal"; pathname: string; search: Record<string, string> }
  | { kind: "external"; href: string };

const INTERNAL = /^\/(?!\/)[A-Za-z0-9\-_/.]*(\?[A-Za-z0-9\-_.=&%+]*)?$/;
const EXTERNAL = /^https:\/\/[^\s<>"']+$/i;

export function parseLink(value: string | null | undefined): ParsedLink | null {
  const v = (value ?? "").trim();
  if (!v) return null;
  if (EXTERNAL.test(v)) return { kind: "external", href: v };
  if (!INTERNAL.test(v)) return null;
  const [pathname = "/", query = ""] = v.split("?");
  const search: Record<string, string> = {};
  for (const pair of query.split("&")) {
    if (!pair) continue;
    const [k, val = ""] = pair.split("=");
    if (k) search[decodeURIComponent(k)] = decodeURIComponent(val.replace(/\+/g, " "));
  }
  return { kind: "internal", pathname: pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname, search };
}

export const isValidLink = (value: string | null | undefined): boolean => parseLink(value) !== null;

/** The fixed pages of the site, offered first in every link picker. */
export const PAGE_LINKS: { path: string; label: string }[] = [
  { path: "/", label: "Home page" },
  { path: "/shop", label: "Shop (all products)" },
  { path: "/collections", label: "Collections" },
  { path: "/about", label: `About ${brand.name}` },
  { path: "/blog", label: "Journal (blog)" },
  { path: "/contact", label: "Contact" },
  { path: "/policies/terms-and-conditions", label: "Terms and Conditions" },
  { path: "/policies/privacy-policy", label: "Privacy Policy" },
  { path: "/policies/cancellation-and-refund", label: "Cancellation and Refund" },
  { path: "/policies/shipping-and-exchange", label: "Shipping and Exchange" },
];

/** Same-site shortcut for products tagged with an occasion, e.g. Bridal or Reception. */
export const occasionLink = (occasion: string) => `/shop?q=${encodeURIComponent(occasion)}`;
