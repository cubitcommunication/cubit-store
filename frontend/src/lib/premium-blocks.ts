import { CURRENCY } from "@/config/brand";
import type { BlockStyle } from "@/lib/pages";

/**
 * Premium page-builder elements. Each one is described once, here: its name, where it sits in the "Add section" list, the
 * fields the editor shows for it, and its starting content. The editor form (PremiumBlockForm) and the public drawing code
 * (PremiumBlocks) both work from this table, so adding a new element means one entry here plus one drawing function.
 *
 * A block keeps everything it shows in `props`. Text is plain text (never HTML); every link goes through SmartLink.
 * This file must not import values from pages.ts (pages.ts imports this one at load time).
 */

export type PremiumType =
  | "p_hero_split" | "p_hero_video" | "p_hero_centered"
  | "p_testimonials" | "p_logos" | "p_stats" | "p_quote"
  | "p_marquee" | "p_countdown" | "p_promo_banner" | "p_newsletter" | "p_trust_badges" | "p_pricing"
  | "p_gallery" | "p_timeline" | "p_tabs" | "p_collection_tiles" | "p_before_after" | "p_product_spotlight" | "p_map";

/** The content of one element. Deliberately loose: the field list above is the real description of it. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PremiumProps = any;
export type PremiumBlock = { id: string; type: PremiumType; hidden?: boolean; style?: BlockStyle; props: PremiumProps };

export type FieldSpec =
  | { key: string; label: string; kind: "text"; max?: number; help?: string }
  | { key: string; label: string; kind: "textarea"; rows?: number; max?: number; help?: string }
  | { key: string; label: string; kind: "number"; min: number; max: number; step?: number; help?: string }
  | { key: string; label: string; kind: "select"; options: [string, string][] }
  | { key: string; label: string; kind: "image" }
  | { key: string; label: string; kind: "link" }
  | { key: string; label: string; kind: "toggle" }
  | { key: string; label: string; kind: "datetime"; help?: string }
  | { key: string; label: string; kind: "list"; itemLabel: string; fields: FieldSpec[]; blank: PremiumProps; max?: number };

export type PremiumDef = { label: string; help: string; group: string; fields: FieldSpec[]; defaults: PremiumProps };

export const TRUST_ICONS: [string, string][] = [
  ["truck", "Delivery truck"], ["shield", "Shield"], ["refresh", "Returns"], ["headset", "Support"], ["gift", "Gift"],
  ["star", "Star"], ["lock", "Secure"], ["heart", "Heart"], ["award", "Award"], ["clock", "Clock"],
];

const TONE_3: [string, string][] = [["dark", "Dark"], ["light", "Light"], ["accent", "Accent colour"]];
const GROUPS = {
  heroes: "Premium · Heroes & banners",
  proof: "Premium · Social proof",
  convert: "Premium · Conversion",
  content: "Premium · Content & media",
} as const;

/** A short sample picture-free text set so a newly added element looks right before anything is typed. */
export const PREMIUM: Record<PremiumType, PremiumDef> = {
  p_hero_split: {
    label: "Hero · split", help: "Picture on one side, heading and buttons on the other", group: GROUPS.heroes,
    fields: [
      { key: "eyebrow", label: "Small label", kind: "text", max: 60 },
      { key: "heading", label: "Heading", kind: "text", max: 120 },
      { key: "text", label: "Text", kind: "textarea", rows: 3, max: 400 },
      { key: "primaryLabel", label: "Main button text", kind: "text", max: 40 },
      { key: "primaryLink", label: "Main button opens", kind: "link" },
      { key: "secondaryLabel", label: "Second button text", kind: "text", max: 40 },
      { key: "secondaryLink", label: "Second button opens", kind: "link" },
      { key: "image", label: "Picture", kind: "image" },
      { key: "imageSide", label: "Picture side", kind: "select", options: [["right", "Right"], ["left", "Left"]] },
      { key: "tone", label: "Colours", kind: "select", options: TONE_3 },
    ],
    defaults: { eyebrow: "New season", heading: "Made to be noticed", text: "A short line that tells visitors what you offer and why it is special.", primaryLabel: "Shop now", primaryLink: "/shop", secondaryLabel: "Our story", secondaryLink: "/about", image: "", imageSide: "right", tone: "light" },
  },
  p_hero_video: {
    label: "Hero · video background", help: "A looping video behind a heading and button", group: GROUPS.heroes,
    fields: [
      { key: "video", label: "Video file (MP4 or WebM)", kind: "text", max: 400, help: "Upload it in Media, then paste its address here." },
      { key: "poster", label: "Picture shown while it loads", kind: "image" },
      { key: "eyebrow", label: "Small label", kind: "text", max: 60 },
      { key: "heading", label: "Heading", kind: "text", max: 120 },
      { key: "text", label: "Text", kind: "textarea", rows: 3, max: 400 },
      { key: "buttonLabel", label: "Button text", kind: "text", max: 40 },
      { key: "buttonLink", label: "Button opens", kind: "link" },
      { key: "overlay", label: "Darkness over the video (%)", kind: "number", min: 0, max: 85, step: 5 },
      { key: "height", label: "Height", kind: "select", options: [["tall", "Tall"], ["medium", "Medium"], ["screen", "Full screen"]] },
    ],
    defaults: { video: "", poster: "", eyebrow: "", heading: "Your story in motion", text: "Add a short, silent video loop to make the first screen come alive.", buttonLabel: "Explore", buttonLink: "/shop", overlay: 45, height: "tall" },
  },
  p_hero_centered: {
    label: "Hero · centred", help: "Large centred heading with two buttons, plain or over a picture", group: GROUPS.heroes,
    fields: [
      { key: "badge", label: "Pill above the heading", kind: "text", max: 40 },
      { key: "heading", label: "Heading", kind: "text", max: 140 },
      { key: "text", label: "Text", kind: "textarea", rows: 3, max: 400 },
      { key: "primaryLabel", label: "Main button text", kind: "text", max: 40 },
      { key: "primaryLink", label: "Main button opens", kind: "link" },
      { key: "secondaryLabel", label: "Second button text", kind: "text", max: 40 },
      { key: "secondaryLink", label: "Second button opens", kind: "link" },
      { key: "image", label: "Background picture (optional)", kind: "image" },
      { key: "tone", label: "Colours", kind: "select", options: TONE_3 },
    ],
    defaults: { badge: `Free delivery over ${CURRENCY}999`, heading: "Everything you love, in one place", text: "Browse the collection and enquire in a tap.", primaryLabel: "Shop the collection", primaryLink: "/shop", secondaryLabel: "Contact us", secondaryLink: "/contact", image: "", tone: "dark" },
  },
  p_testimonials: {
    label: "Testimonials", help: "Customer quotes with stars, as a grid or a slider", group: GROUPS.proof,
    fields: [
      { key: "eyebrow", label: "Small label", kind: "text", max: 60 },
      { key: "heading", label: "Heading", kind: "text", max: 120 },
      { key: "layout", label: "Layout", kind: "select", options: [["grid", "Grid"], ["slider", "Slider"]] },
      { key: "items", label: "Quotes", kind: "list", itemLabel: "Quote", max: 12, blank: { quote: "", name: "", role: "", rating: 5, image: "" }, fields: [
        { key: "quote", label: "Quote", kind: "textarea", rows: 3, max: 400 },
        { key: "name", label: "Name", kind: "text", max: 60 },
        { key: "role", label: "City or role", kind: "text", max: 60 },
        { key: "rating", label: "Stars (0–5)", kind: "number", min: 0, max: 5 },
        { key: "image", label: "Photo (optional)", kind: "image" },
      ] },
    ],
    defaults: { eyebrow: "Kind words", heading: "Loved by our customers", layout: "grid", items: [
      { quote: "Beautiful quality and it arrived earlier than promised. I have already ordered again.", name: "Aisha K.", role: "Mumbai", rating: 5, image: "" },
      { quote: "Exactly as shown in the pictures. Packaging was lovely and support answered in minutes.", name: "Rohan P.", role: "Pune", rating: 5, image: "" },
      { quote: "Great value. My whole family has started shopping here.", name: "Neha S.", role: "Surat", rating: 5, image: "" },
    ] },
  },
  p_logos: {
    label: "Logo cloud", help: "A row of logos: press, partners or payment methods", group: GROUPS.proof,
    fields: [
      { key: "heading", label: "Small heading", kind: "text", max: 80 },
      { key: "grayscale", label: "Show logos in grey", kind: "toggle" },
      { key: "items", label: "Logos", kind: "list", itemLabel: "Logo", max: 12, blank: { image: "", alt: "", link: "" }, fields: [
        { key: "image", label: "Logo picture", kind: "image" },
        { key: "alt", label: "Name (for screen readers)", kind: "text", max: 60 },
        { key: "link", label: "Opens (optional)", kind: "link" },
      ] },
    ],
    defaults: { heading: "As seen in", grayscale: true, items: [] },
  },
  p_stats: {
    label: "Numbers (counters)", help: "Big figures that count up when scrolled into view", group: GROUPS.proof,
    fields: [
      { key: "heading", label: "Heading (optional)", kind: "text", max: 120 },
      { key: "tone", label: "Colours", kind: "select", options: TONE_3 },
      { key: "items", label: "Figures", kind: "list", itemLabel: "Figure", max: 6, blank: { value: 100, prefix: "", suffix: "+", label: "" }, fields: [
        { key: "value", label: "Number", kind: "number", min: 0, max: 1000000000 },
        { key: "prefix", label: "Before the number (currency, #)", kind: "text", max: 4 },
        { key: "suffix", label: "After the number (+, %, k)", kind: "text", max: 6 },
        { key: "label", label: "Label", kind: "text", max: 60 },
      ] },
    ],
    defaults: { heading: "", tone: "dark", items: [
      { value: 12000, prefix: "", suffix: "+", label: "Happy customers" },
      { value: 4.9, prefix: "", suffix: "/5", label: "Average rating" },
      { value: 48, prefix: "", suffix: "h", label: "Dispatch time" },
      { value: 100, prefix: "", suffix: "%", label: "Secure checkout" },
    ] },
  },
  p_quote: {
    label: "Big quote", help: "A large pull-quote with the person who said it", group: GROUPS.proof,
    fields: [
      { key: "quote", label: "Quote", kind: "textarea", rows: 3, max: 400 },
      { key: "name", label: "Name", kind: "text", max: 60 },
      { key: "role", label: "Role or place", kind: "text", max: 60 },
      { key: "image", label: "Photo (optional)", kind: "image" },
      { key: "tone", label: "Colours", kind: "select", options: TONE_3 },
    ],
    defaults: { quote: "Quality you can feel the moment you open the box.", name: "A happy customer", role: "Verified buyer", image: "", tone: "light" },
  },
  p_marquee: {
    label: "Scrolling ticker", help: "A line of short messages that scrolls across the page", group: GROUPS.convert,
    fields: [
      { key: "items", label: "Messages", kind: "list", itemLabel: "Message", max: 12, blank: { text: "" }, fields: [{ key: "text", label: "Message", kind: "text", max: 80 }] },
      { key: "speed", label: "Speed", kind: "select", options: [["slow", "Slow"], ["normal", "Normal"], ["fast", "Fast"]] },
      { key: "tone", label: "Colours", kind: "select", options: TONE_3 },
    ],
    defaults: { items: [{ text: `Free delivery over ${CURRENCY}999` }, { text: "Easy returns" }, { text: "Secure payments" }, { text: "New arrivals every week" }], speed: "normal", tone: "dark" },
  },
  p_countdown: {
    label: "Countdown offer", help: "A timer to the end of an offer, with a button", group: GROUPS.convert,
    fields: [
      { key: "eyebrow", label: "Small label", kind: "text", max: 60 },
      { key: "heading", label: "Heading", kind: "text", max: 120 },
      { key: "text", label: "Text", kind: "textarea", rows: 2, max: 300 },
      { key: "endsAt", label: "Offer ends", kind: "datetime", help: "Uses the visitor's own clock for the countdown." },
      { key: "endedText", label: "Text after it ends", kind: "text", max: 120 },
      { key: "buttonLabel", label: "Button text", kind: "text", max: 40 },
      { key: "buttonLink", label: "Button opens", kind: "link" },
      { key: "tone", label: "Colours", kind: "select", options: TONE_3 },
    ],
    defaults: { eyebrow: "Limited time", heading: "Sale ends soon", text: "Grab your favourites before the timer runs out.", endsAt: "", endedText: "This offer has ended.", buttonLabel: "Shop the sale", buttonLink: "/shop", tone: "accent" },
  },
  p_promo_banner: {
    label: "Promo banner", help: "An offer banner with a badge and a copy-able code", group: GROUPS.convert,
    fields: [
      { key: "image", label: "Background picture", kind: "image" },
      { key: "badge", label: "Badge (20% OFF)", kind: "text", max: 24 },
      { key: "heading", label: "Heading", kind: "text", max: 120 },
      { key: "text", label: "Text", kind: "textarea", rows: 2, max: 300 },
      { key: "code", label: "Discount code (optional)", kind: "text", max: 24 },
      { key: "buttonLabel", label: "Button text", kind: "text", max: 40 },
      { key: "buttonLink", label: "Button opens", kind: "link" },
      { key: "tone", label: "Colours", kind: "select", options: TONE_3 },
    ],
    defaults: { image: "", badge: "20% OFF", heading: "Welcome offer", text: "Use the code at checkout on your first order.", code: "WELCOME20", buttonLabel: "Shop now", buttonLink: "/shop", tone: "dark" },
  },
  p_newsletter: {
    label: "Newsletter sign-up", help: "An e-mail box that adds people to Subscribers", group: GROUPS.convert,
    fields: [
      { key: "heading", label: "Heading", kind: "text", max: 120 },
      { key: "text", label: "Text", kind: "textarea", rows: 2, max: 300 },
      { key: "buttonLabel", label: "Button text", kind: "text", max: 30 },
      { key: "tone", label: "Colours", kind: "select", options: TONE_3 },
    ],
    defaults: { heading: "Get 10% off your first order", text: "Join our list for new arrivals and offers. No spam, unsubscribe any time.", buttonLabel: "Subscribe", tone: "light" },
  },
  p_trust_badges: {
    label: "Trust badges", help: "A row of reasons to buy: delivery, returns, secure payment", group: GROUPS.convert,
    fields: [
      { key: "tone", label: "Colours", kind: "select", options: [["light", "Light"], ["dark", "Dark"]] },
      { key: "items", label: "Badges", kind: "list", itemLabel: "Badge", max: 6, blank: { icon: "star", title: "", text: "" }, fields: [
        { key: "icon", label: "Icon", kind: "select", options: TRUST_ICONS },
        { key: "title", label: "Title", kind: "text", max: 40 },
        { key: "text", label: "Short text", kind: "text", max: 80 },
      ] },
    ],
    defaults: { tone: "light", items: [
      { icon: "truck", title: "Fast delivery", text: "Dispatched within 48 hours" },
      { icon: "refresh", title: "Easy returns", text: "Hassle-free within the window" },
      { icon: "lock", title: "Secure payment", text: "Cards, UPI and cash on delivery" },
      { icon: "headset", title: "Real support", text: "Answers on WhatsApp" },
    ] },
  },
  p_pricing: {
    label: "Pricing / bundles", help: "Plans or bundles side by side, one can be highlighted", group: GROUPS.convert,
    fields: [
      { key: "heading", label: "Heading", kind: "text", max: 120 },
      { key: "text", label: "Text under the heading", kind: "textarea", rows: 2, max: 300 },
      { key: "plans", label: "Plans", kind: "list", itemLabel: "Plan", max: 4, blank: { name: "", price: "", period: "", features: "", buttonLabel: "Choose", buttonLink: "", highlight: false }, fields: [
        { key: "name", label: "Name", kind: "text", max: 40 },
        { key: "price", label: "Price (typed as you want it shown)", kind: "text", max: 20 },
        { key: "period", label: "Per (month, set…)", kind: "text", max: 20 },
        { key: "features", label: "Features (one per line)", kind: "textarea", rows: 4, max: 600 },
        { key: "buttonLabel", label: "Button text", kind: "text", max: 30 },
        { key: "buttonLink", label: "Button opens", kind: "link" },
        { key: "highlight", label: "Highlight this plan", kind: "toggle" },
      ] },
    ],
    defaults: { heading: "Choose your bundle", text: "Simple pricing with everything you need.", plans: [
      { name: "Starter", price: `${CURRENCY}999`, period: "set", features: "1 item\nGift wrap\nFree delivery", buttonLabel: "Choose", buttonLink: "/shop", highlight: false },
      { name: "Popular", price: `${CURRENCY}1,799`, period: "set", features: "3 items\nGift wrap\nFree delivery\nPriority support", buttonLabel: "Choose", buttonLink: "/shop", highlight: true },
      { name: "Premium", price: `${CURRENCY}2,999`, period: "set", features: "5 items\nGift box\nFree delivery\nPriority support", buttonLabel: "Choose", buttonLink: "/shop", highlight: false },
    ] },
  },
  p_gallery: {
    label: "Gallery with zoom", help: "A picture grid; a click opens the picture large", group: GROUPS.content,
    fields: [
      { key: "heading", label: "Heading (optional)", kind: "text", max: 120 },
      { key: "columns", label: "Pictures per row", kind: "select", options: [["2", "2"], ["3", "3"], ["4", "4"]] },
      { key: "layout", label: "Layout", kind: "select", options: [["grid", "Even squares"], ["masonry", "Natural sizes"]] },
      { key: "items", label: "Pictures", kind: "list", itemLabel: "Picture", max: 24, blank: { image: "", caption: "" }, fields: [
        { key: "image", label: "Picture", kind: "image" },
        { key: "caption", label: "Caption (optional)", kind: "text", max: 120 },
      ] },
    ],
    defaults: { heading: "", columns: "3", layout: "grid", items: [] },
  },
  p_timeline: {
    label: "Steps / timeline", help: "A numbered process or story, step by step", group: GROUPS.content,
    fields: [
      { key: "heading", label: "Heading", kind: "text", max: 120 },
      { key: "items", label: "Steps", kind: "list", itemLabel: "Step", max: 10, blank: { label: "", title: "", text: "" }, fields: [
        { key: "label", label: "Label (Step 1, 2024…)", kind: "text", max: 24 },
        { key: "title", label: "Title", kind: "text", max: 80 },
        { key: "text", label: "Text", kind: "textarea", rows: 2, max: 300 },
      ] },
    ],
    defaults: { heading: "How it works", items: [
      { label: "Step 1", title: "Choose your favourites", text: "Browse the collection and pick what you love." },
      { label: "Step 2", title: "Order in a tap", text: "Checkout securely or enquire on WhatsApp." },
      { label: "Step 3", title: "We pack with care", text: "Every order is checked and carefully packed." },
      { label: "Step 4", title: "Delivered to your door", text: "Track it until it arrives." },
    ] },
  },
  p_tabs: {
    label: "Tabs", help: "Several panels of content, one visible at a time", group: GROUPS.content,
    fields: [
      { key: "heading", label: "Heading", kind: "text", max: 120 },
      { key: "tabs", label: "Tabs", kind: "list", itemLabel: "Tab", max: 6, blank: { label: "", title: "", text: "", image: "", link: "" }, fields: [
        { key: "label", label: "Tab name", kind: "text", max: 30 },
        { key: "title", label: "Heading", kind: "text", max: 100 },
        { key: "text", label: "Text", kind: "textarea", rows: 3, max: 500 },
        { key: "image", label: "Picture (optional)", kind: "image" },
        { key: "link", label: "Link (optional)", kind: "link" },
      ] },
    ],
    defaults: { heading: "Find what suits you", tabs: [
      { label: "Everyday", title: "Easy, everyday pieces", text: "Comfortable and simple. Made to be worn all the time.", image: "", link: "/shop" },
      { label: "Occasions", title: "For special days", text: "Statement pieces for celebrations and gifts.", image: "", link: "/shop" },
      { label: "Gifts", title: "Gifts they will keep", text: "Pick a set and we will wrap it for you.", image: "", link: "/shop" },
    ] },
  },
  p_collection_tiles: {
    label: "Collection tiles", help: "Picture tiles that link to collections or pages", group: GROUPS.content,
    fields: [
      { key: "heading", label: "Heading", kind: "text", max: 120 },
      { key: "columns", label: "Tiles per row", kind: "select", options: [["2", "2"], ["3", "3"], ["4", "4"]] },
      { key: "shape", label: "Tile shape", kind: "select", options: [["portrait", "Tall"], ["square", "Square"], ["wide", "Wide"]] },
      { key: "items", label: "Tiles", kind: "list", itemLabel: "Tile", max: 12, blank: { image: "", title: "", subtitle: "", link: "/shop" }, fields: [
        { key: "image", label: "Picture", kind: "image" },
        { key: "title", label: "Title", kind: "text", max: 50 },
        { key: "subtitle", label: "Small text", kind: "text", max: 60 },
        { key: "link", label: "Opens", kind: "link" },
      ] },
    ],
    defaults: { heading: "Shop by collection", columns: "3", shape: "portrait", items: [
      { image: "", title: "New arrivals", subtitle: "Just in", link: "/shop" },
      { image: "", title: "Best sellers", subtitle: "Most loved", link: "/shop" },
      { image: "", title: "Gifts", subtitle: "For someone special", link: "/shop" },
    ] },
  },
  p_before_after: {
    label: "Before / after slider", help: "Drag to compare two pictures", group: GROUPS.content,
    fields: [
      { key: "heading", label: "Heading (optional)", kind: "text", max: 120 },
      { key: "before", label: "Before picture", kind: "image" },
      { key: "after", label: "After picture", kind: "image" },
      { key: "beforeLabel", label: "Left label", kind: "text", max: 24 },
      { key: "afterLabel", label: "Right label", kind: "text", max: 24 },
    ],
    defaults: { heading: "See the difference", before: "", after: "", beforeLabel: "Before", afterLabel: "After" },
  },
  p_product_spotlight: {
    label: "Product spotlight", help: "One product shown large, with its price and a button", group: GROUPS.content,
    fields: [
      { key: "eyebrow", label: "Small label", kind: "text", max: 60 },
      { key: "slug", label: "Product address (slug)", kind: "text", max: 120, help: "The last part of the product page address, for example gold-ring." },
      { key: "text", label: "Your own text (optional)", kind: "textarea", rows: 3, max: 400 },
      { key: "buttonLabel", label: "Button text", kind: "text", max: 40 },
      { key: "imageSide", label: "Picture side", kind: "select", options: [["left", "Left"], ["right", "Right"]] },
    ],
    defaults: { eyebrow: "Product of the week", slug: "", text: "", buttonLabel: "View product", imageSide: "left" },
  },
  p_map: {
    label: "Map & contact", help: "A Google map with the address and ways to reach you", group: GROUPS.content,
    fields: [
      { key: "heading", label: "Heading", kind: "text", max: 120 },
      { key: "embed", label: "Google Maps embed address", kind: "text", max: 600, help: "On Google Maps: Share → Embed a map → copy the address that starts with https://www.google.com/maps/embed" },
      { key: "address", label: "Address", kind: "textarea", rows: 3, max: 300 },
      { key: "hours", label: "Opening hours", kind: "textarea", rows: 2, max: 200 },
      { key: "phone", label: "Phone", kind: "text", max: 30 },
      { key: "email", label: "E-mail", kind: "text", max: 80 },
    ],
    defaults: { heading: "Visit us", embed: "", address: "", hours: "", phone: "", email: "" },
  },
};

export const PREMIUM_TYPES = Object.keys(PREMIUM) as PremiumType[];
export const isPremiumType = (t: string): t is PremiumType => Object.prototype.hasOwnProperty.call(PREMIUM, t);
export const PREMIUM_LABELS = Object.fromEntries(PREMIUM_TYPES.map((t) => [t, { label: PREMIUM[t].label, help: PREMIUM[t].help }])) as Record<PremiumType, { label: string; help: string }>;

/** Groups for the "Add section" list, in a stable order. */
export const PREMIUM_GROUPS = Object.values(GROUPS).map((group) => ({
  group,
  items: PREMIUM_TYPES.filter((t) => PREMIUM[t].group === group).map((t) => ({ key: t, type: t, label: PREMIUM[t].label })),
}));

const uid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `p-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`);

/** A fresh block with its starting content (a copy, so editing one block never changes another). */
export function premiumBlank(type: PremiumType, over: PremiumProps = {}): PremiumBlock {
  return { id: uid(), type, props: { ...JSON.parse(JSON.stringify(PREMIUM[type].defaults)), ...over } };
}
