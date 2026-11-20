import type { Collection } from "@/lib/catalog";

/**
 * Single source of truth for the parent product categories used by the homepage
 * tiles, the footer and the parent category pages.
 *
 * `slug` matches the slug of the row in the `categories` table, so the parent
 * page discovers its sub-collections from the database. Adding a new collection
 * in the admin panel with the matching category makes it appear automatically —
 * no code change needed.
 */
export type CategoryNavItem = {
  /** Uppercase label used on the homepage tiles. */
  label: string;
  /** Sentence-case label used in the footer. */
  shortLabel: string;
  /** Category slug — the parent page lives at /collections/<slug>. */
  slug: string;
  /** Database-driven banner image slot for the homepage tile. */
  mediaKey: string;
};

/** Empty on purpose: a new store has no categories until the owner adds them in Admin → Categories. */
export const CATEGORY_NAV: CategoryNavItem[] = [];

function norm(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

/**
 * Every published collection that belongs to a parent category. A collection
 * belongs to the category when its category filter matches the category name,
 * or — for collections created without a filter — when its group matches.
 */
export function collectionsForCategory(
  collections: Collection[],
  categoryName: string,
): Collection[] {
  const target = norm(categoryName);
  return collections
    .filter((c) => !c.navratri_only)
    .filter((c) => norm(c.category_filter) === target || norm(c.group_name) === target)
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
}
