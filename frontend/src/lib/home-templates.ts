import { blankBlock, type Block, type BlockStyle, type BlockType } from "@/lib/pages";
import { premiumBlank, type PremiumProps, type PremiumType } from "@/lib/premium-blocks";

/**
 * Ready-made home page designs, chosen in Admin → Pages → Page templates. A template is only a list of page-builder
 * sections with starting text: it uses no pictures of its own (so it never shows somebody else's photos), and every word and
 * picture is edited afterwards in the page builder. Applying one fills the Home page editor; nothing goes live until Publish.
 */

export type HomeTemplate = {
  id: string;
  name: string;
  tagline: string;
  description: string;
  /** Short labels for the card preview. */
  outline: { label: string; tone: "dark" | "light" | "accent" | "soft" }[];
  build: () => Block[];
};

/** A regular page-builder section with some of its content replaced. */
function mk(type: BlockType, patch: Record<string, unknown> = {}, style?: BlockStyle): Block {
  const base = blankBlock(type) as unknown as Record<string, unknown>;
  return { ...base, ...patch, ...(style ? { style } : {}) } as unknown as Block;
}

/** A premium section with some of its content replaced. */
function pm(type: PremiumType, props: PremiumProps = {}, style?: BlockStyle): Block {
  const base = premiumBlank(type, props);
  return (style ? { ...base, style } : base) as unknown as Block;
}

export const HOME_TEMPLATES: HomeTemplate[] = [
  {
    id: "boutique",
    name: "Boutique",
    tagline: "Calm, editorial and elegant",
    description: "A split hero, trust badges, collection tiles, your favourites, a brand story and customer words. Best for fashion, accessories, home and gifts.",
    outline: [
      { label: "Split hero", tone: "soft" }, { label: "Trust badges", tone: "light" }, { label: "Collection tiles", tone: "light" },
      { label: "Featured products", tone: "light" }, { label: "Brand story", tone: "soft" }, { label: "Testimonials", tone: "soft" }, { label: "Newsletter", tone: "light" },
    ],
    build: () => [
      pm("p_hero_split", { eyebrow: "The new collection", heading: "Considered pieces for every day", text: "Thoughtfully made, honestly priced and ready to ship. Discover what is new this season.", primaryLabel: "Shop the collection", secondaryLabel: "Our story", tone: "light" }),
      pm("p_trust_badges"),
      pm("p_collection_tiles", { heading: "Shop by collection" }),
      mk("products", { heading: "Our favourites", source: "featured", limit: 8 }),
      mk("image_text", { eyebrow: "Our story", heading: "Made with care, shared with love", body: "Tell visitors who you are and why you started. Two or three honest sentences work better than a long page.", buttonLabel: "Read our story", buttonLink: "/about", imageSide: "left" }),
      pm("p_testimonials", { layout: "slider" }),
      pm("p_newsletter"),
    ],
  },
  {
    id: "flash-sale",
    name: "Flash sale",
    tagline: "High energy, built to convert",
    description: "A moving ticker, a bold hero, a countdown, new arrivals, a promo code banner and answers to common questions. Best for sales and launches.",
    outline: [
      { label: "Ticker", tone: "dark" }, { label: "Bold hero", tone: "dark" }, { label: "Countdown", tone: "accent" }, { label: "New arrivals", tone: "light" },
      { label: "Promo code banner", tone: "dark" }, { label: "Trust badges", tone: "light" }, { label: "FAQ", tone: "soft" }, { label: "Call to action", tone: "dark" },
    ],
    build: () => [
      pm("p_marquee", { tone: "accent" }),
      pm("p_hero_centered", { badge: "Limited time offer", heading: "The big sale is on", text: "Our best prices of the season on the things you love. Once they are gone, they are gone.", primaryLabel: "Shop the sale", secondaryLabel: "See new arrivals", tone: "dark" }),
      pm("p_countdown", { heading: "Sale ends soon", tone: "accent" }),
      mk("products", { heading: "Just in", source: "new", limit: 8 }),
      pm("p_promo_banner", { badge: "EXTRA 10% OFF", heading: "Use the code at checkout", code: "SALE10", tone: "dark" }),
      pm("p_trust_badges"),
      mk("faq", { heading: "Good to know" }),
      mk("cta", { heading: "Do not miss out", body: "New offers go up every week.", buttonLabel: "Shop now", buttonLink: "/shop", tone: "dark" }),
    ],
  },
  {
    id: "gallery",
    name: "Gallery",
    tagline: "Minimal and picture-led",
    description: "A full-width hero, a short introduction, a zoomable picture gallery, a pull-quote and a logo strip. Best when your photos do the talking.",
    outline: [
      { label: "Full-width hero", tone: "dark" }, { label: "Introduction", tone: "light" }, { label: "Picture gallery", tone: "soft" },
      { label: "Big quote", tone: "light" }, { label: "Featured products", tone: "light" }, { label: "Logo strip", tone: "soft" }, { label: "Call to action", tone: "dark" },
    ],
    build: () => [
      mk("hero", { heading: "Less noise. More beauty.", subheading: "A small collection, made well.", buttonLabel: "Explore", buttonLink: "/shop", height: "tall", align: "center" }),
      mk("text", { eyebrow: "Welcome", heading: "A closer look", body: "A few words about what you make and what makes it different. Keep it short and let the pictures below carry the rest.", align: "center" }),
      pm("p_gallery", { heading: "", columns: "3", layout: "masonry" }),
      pm("p_quote", { quote: "Simple, beautiful and exactly what I was looking for.", name: "A happy customer", role: "Verified buyer", tone: "light" }),
      mk("products", { heading: "From the collection", source: "featured", limit: 4 }),
      pm("p_logos", { heading: "As seen in" }),
      mk("cta", { heading: "Take a look around", body: "", buttonLabel: "Shop all", buttonLink: "/shop", tone: "dark" }),
    ],
  },
  {
    id: "launch",
    name: "Launch",
    tagline: "Video first, proof everywhere",
    description: "A video hero, headline numbers, feature boxes, a spotlight product, tabs, customer reviews and a sign-up. Best for new products and brands.",
    outline: [
      { label: "Video hero", tone: "dark" }, { label: "Numbers", tone: "dark" }, { label: "Feature boxes", tone: "light" }, { label: "Product spotlight", tone: "light" },
      { label: "Tabs", tone: "soft" }, { label: "Testimonials", tone: "soft" }, { label: "Newsletter", tone: "dark" },
    ],
    build: () => [
      pm("p_hero_video", { eyebrow: "Introducing", heading: "Meet what is next", text: "Show your product in motion with a short, silent video loop.", buttonLabel: "Shop now", height: "screen" }),
      pm("p_stats", { tone: "dark" }),
      mk("features", { heading: "Why people choose us", perRow: 3 }),
      pm("p_product_spotlight", { eyebrow: "Product of the week" }),
      pm("p_tabs", { heading: "Find what suits you" }),
      pm("p_testimonials", { layout: "grid", heading: "What people are saying" }),
      pm("p_newsletter", { tone: "dark", heading: "Be first to know" }),
    ],
  },
  {
    id: "story-and-shop",
    name: "Story & shop",
    tagline: "Warm, personal and informative",
    description: "A friendly hero, how it works, collection tiles, bundle pricing, a before-and-after, where to find you and common questions. Best for makers and local shops.",
    outline: [
      { label: "Friendly hero", tone: "soft" }, { label: "How it works", tone: "light" }, { label: "Collection tiles", tone: "light" }, { label: "Bundles & pricing", tone: "soft" },
      { label: "Before / after", tone: "light" }, { label: "Map & contact", tone: "soft" }, { label: "FAQ", tone: "light" },
    ],
    build: () => [
      pm("p_hero_centered", { badge: "Welcome", heading: "Hello, and welcome to our shop", text: "Handpicked, carefully packed and delivered to your door. Browse, ask us anything and order in a few taps.", primaryLabel: "Start shopping", secondaryLabel: "Say hello", secondaryLink: "/contact", tone: "light" }),
      pm("p_timeline", { heading: "How it works" }),
      pm("p_collection_tiles", { heading: "Browse the shop", columns: "4", shape: "square" }),
      pm("p_pricing", { heading: "Bundles that save you more" }),
      pm("p_before_after", { heading: "See the difference" }),
      pm("p_map", { heading: "Find us" }),
      mk("faq", { heading: "Questions & answers" }),
    ],
  },
];

export const homeTemplate = (id: string): HomeTemplate | undefined => HOME_TEMPLATES.find((t) => t.id === id);
