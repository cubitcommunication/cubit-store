import { LogoPlaceholder } from "@/components/site/LogoPlaceholder";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { item as analyticsItem, money, track } from "@/lib/analytics";
import { formatPrice, brand } from "@/config/brand";
import { useCart, useCartQuote } from "@/lib/cart";
import { lineKey, outlineButton, primaryButton, useCommerce } from "@/lib/commerce";
import { useContactInfo } from "@/lib/site-settings";
import { QuantityStepper } from "@/components/site/CommerceButtons";
import { ShippingProgress } from "@/components/site/CartDrawer";
import { CouponBox } from "@/components/site/Offers";
import { OrderTotals, StorePage } from "@/components/site/OrderBits";
import { WhatsAppIcon } from "@/components/site/WhatsAppIcon";

export const Route = createFileRoute("/cart")({
  head: () => ({ meta: [{ title: `Your cart — ${brand.name}` }, { name: "robots", content: "noindex, follow" }] }),
  component: CartPage,
});

function CartPage() {
  const { cart, checkout, maxQty, freeShippingOver, gifts } = useCommerce();
  const { items, setQty, remove } = useCart();
  const quote = useCartQuote(items);
  const contact = useContactInfo();
  const reportedCart = useRef(false);
  useEffect(() => {
    if (!quote.data || quote.isPlaceholderData || reportedCart.current || !quote.data.lines.length) return;
    reportedCart.current = true;
    const reported = quote.data.lines.map((l) => analyticsItem({ id: l.id, sku: l.sku, name: l.name, price: l.price, qty: l.qty, variant: l.variantTitle }));
    track("view_cart", { currency: "INR", value: money(reported), items: reported });
  }, [quote.data, quote.isPlaceholderData]);

  // Pieces the server no longer sells are dropped from the cart.
  useEffect(() => {
    if (!quote.data || quote.isPlaceholderData) return;
    const known = new Set(quote.data.lines.map((l) => lineKey(l.id, l.variantId)));
    items.filter((i) => !known.has(i.key)).forEach((i) => remove(i.key));
  }, [quote.data, quote.isPlaceholderData, items, remove]);

  if (!cart) {
    return (
      <StorePage title="Cart" narrow>
        <p className="text-muted-foreground">Online ordering is not open yet. Browse the collection and enquire on WhatsApp — we'll be happy to help.</p>
        <Link to="/shop" className={`${primaryButton} mt-6`}>
          Browse products
        </Link>
      </StorePage>
    );
  }

  if (items.length === 0) {
    return (
      <StorePage title="Your cart" narrow>
        <p className="text-muted-foreground">Your cart is empty.</p>
        <Link to="/shop" className={`${primaryButton} mt-6`}>
          Continue shopping
        </Link>
      </StorePage>
    );
  }

  const lines = quote.data?.lines ?? [];
  const hasIssue = lines.some((l) => l.issue);
  const whatsapp = `Hi ${brand.name}, I would like to order:\n${lines.map((l) => `• ${l.name}${l.variantTitle ? ` (${l.variantTitle})` : ""} × ${l.qty} — ${formatPrice(l.lineTotal)}`).join("\n")}\nTotal: ${formatPrice(quote.data?.total ?? 0)}`;

  return (
    <StorePage title="Your cart">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,1fr)_380px]">
        <ul className="divide-y divide-border border-y border-border">
          {(lines.length ? lines : items.map((i) => ({ id: i.id, variantId: i.variantId, variantTitle: i.variantTitle, slug: i.slug, name: i.name, price: i.price, qty: i.qty, image: i.image, lineTotal: i.price * i.qty, issue: null as string | null, compareAt: null as number | null }))).map((line) => (
            <li key={lineKey(line.id, line.variantId)} className="flex gap-4 py-6 sm:gap-6">
              <Link to="/product/$slug" params={{ slug: line.slug }} className="size-24 shrink-0 bg-surface sm:size-28">
                {line.image ? <img src={line.image} alt="" className="size-full object-cover" /> : <LogoPlaceholder className="size-full" />}
              </Link>
              <div className="min-w-0 flex-1">
                <Link to="/product/$slug" params={{ slug: line.slug }} className="font-display hover:text-brand-red">
                  {line.name}
                </Link>
                {line.variantTitle ? <p className="mt-0.5 text-xs text-muted-foreground">{line.variantTitle}</p> : null}
                <p className="mt-1 text-sm">
                  {formatPrice(line.price)}
                  {line.compareAt ? <s className="ml-2 text-muted-foreground">{formatPrice(line.compareAt)}</s> : null}
                </p>
                {line.issue ? <p className="mt-1 text-sm text-brand-red">{line.issue}</p> : null}
                <div className="mt-4 flex items-center gap-4">
                  <QuantityStepper value={line.qty} max={maxQty} onChange={(n) => setQty(lineKey(line.id, line.variantId), n)} />
                  <button type="button" onClick={() => remove(lineKey(line.id, line.variantId))} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-brand-red">
                    <Trash2 className="size-4" /> Remove
                  </button>
                </div>
              </div>
              <p className="shrink-0 text-sm font-medium">{formatPrice(line.lineTotal)}</p>
            </li>
          ))}
        </ul>

        <aside className="h-fit space-y-5 border border-border bg-surface p-6">
          <h2 className="eyebrow">Order summary</h2>
          <ShippingProgress subtotal={quote.data?.subtotal ?? 0} threshold={freeShippingOver} gifts={gifts} />
          {checkout ? <CouponBox quote={quote.data} /> : null}
          <OrderTotals subtotal={quote.data?.subtotal ?? 0} discount={quote.data?.discount ?? 0} couponCode={quote.data?.coupon?.code ?? null} shipping={quote.data?.shipping ?? 0} total={quote.data?.total ?? 0} />
          {checkout ? (
            <Link to="/checkout" aria-disabled={hasIssue} className={`${primaryButton} w-full ${hasIssue ? "pointer-events-none opacity-50" : ""}`}>
              Proceed to checkout
            </Link>
          ) : (
            <a href={contact.whatsappUrl(whatsapp)} target="_blank" rel="noreferrer noopener" className={`${primaryButton} w-full bg-brand-red`}>
              <WhatsAppIcon className="size-4" /> Order on WhatsApp
            </a>
          )}
          <Link to="/shop" className={`${outlineButton} w-full`}>
            Continue shopping
          </Link>
          {hasIssue ? <p className="text-xs text-brand-red">Please fix the items marked above to continue.</p> : null}
        </aside>
      </div>
    </StorePage>
  );
}
