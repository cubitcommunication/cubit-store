/**
 * The store's identity in the browser. The values come from the server (backend/config/brand.php, set in backend/.env),
 * which writes them into the page as window.__BRAND__. The fallbacks below are used only when that is missing (the Vite
 * dev server, tests) and are neutral on purpose. No product data lives here — products come from the database.
 */

type BrandFacts = {
  name: string;
  tagline: string;
  description: string;
  foundedLabel: string;
  phoneDisplay: string;
  phoneE164: string;
  email: string;
  instagramHandle: string;
  instagramUrl: string;
  facebookLabel: string;
  facebookUrl: string;
  websiteLabel: string;
  siteUrl: string;
  /** Money, dates and place (from the server's BRAND_* settings). */
  currencySymbol: string;
  locale: string;
  timezone: string;
  country: string;
};

const FALLBACK: BrandFacts = {
  name: "Your Store",
  tagline: "",
  description: "",
  foundedLabel: "",
  phoneDisplay: "",
  phoneE164: "",
  email: "",
  instagramHandle: "",
  instagramUrl: "",
  facebookLabel: "",
  facebookUrl: "",
  websiteLabel: typeof window !== "undefined" ? window.location?.host ?? "" : "",
  siteUrl: typeof window !== "undefined" ? window.location?.origin ?? "" : "",
  // Only used when the server has not supplied them (dev server without the API, tests).
  currencySymbol: "₹",
  locale: "en-IN",
  timezone: "Asia/Kolkata",
  country: "India",
};

function fromServer(): Partial<BrandFacts> {
  try {
    return (typeof window !== "undefined" ? (window as unknown as { __BRAND__?: Partial<BrandFacts> }).__BRAND__ : undefined) ?? {};
  } catch {
    return {};
  }
}

export const brand: BrandFacts = { ...FALLBACK, ...fromServer() };

export const CURRENCY = brand.currencySymbol;
export const LOCALE = brand.locale;
export const TIMEZONE = brand.timezone;
export const COUNTRY = brand.country;

/** The first announcement-bar text before the admin edits it. */
export const announcement = "";

export const hero = {
  title: "MADE TO BE NOTICED",
  subtitle:
    "Quality products, honest prices and fast delivery.",
  primaryCta: { label: "EXPLORE COLLECTION", to: "/shop" },
  secondaryCta: { label: "ABOUT US", to: "/about" },
  imageDesktop: "",
  imageMobile: "",
  imageAlt: `${brand.name} editorial campaign image`,
} as const;

/** Empty on purpose: the menu is built in Admin → Navigation. */
export const navLinks: readonly { label: string; to: string }[] = [];

export const CATEGORIES = [] as const;

export const MATERIALS = ["Cotton", "Leather", "Metal", "Wood", "Glass"] as const;

export const OCCASIONS = ["Everyday", "Bridal", "Reception", "Party"] as const;

export function formatPrice(value: number): string {
  // Whole amounts stay clean (1,299); anything with decimals shows both digits (1,268.10).
  const whole = Math.abs(value - Math.round(value)) < 0.005;
  return `${CURRENCY}${new Intl.NumberFormat(LOCALE, { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 }).format(value)}`;
}

export function whatsappUrl(message: string): string {
  return `https://wa.me/${brand.phoneE164}?text=${encodeURIComponent(message)}`;
}

export function productEnquiryUrl(product: {
  name: string;
  sku: string;
  price: number;
}): string {
  return whatsappUrl(
    `Hi ${brand.name}, I am interested in ${product.name}, SKU ${product.sku}, priced at ${CURRENCY}${Math.round(
      product.price,
    )}. Please let me know the availability and details.`,
  );
}

export const generalEnquiryUrl = whatsappUrl(
  `Hi ${brand.name}, I would like to know more about your products.`,
);
