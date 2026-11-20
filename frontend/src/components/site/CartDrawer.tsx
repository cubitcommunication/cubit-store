import { LogoPlaceholder } from "@/components/site/LogoPlaceholder";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Check, Gift as GiftIcon, PartyPopper, ShoppingBag, Trash2, Truck } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatPrice, brand } from "@/config/brand";
import { useCart, useCartQuote } from "@/lib/cart";
import { buildMilestones, lineKey, primaryButton, outlineButton, useCommerce, type Gift } from "@/lib/commerce";
import { useContactInfo } from "@/lib/site-settings";
import { QuantityStepper } from "@/components/site/CommerceButtons";
import { CouponBox } from "@/components/site/Offers";
import { WhatsAppIcon } from "@/components/site/WhatsAppIcon";

const CONFETTI = Array.from({ length: 14 }, (_, i) => ({
  x: Math.round(Math.cos((i / 14) * Math.PI * 2) * (34 + (i % 3) * 12)),
  y: Math.round(Math.sin((i / 14) * Math.PI * 2) * (22 + (i % 3) * 8)),
  delay: (i % 5) * 40,
  color: ["bg-brand-red", "bg-amber-400", "bg-emerald-500", "bg-sky-400"][i % 4],
}));

/**
 * Free-shipping meter ("Spend 500 more and get free shipping"). The amount is set in
 * Admin → Store features. The bar fills smoothly, a truck rides its tip, and when the cart
 * crosses the amount the bar turns green and a small burst of confetti plays. The real
 * shipping fee is always decided by the server at checkout.
 */
export function ShippingProgress({ subtotal, threshold, gifts = [], compact }: { subtotal: number; threshold: number; gifts?: Gift[]; compact?: boolean }) {
  // Free shipping and every free gift are steps on one bar.
  const steps = buildMilestones(threshold, gifts);
  const reached = steps.filter((s) => subtotal >= s.amount);
  const next = steps.find((s) => subtotal < s.amount);
  const unlocked = steps.length > 0 && !next;
  const wasReached = useRef(reached.length);
  const [burst, setBurst] = useState(0);

  useEffect(() => {
    // Celebrate only when the cart crosses a step while the shopper is looking, not on every open.
    if (reached.length > wasReached.current) {
      setBurst((n) => n + 1);
      const t = window.setTimeout(() => setBurst(0), 1800);
      wasReached.current = reached.length;
      return () => window.clearTimeout(t);
    }
    wasReached.current = reached.length;
    return undefined;
  }, [reached.length]);

  if (steps.length === 0 || subtotal <= 0) return null;
  const top = steps[steps.length - 1]!.amount;
  const left = next ? Math.max(0, next.amount - subtotal) : 0;
  const pct = Math.min(100, (subtotal / top) * 100);
  const earnedGifts = reached.filter((s) => s.kind === "gift").map((s) => s.label);

  return (
    <div
      className={`ship-meter relative overflow-hidden rounded-[12px] border transition-colors duration-500 ${compact ? "px-3 py-2" : "px-3.5 py-3"} ${
        unlocked ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-border bg-muted/40"
      }`}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2.5">
        <span className={`flex ${compact ? "size-6" : "size-8"} shrink-0 items-center justify-center rounded-full text-background transition-colors duration-500 ${unlocked ? "ship-pop bg-emerald-600" : "bg-brand-red"}`}>
          {unlocked ? <PartyPopper className="size-4" /> : next?.kind === "gift" ? <GiftIcon className="size-4" /> : <Truck className="size-4" />}
        </span>
        <p key={`${reached.length}-${unlocked ? "done" : "todo"}`} className={`ship-text leading-snug ${compact ? "text-xs" : "text-[0.8125rem]"}`}>
          {next ? (
            <>
              Spend <strong className="font-semibold text-brand-red">{formatPrice(left)}</strong> more and get{" "}
              <strong className="font-semibold">{next.kind === "gift" ? `a free gift: ${next.label}` : "free shipping"}</strong>
              {earnedGifts.length ? <span className="block text-muted-foreground">Your free gift so far: {earnedGifts.join(", ")}</span> : null}
            </>
          ) : (
            <>
              <strong className="font-semibold">{earnedGifts.length ? "Rewards unlocked!" : "Free shipping unlocked!"}</strong>{" "}
              {steps.some((s) => s.kind === "shipping") ? "Your order ships free" : "Your order is eligible"}
              {earnedGifts.length ? ` and you get ${earnedGifts.join(" + ")} free` : ""}.
            </>
          )}
        </p>
      </div>

      <div className={`relative w-full rounded-full bg-foreground/10 ${compact ? "mt-2.5 h-1.5" : "mt-3 h-2"}`} role="presentation">
        <div
          className={`ship-fill relative h-full rounded-full transition-[width] duration-700 ease-out ${unlocked ? "bg-emerald-500" : "bg-gradient-to-r from-brand-red to-amber-400"}`}
          style={{ width: `${pct}%` }}
        >
          {!unlocked ? <span className="ship-shine absolute inset-0 rounded-full" aria-hidden="true" /> : null}
        </div>
        {steps.slice(0, -1).map((s) => (
          <span
            key={`${s.kind}-${s.amount}`}
            className={`absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background ${subtotal >= s.amount ? "bg-emerald-500" : "bg-foreground/30"}`}
            style={{ left: `${(s.amount / top) * 100}%` }}
            title={`${s.label} at ${formatPrice(s.amount)}`}
            aria-hidden="true"
          />
        ))}
        <span
          className="absolute top-1/2 flex size-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-background shadow ring-1 ring-foreground/10 transition-[left] duration-700 ease-out"
          style={{ left: `${Math.max(4, Math.min(96, pct))}%` }}
          aria-hidden="true"
        >
          {unlocked ? <Check className="size-3 text-emerald-600" /> : <Truck className="ship-drive size-3 text-brand-red" />}
        </span>
      </div>

      {burst ? (
        <span key={burst} className="pointer-events-none absolute left-[18px] top-[28px]" aria-hidden="true">
          {CONFETTI.map((c, i) => (
            <span
              key={i}
              className={`ship-confetti absolute size-1.5 rounded-sm ${c.color}`}
              style={{ ["--cx" as string]: `${c.x}px`, ["--cy" as string]: `${c.y}px`, animationDelay: `${c.delay}ms` }}
            />
          ))}
        </span>
      ) : null}
    </div>
  );
}

/** The mini-cart: a right-hand drawer that opens whenever something is added to the cart. */
export function CartDrawer() {
  const { cart, checkout, maxQty, freeShippingOver, gifts } = useCommerce();
  const { items, drawerOpen, closeDrawer, setQty, remove } = useCart();
  const quote = useCartQuote(items);
  const contact = useContactInfo();
  const navigate = useNavigate();
  if (!cart) return null;

  // Server prices win over the browser snapshot as soon as they arrive.
  const byKey = new Map((quote.data?.lines ?? []).map((l) => [lineKey(l.id, l.variantId), l]));
  const lines = items.map((item) => {
    const live = byKey.get(item.key);
    return {
      id: item.key, variantTitle: live?.variantTitle ?? item.variantTitle, qty: item.qty, name: live?.name ?? item.name, slug: live?.slug ?? item.slug,
      price: live?.price ?? item.price, image: live?.image ?? item.image, issue: live?.issue ?? null,
    };
  });
  const subtotal = quote.data?.subtotal ?? lines.reduce((sum, l) => sum + l.price * l.qty, 0);
  const hasIssue = lines.some((l) => l.issue);

  const whatsappMessage = `Hi ${brand.name}, I would like to order:\n${lines.map((l) => `• ${l.name}${l.variantTitle ? ` (${l.variantTitle})` : ""} × ${l.qty} — ${formatPrice(l.price * l.qty)}`).join("\n")}\nTotal: ${formatPrice(subtotal)}`;

  return (
    <Sheet open={drawerOpen} onOpenChange={(open) => !open && closeDrawer()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border px-4 py-3.5">
          <SheetTitle className="font-display text-base tracking-tight">YOUR CART</SheetTitle>
          <SheetDescription className="sr-only">Items in your shopping cart</SheetDescription>
        </SheetHeader>

        {lines.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
            <ShoppingBag className="size-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Your cart is empty.</p>
            <Link to="/shop" onClick={closeDrawer} className={primaryButton}>
              Continue shopping
            </Link>
          </div>
        ) : (
          <>
            {(freeShippingOver > 0 || gifts.length > 0) && subtotal > 0 ? (
              <div className="border-b border-border px-4 py-3">
                <ShippingProgress subtotal={subtotal} threshold={freeShippingOver} gifts={gifts} compact />
              </div>
            ) : null}
            <ul className="flex-1 divide-y divide-border overflow-y-auto px-4">
              {lines.map((line) => (
                <li key={line.id} className="flex gap-3 py-3">
                  <Link to="/product/$slug" params={{ slug: line.slug }} onClick={closeDrawer} className="size-14 shrink-0 bg-surface">
                    {line.image ? <img src={line.image} alt="" className="size-full object-cover" /> : <LogoPlaceholder className="size-full" />}
                  </Link>
                  <div className="min-w-0 flex-1">
                    <Link to="/product/$slug" params={{ slug: line.slug }} onClick={closeDrawer} className="block break-words font-display text-sm hover:text-brand-red">
                      {line.name}
                    </Link>
                    {line.variantTitle ? <p className="mt-0.5 text-xs text-muted-foreground">{line.variantTitle}</p> : null}
                    <p className="mt-0.5 text-[0.8125rem]">{formatPrice(line.price)}</p>
                    {line.issue ? <p className="mt-1 text-xs text-brand-red">{line.issue}</p> : null}
                    <div className="mt-1.5 flex items-center justify-between">
                      <QuantityStepper compact value={line.qty} max={maxQty} onChange={(n) => setQty(line.id, n)} />
                      <button type="button" onClick={() => remove(line.id)} aria-label={`Remove ${line.name}`} className="p-1.5 text-muted-foreground hover:text-brand-red">
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <div className="max-h-[60vh] space-y-3 overflow-y-auto border-t border-border p-4">
              {checkout ? <CouponBox quote={quote.data} compact /> : null}
              <div className="flex items-center justify-between text-sm">
                <span>Subtotal</span>
                <span className="font-medium">{formatPrice(subtotal)}</span>
              </div>
              {quote.data && quote.data.discount > 0 ? (
                <div className="flex items-center justify-between text-sm text-emerald-700">
                  <span>Discount ({quote.data.coupon?.code})</span>
                  <span className="font-medium">−{formatPrice(quote.data.discount)}</span>
                </div>
              ) : null}
              <p className="text-xs text-muted-foreground">Shipping and taxes are shown at checkout.</p>
              {checkout ? (
                <button
                  type="button"
                  disabled={hasIssue}
                  onClick={() => {
                    closeDrawer();
                    void navigate({ to: "/checkout" });
                  }}
                  className={`${primaryButton} w-full !h-10 !px-4 !py-0 !text-[0.7rem]`}
                >
                  Checkout
                </button>
              ) : (
                <a href={contact.whatsappUrl(whatsappMessage)} target="_blank" rel="noreferrer noopener" className={`${primaryButton} w-full bg-brand-red !h-10 !px-4 !py-0 !text-[0.7rem]`}>
                  <WhatsAppIcon className="size-4" /> Order on WhatsApp
                </a>
              )}
              <Link to="/cart" onClick={closeDrawer} className={`${outlineButton} w-full !h-10 !px-4 !py-0 !text-[0.7rem]`}>
                View cart
              </Link>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
