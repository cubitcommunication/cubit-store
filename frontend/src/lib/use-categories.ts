import { useQuery } from "@tanstack/react-query";
import { CATEGORIES } from "@/config/brand";
import { categoriesQuery, type Category } from "@/lib/catalog";
import { CATEGORY_NAV, type CategoryNavItem } from "@/lib/category-nav";
import { db } from "@/lib/data";

/**
 * Categories come from the database (Admin → Categories), so a category added there shows up in every list and filter
 * at once. The built-in four are only a fallback while the list loads or if the database has none.
 */

/** Every category an admin form may choose from, including ones not published yet. */
export function useAdminCategoryNames(current?: string | null): { names: string[]; loading: boolean } {
  const q = useQuery({
    queryKey: ["admin", "category-names"],
    queryFn: async () => {
      const { data, error } = await db.from("categories").select("name,sort_order").order("sort_order", { ascending: true });
      if (error) throw new Error(error.message);
      return ((data ?? []) as { name: string }[]).map((c) => c.name).filter(Boolean);
    },
    staleTime: 0,
  });
  const names = q.data?.length ? [...q.data] : [...CATEGORIES];
  // A product or collection saved with a category that has since been renamed or removed still keeps its value.
  if (current && !names.includes(current)) names.push(current);
  return { names, loading: q.isPending };
}

const bySlug = new Map(CATEGORY_NAV.map((c) => [c.slug, c]));

/** A database category in the shape the footer, material tabs and menus use. */
export function toNavItem(c: Pick<Category, "name" | "slug">): CategoryNavItem {
  const known = bySlug.get(c.slug);
  return known ?? { label: c.name.toUpperCase(), shortLabel: c.name, slug: c.slug, mediaKey: "" };
}

/** Published categories for the storefront (footer, material page tabs...). */
export function useCategoryNav(): CategoryNavItem[] {
  const { data } = useQuery(categoriesQuery());
  return data?.length ? data.map(toNavItem) : CATEGORY_NAV;
}
