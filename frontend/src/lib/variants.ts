import type { Product } from "@/lib/catalog";

/**
 * Product options (Size, Colour…) and their variants.
 * A variant is one purchasable combination; it may override the price and has its own stock.
 */
export type ProductOption = { name: string; values: string[] };

export type Variant = {
  id: string;
  title: string;
  options: Record<string, string>;
  sku: string | null;
  price: number | null;
  compare_at_price: number | null;
  stock_quantity: number | null;
  image_url: string | null;
  /** A video for this variation, shown without sound. */
  video_url?: string | null;
  sort_order: number;
};

export type Selection = Record<string, string>;

export const hasVariants = (p: Pick<Product, "options" | "product_variants">): boolean =>
  (p.options?.length ?? 0) > 0 && (p.product_variants?.length ?? 0) > 0;

export const isSoldOut = (v: Pick<Variant, "stock_quantity">): boolean => v.stock_quantity != null && v.stock_quantity <= 0;

export const variantPrice = (p: Pick<Product, "price">, v?: Variant | null): number => (v?.price ?? p.price);

/** Lowest and highest price across variants (or the plain price). */
export function priceRange(p: Product): { min: number; max: number } {
  if (!hasVariants(p)) return { min: p.price, max: p.price };
  const prices = (p.product_variants ?? []).map((v) => variantPrice(p, v));
  return { min: Math.min(...prices), max: Math.max(...prices) };
}

/** True when every option has been chosen. */
export function isComplete(p: Product, selection: Selection): boolean {
  return (p.options ?? []).every((o) => Boolean(selection[o.name]));
}

export function findVariant(p: Product, selection: Selection): Variant | undefined {
  if (!hasVariants(p) || !isComplete(p, selection)) return undefined;
  return (p.product_variants ?? []).find((v) => (p.options ?? []).every((o) => v.options[o.name] === selection[o.name]));
}

/** Names of the options that still need a choice. */
export function missingOptions(p: Product, selection: Selection): string[] {
  return (p.options ?? []).filter((o) => !selection[o.name]).map((o) => o.name);
}

/**
 * Can this value still be bought, given what is already chosen in the other options?
 * (Used to grey out sold-out or impossible combinations.)
 */
export function valueAvailable(p: Product, selection: Selection, optionName: string, value: string): boolean {
  return (p.product_variants ?? []).some(
    (v) =>
      v.options[optionName] === value &&
      !isSoldOut(v) &&
      Object.entries(selection).every(([name, chosen]) => name === optionName || !chosen || v.options[name] === chosen),
  );
}

/** Small set of colour names that can be drawn as a swatch dot. Anything else is shown as a text chip. */
const COLOURS: Record<string, string> = {
  gold: "#d4af37", golden: "#d4af37", silver: "#c0c0c0", "rose gold": "#e0a899", rosegold: "#e0a899", black: "#111111",
  white: "#ffffff", red: "#c8102e", maroon: "#800000", green: "#1f7a4d", blue: "#1f4fbf", navy: "#14213d", pink: "#f06292",
  purple: "#6a3fa0", multi: "conic-gradient(#c8102e,#d4af37,#1f7a4d,#1f4fbf,#c8102e)", multicolour: "conic-gradient(#c8102e,#d4af37,#1f7a4d,#1f4fbf,#c8102e)",
  oxidised: "#4a4a4a", antique: "#8b6f47", copper: "#b87333", turquoise: "#30b8b0", orange: "#ff8a3d", yellow: "#f4c430", brown: "#6b4226",
};

export function swatchColour(optionName: string, value: string): string | null {
  if (!/colou?r|shade|finish|plating/i.test(optionName)) return null;
  return COLOURS[value.trim().toLowerCase()] ?? null;
}

/** All combinations of option values, in order: [{Size:"6",Colour:"Gold"}, …]. */
export function combinations(options: ProductOption[]): Selection[] {
  return options.reduce<Selection[]>(
    (acc, option) => acc.flatMap((combo) => option.values.map((value) => ({ ...combo, [option.name]: value }))),
    [{}],
  );
}

export const variantTitle = (selection: Selection): string => Object.values(selection).join(" / ");
