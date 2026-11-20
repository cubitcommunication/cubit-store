import { DeliveryCheck } from "@/components/site/DeliveryCheck";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Banknote, Truck } from "lucide-react";
import { toast } from "sonner";
import { item as analyticsItem, track } from "@/lib/analytics";
import { formatPrice, brand } from "@/config/brand";
import { productsQuery, relatedProducts, safeImage, type Product } from "@/lib/catalog";
import { useCommerce } from "@/lib/commerce";
import { percentOff } from "@/lib/pricing";
import { productEnquiryLink, useContactInfo } from "@/lib/site-settings";
import { findVariant, hasVariants, type Variant, missingOptions, priceRange, variantPrice, type Selection } from "@/lib/variants";
import { AddToCartButton, BuyNowButton, QuantityStepper, WishlistButton, unavailableReason } from "@/components/site/CommerceButtons";
import { ProductOffers } from "@/components/site/Offers";
import { ProductGallery } from "@/components/site/ProductGallery";
import { ProductGrid } from "@/components/site/ProductGrid";
import { CollectionProducts } from "@/components/site/CollectionProducts";
import { Reveal } from "@/components/site/Reveal";
import { VariantPicker } from "@/components/site/VariantPicker";
import { WhatsAppIcon } from "@/components/site/WhatsAppIcon";

/**
 * The product page and the collection page, as blocks. The built-in pages and the Product / Collection templates in
 * the page builder draw the same components, so prices, stock and options always come from the server data.
 */

/* ------------------------------------------------------------------ product */

type ProductCtxValue = {
  product: Product;
  selection: Selection;
  setSelection: (s: Selection) => void;
  variant: Variant | undefined;
  needOptions: () => void;
};
const ProductCtx = createContext<ProductCtxValue | null>(null);

export function ProductProvider({ product, children }: { product: Product; children: ReactNode }) {
  const [selection, setSelection] = useState<Selection>({});
  const variant = findVariant(product, selection);
  const needOptions = () => {
    toast.error(`Please choose ${missingOptions(product, selection).join(" and ").toLowerCase()}.`);
    document.getElementById("product-options")?.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  useEffect(() => {
    const reported = analyticsItem({ id: product.id, sku: product.sku, name: product.name, price: product.price, category: product.category });
    track("view_item", { currency: "INR", value: reported.price, items: [reported] });
  }, [product.id]);
  return <ProductCtx.Provider value={{ product, selection, setSelection, variant, needOptions }}>{children}</ProductCtx.Provider>;
}

export function useProductCtx(): ProductCtxValue | null {
  return useContext(ProductCtx);
}

function NeedsProduct() {
  return <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">This block shows the current product. It is only used in the Product page template.</p>;
}

export function ProductBreadcrumbBlock() {
  const ctx = useProductCtx();
  if (!ctx) return <NeedsProduct />;
  return (
    <nav aria-label="Breadcrumb" className="eyebrow text-muted-foreground">
      <Link to="/shop" className="hover:text-brand-red">Shop</Link>
      <span aria-hidden="true"> / </span>
      <span className="text-foreground">{ctx.product.name}</span>
    </nav>
  );
}

export function ProductGalleryBlock() {
  const ctx = useProductCtx();
  if (!ctx) return <NeedsProduct />;
  return <ProductGallery product={ctx.product} focusUrl={ctx.variant?.image_url ?? null} focusVideo={ctx.variant?.video_url ?? null} />;
}

export function ProductInfoBlock({ showSpecs = false }: { showSpecs?: boolean }) {
  const ctx = useProductCtx();
  if (!ctx) return <NeedsProduct />;
  return (
    <>
      <Details product={ctx.product} selection={ctx.selection} onSelect={ctx.setSelection} onNeedOptions={ctx.needOptions} showSpecs={showSpecs} />
      <DeliveryCheck />
    </>
  );
}

export function ProductSpecsBlock() {
  const ctx = useProductCtx();
  if (!ctx) return <NeedsProduct />;
  return <ProductSpecs product={ctx.product} variant={ctx.variant ?? null} />;
}

export function ProductRelatedBlock() {
  const ctx = useProductCtx();
  const { data: all } = useQuery(productsQuery());
  if (!ctx) return <NeedsProduct />;
  const related = all ? relatedProducts(all, ctx.product) : [];
  if (!related.length) return null;
  return (
    <section className="product-cat-main mx-auto mt-20 max-w-[1400px] px-4 sm:px-6 lg:mt-28 lg:px-10">
      <h2 className="font-display text-2xl tracking-tight sm:text-3xl">YOU MAY ALSO LIKE</h2>
      <div className="mt-8">
        <ProductGrid products={related} />
      </div>
    </section>
  );
}

export function ProductStickyBar() {
  const ctx = useProductCtx();
  const contact = useContactInfo();
  const cartOn = useCommerce().cart;
  if (!ctx) return null;
  const { product, variant, needOptions } = ctx;
  const range = priceRange(product);
  const stickyPrice = variant ? variantPrice(product, variant) : range.min;
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-4 py-3 backdrop-blur lg:hidden">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm">{product.name}</p>
          <p className="text-xs text-muted-foreground">
            {!variant && hasVariants(product) && range.min !== range.max ? `From ${formatPrice(range.min)}` : formatPrice(stickyPrice)} · SKU {variant?.sku || product.sku}
          </p>
        </div>
        {cartOn ? (
          <AddToCartButton product={product} variant={variant ?? null} onNeedOptions={needOptions} className="shrink-0 !px-4 !py-3" />
        ) : (
          <a
            href={productEnquiryLink(contact, product, variant?.title)}
            target="_blank"
            rel="noreferrer noopener"
            className="eyebrow flex shrink-0 items-center gap-2 rounded-lg bg-brand-red px-4 py-3 text-background"
          >
            <WhatsAppIcon className="size-4" /> Enquire
          </a>
        )}
      </div>
    </div>
  );
}

export function Details({ product, selection, onSelect, onNeedOptions, showSpecs = true }: { product: Product; selection: Selection; onSelect: (s: Selection) => void; onNeedOptions: () => void; showSpecs?: boolean }) {
  const contact = useContactInfo();
  const { cart, checkout, maxQty, freeShippingOver, cod } = useCommerce();
  const [qty, setQty] = useState(1);
  // Small reassurance line under the buttons: only things the shop settings really offer.
  const perks: { Icon: typeof Truck; text: string }[] = [
    ...(freeShippingOver > 0 ? [{ Icon: Truck, text: `Free shipping over ${formatPrice(freeShippingOver)}` }] : []),
    ...(checkout && cod ? [{ Icon: Banknote, text: "Cash on delivery available" }] : []),
  ];
  const variants = hasVariants(product);
  const variant = findVariant(product, selection);
  const reason = unavailableReason(product, variant);
  const range = priceRange(product);
  const unit = variant ? variantPrice(product, variant) : product.price;
  const compareAt = variant?.compare_at_price ?? product.compare_at_price ?? null;
  const onSale = compareAt != null && compareAt > unit && (!variants || Boolean(variant));
  const stock = variants ? (variant ? variant.stock_quantity : null) : product.stock_quantity;
  const lowStock = stock != null && stock > 0 && stock <= 3;
  return (
    <Reveal>
      <p className="eyebrow text-brand-red">
        {product.material} · {product.category}
      </p>
      <h1 className="mt-3 font-display text-3xl leading-[1.05] tracking-tight sm:text-5xl">{product.name}</h1>
      <div className="mt-4">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className={`font-display text-3xl sm:text-4xl ${onSale ? "text-brand-red" : ""}`}>
            {variants && !variant ? (range.min !== range.max ? `From ${formatPrice(range.min)}` : formatPrice(range.min)) : formatPrice(unit)}
          </span>
          {onSale ? <s className="text-lg text-muted-foreground">{formatPrice(compareAt!)}</s> : null}
          {onSale ? <span className="eyebrow rounded-md bg-brand-red px-2.5 py-1.5 text-background">{percentOff(unit, compareAt)}% OFF</span> : null}
        </p>
        {onSale ? <p className="mt-1.5 text-sm font-medium text-emerald-700">You save {formatPrice(compareAt! - unit)} ({percentOff(unit, compareAt)}% off MRP)</p> : null}
      </div>
      <p className="eyebrow mt-2 text-muted-foreground">SKU {variant?.sku || product.sku}</p>
      {cart && lowStock ? <p className="mt-2 text-sm text-brand-red">Only {stock} left</p> : null}
      {cart && reason === "Sold out" ? <p className="mt-2 text-sm text-brand-red">Sold out</p> : null}

      {variants ? <VariantPicker product={product} selection={selection} onChange={onSelect} className="mt-6" /> : null}

      {product.description ? (
        <p className="mt-6 max-w-md text-sm leading-relaxed text-muted-foreground sm:text-base">
          {product.description}
        </p>
      ) : null}

      {cart ? (
        <div className="mt-8 grid gap-3 sm:max-w-lg">
          {/* Row 1: quantity, add to cart and wishlist share one height */}
          <div className="flex items-stretch gap-2.5">
            <QuantityStepper className="h-12 shrink-0" value={qty} max={Math.min(maxQty, stock ?? maxQty)} onChange={(n) => setQty(Math.max(1, n))} />
            <AddToCartButton product={product} qty={qty} variant={variant ?? null} onNeedOptions={onNeedOptions} className="h-12 flex-1 !py-0" />
            <WishlistButton productId={product.id} className="size-12 shrink-0 rounded-lg border border-border" />
          </div>
          {/* Rows 2 and 3: two full-width buttons of the same height */}
          <BuyNowButton product={product} qty={qty} variant={variant ?? null} onNeedOptions={onNeedOptions} className="h-12 w-full !border-brand-red !bg-brand-red !py-0 !text-background hover:!opacity-90" />
          <a
            href={productEnquiryLink(contact, product, variant?.title)}
            target="_blank"
            rel="noreferrer noopener"
            onClick={() => track("whatsapp_enquiry", { item_id: product.sku, item_name: product.name, value: unit, currency: "INR" })}
            className="eyebrow flex h-12 w-full items-center justify-center gap-2 rounded-lg border border-border transition-colors hover:border-brand-red hover:text-brand-red"
          >
            <WhatsAppIcon className="size-4" /> Enquire on WhatsApp
          </a>
          {perks.length ? (
            <ul className="mt-1 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
              {perks.map(({ Icon, text }) => (
                <li key={text} className="flex items-center gap-1.5"><Icon className="size-4 text-brand-red" aria-hidden="true" /> {text}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : (
        <div className="mt-8 flex items-stretch gap-2.5 sm:max-w-lg">
          <a
            href={productEnquiryLink(contact, product, variant?.title)}
            target="_blank"
            rel="noreferrer noopener"
            onClick={() => track("whatsapp_enquiry", { item_id: product.sku, item_name: product.name, value: unit, currency: "INR" })}
            className="eyebrow flex h-12 flex-1 items-center justify-center gap-2 rounded-lg bg-brand-red px-6 text-background transition-opacity hover:opacity-90"
          >
            <WhatsAppIcon className="size-4" /> Enquire on WhatsApp
          </a>
          <WishlistButton productId={product.id} className="size-12 shrink-0 rounded-lg border border-border" />
        </div>
      )}

      <ProductOffers className="mt-6" />

      {showSpecs ? <ProductSpecs product={product} variant={variant ?? null} /> : null}
    </Reveal>
  );
}

export function ProductSpecs({ product, variant }: { product: Product; variant: Variant | null }) {
  // Internal keys (enquiry message, short description) are never shown as specs.
  const INTERNAL_SPEC_KEYS = ["whatsapp_message", "short_description"];
  const specs = Object.fromEntries(
    Object.entries(product.specifications ?? {}).filter(
      ([key]) => !INTERNAL_SPEC_KEYS.includes(key),
    ),
  );
  return (
    <section aria-labelledby="product-details-heading" className="mt-10 border-t border-border pt-8">
      <h2 id="product-details-heading" className="font-display text-xl tracking-tight">PRODUCT DETAILS</h2>
      <dl className="mt-5 grid grid-cols-2 gap-3">
        <Fact label="Category" value={product.category} />
        <Fact label="Material" value={product.material} />
        {product.subcategory ? <Fact label="Collection" value={product.subcategory} /> : null}
        <Fact label="SKU" value={variant?.sku || product.sku} />
        {product.where_to_wear ? <Fact label="Where to wear" value={product.where_to_wear} wide /> : null}
        {product.occasion?.length ? (
          <div className="col-span-2 rounded-[12px] border border-border bg-surface p-4">
            <dt className="eyebrow text-muted-foreground">Occasion</dt>
            <dd className="mt-2 flex flex-wrap gap-2">
              {product.occasion.map((o) => (
                <span key={o} className="rounded-full border border-border bg-background px-3 py-1 text-xs font-medium">{o}</span>
              ))}
            </dd>
          </div>
        ) : null}
        {Object.entries(specs).map(([k, v]) => (
          <Fact key={k} label={k} value={String(v)} wide={String(v).length > 28} />
        ))}
      </dl>
    </section>
  );
}

function Fact({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={`rounded-[12px] border border-border bg-surface p-4 ${wide ? "col-span-2" : ""}`}>
      <dt className="eyebrow text-muted-foreground">{label}</dt>
      <dd className="mt-1.5 break-words text-sm font-medium leading-snug text-foreground">{value}</dd>
    </div>
  );
}

/* ------------------------------------------------------------------ collection */

export type CollectionCtxValue = {
  name: string;
  description: string | null;
  image: string | null;
  products: Product[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  /** The breadcrumb's parent link, e.g. Collections or Shop. */
  parent: { label: string; to: "/collections" | "/shop" };
  heightClass: string;
};
const CollectionCtx = createContext<CollectionCtxValue | null>(null);

export function CollectionProvider({ value, children }: { value: CollectionCtxValue; children: ReactNode }) {
  return <CollectionCtx.Provider value={value}>{children}</CollectionCtx.Provider>;
}

export function CollectionHeaderBlock() {
  const ctx = useContext(CollectionCtx);
  if (!ctx) return <p className="p-6 text-center text-sm text-muted-foreground">This block shows the current collection. It is only used in the Collection page template.</p>;
  const image = safeImage(ctx.image);
  return (
    <Reveal as="header" className="relative">
      <div className={`relative w-full overflow-hidden bg-foreground ${ctx.heightClass}`}>
        {image ? <img src={image} alt={`${ctx.name} by ${brand.name}`} className="size-full object-cover opacity-80" decoding="async" /> : null}
        <div className="absolute inset-0 flex items-end bg-foreground/35">
          <div className="mx-auto w-full max-w-[1400px] px-4 pb-10 sm:px-6 lg:px-10 lg:pb-14">
            <nav aria-label="Breadcrumb" className="eyebrow text-background/70">
              <Link to={ctx.parent.to} className="hover:text-background">{ctx.parent.label}</Link>
              <span aria-hidden="true"> / </span>
              <span className="text-background">{ctx.name}</span>
            </nav>
            <h1 className="mt-4 max-w-3xl font-display text-3xl leading-[1.03] tracking-tight text-background sm:text-5xl lg:text-6xl">{ctx.name.toUpperCase()}</h1>
          </div>
        </div>
      </div>
    </Reveal>
  );
}

export function CollectionProductsBlock() {
  const ctx = useContext(CollectionCtx);
  if (!ctx) return null;
  return (
    <div className="mx-auto max-w-[1400px] px-4 pt-10 sm:px-6 lg:px-10 lg:pt-14">
      {ctx.description ? <p className="max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">{ctx.description}</p> : null}
      <div className="mt-8">
        <CollectionProducts products={ctx.products} isLoading={ctx.isLoading} isError={ctx.isError} onRetry={ctx.onRetry} />
      </div>
    </div>
  );
}
