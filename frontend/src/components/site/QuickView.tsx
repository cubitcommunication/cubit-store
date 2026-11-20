import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { formatPrice } from "@/config/brand";
import { percentOff } from "@/lib/pricing";
import type { Product } from "@/lib/catalog";
import { primaryImage } from "@/lib/catalog";
import { useCart } from "@/lib/cart";
import { useCommerce } from "@/lib/commerce";
import { productEnquiryLink, useContactInfo } from "@/lib/site-settings";
import { findVariant, hasVariants, isComplete, missingOptions, priceRange, variantPrice, type Selection } from "@/lib/variants";
import { AddToCartButton, QuantityStepper, WishlistButton, unavailableReason } from "@/components/site/CommerceButtons";
import { VariantPicker } from "@/components/site/VariantPicker";
import { WhatsAppIcon } from "@/components/site/WhatsAppIcon";

type Ctx = { open: (product: Product, selection?: Selection) => void };
const QuickViewContext = createContext<Ctx>({ open: () => undefined });

export const useQuickView = () => useContext(QuickViewContext);

/** Mount once near the root: lets any product card open a quick-view popup. */
export function QuickViewProvider({ children }: { children: ReactNode }) {
  const [product, setProduct] = useState<Product | null>(null);
  const [initial, setInitial] = useState<Selection>({});
  const open = useCallback((p: Product, selection: Selection = {}) => {
    setInitial(selection);
    setProduct(p);
  }, []);
  const value = useMemo(() => ({ open }), [open]);

  return (
    <QuickViewContext.Provider value={value}>
      {children}
      <Dialog open={product !== null} onOpenChange={(o) => !o && setProduct(null)}>
        <DialogContent className="max-h-[92vh] w-[calc(100vw-1.5rem)] max-w-4xl gap-0 overflow-y-auto rounded-xl p-0">
          {product ? <QuickViewBody key={product.id} product={product} initial={initial} onClose={() => setProduct(null)} /> : null}
        </DialogContent>
      </Dialog>
    </QuickViewContext.Provider>
  );
}

function QuickViewBody({ product, initial, onClose }: { product: Product; initial: Selection; onClose: () => void }) {
  const { cart, maxQty } = useCommerce();
  const contact = useContactInfo();
  const { add } = useCart();
  const [selection, setSelection] = useState<Selection>(initial);
  const [qty, setQty] = useState(1);
  const [index, setIndex] = useState(0);

  const variant = findVariant(product, selection);
  const variants = hasVariants(product);
  const images = product.product_images;

  // A variant with its own photo switches the large image.
  useEffect(() => {
    if (!variant?.image_url) return;
    const at = images.findIndex((i) => i.image_url === variant.image_url);
    if (at >= 0) setIndex(at);
  }, [variant?.image_url, images]);

  const shown = (variant?.image_url && images.every((i) => i.image_url !== variant.image_url) ? variant.image_url : null) ?? images[index]?.image_url ?? primaryImage(product)?.image_url ?? null;
  const price = variant ? variantPrice(product, variant) : null;
  const range = priceRange(product);
  const compare = variant?.compare_at_price ?? product.compare_at_price ?? null;
  const reason = unavailableReason(product, variant);
  const stock = variants ? variant?.stock_quantity : product.stock_quantity;
  const lowStock = stock != null && stock > 0 && stock <= 3;

  function needOptions() {
    const names = missingOptions(product, selection);
    toast.error(`Please choose ${names.join(" and ")}.`);
    document.getElementById("product-options")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return (
    <div className="grid md:grid-cols-2">
      <div className="bg-muted">
        {shown ? <img src={shown} alt={product.name} className="aspect-[4/5] w-full rounded-none object-cover md:h-full md:max-h-[640px]" /> : <div className="aspect-[4/5] w-full" />}
        {images.length > 1 ? (
          <div className="flex gap-2 overflow-x-auto bg-background p-2 md:hidden">
            {images.map((img, i) => (
              <button key={img.id} type="button" onClick={() => setIndex(i)} aria-label={`Show image ${i + 1}`} className={`size-14 shrink-0 overflow-hidden rounded-lg border-2 ${i === index ? "border-foreground" : "border-transparent"}`}>
                <img src={img.image_url} alt="" className="size-full object-cover" />
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="flex flex-col p-5 sm:p-7">
        <p className="eyebrow text-brand-red">{product.material} · {product.category}</p>
        <DialogTitle className="mt-2 text-2xl leading-tight">{product.name}</DialogTitle>
        <DialogDescription className="sr-only">Quick view of {product.name}</DialogDescription>

        <p className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-lg">
          <span className={compare && compare > (price ?? product.price) && (!variants || variant) ? "font-semibold text-brand-red" : undefined}>
            {variant ? formatPrice(price ?? product.price) : variants && range.min !== range.max ? `From ${formatPrice(range.min)}` : formatPrice(variants ? range.min : product.price)}
          </span>
          {compare && compare > (price ?? product.price) && (!variants || variant) ? <s className="text-sm text-muted-foreground">{formatPrice(compare)}</s> : null}
          {compare && compare > (price ?? product.price) && (!variants || variant) ? <span className="eyebrow rounded-md bg-brand-red px-2 py-1 text-[0.7rem] text-background">{percentOff(price ?? product.price, compare)}% OFF</span> : null}
        </p>
        {cart && lowStock ? <p className="mt-1 text-sm text-brand-red">Only {stock} left</p> : null}

        {product.description ? <p className="mt-4 line-clamp-4 text-sm leading-relaxed text-muted-foreground">{product.description}</p> : null}

        {variants ? <VariantPicker product={product} selection={selection} onChange={setSelection} className="mt-5" /> : null}

        <div className="mt-6 space-y-3">
          {cart ? (
            <div className="flex items-center gap-3">
              <QuantityStepper value={qty} max={Math.min(maxQty, stock ?? maxQty)} onChange={(n) => setQty(Math.max(1, n))} />
              <AddToCartButton product={product} qty={qty} variant={variant ?? null} className="flex-1" onNeedOptions={needOptions} />
              <WishlistButton productId={product.id} className="size-12 rounded-lg border border-border" />
            </div>
          ) : null}
          <a
            href={productEnquiryLink(contact, product, variant?.title)}
            target="_blank"
            rel="noreferrer noopener"
            className={`eyebrow flex w-full items-center justify-center gap-2 rounded-lg px-6 py-4 transition-colors ${cart ? "border border-border hover:border-brand-red hover:text-brand-red" : "bg-brand-red text-background hover:opacity-90"}`}
          >
            <WhatsAppIcon className="size-4" /> Enquire on WhatsApp
          </a>
          {!cart && reason === null ? <WishlistButton productId={product.id} label className="h-12 w-full rounded-lg border border-border" /> : null}
          <Link to="/product/$slug" params={{ slug: product.slug }} onClick={onClose} className="block text-center text-sm underline underline-offset-4 hover:text-brand-red">
            View full details
          </Link>
        </div>
        {isComplete(product, selection) || !variants ? null : <p className="mt-3 text-xs text-muted-foreground">Choose {missingOptions(product, selection).join(" and ").toLowerCase()} to continue.</p>}
      </div>
    </div>
  );
}
