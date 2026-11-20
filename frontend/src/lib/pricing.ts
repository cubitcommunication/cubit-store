import type { Product } from "@/lib/catalog";
import { variantPrice, type Variant } from "@/lib/variants";

/** Whole-number percentage off, or null when the MRP is not really higher than the sale price. */
export function percentOff(price: number, mrp: number | null | undefined): number | null {
  if (mrp == null || !(mrp > price) || !(price >= 0)) return null;
  const pct = Math.round(((mrp - price) / mrp) * 100);
  return pct >= 1 ? pct : null;
}

export type SaleInfo = {
  /** What the customer pays (the sale price). */
  unit: number;
  /** The original price (MRP) shown struck through, when higher than the sale price. */
  mrp: number | null;
  percent: number | null;
  saving: number | null;
  onSale: boolean;
};

/**
 * Sale price, MRP and discount for a product or the chosen option. While a product with options has
 * no option chosen yet, the product-level prices decide whether the "% OFF" badge shows.
 */
export function saleInfo(product: Product, variant?: Variant | null): SaleInfo {
  const unit = variant ? variantPrice(product, variant) : product.price;
  const mrp = variant?.compare_at_price ?? product.compare_at_price ?? null;
  const percent = percentOff(unit, mrp);
  return { unit, mrp: percent ? mrp : null, percent, saving: percent && mrp ? Math.round((mrp - unit) * 100) / 100 : null, onSale: percent !== null };
}
