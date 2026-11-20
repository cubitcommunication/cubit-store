import { LogoPlaceholder } from "@/components/site/LogoPlaceholder";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { formatPrice, brand } from "@/config/brand";
import { accountApi } from "@/lib/account";
import { outlineButton } from "@/lib/commerce";
import { useContactInfo } from "@/lib/site-settings";
import { AddressBlock, OrderTotals, TrackingNote, formatDate, orderStatusLabel, paymentLabel } from "@/components/site/OrderBits";
import { WhatsAppIcon } from "@/components/site/WhatsAppIcon";
import { ReturnPanel } from "@/components/site/ReturnPanel";
import { LoadingRows } from "@/components/ui/loading-rows";

export const Route = createFileRoute("/account/orders/$number")({
  component: OrderDetail,
});

function OrderDetail() {
  const { number } = Route.useParams();
  const contact = useContactInfo();
  const { data: o, isPending, isError } = useQuery({ queryKey: ["account", "order", number], queryFn: () => accountApi.order(number) });

  if (isPending) return <LoadingRows variant="store" />;
  if (isError || !o) {
    return (
      <div>
        <p className="text-muted-foreground">We couldn't find that order.</p>
        <Link to="/account/orders" className={`${outlineButton} mt-4`}>Back to orders</Link>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link to="/account/orders" className="text-sm text-muted-foreground hover:text-brand-red">← All orders</Link>
          <h2 className="mt-2 font-display text-2xl">Order #{o.number}</h2>
          <p className="mt-1 text-sm text-muted-foreground">Placed {formatDate(o.createdAt)}</p>
        </div>
        <div className="flex gap-2">{orderStatusLabel(o)}{paymentLabel(o)}</div>
      </div>

      <TrackingNote order={o} />

      <section>
        <ul className="divide-y divide-border border-y border-border">
          {o.items.map((item, i) => (
            <li key={i} className="flex items-center gap-4 py-4 text-sm">
              <div className="size-16 shrink-0 bg-surface">{item.image ? <img src={item.image} alt="" className="size-full object-cover" /> : <LogoPlaceholder className="size-full" />}</div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-display">{item.name}{item.variantTitle ? <span className="font-sans text-xs text-muted-foreground"> · {item.variantTitle}</span> : null}</p>
                <p className="text-xs text-muted-foreground">SKU {item.sku} · Qty {item.qty} · {formatPrice(item.price)} each</p>
              </div>
              <p>{formatPrice(item.lineTotal)}</p>
            </li>
          ))}
        </ul>
        <div className="mt-6 max-w-sm"><OrderTotals subtotal={o.subtotal} discount={o.discount ?? 0} couponCode={o.couponCode ?? null} shipping={o.shipping} codFee={o.codFee} total={o.total} /></div>
      </section>

      <div className="grid gap-8 sm:grid-cols-2">
        <section>
          <h3 className="eyebrow">Delivery address</h3>
          <div className="mt-3"><AddressBlock address={o.address} /></div>
        </section>
        <section>
          <h3 className="eyebrow">Timeline</h3>
          <ol className="mt-3 space-y-3 border-l border-border pl-4">
            {(o.events ?? []).map((e, i) => (
              <li key={i} className="text-sm">
                <p>{e.message}</p>
                <p className="text-xs text-muted-foreground">{formatDate(e.at)}</p>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <ReturnPanel number={o.number} info={o.returns} />

      <a href={contact.whatsappUrl(`Hi ${brand.name}, I have a question about my order #${o.number}.`)} target="_blank" rel="noreferrer noopener" className={outlineButton}>
        <WhatsAppIcon className="size-4" /> Ask about this order
      </a>
    </div>
  );
}
