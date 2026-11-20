/**
 * Settings of the "Shop by category" section: which tiles it shows (categories and/or collections), how they look
 * (style) and how they are laid out (columns per screen size, and how many rows). They are saved in the block's own
 * content, so every place the section is used on has its own choices.
 */

export type TileConfig = {
  kind: "category" | "collection";
  slug: string;
  /** Optional replacement for the name shown on the tile. */
  label?: string;
  /** Optional replacement picture (otherwise the category's or collection's own picture is used). */
  image?: string;
};

export const TILE_STYLES: [string, string][] = [
  ["overlay", "Name over the picture"],
  ["below", "Name under the picture"],
  ["round", "Round pictures"],
  ["card", "Framed cards"],
];

export const COLS_DESKTOP: [string, string][] = ["2", "3", "4", "5", "6"].map((n) => [n, `${n} columns`]);
export const COLS_TABLET: [string, string][] = ["2", "3", "4"].map((n) => [n, `${n} columns`]);
export const COLS_MOBILE: [string, string][] = ["1", "2", "3"].map((n) => [n, n === "1" ? "1 column" : `${n} columns`]);
export const ROW_CHOICES: [string, string][] = [["0", "Show all (as many rows as needed)"], ...["1", "2", "3", "4", "5", "6"].map((n): [string, string] => [n, n === "1" ? "1 row" : `${n} rows`])];

export type TileGrid = { style: string; mobile: number; tablet: number; desktop: number; rows: number };

const pick = (value: string | undefined, allowed: string[], fallback: string) => (value && allowed.includes(value) ? value : fallback);

/** The saved choices with safe defaults (the look the section always had: 2 columns on phones and tablets, 4 on desktop). */
export function parseGrid(get: (key: string) => string): TileGrid {
  return {
    style: pick(get("category_style"), TILE_STYLES.map(([v]) => v), "overlay"),
    mobile: Number(pick(get("category_cols_mobile"), COLS_MOBILE.map(([v]) => v), "2")),
    tablet: Number(pick(get("category_cols_tablet"), COLS_TABLET.map(([v]) => v), "2")),
    desktop: Number(pick(get("category_cols_desktop"), COLS_DESKTOP.map(([v]) => v), "4")),
    rows: Number(pick(get("category_rows"), ROW_CHOICES.map(([v]) => v), "0")),
  };
}

export function parseTiles(json: string | undefined): TileConfig[] {
  try {
    const list: unknown = JSON.parse(json || "[]");
    if (!Array.isArray(list)) return [];
    const out: TileConfig[] = [];
    for (const raw of list) {
      const t = raw as Partial<TileConfig> | null;
      if (!t || (t.kind !== "category" && t.kind !== "collection") || typeof t.slug !== "string" || !t.slug) continue;
      out.push({ kind: t.kind, slug: t.slug, ...(t.label ? { label: String(t.label) } : {}), ...(t.image ? { image: String(t.image) } : {}) });
    }
    return out.slice(0, 60);
  } catch {
    return [];
  }
}

/** Static class names (Tailwind only keeps classes it can see written out in full). */
export const GRID_CLASS = {
  mobile: { 1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-3" } as Record<number, string>,
  tablet: { 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-4" } as Record<number, string>,
  desktop: { 2: "lg:grid-cols-2", 3: "lg:grid-cols-3", 4: "lg:grid-cols-4", 5: "lg:grid-cols-5", 6: "lg:grid-cols-6" } as Record<number, string>,
};

/** "Rows" limits how many tiles show on each screen size (rows x columns); the rest are hidden there. 0 = no limit. */
export function hiddenClass(index: number, g: TileGrid): string {
  if (g.rows <= 0) return "";
  const out: string[] = [];
  if (index >= g.rows * g.mobile) out.push("max-sm:hidden");
  if (index >= g.rows * g.tablet) out.push("sm:max-lg:hidden");
  if (index >= g.rows * g.desktop) out.push("lg:hidden");

  return out.join(" ");
}
