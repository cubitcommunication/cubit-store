import { formatPrice } from "@/config/brand";
import { queryOptions } from "@tanstack/react-query";
import { db } from "@/lib/data";
import type { ProductOption, Variant } from "@/lib/variants";

export type ProductImage = {
  id: string;
  image_url: string;
  alt_text: string | null;
  sort_order: number;
};

export type Product = {
  id: string;
  name: string;
  slug: string;
  sku: string;
  price: number;
  /** null = stock not tracked (always available). */
  stock_quantity?: number | null;
  compare_at_price?: number | null;
  /** Option definitions (Size, Colour…) and the purchasable combinations. */
  options?: ProductOption[] | null;
  product_variants?: Variant[];
  description: string | null;
  material: string;
  category: string;
  subcategory: string | null;
  occasion: string[] | null;
  /** Labels used for sales and discounts (for example "sale"). */
  tags?: string[];
  /** A product video, shown without sound. */
  video_url?: string | null;
  where_to_wear: string | null;
  specifications: Record<string, string> | null;
  featured: boolean;
  new_arrival: boolean;
  navratri_2026: boolean;
  diwali_2026?: boolean;
  published: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  seo_title: string | null;
  seo_description: string | null;
  seo_image_url: string | null;
  product_images: ProductImage[];
};

export type Collection = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image: string | null;
  group_name: string | null;
  category_filter: string | null;
  material_filter: string | null;
  navratri_only: boolean;
  /** Every product marked "Diwali 2026" belongs to the collection. */
  diwali_only?: boolean;
  /** Products tagged with this occasion (e.g. Bridal) belong to the collection. */
  occasion_filter?: string | null;
  /** Products added by hand. */
  product_ids?: string[] | null;
  sort_order: number;
  published: boolean;
  updated_at: string;
  seo_title: string | null;
  seo_description: string | null;
  seo_image_url: string | null;
};

export type Category = {
  id: string; name: string; slug: string; description: string | null;
  image: string | null; published: boolean; updated_at: string;
  seo_title: string | null; seo_description: string | null; seo_image_url: string | null;
};

const PRODUCT_FIELDS =
  "id,name,slug,sku,price,stock_quantity,compare_at_price,description,material,category,subcategory,occasion,tags,video_url,where_to_wear,specifications,featured,new_arrival,navratri_2026,diwali_2026,published,archived_at,created_at,updated_at,seo_title,seo_description,seo_image_url,options,product_images(id,image_url,alt_text,sort_order),product_variants(id,title,options,sku,price,compare_at_price,stock_quantity,image_url,video_url,sort_order)";

const SAFE_URL = /^\/[\w\-./]*$|^https:\/\/[\w\-./%?=&:]+$/;

/** Only allow local or https image paths, so bad data can never inject a URL. */
export function safeImage(url: string | null | undefined): string | null {
  if (!url) return null;
  return SAFE_URL.test(url) ? url : null;
}

function normalise(row: any): Product {
  const images = (row.product_images ?? [])
    .filter((i: ProductImage) => safeImage(i.image_url))
    .sort((a: ProductImage, b: ProductImage) => a.sort_order - b.sort_order);
  return {
    ...row,
    price: Number(row.price),
    compare_at_price: row.compare_at_price == null ? null : Number(row.compare_at_price),
    occasion: row.occasion ?? [],
    tags: Array.isArray(row.tags) ? row.tags : [],
    specifications:
      row.specifications && typeof row.specifications === "object"
        ? (row.specifications as Record<string, string>)
        : null,
    options: Array.isArray(row.options) ? row.options : null,
    product_images: images,
    product_variants: (row.product_variants ?? [])
      .map((v: any) => ({
        ...v,
        price: v.price == null ? null : Number(v.price),
        compare_at_price: v.compare_at_price == null ? null : Number(v.compare_at_price),
        options: v.options && typeof v.options === "object" ? v.options : {},
      }))
      .sort((a: Variant, b: Variant) => a.sort_order - b.sort_order),
  };
}

export function primaryImage(product: Product): ProductImage | null {
  return product.product_images[0] ?? null;
}

async function fetchProducts(): Promise<Product[]> {
  const { data, error } = await db
    .from("products")
    .select(PRODUCT_FIELDS)
    .eq("published", true)
    .is("archived_at", null)
    .order("created_at", { ascending: true });
  if (error) throw new Error("PRODUCTS_UNAVAILABLE");
  return (data ?? []).map(normalise);
}

async function fetchProductBySlug(slug: string): Promise<Product | null> {
  const { data, error } = await db
    .from("products")
    .select(PRODUCT_FIELDS)
    .eq("published", true)
    .is("archived_at", null)
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error("PRODUCT_UNAVAILABLE");
  return data ? normalise(data) : null;
}

async function fetchCollections(): Promise<Collection[]> {
  const { data, error } = await db
    .from("collections")
    .select(
      "id,name,slug,description,image,group_name,category_filter,material_filter,occasion_filter,product_ids,navratri_only,diwali_only,sort_order,published,updated_at,seo_title,seo_description,seo_image_url",
    )
    .eq("published", true)
    .order("sort_order", { ascending: true });
  if (error) throw new Error("COLLECTIONS_UNAVAILABLE");
  return (data ?? []) as Collection[];
}

async function fetchCategories(): Promise<Category[]> {
  const { data, error } = await db.from("categories")
    .select("id,name,slug,description,image,published,updated_at,seo_title,seo_description,seo_image_url")
    .eq("published", true).order("sort_order", { ascending: true });
  if (error) throw new Error("CATEGORIES_UNAVAILABLE");
  return (data ?? []) as Category[];
}

const FIVE_MIN = 5 * 60 * 1000;

export const productsQuery = () =>
  queryOptions({
    queryKey: ["products"],
    queryFn: fetchProducts,
    staleTime: FIVE_MIN,
  });

export const productQuery = (slug: string) =>
  queryOptions({
    queryKey: ["product", slug],
    queryFn: () => fetchProductBySlug(slug),
    staleTime: FIVE_MIN,
  });

export const collectionsQuery = () =>
  queryOptions({
    queryKey: ["collections"],
    queryFn: fetchCollections,
    staleTime: FIVE_MIN,
  });

export const categoriesQuery = () => queryOptions({
  queryKey: ["categories"], queryFn: fetchCategories, staleTime: FIVE_MIN,
});

export const slugRedirectQuery = (path: string) => queryOptions({
  queryKey: ["slug-redirect", path],
  queryFn: async () => {
    const { data } = await db.from("slug_redirects").select("target_path").eq("source_path", path).maybeSingle();
    return data?.target_path ?? null;
  },
  staleTime: FIVE_MIN,
});

/* ---------------------------------------------------------------- business logic */

export function matchesCollection(product: Product, collection: Collection) {
  if (collection.navratri_only) return product.navratri_2026;
  if (collection.diwali_only) return Boolean(product.diwali_2026);
  // Products added by hand always belong.
  if (collection.product_ids?.includes(product.id)) return true;
  const rules = Boolean(collection.category_filter || collection.material_filter || collection.occasion_filter);
  // Only hand-picked products and no rules: nothing else belongs.
  if (!rules) return !(collection.product_ids && collection.product_ids.length > 0);
  if (collection.category_filter && product.category !== collection.category_filter) return false;
  if (collection.material_filter && product.material !== collection.material_filter) return false;
  if (collection.occasion_filter && !(product.occasion ?? []).includes(collection.occasion_filter)) return false;
  return true;
}

export type Filters = {
  q: string;
  categories: string[];
  materials: string[];
  occasions: string[];
  price: string | null;
};

export type PriceBand = { id: string; label: string; min: number; max: number };

/** Two significant digits, so a boundary reads as a price people would set (1,240 rather than 1,237). */
function niceAmount(n: number): number {
  const step = Math.pow(10, Math.max(0, Math.floor(Math.log10(Math.max(1, n))) - 1));
  return Math.max(step, Math.round(n / step) * step);
}

function bandLabel(min: number, max: number): string {
  const f = (n: number) => formatPrice(n);
  if (min <= 0) return `Under ${f(max + 1)}`;
  return Number.isFinite(max) ? `${f(min)} – ${f(max)}` : `${f(min)} & above`;
}

/**
 * Price groups for the shop filter, worked out from the prices actually in the shop (quarters of the range), so nothing
 * about a particular kind of shop is built in. Fewer than eight different prices: no price filter.
 */
export function priceBands(products: Pick<Product, "price">[]): PriceBand[] {
  const prices = products.map((p) => p.price).filter((n) => Number.isFinite(n) && n > 0).sort((x, y) => x - y);
  if (new Set(prices).size < 8) return [];
  const at = (f: number) => niceAmount(prices[Math.min(prices.length - 1, Math.floor(prices.length * f))]!);
  const cuts = [...new Set([at(0.25), at(0.5), at(0.75)])].sort((x, y) => x - y);
  if (cuts.length < 2) return [];
  const out: PriceBand[] = [];
  let from = 0;
  for (const cut of cuts) {
    out.push({ id: `${from}-${cut - 1}`, label: bandLabel(from, cut - 1), min: from, max: cut - 1 });
    from = cut;
  }
  out.push({ id: `${from}-plus`, label: bandLabel(from, Infinity), min: from, max: Infinity });
  return out;
}

/** Reads a band back from its id ("0-749", "1800-plus"), so a shared link keeps working. */
export function bandById(id: string | null | undefined): PriceBand | null {
  const m = /^(\d+)-(\d+|plus)$/.exec(id ?? "");
  if (!m) return null;
  const min = Number(m[1]);
  const max = m[2] === "plus" ? Infinity : Number(m[2]);
  return { id: id as string, label: bandLabel(min, max), min, max };
}

export function searchMatches(product: Product, term: string) {
  const q = term.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    product.name,
    product.sku,
    product.category,
    product.material,
    product.subcategory ?? "",
    product.where_to_wear ?? "",
    product.description ?? "",
    ...(product.occasion ?? []),
  ]
    .join(" ")
    .toLowerCase();
  return q.split(/\s+/).every((word) => haystack.includes(word));
}

export function applyFilters(products: Product[], f: Filters): Product[] {
  const band = bandById(f.price);
  return products.filter((p) => {
    if (!searchMatches(p, f.q)) return false;
    if (f.categories.length) {
      const cat = p.category.toLowerCase();
      const ok = f.categories.some((c) => {
        const needle = c.toLowerCase();
        if (needle === "bracelets" || needle === "kada")
          return cat.includes("bracelet") || cat.includes("kada");
        return cat === needle;
      });
      if (!ok) return false;
    }
    if (f.materials.length && !f.materials.includes(p.material)) return false;
    if (
      f.occasions.length &&
      !f.occasions.some((o) => (p.occasion ?? []).includes(o))
    )
      return false;
    if (band && (p.price < band.min || p.price > band.max)) return false;
    return true;
  });
}

export type SortKey = "newest" | "price-asc" | "price-desc" | "name-asc";

export function sortProducts(products: Product[], key: SortKey): Product[] {
  const list = [...products];
  switch (key) {
    case "price-asc":
      return list.sort((a, b) => a.price - b.price);
    case "price-desc":
      return list.sort((a, b) => b.price - a.price);
    case "name-asc":
      return list.sort((a, b) => a.name.localeCompare(b.name));
    default:
      return list.sort(
        (a, b) => Number(b.new_arrival) - Number(a.new_arrival),
      );
  }
}

export function relatedProducts(
  all: Product[],
  current: Product,
  limit = 4,
): Product[] {
  const score = (p: Product) =>
    (p.category === current.category ? 2 : 0) +
    (p.material === current.material ? 2 : 0) +
    (p.subcategory && p.subcategory === current.subcategory ? 1 : 0);
  return all
    .filter((p) => p.id !== current.id)
    .map((p) => ({ p, s: score(p) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.p);
}
