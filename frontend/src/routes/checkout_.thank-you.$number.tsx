import { LogoPlaceholder } from "@/components/site/LogoPlaceholder";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { item as analyticsItem, trackOnce } from "@/lib/analytics";
import { CheckCircle2 } from "lucide-react";
import { formatPrice, brand } from "@/config/brand";
import { api } from "@/lib/api";
import type { OrderView } from "@/lib/commerce";
import { outlineButton, primaryButton } from "@/lib/commerce";
import { useCustomer } from "@/lib/account";
import { useContactInfo } from "@/lib/site-settings";
import { AddressBlock, OrderTotals, StorePage, TrackingNote, paymentLabel } from "@/components/site/OrderBits";
import { WhatsAppIcon } from "@/components/site/WhatsAppIcon";
import { LoadingRows } from "@/components/ui/loading-rows";

export const Route = createFileRoute("/checkout_/thank-you/$number")({
  validateSearch: (search: Record<string, unknown>): { token?: string | undefined } => ({
    token: typeof search["token"] === "string" ? (search["token"] as string) : undefined,
  }),
  head: () => ({ meta: [{ title: `Thank you — ${brand.name}` }, { name: "robots", content: "noindex, nofollow" }] }),
  component: ThankYou,
});

function ThankYou() {
  const { number } = Route.useParams();
  const { token } = Route.useSearch();
  const contact = useContactInfo();
  const { customer } = useCustomer();
  const order = useQuery({
    queryKey: ["order", number, token ?? ""],
    queryFn: () => api<OrderView>(`/orders/${number}${token ? `?token=${encodeURIComponent(token)}` : ""}`),
    retry: false,
  });

  useEffect(() => {
    const o = order.data;
    if (!o) return;
    const reported = o.items.map((i) => analyticsItem({ id: i.productId ?? undefined, sku: i.sku, name: i.name, price: i.price, qty: i.qty, variant: i.variantTitle ?? null }));
    trackOnce(`purchase_${o.number}`, "purchase", {
      transaction_id: String(o.number), currency: "INR", value: o.total, shipping: o.shipping, tax: 0,
      ...(o.couponCode ? { coupon: o.couponCode } : {}), items: reported, payment_type: o.paymentMethod,
    });
  }, [order.data]);

  if (order.isPending) {
    return (
      <StorePage title="Thank you" narrow>
        <LoadingRows variant="store" />
      </StorePage>
    );
  }
  if (order.isError || !order.data) {
    return (
      <StorePage title="Order not found" narrow>
        <p className="text-muted-foreground">We couldn't open this order. If you just placed it, check your e-mail or contact us on WhatsApp.</p>
        <Link to="/shop" className={`${primaryButton} mt-6`}>
          Continue shopping
        </Link>
      </StorePage>
    );
  }

  const o = order.data;
  const message = `Hi ${brand.name}, I just placed order #${o.number} (${formatPrice(o.total)}). Please confirm.`;

  return (
    <StorePage title="Thank you!">
      <div className="flex items-start gap-4">
        <CheckCircle2 className="mt-1 size-8 shrink-0 text-emerald-600" />
        <div>
          <p className="font-display text-xl">Your order #{o.number} is confirmed</p>
          <p className="mt-2 text-sm text-muted-foreground">
            We've sent the details to {o.email}. {o.paymentMethod === "cod" ? "Please keep the amount ready for Cash on Delivery." : o.paymentStatus === "paid" ? "Your payment was received." : "We'll confirm once your payment is verified."}
          </p>
        </div>
      </div>

      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section>
          <h2 className="eyebrow">Items</h2>
          <ul className="mt-4 divide-y divide-border border-y border-border">
            {o.items.map((item, i) => (
              <li key={i} className="flex items-center gap-4 py-4 text-sm">
                <div className="size-16 shrink-0 bg-surface">{item.image ? <img src={item.image} alt="" className="size-full object-cover" /> : <LogoPlaceholder className="size-full" />}</div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display">{item.name}{item.variantTitle ? <span className="font-sans text-xs text-muted-foreground"> · {item.variantTitle}</span> : null}</p>
                  <p className="text-xs text-muted-foreground">Qty {item.qty} · {formatPrice(item.price)} each</p>
                </div>
                <p>{formatPrice(item.lineTotal)}</p>
              </li>
            ))}
          </ul>
          <div className="mt-6 max-w-sm">
            <OrderTotals subtotal={o.subtotal} discount={o.discount ?? 0} couponCode={o.couponCode ?? null} shipping={o.shipping} codFee={o.codFee} total={o.total} />
          </div>
        </section>

        <aside className="space-y-6 border border-border bg-surface p-6">
          <TrackingNote order={o} />
          <div>
            <h2 className="eyebrow">Payment</h2>
            <p className="mt-2">{paymentLabel(o)}</p>
          </div>
          <div>
            <h2 className="eyebrow">Delivering to</h2>
            <div className="mt-2"><AddressBlock address={o.address} /></div>
          </div>
          <a href={contact.whatsappUrl(message)} target="_blank" rel="noreferrer noopener" className={`${outlineButton} w-full`}>
            <WhatsAppIcon className="size-4" /> Message us about this order
          </a>
          {customer ? (
            <Link to="/account/orders/$number" params={{ number }} className={`${outlineButton} w-full`}>View in my account</Link>
          ) : null}
          <Link to="/shop" className={`${primaryButton} w-full`}>Continue shopping</Link>
        </aside>
      </div>
    </StorePage>
  );
}
