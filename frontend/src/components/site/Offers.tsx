import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronDown, Copy, Tag, X } from "lucide-react";
import { toast } from "sonner";
import { formatPrice } from "@/config/brand";
import { api } from "@/lib/api";
import { useCart } from "@/lib/cart";
import { useCommerce, type Promotion, type Quote } from "@/lib/commerce";
import { cn } from "@/lib/utils";

/** Offers the store switched on in Admin → Discounts → "Show on website". Empty while the cart is off. */
export function usePromotions(): Promotion[] {
  const { cart } = useCommerce();
  const { data } = useQuery({
    queryKey: ["promotions"],
    enabled: cart,
    staleTime: 60_000,
    queryFn: () => api<Promotion[]>("/promotions"),
  });
  return cart ? (data ?? []) : [];
}

/** One offer as a ticket: a red label on the left, the details, then the code and a button. */
function OfferCard({ promo, applied, onApply }: { promo: Promotion; applied: boolean; onApply: () => void }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(promo.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.message(`Your code is ${promo.code}`);
    }
  }
  return (
    <li className="flex overflow-hidden rounded-[12px] border border-dashed border-brand-red/50 bg-brand-red/[0.04]">
      <div className="flex w-[4.5rem] shrink-0 flex-col items-center justify-center bg-brand-red px-2 py-3 text-center text-background sm:w-24">
        <Tag className="size-4 opacity-80" aria-hidden="true" />
        <span className="mt-1 text-[0.8125rem] font-bold leading-tight tracking-wide">{promo.label}</span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <div className="min-w-0">
          {promo.description ? <p className="text-[0.875rem] font-medium leading-snug">{promo.description}</p> : null}
          {promo.terms ? <p className={cn("text-xs leading-snug text-muted-foreground", promo.description && "mt-0.5")}>{promo.terms}</p> : null}
          <button type="button" onClick={copy} className="mt-1.5 inline-flex items-center gap-1.5 rounded-md border border-dashed border-foreground/40 px-2 py-1 font-mono text-[0.75rem] font-semibold tracking-wider hover:border-brand-red hover:text-brand-red" aria-label={`Copy code ${promo.code}`}>
            {promo.code}
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          </button>
        </div>
        <button
          type="button"
          onClick={onApply}
          disabled={applied}
          className={cn(
            "eyebrow inline-flex h-10 shrink-0 items-center justify-center rounded-lg px-4 text-[0.72rem] transition-colors",
            applied ? "bg-emerald-100 text-emerald-900" : "bg-foreground text-background hover:bg-brand-red",
          )}
        >
          {applied ? "Applied" : "Apply"}
        </button>
      </div>
    </li>
  );
}

/**
 * "Have a discount code?" for the cart, mini-cart and checkout: a code field, the applied code with
 * what it saved, and the offers the store is promoting. Prices are always worked out by the server.
 */
export function CouponBox({ quote, className, compact }: { quote: Quote | undefined; className?: string; compact?: boolean }) {
  const { coupon, setCoupon } = useCart();
  const promos = usePromotions();
  const [text, setText] = useState("");
  const [open, setOpen] = useState(true);

  const applied = quote?.coupon && !quote.couponError ? quote.coupon : null;
  const error = coupon && quote && quote.couponError ? quote.couponError : null;
  const offers = promos.filter((p) => p.code !== applied?.code);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const code = text.replace(/\s+/g, "").toUpperCase();
    if (!code) return;
    setCoupon(code);
    setText("");
  }

  return (
    <div className={cn("space-y-3", className)}>
      {applied ? (
        <div className="flex items-center justify-between gap-3 rounded-[12px] border border-emerald-300 bg-emerald-50 px-3.5 py-3 text-emerald-900">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Tag className="size-4 shrink-0" aria-hidden="true" /> <span className="truncate font-mono tracking-wider">{applied.code}</span>
            </p>
            <p className="mt-0.5 text-xs">
              {quote && quote.discount > 0 ? `You saved ${formatPrice(quote.discount)}` : applied.type === "free_shipping" ? "Free shipping applied" : applied.label}
            </p>
          </div>
          <button type="button" onClick={() => setCoupon("")} aria-label={`Remove code ${applied.code}`} className="flex size-9 shrink-0 items-center justify-center rounded-full hover:bg-emerald-100">
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="flex gap-2" noValidate>
          <label htmlFor="coupon-code" className="sr-only">Discount code</label>
          <input
            id="coupon-code"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Discount code"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            className={cn("min-w-0 flex-1 rounded-lg border border-border bg-background px-3 uppercase placeholder:normal-case focus:border-brand-red focus:outline-none", compact ? "h-9 text-[0.8125rem]" : "h-11 text-sm")}
          />
          <button type="submit" disabled={!text.trim()} className={cn("eyebrow shrink-0 rounded-lg bg-foreground text-background transition-colors hover:bg-brand-red disabled:opacity-50", compact ? "h-9 px-4 text-[0.66rem]" : "h-11 px-5 text-[0.72rem]")}>
            Apply
          </button>
        </form>
      )}

      {error ? (
        <p role="alert" className="flex items-start justify-between gap-3 text-xs text-brand-red">
          <span>{error}</span>
          <button type="button" onClick={() => setCoupon("")} className="shrink-0 underline underline-offset-2">Remove</button>
        </p>
      ) : null}

      {offers.length ? (
        <div>
          <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center justify-between text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <span>Available offers ({offers.length})</span>
            <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
          </button>
          {open ? (
            <ul className="mt-2 space-y-2">
              {offers.map((p) => (
                <OfferCard key={p.code} promo={p} applied={false} onApply={() => { setCoupon(p.code); toast.success(`${p.code} applied`); }} />
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** "Offers for you" under the buy buttons on a product page. */
export function ProductOffers({ className }: { className?: string }) {
  const promos = usePromotions();
  const { coupon, setCoupon } = useCart();
  if (!promos.length) return null;
  return (
    <section aria-labelledby="offers-heading" className={cn("sm:max-w-md", className)}>
      <h2 id="offers-heading" className="eyebrow flex items-center gap-2 text-brand-red">
        <Tag className="size-4" aria-hidden="true" /> Offers for you
      </h2>
      <ul className="mt-3 space-y-2">
        {promos.slice(0, 3).map((p) => (
          <OfferCard
            key={p.code}
            promo={p}
            applied={coupon.toUpperCase() === p.code}
            onApply={() => { setCoupon(p.code); toast.success(`${p.code} will be applied in your cart`); }}
          />
        ))}
      </ul>
    </section>
  );
}
