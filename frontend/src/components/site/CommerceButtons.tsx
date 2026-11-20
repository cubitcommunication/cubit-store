import { Heart, Minus, Plus, ShoppingBag } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useCart } from "@/lib/cart";
import { lineKey, useCommerce } from "@/lib/commerce";
import { useWishlist } from "@/lib/wishlist";
import type { Product } from "@/lib/catalog";
import { hasVariants, isSoldOut, variantPrice, type Variant } from "@/lib/variants";
import { cn } from "@/lib/utils";

/** Why a product (or the chosen variant) cannot be added, or null when it can. */
export function unavailableReason(product: Pick<Product, "price" | "stock_quantity" | "options" | "product_variants">, variant?: Variant | null): string | null {
  if (hasVariants(product)) {
    if (!variant) return null; // the shopper still has to choose; handled by the button label
    if (!(variantPrice(product, variant) > 0)) return "Not available online";
    return isSoldOut(variant) ? "Sold out" : null;
  }
  if (!(product.price > 0)) return "Not available online";
  if (product.stock_quantity != null && product.stock_quantity <= 0) return "Sold out";
  return null;
}

/** Heart toggle. Renders nothing unless the wishlist is switched on in the admin. */
export function WishlistButton({ productId, className, label = false }: { productId: string; className?: string; label?: boolean }) {
  const { wishlist } = useCommerce();
  const list = useWishlist();
  if (!wishlist) return null;
  const saved = list.has(productId);
  return (
    <button
      type="button"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        list.toggle(productId);
      }}
      aria-pressed={saved}
      aria-label={saved ? "Remove from wishlist" : "Add to wishlist"}
      className={cn(
        "inline-flex items-center justify-center gap-2 transition-colors hover:text-brand-red focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-red",
        className,
      )}
    >
      <Heart className={cn("size-5", saved && "fill-brand-red text-brand-red")} />
      {label ? <span className="eyebrow">{saved ? "Saved" : "Save"}</span> : null}
    </button>
  );
}

/**
 * "Add to cart". Renders nothing unless the cart is switched on in the admin.
 * For products with options and no choice yet it reads "Choose options" and calls onNeedOptions.
 */
export function AddToCartButton({
  product,
  qty = 1,
  variant,
  compact = false,
  className,
  onNeedOptions,
}: {
  product: Product;
  qty?: number;
  variant?: Variant | null;
  compact?: boolean;
  className?: string;
  onNeedOptions?: () => void;
}) {
  const { cart } = useCommerce();
  const { add } = useCart();
  if (!cart) return null;
  const needsOptions = hasVariants(product) && !variant;
  const reason = unavailableReason(product, variant);
  return (
    <button
      type="button"
      disabled={reason !== null}
      onClick={() => {
        if (needsOptions) onNeedOptions?.();
        else add(product, qty, variant ?? null);
      }}
      className={cn(
        "eyebrow inline-flex min-w-0 items-center justify-center gap-1.5 whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-50 sm:gap-2",
        compact
          ? "w-full rounded-lg border border-border bg-background px-3 py-3 hover:bg-foreground hover:text-background"
          : "rounded-lg bg-foreground px-2.5 py-3.5 text-background hover:bg-brand-red max-sm:text-[0.72rem] sm:px-8 sm:py-4",
        className,
      )}
    >
      <ShoppingBag className="size-4" />
      {reason ?? (needsOptions ? "Choose options" : "Add to cart")}
    </button>
  );
}

/** "Buy it now": adds the piece and goes straight to checkout. Only shown when checkout is on. */
export function BuyNowButton({ product, qty = 1, variant, className, onNeedOptions }: { product: Product; qty?: number; variant?: Variant | null; className?: string; onNeedOptions?: () => void }) {
  const { checkout } = useCommerce();
  const { items, setQty, add, closeDrawer } = useCart();
  const navigate = useNavigate();
  if (!checkout || unavailableReason(product, variant)) return null;
  return (
    <button
      type="button"
      onClick={() => {
        if (hasVariants(product) && !variant) {
          onNeedOptions?.();
          return;
        }
        const key = lineKey(product.id, variant?.id);
        const existing = items.find((i) => i.key === key);
        if (existing) setQty(key, Math.max(existing.qty, qty));
        else add(product, qty, variant ?? null);
        closeDrawer();
        void navigate({ to: "/checkout" });
      }}
      className={cn("eyebrow inline-flex items-center justify-center rounded-lg border border-foreground px-8 py-4 transition-colors hover:bg-foreground hover:text-background", className)}
    >
      Buy it now
    </button>
  );
}

export function QuantityStepper({
  value,
  onChange,
  max,
  className,
  compact,
}: {
  value: number;
  onChange: (next: number) => void;
  max: number;
  className?: string;
  /** Smaller buttons, used in the mini-cart. */
  compact?: boolean;
}) {
  const [focus, setFocus] = useState(false);
  const btn = compact ? "min-h-7 w-7" : "min-h-8 w-8 sm:min-h-10 sm:w-10";
  return (
    <div className={cn("inline-flex items-center rounded-lg border border-border", focus && "border-brand-red", className)} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}>
      <button type="button" aria-label="Decrease quantity" onClick={() => onChange(value - 1)} className={cn("flex items-center justify-center self-stretch hover:text-brand-red", btn)}>
        <Minus className={compact ? "size-3" : "size-3.5 sm:size-4"} />
      </button>
      <span className={cn("text-center tabular-nums", compact ? "w-5 text-xs" : "w-6 text-sm sm:w-8")} aria-live="polite">
        {value}
      </span>
      <button type="button" aria-label="Increase quantity" disabled={value >= max} onClick={() => onChange(value + 1)} className={cn("flex items-center justify-center self-stretch hover:text-brand-red disabled:opacity-40", btn)}>
        <Plus className={compact ? "size-3" : "size-3.5 sm:size-4"} />
      </button>
    </div>
  );
}
