import { queryOptions } from "@tanstack/react-query";
import { db } from "@/lib/data";
import type { ProductOption, Variant } from "@/lib/variants";

export type AdminProduct = {
  id: string;
  name: string;
  slug: string;
  sku: string;
  price: number;
  stock_quantity?: number | null;
  compare_at_price?: number | null;
  options?: ProductOption[] | null;
  product_variants?: Variant[];
  description: string | null;
  material: string;
  category: string;
  subcategory: string | null;
  occasion: string[];
  tags?: string[];
  video_url?: string | null;
  /** Packed weight and size, used to book a courier (blank = the default parcel). */
  weight_grams?: number | null;
  length_cm?: number | null;
  breadth_cm?: number | null;
  height_cm?: number | null;
  where_to_wear: string | null;
  specifications: Record<string, string>;
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
  product_images: {
    id: string;
    image_url: string;
    alt_text: string | null;
    sort_order: number;
  }[];
};

export type AdminFlag =
  | "all"
  | "published"
  | "draft"
  | "featured"
  | "new_arrival"
  | "sale"
  | "archived";

export type AdminSort =
  | "updated" | "updated_asc" | "name_asc" | "name_desc" | "price_asc" | "price_desc" | "newest" | "oldest"
  | "category_asc" | "category_desc" | "material_asc" | "material_desc" | "status_asc" | "status_desc";

export type AdminProductFilters = {
  search: string;
  flag: AdminFlag;
  category?: string | undefined;
  minPrice?: number | null;
  maxPrice?: number | null;
};

const ADMIN_FIELDS =
  "id,name,slug,sku,price,stock_quantity,compare_at_price,description,material,category,subcategory,occasion,tags,video_url,weight_grams,length_cm,breadth_cm,height_cm,where_to_wear,specifications,featured,new_arrival,navratri_2026,diwali_2026,published,archived_at,created_at,updated_at,seo_title,seo_description,seo_image_url,options,product_images(id,image_url,alt_text,sort_order),product_variants(id,title,options,sku,price,compare_at_price,stock_quantity,image_url,video_url,sort_order)";

export const ADMIN_PAGE_SIZE = 20;

/** Applies the search / status / category / price-range filters shared by the list and "select all matching". */
function applyAdminFilters(q: any, opts: AdminProductFilters) {
  const term = opts.search.trim();
  if (term) {
    const safe = term.replace(/[,%()]/g, " ");
    q = q.or(
      [
        `name.ilike.%${safe}%`,
        `sku.ilike.%${safe}%`,
        `category.ilike.%${safe}%`,
        `material.ilike.%${safe}%`,
        `subcategory.ilike.%${safe}%`,
      ].join(","),
    );
  }

  if (opts.flag === "archived") q = q.not("archived_at", "is", null);
  else q = q.is("archived_at", null);

  if (opts.flag === "published") q = q.eq("published", true);
  if (opts.flag === "draft") q = q.eq("published", false);
  if (opts.flag === "featured") q = q.eq("featured", true);
  if (opts.flag === "new_arrival") q = q.eq("new_arrival", true);
  // "On sale" = an MRP is set (the storefront only shows it when the MRP is above the price).
  if (opts.flag === "sale") q = q.not("compare_at_price", "is", null);

  if (opts.category) q = q.eq("category", opts.category);
  if (opts.minPrice != null) q = q.gte("price", opts.minPrice);
  if (opts.maxPrice != null) q = q.lte("price", opts.maxPrice);
  return q;
}

export const adminProductsQuery = (opts: AdminProductFilters & { page: number; sort?: AdminSort }) =>
  queryOptions({
    queryKey: ["admin", "products", opts],
    queryFn: async () => {
      const from = (opts.page - 1) * ADMIN_PAGE_SIZE;
      let q: any = db.from("products").select(ADMIN_FIELDS, { count: "exact" });
      switch (opts.sort ?? "updated") {
        case "name_asc": q = q.order("name", { ascending: true }); break;
        case "name_desc": q = q.order("name", { ascending: false }); break;
        case "price_asc": q = q.order("price", { ascending: true }).order("name", { ascending: true }); break;
        case "price_desc": q = q.order("price", { ascending: false }).order("name", { ascending: true }); break;
        case "newest": q = q.order("created_at", { ascending: false }); break;
        case "oldest": q = q.order("created_at", { ascending: true }); break;
        case "updated_asc": q = q.order("updated_at", { ascending: true }); break;
        case "category_asc": q = q.order("category", { ascending: true }).order("name", { ascending: true }); break;
        case "category_desc": q = q.order("category", { ascending: false }).order("name", { ascending: true }); break;
        case "material_asc": q = q.order("material", { ascending: true }).order("name", { ascending: true }); break;
        case "material_desc": q = q.order("material", { ascending: false }).order("name", { ascending: true }); break;
        case "status_asc": q = q.order("published", { ascending: true }).order("name", { ascending: true }); break;
        case "status_desc": q = q.order("published", { ascending: false }).order("name", { ascending: true }); break;
        default: q = q.order("updated_at", { ascending: false });
      }
      q = applyAdminFilters(q, opts).range(from, from + ADMIN_PAGE_SIZE - 1);

      const { data, error, count } = await q;
      if (error) throw new Error("ADMIN_PRODUCTS_UNAVAILABLE");
      return {
        rows: (data ?? []).map((r: any) => ({
          ...r,
          price: Number(r.price),
          occasion: r.occasion ?? [],
          tags: Array.isArray(r.tags) ? r.tags : [],
          video_url: r.video_url ?? null,
          weight_grams: r.weight_grams ?? null, length_cm: r.length_cm ?? null, breadth_cm: r.breadth_cm ?? null, height_cm: r.height_cm ?? null,
          specifications: r.specifications ?? {},
          product_images: [...(r.product_images ?? [])].sort(
            (a: any, b: any) => a.sort_order - b.sort_order,
          ),
        })) as AdminProduct[],
        total: count ?? 0,
      };
    },
  });

/** Ids of every product matching the filters (capped), for "select all N products". */
export async function fetchMatchingProductIds(opts: AdminProductFilters, limit = 1000): Promise<string[]> {
  const { data, error } = await applyAdminFilters(db.from("products").select("id") as any, opts).range(0, limit - 1);
  if (error) throw new Error("ADMIN_PRODUCTS_UNAVAILABLE");
  return (data ?? []).map((r: any) => r.id as string);
}

export const adminProductQuery = (id: string) =>
  queryOptions({
    queryKey: ["admin", "product", id],
    queryFn: async () => {
      const { data, error } = await db
        .from("products")
        .select(ADMIN_FIELDS)
        .eq("id", id)
        .maybeSingle();
      if (error) throw new Error("ADMIN_PRODUCT_UNAVAILABLE");
      if (!data) return null;
      const row: any = data;
      return {
        ...row,
        price: Number(row.price),
        occasion: row.occasion ?? [],
        tags: Array.isArray(row.tags) ? row.tags : [],
        video_url: row.video_url ?? null,
        weight_grams: row.weight_grams ?? null, length_cm: row.length_cm ?? null, breadth_cm: row.breadth_cm ?? null, height_cm: row.height_cm ?? null,
        specifications: row.specifications ?? {},
        product_images: [...(row.product_images ?? [])].sort(
          (a: any, b: any) => a.sort_order - b.sort_order,
        ),
      } as AdminProduct;
    },
  });

async function countProducts(
  apply: (q: any) => any,
): Promise<number> {
  const { count, error } = await apply(
    db.from("products").select("id", { count: "exact", head: true }),
  );
  if (error) throw new Error("ADMIN_STATS_UNAVAILABLE");
  return count ?? 0;
}

export const adminStatsQuery = () =>
  queryOptions({
    queryKey: ["admin", "stats"],
    queryFn: async () => {
      const live = (q: any) => q.is("archived_at", null);
      const [
        total,
        published,
        draft,
        featured,
        newArrivals,
        archived,
      ] = await Promise.all([
        countProducts(live),
        countProducts((q) => live(q).eq("published", true)),
        countProducts((q) => live(q).eq("published", false)),
        countProducts((q) => live(q).eq("featured", true)),
        countProducts((q) => live(q).eq("new_arrival", true)),
        countProducts((q) => q.not("archived_at", "is", null)),
      ]);
      const { count: collections } = await db
        .from("collections")
        .select("id", { count: "exact", head: true });
      const { count: categories } = await db
        .from("categories")
        .select("id", { count: "exact", head: true });
      return {
        total,
        published,
        draft,
        featured,
        newArrivals,
        archived,
        collections: collections ?? 0,
        categories: categories ?? 0,
      };
    },
  });

export const adminCollectionsQuery = () =>
  queryOptions({
    queryKey: ["admin", "collections"],
    queryFn: async () => {
      const { data, error } = await db
        .from("collections")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw new Error("ADMIN_COLLECTIONS_UNAVAILABLE");
      return data ?? [];
    },
  });

export const adminCategoriesQuery = () =>
  queryOptions({
    queryKey: ["admin", "categories"],
    queryFn: async () => {
      const { data, error } = await db
        .from("categories")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw new Error("ADMIN_CATEGORIES_UNAVAILABLE");
      return data ?? [];
    },
  });

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function slugIsFree(slug: string, ignoreId?: string) {
  let q = db.from("products").select("id").eq("slug", slug).limit(1);
  if (ignoreId) q = q.neq("id", ignoreId);
  const { data, error } = await q;
  if (error) return true;
  return (data ?? []).length === 0;
}

export function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]!);
  const cell = (v: unknown) => {
    const s =
      v == null
        ? ""
        : Array.isArray(v)
          ? v.join(" | ")
          : typeof v === "object"
            ? JSON.stringify(v)
            : String(v);
    return `"${s.replace(/"/g, '""')}"`;
  };
  return [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => cell(r[h])).join(",")),
  ].join("\n");
}
