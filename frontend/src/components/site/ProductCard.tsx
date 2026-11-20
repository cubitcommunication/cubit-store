import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Eye, ShoppingBag } from "lucide-react";
import { formatPrice } from "@/config/brand";
import { primaryImage, type Product } from "@/lib/catalog";
import { useCart } from "@/lib/cart";
import { useCommerce } from "@/lib/commerce";
import { useAppearance, useIsPhone, type Appearance, type CardStyle, type MobileCardStyle } from "@/lib/appearance";
import { saleInfo } from "@/lib/pricing";
import { findVariant, hasVariants, priceRange, variantPrice, type Selection } from "@/lib/variants";
import { WishlistButton, unavailableReason } from "@/components/site/CommerceButtons";
import { useQuickView } from "@/components/site/QuickView";
import { VariantPicker } from "@/components/site/VariantPicker";
import { LogoPlaceholder } from "@/components/site/LogoPlaceholder";
import { cn } from "@/lib/utils";

/**
 * One product card, five designs (classic, hover actions, minimal, elegant, quick add).
 * The design and the hover actions come from Admin → Product cards. Every design has the same 12px corners.
 * `preview` renders a non-clickable copy for the admin's live preview.
 */
export function ProductCard({
  product,
  priority = false,
  appearance,
  preview = false,
}: {
  product: Product;
  priority?: boolean;
  appearance?: Appearance;
  preview?: boolean;
}) {
  const site = useAppearance();
  const a = appearance ?? site;
  const phone = useIsPhone();
  const chosen: CardStyle | Exclude<MobileCardStyle, "same"> = phone && a.mobileStyle !== "same" ? a.mobileStyle : a.style;
  // On a phone the picture stays clean (no buttons or badges on it). Designs that put things on the image
  // fall back to the nearest clean layout: everything sits below the picture.
  const style: CardStyle | Exclude<MobileCardStyle, "same"> = !phone || chosen === "bag" || chosen === "bar" || chosen === "price" ? chosen : chosen === "classic" || chosen === "quick" ? "bar" : "bag";
  const flags = useCommerce();
  const quickView = useQuickView();
  const { add } = useCart();
  const [selection, setSelection] = useState<Selection>({});

  const images = product.product_images;
  const variants = hasVariants(product);
  const variant = findVariant(product, selection);
  const needsOptions = variants && !variant;

  const main = variant?.image_url ?? primaryImage(product)?.image_url ?? null;
  const second = a.hoverImage && !variant?.image_url && images[1] ? images[1].image_url : null;

  const cartOn = flags.cart && a.showCart;
  const wishOn = flags.wishlist && a.showWishlist;
  const chipsOn = a.showVariants && variants;
  const reason = unavailableReason(product, variant);
  const range = priceRange(product);
  const sale = saleInfo(product, variant);
  const unit = sale.unit;
  // The struck-through MRP only shows for a definite price; the "% OFF" badge shows either way.
  const compare = sale.mrp;
  const onSale = sale.onSale && !needsOptions;

  const priceLabel = needsOptions
    ? range.min !== range.max
      ? `From ${formatPrice(range.min)}`
      : formatPrice(range.min)
    : formatPrice(unit);

  const openQuickView = (event?: React.MouseEvent) => {
    event?.preventDefault();
    event?.stopPropagation();
    if (!preview) quickView.open(product, selection);
  };
  const addToCart = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (preview) return;
    if (needsOptions) quickView.open(product, selection);
    else add(product, 1, variant ?? null);
  };

  // A plain function (not a component) so React keeps the DOM when the card re-renders.
  const wrap = (children: ReactNode, className?: string) =>
    preview ? (
      <div className={className}>{children}</div>
    ) : (
      <Link to="/product/$slug" params={{ slug: product.slug }} className={className}>
        {children}
      </Link>
    );

  /* ----------------------------------------------------------- small parts */
  const ratio = { aspectRatio: a.ratio.replace("/", " / ") };

  const image = (extra?: ReactNode, rounded = "rounded-lg") => (
    <div className={cn("relative overflow-hidden bg-surface", rounded, rounded !== "rounded-none" && "border border-transparent bg-clip-padding transition-colors duration-300 group-hover:border-brand-red")} style={ratio}>
      {wrap(
        main ? (
          <>
            <img
              src={main}
              alt={primaryImage(product)?.alt_text ?? product.name}
              loading={priority ? "eager" : "lazy"}
              decoding="async"
              className={cn("size-full object-cover transition-all duration-700 ease-out", second ? "group-hover:opacity-0" : "group-hover:scale-[1.05]")}
            />
            {second ? <img src={second} alt="" loading="lazy" decoding="async" className="absolute inset-0 size-full scale-[1.02] object-cover opacity-0 transition-opacity duration-500 group-hover:opacity-100" /> : null}
          </>
        ) : (
          <LogoPlaceholder className="size-full" />
        ),
        "block size-full",
      )}
      {!phone && sale.percent ? (
        <span className="eyebrow pointer-events-none absolute left-0 top-0 rounded-br-lg bg-brand-red px-2.5 py-1.5 text-[0.7rem] leading-none text-background shadow-sm">{sale.percent}% OFF</span>
      ) : null}
      {!phone && product.new_arrival ? (
        sale.percent ? (
          <span className="eyebrow pointer-events-none absolute bottom-2 left-2 rounded-md bg-foreground px-2 py-1 text-[0.7rem] text-background">New</span>
        ) : (
          <span className="eyebrow pointer-events-none absolute left-0 top-0 rounded-br-lg bg-brand-red px-2.5 py-1.5 text-[0.7rem] text-background">New</span>
        )
      ) : null}
      {phone ? null : extra}
    </div>
  );

  const heart = (cls = "right-2 top-2") =>
    wishOn ? <WishlistButton productId={product.id} className={cn("absolute size-9 rounded-full bg-background/95 shadow-sm", cls)} /> : null;

  const round = "flex size-10 items-center justify-center rounded-full bg-background text-foreground shadow-md transition-colors hover:bg-foreground hover:text-background disabled:opacity-50";

  /** Round icon buttons used by the hover-action designs. */
  const iconActions = (
    <>
      {cartOn ? (
        <button type="button" onClick={addToCart} disabled={reason !== null} aria-label={reason ?? (needsOptions ? "Choose options" : "Add to cart")} title={reason ?? (needsOptions ? "Choose options" : "Add to cart")} className={round}>
          <ShoppingBag className="size-[18px]" />
        </button>
      ) : null}
      {a.showQuickView ? (
        <button type="button" onClick={openQuickView} aria-label="Quick view" title="Quick view" className={round}>
          <Eye className="size-[18px]" />
        </button>
      ) : null}
    </>
  );

  /** Wide pill button: Add to cart / Choose options / Enquire. */
  const primary = (cls?: string) => {
    if (cartOn) {
      // @container: the label depends on the room the button really has (2-up phone cards are narrow).
      return (
        <div className="@container min-w-0 flex-1">
          <button type="button" onClick={addToCart} disabled={reason !== null} className={cn("eyebrow inline-flex h-11 w-full min-w-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-foreground px-2.5 text-[0.7rem] leading-none text-background transition-colors hover:bg-brand-red disabled:opacity-50 @[8.5rem]:px-3 @[8.5rem]:text-[0.72rem]", cls)}>
            <ShoppingBag className="size-4 shrink-0" />
            <span className="min-w-0 truncate">
              {reason ?? (needsOptions ? <><span className="@[10rem]:hidden">Options</span><span className="hidden @[10rem]:inline">Choose options</span></> : <><span className="@[8.5rem]:hidden">Add</span><span className="hidden @[8.5rem]:inline">Add to cart</span></>)}
            </span>
          </button>
        </div>
      );
    }
    return null;
  };

  // Names are always shown in full; long ones get a slightly smaller type so they stay tidy.
  const longName = product.name.length > 32;
  const meta = a.showMaterial ? <p className="product-card-meta uppercase text-muted-foreground">{product.material} · {product.category}</p> : null;
  const title = (cls?: string) => (
    <h3 className={cn("product-card-title break-words font-display tracking-tight", longName && "text-[0.875rem] leading-snug", cls)}>
      {wrap(product.name)}
    </h3>
  );
  const price = (cls?: string) => (
    <p className={cn("product-card-price", cls)}>
      <span className={onSale ? "font-semibold text-brand-red" : undefined}>{priceLabel}</span>
      {onSale ? <s className="ml-2 text-[0.85em] font-normal text-muted-foreground">{formatPrice(compare!)}</s> : null}
    </p>
  );
  const chips = chipsOn ? <VariantPicker product={product} selection={selection} onChange={setSelection} compact className="mt-2" /> : null;

  const hoverBar = "pointer-events-none absolute inset-x-0 bottom-3 flex translate-y-3 justify-center gap-2 opacity-0 transition-all duration-300 group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:translate-y-0 [@media(hover:none)]:opacity-100";

  /* ---------------------------------------------------------------- phone-only parts */
  /** Round 40px add-to-bag action (nothing while the cart is off). */
  const roundAction = (cls: string) => {
    const base = cn("flex size-10 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-40", cls);
    if (cartOn) {
      const label = reason ?? (needsOptions ? "Choose options" : "Add to cart");
      return (
        <button type="button" onClick={addToCart} disabled={reason !== null} aria-label={label} title={label} className={base}>
          <ShoppingBag className="size-[18px]" />
        </button>
      );
    }
    return null;
  };
  /** Phone: the wishlist heart sits next to the title, below the picture (not on it). */
  const phoneHeart = wishOn ? <WishlistButton productId={product.id} className="-mr-1 -mt-0.5 size-8 shrink-0 rounded-full text-foreground/70" /> : null;
  const phoneTitle = (
    <div className="flex items-start justify-between gap-1">
      <h3 className={cn("product-card-title min-w-0 break-words font-display tracking-tight", longName && "text-[0.8125rem] leading-snug")}>{wrap(product.name)}</h3>
      {phoneHeart}
    </div>
  );
  const phoneTags =
    sale.percent || product.new_arrival ? (
      <div className="mt-1.5 flex flex-wrap gap-1">
        {sale.percent ? <span className="eyebrow rounded-md bg-brand-red px-1.5 py-1 text-[0.62rem] leading-none text-background">{sale.percent}% OFF</span> : null}
        {product.new_arrival ? <span className="eyebrow rounded-md bg-foreground px-1.5 py-1 text-[0.62rem] leading-none text-background">New</span> : null}
      </div>
    ) : null;
  const priceOnly = (
    <p className="product-card-price text-foreground">
      <span className={onSale ? "font-semibold text-brand-red" : undefined}>{priceLabel}</span>
      {onSale ? <s className="ml-1.5 text-xs font-normal text-muted-foreground">{formatPrice(compare!)}</s> : null}
    </p>
  );
  const soldOut = reason ? <p className="text-xs text-brand-red">{reason}</p> : null;

  /* ---------------------------------------------------------------- designs */
  switch (style) {
    /* ---- phone-only designs (Admin → Product cards → Phone design) ---- */
    case "bag":
      return (
        <article className="group relative flex h-full flex-col overflow-hidden rounded-lg border border-border bg-background shadow-[0_10px_30px_-18px_rgba(0,0,0,0.45)]">
          {image(<>{heart()}</>, "rounded-none")}
          <div className="flex flex-1 flex-col p-3">
            {meta}
            {phoneTitle}
            {phoneTags}
            {chips}
            <div className="mt-auto flex items-end justify-between gap-2 pt-2">
              <div className="min-w-0">
                {priceOnly}
                {soldOut}
              </div>
              {roundAction("bg-foreground text-background hover:bg-brand-red")}
            </div>
          </div>
        </article>
      );

    case "bar":
      return (
        <article className="group relative flex h-full flex-col overflow-hidden rounded-lg border border-border bg-background shadow-[0_10px_30px_-18px_rgba(0,0,0,0.45)]">
          {image(<>{heart()}</>, "rounded-none")}
          <div className="flex flex-1 flex-col p-3">
            {meta}
            {phoneTitle}
            {phoneTags}
            {priceOnly}
            {chips}
            <div className="mt-auto pt-2.5">{primary("!h-10 !rounded-lg")}</div>
          </div>
        </article>
      );

    case "float":
      return (
        <article className="group relative flex h-full flex-col overflow-hidden rounded-lg border border-border bg-background shadow-[0_10px_30px_-18px_rgba(0,0,0,0.45)]">
          {image(
            <>
              {heart()}
              <div className="absolute bottom-2 right-2">{roundAction("bg-background text-foreground shadow-md hover:bg-foreground hover:text-background")}</div>
            </>,
            "rounded-none",
          )}
          <div className="flex flex-1 flex-col p-3">
            {meta}
            {phoneTitle}
            {priceOnly}
            {soldOut}
            {chips}
          </div>
        </article>
      );

    case "price": {
      const label = reason ?? (needsOptions ? "Choose options" : `Add · ${priceLabel}`);
      const pill = "mt-auto inline-flex h-10 w-full min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-foreground px-3 text-[0.72rem] font-semibold uppercase leading-none tracking-wide text-background transition-colors hover:bg-brand-red disabled:opacity-50";
      return (
        <article className="group relative flex h-full flex-col overflow-hidden rounded-lg border border-border bg-background shadow-[0_10px_30px_-18px_rgba(0,0,0,0.45)]">
          {image(<>{heart()}</>, "rounded-none")}
          <div className="flex flex-1 flex-col p-3">
            {meta}
            {phoneTitle}
            {phoneTags}
            {chips}
            <div className="mt-auto pt-2.5">
              {cartOn ? (
                <button type="button" onClick={addToCart} disabled={reason !== null} className={pill}>
                  <ShoppingBag className="size-4 shrink-0" />
                  <span className="min-w-0 truncate">{label}</span>
                </button>
              ) : (
                priceOnly
              )}
            </div>
          </div>
        </article>
      );
    }

    case "overlay":
      return (
        <article className="group relative flex h-full flex-col">
          {image(
            <>
              {heart()}
              <div className={hoverBar}>{iconActions}</div>
            </>,
          )}
          <div className="mt-3 flex-1">
            {meta}
            {title("mt-1")}
            {price("mt-1 text-foreground/80")}
            {chips}
          </div>
        </article>
      );

    case "minimal":
      return (
        <article className="group relative flex h-full flex-col text-center">
          {image(
            <>
              {heart("right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100 [@media(hover:none)]:opacity-100")}
              <div className="pointer-events-none absolute inset-x-3 bottom-3 translate-y-3 opacity-0 transition-all duration-300 group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:translate-y-0 [@media(hover:none)]:opacity-100">
                {primary("!rounded-full !bg-background !text-foreground shadow-md hover:!bg-foreground hover:!text-background")}
              </div>
            </>,
          )}
          <div className="mt-3 flex flex-1 flex-col items-center">
            {title()}
            {price("mt-1 text-foreground/80")}
            {chipsOn ? <div className="mt-2 flex justify-center"><VariantPicker product={product} selection={selection} onChange={setSelection} compact /></div> : null}
          </div>
        </article>
      );

    case "elegant": {
      const sideBtn = "absolute right-2 flex size-9 items-center justify-center rounded-full bg-background/95 text-foreground opacity-0 shadow-sm transition-opacity hover:bg-foreground hover:text-background group-hover:opacity-100 [@media(hover:none)]:opacity-100";
      return (
        <article className="group relative flex flex-col self-start">
          {image(
            <>
              {heart()}
              {a.showQuickView ? (
                <button type="button" onClick={openQuickView} aria-label="Quick view" title="Quick view" className={cn(sideBtn, "top-12")}><Eye className="size-[18px]" /></button>
              ) : null}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 rounded-b-lg bg-gradient-to-t from-black/85 via-black/45 to-transparent px-3.5 pb-3.5 pt-16 text-white">
                {a.showMaterial ? <p className="text-[0.68rem] uppercase tracking-wider text-white/70">{product.material}</p> : null}
                <h3 className="mt-0.5 font-display text-[0.95rem] leading-snug tracking-tight">{product.name}</h3>
                <p className="mt-0.5 text-sm text-white/90"><span className={onSale ? "font-semibold text-white" : undefined}>{priceLabel}</span>{onSale ? <s className="ml-2 text-white/60">{formatPrice(compare!)}</s> : null}</p>
                <div className="pointer-events-auto max-h-0 overflow-hidden opacity-0 transition-all duration-300 group-hover:mt-3 group-hover:max-h-14 group-hover:opacity-100 [@media(hover:none)]:mt-3 [@media(hover:none)]:max-h-14 [@media(hover:none)]:opacity-100">
                  {primary("!h-10 !rounded-full !bg-white !text-black hover:!bg-brand-red hover:!text-white")}
                </div>
              </div>
            </>,
          )}
          {chipsOn ? <div className="mt-2"><VariantPicker product={product} selection={selection} onChange={setSelection} compact /></div> : null}
        </article>
      );
    }

    case "quick":
      return (
        <article className="group relative flex h-full flex-col overflow-hidden rounded-lg border border-border bg-background transition-colors duration-300 hover:border-brand-red">
          {image(
            <>
              {heart()}
              {a.showQuickView ? (
                <button type="button" onClick={openQuickView} aria-label="Quick view" title="Quick view" className="absolute right-2 top-12 flex size-9 items-center justify-center rounded-full bg-background/95 opacity-0 shadow-sm transition-opacity hover:bg-foreground hover:text-background group-hover:opacity-100 [@media(hover:none)]:opacity-100"><Eye className="size-[18px]" /></button>
              ) : null}
            </>,
            "rounded-none",
          )}
          <div className="flex flex-1 flex-col p-3.5">
            {meta}
            {title("mt-1")}
            {price("mt-1 text-foreground/80")}
            {chips}
            <div className="mt-auto flex items-center gap-2 pt-3">
              {primary()}
            </div>
          </div>
        </article>
      );

    default: // classic
      return (
        <article className="group relative flex h-full flex-col overflow-hidden rounded-lg border border-border bg-background transition-[border-color,box-shadow] duration-300 hover:border-brand-red hover:shadow-[0_10px_30px_-18px_rgba(0,0,0,0.45)]">
          {image(
            <>
              {heart()}
              {a.showQuickView ? (
                <button type="button" onClick={openQuickView} aria-label="Quick view" title="Quick view" className="absolute right-2 top-12 flex size-9 items-center justify-center rounded-full bg-background/95 opacity-0 shadow-sm transition-opacity hover:bg-foreground hover:text-background group-hover:opacity-100 [@media(hover:none)]:opacity-100"><Eye className="size-[18px]" /></button>
              ) : null}
            </>,
            "rounded-none",
          )}
          <div className="flex flex-1 flex-col p-4">
            {meta}
            {title("mt-2")}
            {price("mt-1 text-foreground/80")}
            {chips}
            {cartOn ? (
              <div className="mt-auto flex items-center gap-2 pt-4">
                {primary("!bg-background !text-foreground border border-border hover:!bg-foreground hover:!text-background")}
              </div>
            ) : (
              <span className="eyebrow mt-auto inline-block self-start border-b border-foreground pb-0.5 pt-4">View details</span>
            )}
          </div>
        </article>
      );
  }
}

export function ProductCardSkeleton() {
  return (
    <div aria-hidden="true">
      <div className="soft-load aspect-[4/5] w-full rounded-lg" />
      <div className="mt-3 space-y-2">
        <div className="soft-load h-3.5 w-3/4 rounded-full" />
        <div className="soft-load h-3 w-1/4 rounded-full" />
      </div>
    </div>
  );
}
