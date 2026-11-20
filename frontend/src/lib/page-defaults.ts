import { brand } from "@/config/brand";
import { blankBlock, type Block, type BlockType, type ColumnsBlock, type ColumnsLayout, type SystemKind } from "@/lib/pages";

/**
 * Starting designs for the built-in pages. They are built from the same sections the live pages use, so opening
 * "Edit" in Admin → Pages shows today's page, ready to rearrange. Nothing changes on the site until it is published.
 */

function make<T extends Block>(type: BlockType, patch: Partial<T> = {}, layout?: ColumnsLayout): T {
  return { ...blankBlock(type, layout), ...patch } as T;
}

const columns = (layout: ColumnsLayout, cols: Block[][], gap: ColumnsBlock["gap"] = "md"): ColumnsBlock =>
  make<ColumnsBlock>("columns", { gap, columns: cols }, layout);

function home(): Block[] {
  // A new store opens with one line: everything else is built in Admin → Pages → Home page (or from a template).
  return [make("text", { eyebrow: "", heading: `Welcome to ${brand.name}`, body: "", align: "center" }, undefined)].map((b) => ({ ...b, style: { padY: 140 } }));
}

function contact(): Block[] {
  return [
    make("text", {
      eyebrow: "We're one message away",
      heading: "CONTACT",
      body: `Talk to ${brand.name} about availability, styling and product details. WhatsApp is the fastest way to reach us.`,
      align: "left",
    }),
    make("site_contact"),
  ];
}

function product(): Block[] {
  return [
    make("product_breadcrumb"),
    columns("1-1", [[make("product_gallery")], [make("product_info"), make("product_specs")]], "lg"),
    make("product_related"),
    make("product_sticky_bar"),
  ];
}

function collection(): Block[] {
  return [make("collection_header"), make("collection_products")];
}

function about(): Block[] {
  return [
    make("text", {
      eyebrow: `About ${brand.name}`,
      heading: "Our story",
      align: "left",
      body: "Tell visitors who you are, what you sell and why you started. Two or three honest paragraphs are enough.",
    }),
    make("image_text", {
      image: "media:about_story",
      alt: brand.name,
      eyebrow: "Why we started",
      heading: "What drives us",
      imageSide: "left",
      body: "Share the idea behind your shop, how you choose what you sell, and what customers can expect from you.",
    }),
    make("features", {
      heading: "What we stand for",
      perRow: 3,
      items: [
        { title: "Quality", body: "We only sell things we would be happy to give to someone we love." },
        { title: "Fair prices", body: "Honest pricing with no surprises at checkout." },
        { title: "Care", body: "Every order is checked, packed and sent with attention." },
      ],
    }),
    make("cta", { heading: "Questions? Say hello.", body: "", tone: "dark", buttonLabel: "Contact us", buttonLink: "/contact" }),
  ];
}

const header = (eyebrow: string, heading: string, body: string): Block =>
  make("text", { eyebrow, heading, body, align: "left" });

function shop(): Block[] {
  return [
    make("image", { image: "media:shop_banner", alt: "" }),
    header("The full range", `SHOP ${brand.name}`, "Every published piece, ready to browse. Found something you love? Send a WhatsApp enquiry and we'll take it from there."),
    make("shop_listing"),
  ];
}

function collectionsPage(): Block[] {
  return [
    make("image", { image: "media:collections_banner", alt: "" }),
    header("Curated edits", "COLLECTIONS", "Browse the collections to find what you are looking for faster."),
    make("collections_list"),
  ];
}

function blog(): Block[] {
  return [header("Stories & styling", "JOURNAL", ""), make("blog_list")];
}

export const DEFAULT_BLOCKS: Record<SystemKind, () => Block[]> = { home, about, contact, product, collection, shop, collections: collectionsPage, blog };
