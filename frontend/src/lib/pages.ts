import { brand } from "@/config/brand";
import { queryOptions } from "@tanstack/react-query";
import { CURRENCY } from "@/config/brand";
import { db } from "@/lib/data";
import { PREMIUM_GROUPS, PREMIUM_LABELS, PREMIUM_TYPES, isPremiumType, premiumBlank, type PremiumBlock } from "@/lib/premium-blocks";

/**
 * Pages made in Admin → Pages (the page builder). A page is an ordered list of blocks stored as JSON.
 * A "columns" block holds further blocks in each column. Block text is always plain text (never HTML),
 * every link goes through SmartLink and every video address is parsed into a known embed, so nothing
 * typed in the builder can inject script or an unsafe address.
 */

export type Device = "desktop" | "tablet" | "mobile";
export type BlockStyle = {
  bg?: "none" | "surface" | "dark" | "red" | undefined;
  /** Space above and below, in px. Unset = the block's own default. */
  padY?: number | undefined;
  hideOn?: Device[] | undefined;
};

type Base = { id: string; hidden?: boolean; style?: BlockStyle };

export type HeroBlock = Base & {
  type: "hero";
  image: string;
  heading: string;
  subheading: string;
  buttonLabel: string;
  buttonLink: string;
  height: "medium" | "tall";
  align: "left" | "center";
};
export type TextBlock = Base & { type: "text"; eyebrow: string; heading: string; body: string; align: "left" | "center" };
export type ImageBlock = Base & { type: "image"; image: string; alt: string; link: string; width: "contained" | "full" };
export type ImageTextBlock = Base & {
  type: "image_text";
  image: string;
  alt: string;
  eyebrow: string;
  heading: string;
  body: string;
  buttonLabel: string;
  buttonLink: string;
  imageSide: "left" | "right";
};
export type ProductsBlock = Base & {
  type: "products";
  heading: string;
  source: "featured" | "new" | "category" | "collection" | "manual";
  category: string;
  collectionSlug: string;
  productIds: string[];
  limit: number;
};
export type CtaBlock = Base & { type: "cta"; heading: string; body: string; buttonLabel: string; buttonLink: string; tone: "dark" | "light" | "red" };
export type SpacerBlock = Base & { type: "spacer"; height: number; divider: boolean };
export type ButtonBlock = Base & {
  type: "button";
  label: string;
  link: string;
  variant: "solid" | "outline";
  align: "left" | "center" | "right";
  fullWidth: boolean;
};
export type ColumnsLayout = "1-1" | "1-1-1" | "1-1-1-1" | "1-2" | "2-1";
export type ColumnsBlock = Base & {
  type: "columns";
  layout: ColumnsLayout;
  gap: "sm" | "md" | "lg";
  valign: "top" | "center";
  columns: Block[][];
};
export type FaqBlock = Base & { type: "faq"; heading: string; items: { q: string; a: string }[] };
export type FeaturesBlock = Base & { type: "features"; heading: string; perRow: 2 | 3 | 4; items: { title: string; body: string }[] };
export type VideoBlock = Base & { type: "video"; url: string; caption: string };

/** Ready-made sections of the site. Each keeps its own text and pictures in the page, edited in the page builder. */
export type SiteSectionType =
  | "site_hero" | "site_categories" | "site_season" | "site_featured" | "site_stories" | "site_occasions" | "site_story" | "site_reels" | "site_contact";
/** `content` holds the section's own text and pictures (see section-content.ts); a block without it reads the shop settings. */
export type SiteBlock = Base & { type: SiteSectionType; content?: Record<string, string> };

/** Blocks that fill in the current product or collection. Only offered in the Product / Collection templates. */
export type TemplateBlockType =
  | "product_breadcrumb" | "product_gallery" | "product_info" | "product_specs" | "product_related" | "product_sticky_bar" | "collection_header" | "collection_products"
  | "shop_listing" | "collections_list" | "blog_list";
export type TemplateBlock = Base & { type: TemplateBlockType };

export type TeamBlock = Base & {
  type: "team";
  eyebrow: string;
  heading: string;
  items: { name: string; role: string; image: string; blurb: string; link: string }[];
};

export type Block =
  | SiteBlock
  | PremiumBlock
  | TemplateBlock
  | TeamBlock
  | HeroBlock
  | TextBlock
  | ImageBlock
  | ImageTextBlock
  | ProductsBlock
  | CtaBlock
  | SpacerBlock
  | ButtonBlock
  | ColumnsBlock
  | FaqBlock
  | FeaturesBlock
  | VideoBlock;
export type BlockType = Block["type"];

/** "page" = an ordinary page at /pages/<slug>; the others are the editable designs of the built-in pages. */
export type PageKind = "page" | "post" | "policy" | "home" | "about" | "contact" | "product" | "collection" | "shop" | "collections" | "blog";
export type SystemKind = Exclude<PageKind, "page" | "post" | "policy">;
export const isSystemKind = (k: PageKind): k is SystemKind => k !== "page" && k !== "post" && k !== "policy";
export const SYSTEM_PAGES: { kind: SystemKind; title: string; path: string | null; help: string }[] = [
  { kind: "home", title: "Home page", path: "/", help: "The front page of the shop." },
  { kind: "about", title: "About page", path: "/about", help: "Story, mission, founders and values." },
  { kind: "contact", title: "Contact page", path: "/contact", help: "WhatsApp, phone, e-mail and social links." },
  { kind: "product", title: "Product page template", path: null, help: "Used for every product: gallery, price, buy buttons, details." },
  { kind: "collection", title: "Collection page template", path: null, help: "Used for every collection and category page." },
  { kind: "shop", title: "Shop page", path: "/shop", help: "All products with search and filters." },
  { kind: "collections", title: "Collections page", path: "/collections", help: "Every collection, grouped." },
  { kind: "blog", title: "Journal (blog) page", path: "/blog", help: "The heading and list of blog posts." },
];
export const systemSlug = (kind: SystemKind) => `system-${kind}`;

export type PageRow = {
  id: string;
  title: string;
  slug: string;
  kind: PageKind;
  published: boolean;
  blocks: Block[] | null;
  seo_title: string | null;
  seo_description: string | null;
  seo_image_url: string | null;
  /** Blog posts only. */
  excerpt: string | null;
  cover_url: string | null;
  author: string | null;
  tags: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

/** A blog post as listed on /blog (no blocks). */
export type PostCard = Pick<PageRow, "id" | "title" | "slug" | "excerpt" | "cover_url" | "author" | "tags" | "published_at" | "created_at">;
export const POST_CARD_FIELDS = "id,title,slug,excerpt,cover_url,author,tags,published_at,created_at";

/** "Festive, Care" -> ["Festive", "Care"] */
export const parseTags = (tags: string | null | undefined): string[] =>
  (tags ?? "").split(",").map((t) => t.trim()).filter(Boolean).slice(0, 8);

export const BLOCK_LABELS: Record<BlockType, { label: string; help: string }> = {
  ...PREMIUM_LABELS,
  hero: { label: "Hero banner", help: "Big picture, heading and button" },
  text: { label: "Heading & text", help: "A title and a paragraph" },
  image: { label: "Image", help: "One picture, optionally a link" },
  image_text: { label: "Image + text", help: "Picture beside a heading and text" },
  products: { label: "Product grid", help: "Featured, new, category, collection or picked" },
  cta: { label: "Call to action", help: "Highlighted message with a button" },
  spacer: { label: "Space / divider", help: "Empty space or a thin line" },
  button: { label: "Button", help: "A single button with a link" },
  columns: { label: "Columns", help: "Put blocks side by side" },
  faq: { label: "FAQ", help: "Questions that open and close" },
  features: { label: "Feature boxes", help: "A row of short highlights" },
  video: { label: "Video", help: "YouTube, Vimeo or an .mp4 link" },
  team: { label: "People / team", help: "Photos with a name, role and link" },
  site_hero: { label: "Home hero", help: "The big home banner: picture, heading, buttons" },
  site_categories: { label: "Shop by category", help: "Category picture tiles" },
  site_season: { label: "Seasonal banner", help: "A seasonal or sale banner" },
  site_featured: { label: "Featured products", help: "Carousel of featured products" },
  site_stories: { label: "Home stories", help: "Picture + text bands" },
  site_occasions: { label: "Shop by occasion", help: "Occasion tabs with products" },
  site_story: { label: `Discover ${brand.name}`, help: "Story with highlights" },
  site_reels: { label: "Reels", help: "Reels strip (videos from Admin -> Reels)" },
  site_contact: { label: "Contact details", help: "WhatsApp button, phone, e-mail, social, picture" },
  product_breadcrumb: { label: "Product breadcrumb", help: "Shop / product name" },
  product_gallery: { label: "Product gallery", help: "The product pictures" },
  product_info: { label: "Product info & buy box", help: "Name, price, options, buttons" },
  product_specs: { label: "Product details", help: "Category, material, occasion, specs" },
  product_related: { label: "You may also like", help: "Related products" },
  product_sticky_bar: { label: "Mobile buy bar", help: "Sticky bar on phones" },
  collection_header: { label: "Collection header", help: "Picture, breadcrumb and name" },
  collection_products: { label: "Collection products", help: "Description, count and product grid" },
  shop_listing: { label: "Shop listing", help: "Search, filters, sorting and all products" },
  collections_list: { label: "Collections list", help: "Material shortcuts and every collection" },
  blog_list: { label: "Blog post list", help: "Topic filter and all published posts" },
};

/** What the "Add" panel offers, grouped. */
export type LibraryItem = { key: string; type: BlockType; label: string; layout?: ColumnsLayout };
export const LIBRARY: { group: string; /** Only offered when editing one of these kinds (all when empty). */ kinds?: PageKind[]; items: LibraryItem[] }[] = [
  {
    group: "Layout",
    items: [
      { key: "cols2", type: "columns", label: "2 columns", layout: "1-1" },
      { key: "cols3", type: "columns", label: "3 columns", layout: "1-1-1" },
      { key: "cols4", type: "columns", label: "4 columns", layout: "1-1-1-1" },
      { key: "cols13", type: "columns", label: "1/3 + 2/3", layout: "1-2" },
      { key: "spacer", type: "spacer", label: "Space / divider" },
    ],
  },
  {
    group: "Basics",
    items: [
      { key: "text", type: "text", label: "Heading & text" },
      { key: "button", type: "button", label: "Button" },
      { key: "image", type: "image", label: "Image" },
      { key: "video", type: "video", label: "Video" },
    ],
  },
  {
    group: "Sections",
    items: [
      { key: "hero", type: "hero", label: "Hero banner" },
      { key: "image_text", type: "image_text", label: "Image + text" },
      { key: "features", type: "features", label: "Feature boxes" },
      { key: "cta", type: "cta", label: "Call to action" },
      { key: "faq", type: "faq", label: "FAQ" },
      { key: "team", type: "team", label: "People / team" },
    ],
  },
  { group: "Store", items: [{ key: "products", type: "products", label: "Product grid" }] },
  {
    group: "Site sections",
    items: (["site_hero", "site_categories", "site_season", "site_featured", "site_stories", "site_occasions", "site_story", "site_reels", "site_contact"] as const).map((t) => ({ key: t, type: t, label: BLOCK_LABELS[t].label })),
  },
  {
    group: "Product page",
    kinds: ["product"],
    items: (["product_breadcrumb", "product_gallery", "product_info", "product_specs", "product_related", "product_sticky_bar"] as const).map((t) => ({ key: t, type: t, label: BLOCK_LABELS[t].label })),
  },
  {
    group: "Listings",
    kinds: ["shop", "collections", "blog"],
    items: (["shop_listing", "collections_list", "blog_list"] as const).map((t) => ({ key: t, type: t, label: BLOCK_LABELS[t].label })),
  },
  {
    group: "Collection page",
    kinds: ["collection"],
    items: (["collection_header", "collection_products"] as const).map((t) => ({ key: t, type: t, label: BLOCK_LABELS[t].label })),
  },
  ...PREMIUM_GROUPS,
];

/** The library groups to offer for a page kind. */
export const libraryFor = (kind: PageKind) => LIBRARY.filter((g) => !g.kinds || g.kinds.includes(kind));

/** Blocks that cannot sit inside a column. */
export const NOT_IN_COLUMNS: BlockType[] = [
  ...PREMIUM_TYPES,
  "hero", "columns", "site_hero", "site_categories", "site_season", "site_featured", "site_stories", "site_occasions", "site_story", "site_reels", "site_contact",
  "collection_header", "product_sticky_bar", "shop_listing", "collections_list", "blog_list",
];

/** Sections that bring their own width and spacing. */
export const SELF_CONTAINED = new Set<BlockType>([
  ...PREMIUM_TYPES,
  "site_hero", "site_categories", "site_season", "site_featured", "site_stories", "site_occasions", "site_story", "site_reels", "site_contact",
  "collection_header", "collection_products", "product_sticky_bar", "product_related", "shop_listing", "collections_list", "blog_list",
]);

export const newId = () => crypto.randomUUID();

export const COLUMN_COUNT: Record<ColumnsLayout, number> = { "1-1": 2, "1-1-1": 3, "1-1-1-1": 4, "1-2": 2, "2-1": 2 };

export function blankBlock(type: BlockType, layout: ColumnsLayout = "1-1"): Block {
  if (isPremiumType(type)) return premiumBlank(type);
  const id = newId();
  switch (type) {
    case "hero":
      return { id, type, image: "", heading: "Your heading", subheading: "", buttonLabel: "Shop now", buttonLink: "/shop", height: "medium", align: "left" };
    case "text":
      return { id, type, eyebrow: "", heading: "Your heading", body: "Write something here.", align: "center" };
    case "image":
      return { id, type, image: "", alt: "", link: "", width: "contained" };
    case "image_text":
      return { id, type, image: "", alt: "", eyebrow: "", heading: "Your heading", body: "Write something here.", buttonLabel: "", buttonLink: "", imageSide: "left" };
    case "products":
      return { id, type, heading: "Our favourites", source: "featured", category: "", collectionSlug: "", productIds: [], limit: 8 };
    case "cta":
      return { id, type, heading: "Found something you love?", body: "", buttonLabel: "Shop now", buttonLink: "/shop", tone: "dark" };
    case "button":
      return { id, type, label: "Shop now", link: "/shop", variant: "solid", align: "center", fullWidth: false };
    case "columns":
      return { id, type, layout, gap: "md", valign: "top", columns: Array.from({ length: COLUMN_COUNT[layout] }, () => []) };
    case "faq":
      return { id, type, heading: "Questions & answers", items: [{ q: "Your first question?", a: "Your answer." }, { q: "Another question?", a: "Another answer." }] };
    case "features":
      return { id, type, heading: "", perRow: 3, items: [{ title: "Free shipping", body: `On orders above ${CURRENCY}999.` }, { title: "Easy returns", body: "Within 7 days." }, { title: "Gift ready", body: "Packed with care." }] };
    case "video":
      return { id, type, url: "", caption: "" };
    case "team":
      return { id, type, eyebrow: "", heading: "Meet the team", items: [{ name: "Name", role: "Role", image: "", blurb: "", link: "" }] };
    case "site_hero": case "site_categories": case "site_season": case "site_featured": case "site_stories": case "site_occasions": case "site_story": case "site_reels": case "site_contact":
    case "product_breadcrumb": case "product_gallery": case "product_info": case "product_specs": case "product_related": case "product_sticky_bar":
    case "collection_header": case "collection_products":
    case "shop_listing":
    case "collections_list":
    case "blog_list":
      return { id, type };
    default:
      return { id, type: "spacer", height: 48, divider: false };
  }
}

/** Page addresses: lower-case letters, numbers and single hyphens. */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/* ---------------------------------------------------------------- video links */

const ID = /^[A-Za-z0-9_-]{6,20}$/;

export type VideoSource = { kind: "iframe"; src: string } | { kind: "file"; src: string } | null;

/** Turns a pasted video address into a safe embed. Anything not recognised returns null. */
export function parseVideo(value: string): VideoSource {
  const v = (value ?? "").trim();
  let url: URL;
  try {
    url = new URL(v);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const host = url.hostname.replace(/^www\./, "");
  if (host === "youtu.be") {
    const id = url.pathname.slice(1);
    return ID.test(id) ? { kind: "iframe", src: `https://www.youtube-nocookie.com/embed/${id}` } : null;
  }
  if (host === "youtube.com" || host === "m.youtube.com") {
    const id = url.searchParams.get("v") ?? url.pathname.match(/^\/(?:embed|shorts)\/([^/]+)/)?.[1] ?? "";
    return ID.test(id) ? { kind: "iframe", src: `https://www.youtube-nocookie.com/embed/${id}` } : null;
  }
  if (host === "vimeo.com") {
    const id = url.pathname.match(/^\/(\d{5,12})/)?.[1];
    return id ? { kind: "iframe", src: `https://player.vimeo.com/video/${id}` } : null;
  }
  if (/\.(mp4|webm)$/i.test(url.pathname)) return { kind: "file", src: url.href };
  return null;
}

/* ---------------------------------------------------------------- tree helpers */

export type Loc = { parentId: string | null; col: number; index: number; block: Block };

/** Finds a block anywhere in the page (including inside columns). */
export function findBlock(blocks: Block[], id: string): Loc | null {
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]!;
    if (b.id === id) return { parentId: null, col: 0, index: i, block: b };
    if (b.type === "columns") {
      for (let c = 0; c < b.columns.length; c++) {
        const col = b.columns[c]!;
        for (let j = 0; j < col.length; j++) {
          if (col[j]!.id === id) return { parentId: b.id, col: c, index: j, block: col[j]! };
        }
      }
    }
  }
  return null;
}

function mapTree(blocks: Block[], fn: (b: Block) => Block): Block[] {
  return blocks.map((b) => {
    const next = fn(b);
    return next.type === "columns" ? { ...next, columns: next.columns.map((c) => mapTree(c, fn)) } : next;
  });
}

export const updateBlock = (blocks: Block[], id: string, change: Partial<Block>): Block[] =>
  mapTree(blocks, (b) => (b.id === id ? ({ ...b, ...change } as Block) : b));

export function removeBlock(blocks: Block[], id: string): Block[] {
  return blocks
    .filter((b) => b.id !== id)
    .map((b) => (b.type === "columns" ? { ...b, columns: b.columns.map((c) => c.filter((x) => x.id !== id)) } : b));
}

export type Target = { parentId: string | null; col: number; index: number };

export function insertBlock(blocks: Block[], block: Block, at: Target): Block[] {
  if (at.parentId === null) {
    const next = [...blocks];
    next.splice(Math.max(0, Math.min(at.index, next.length)), 0, block);
    return next;
  }
  return mapTree(blocks, (b) => {
    if (b.id !== at.parentId || b.type !== "columns") return b;
    const columns = b.columns.map((c, i) => {
      if (i !== at.col) return c;
      const next = [...c];
      next.splice(Math.max(0, Math.min(at.index, next.length)), 0, block);
      return next;
    });
    return { ...b, columns };
  });
}

/** Moves a block one place up (-1) or down (+1) inside its own list. */
export function moveBlock(blocks: Block[], id: string, by: -1 | 1): Block[] {
  const loc = findBlock(blocks, id);
  if (!loc) return blocks;
  const swap = (list: Block[]) => {
    const to = loc.index + by;
    if (to < 0 || to >= list.length) return list;
    const next = [...list];
    [next[loc.index], next[to]] = [next[to]!, next[loc.index]!];
    return next;
  };
  if (loc.parentId === null) return swap(blocks);
  return mapTree(blocks, (b) => (b.id === loc.parentId && b.type === "columns" ? { ...b, columns: b.columns.map((c, i) => (i === loc.col ? swap(c) : c)) } : b));
}

/** A deep copy with fresh ids. */
export function cloneBlock(block: Block): Block {
  const copy = { ...block, id: newId() } as Block;
  return copy.type === "columns" ? { ...copy, columns: copy.columns.map((c) => c.map(cloneBlock)) } : copy;
}

export function duplicateBlock(blocks: Block[], id: string): { blocks: Block[]; newId: string | null } {
  const loc = findBlock(blocks, id);
  if (!loc) return { blocks, newId: null };
  const copy = cloneBlock(loc.block);
  return { blocks: insertBlock(blocks, copy, { parentId: loc.parentId, col: loc.col, index: loc.index + 1 }), newId: copy.id };
}

/** Moves a block to a new place (drag and drop in the layers panel). A block cannot move into itself. */
export function relocateBlock(blocks: Block[], id: string, at: Target): Block[] {
  const loc = findBlock(blocks, id);
  if (!loc) return blocks;
  if (at.parentId === id) return blocks;
  if (loc.block.type === "columns" && at.parentId !== null) return blocks; // columns never nest
  const sameList = loc.parentId === at.parentId && loc.col === at.col;
  const without = removeBlock(blocks, id);
  const index = sameList && loc.index < at.index ? at.index - 1 : at.index;
  return insertBlock(without, loc.block, { ...at, index });
}

/** Keeps the column arrays in step with the chosen layout (extra columns merge into the last one). */
export function withLayout(block: ColumnsBlock, layout: ColumnsLayout): ColumnsBlock {
  const count = COLUMN_COUNT[layout];
  const columns = block.columns.map((c) => [...c]);
  while (columns.length > count) columns[columns.length - 2] = [...columns[columns.length - 2]!, ...columns.pop()!];
  while (columns.length < count) columns.push([]);
  return { ...block, layout, columns };
}

/* ---------------------------------------------------------------- data */

export const PAGE_FIELDS = "id,title,slug,kind,published,blocks,seo_title,seo_description,seo_image_url,excerpt,cover_url,author,tags,published_at,created_at,updated_at";

export const publishedPageQuery = (slug: string) =>
  queryOptions({
    queryKey: ["page", slug],
    queryFn: async () => {
      const { data, error } = await db.from("pages").select(PAGE_FIELDS).eq("slug", slug).eq("kind", "page").maybeSingle();
      if (error) throw new Error("PAGE_UNAVAILABLE");
      return (data as PageRow | null) ?? null;
    },
    staleTime: 60_000,
  });

/** The published custom design of a built-in page (null while the built-in design is in use). */
export const systemPageQuery = (kind: SystemKind) =>
  queryOptions({
    queryKey: ["page", "system", kind],
    queryFn: async () => {
      const { data, error } = await db.from("pages").select(PAGE_FIELDS).eq("slug", systemSlug(kind)).eq("kind", kind).maybeSingle();
      if (error) return null;
      const row = data as PageRow | null;
      return row && row.published && Array.isArray(row.blocks) && row.blocks.length > 0 ? row : null;
    },
    staleTime: 60_000,
  });

/** One published policy page (terms, privacy...), by address. */
export const publishedPolicyQuery = (slug: string) =>
  queryOptions({
    queryKey: ["policy", slug],
    queryFn: async () => {
      const { data, error } = await db.from("pages").select(PAGE_FIELDS).eq("slug", slug).eq("kind", "policy").maybeSingle();
      if (error) throw new Error("POLICY_UNAVAILABLE");
      return (data as PageRow | null) ?? null;
    },
    staleTime: 60_000,
  });

/** The usual order of the policies; any policy added later follows, by title. */
const POLICY_ORDER = ["terms-and-conditions", "privacy-policy", "cancellation-and-refund", "shipping-and-exchange"];
export const sortPolicies = <T extends { slug: string; title: string }>(list: T[]): T[] =>
  [...list].sort((a, b) => {
    const ia = POLICY_ORDER.indexOf(a.slug);
    const ib = POLICY_ORDER.indexOf(b.slug);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.title.localeCompare(b.title);
  });

/** Published policies for the footer links. */
export const policyListQuery = () =>
  queryOptions({
    queryKey: ["policies"],
    queryFn: async () => {
      const { data, error } = await db.from("pages").select("id,title,slug").eq("kind", "policy").eq("published", true);
      if (error) return [];
      return sortPolicies((data ?? []) as { id: string; title: string; slug: string }[]);
    },
    staleTime: 60_000,
  });

/** One published blog post, by address. */
export const publishedPostQuery = (slug: string) =>
  queryOptions({
    queryKey: ["post", slug],
    queryFn: async () => {
      const { data, error } = await db.from("pages").select(PAGE_FIELDS).eq("slug", slug).eq("kind", "post").maybeSingle();
      if (error) throw new Error("POST_UNAVAILABLE");
      return (data as PageRow | null) ?? null;
    },
    staleTime: 60_000,
  });

/** Published posts, newest first. */
export const blogListQuery = () =>
  queryOptions({
    queryKey: ["posts"],
    queryFn: async () => {
      const { data, error } = await db.from("pages").select(POST_CARD_FIELDS).eq("kind", "post").order("published_at", { ascending: false }).limit(200);
      if (error) throw new Error("POSTS_UNAVAILABLE");
      return (data ?? []) as PostCard[];
    },
    staleTime: 60_000,
  });
