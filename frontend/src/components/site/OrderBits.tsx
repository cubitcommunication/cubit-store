import type { ReactNode } from "react";
import { formatPrice, LOCALE, COUNTRY } from "@/config/brand";
import type { OrderView } from "@/lib/commerce";
import { cn } from "@/lib/utils";

/** Centered page wrapper used by the cart, checkout and account pages. */
export function StorePage({ title, children, narrow = false }: { title: string; children: ReactNode; narrow?: boolean }) {
  return (
    <div className={cn("mx-auto px-4 py-10 sm:px-6 lg:px-10 lg:py-16", narrow ? "max-w-[520px]" : "max-w-[1200px]")}>
      <h1 className="font-display text-3xl tracking-tight sm:text-4xl">{title}</h1>
      <div className="mt-8">{children}</div>
    </div>
  );
}

export function Pill({ tone, children }: { tone: "green" | "amber" | "red" | "grey" | "blue"; children: ReactNode }) {
  const tones = {
    green: "bg-emerald-100 text-emerald-900",
    amber: "bg-amber-100 text-amber-900",
    red: "bg-red-100 text-red-900",
    grey: "bg-muted text-foreground/80",
    blue: "bg-sky-100 text-sky-900",
  };
  return <span className={cn("inline-block px-2.5 py-1 text-xs font-medium", tones[tone])}>{children}</span>;
}

export function orderStatusLabel(order: Pick<OrderView, "status" | "paymentStatus" | "fulfillmentStatus">) {
  if (order.status === "cancelled") return <Pill tone="red">Cancelled</Pill>;
  if (order.fulfillmentStatus === "fulfilled") return <Pill tone="green">Shipped</Pill>;
  return <Pill tone="amber">Being prepared</Pill>;
}

/** Courier, tracking number and a link, shown once the parcel has been booked with a courier. */
export function TrackingNote({ order }: { order: Pick<OrderView, "delivery"> }) {
  const s = order.delivery;
  if (!s) return null;
  return (
    <div className="border border-border p-4 text-sm">
      <p className="eyebrow">Delivery</p>
      <p className="mt-2">
        {s.courier ? <>Courier: <strong>{s.courier}</strong><br /></> : null}
        {s.awb ? <>Tracking ID: <strong>{s.awb}</strong></> : null}
        {s.status ? <><br />Latest update: {s.status}</> : null}
      </p>
      {s.trackingUrl ? <a href={s.trackingUrl} target="_blank" rel="noreferrer noopener" className="mt-2 inline-block underline underline-offset-4 hover:text-brand-red">Track your parcel</a> : null}
    </div>
  );
}

export function paymentLabel(order: Pick<OrderView, "paymentStatus" | "paymentMethod">) {
  if (order.paymentStatus === "paid") return <Pill tone="green">Paid</Pill>;
  if (order.paymentStatus === "failed") return <Pill tone="red">Payment failed</Pill>;
  if (order.paymentStatus === "refunded") return <Pill tone="grey">Refunded</Pill>;
  return <Pill tone="amber">{order.paymentMethod === "cod" ? "Pay on delivery" : "Awaiting payment"}</Pill>;
}

export function OrderTotals({ subtotal, discount, couponCode, shipping, codFee, total }: { subtotal: number; discount?: number; couponCode?: string | null; shipping: number; codFee?: number; total: number }) {
  return (
    <dl className="space-y-2 text-sm">
      <div className="flex justify-between">
        <dt className="text-muted-foreground">Subtotal</dt>
        <dd>{formatPrice(subtotal)}</dd>
      </div>
      {discount ? (
        <div className="flex justify-between text-emerald-700">
          <dt>Discount{couponCode ? ` (${couponCode})` : ""}</dt>
          <dd>−{formatPrice(discount)}</dd>
        </div>
      ) : null}
      <div className="flex justify-between">
        <dt className="text-muted-foreground">Shipping</dt>
        <dd>{shipping > 0 ? formatPrice(shipping) : "Free"}</dd>
      </div>
      {codFee ? (
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Cash on Delivery fee</dt>
          <dd>{formatPrice(codFee)}</dd>
        </div>
      ) : null}
      <div className="flex justify-between border-t border-border pt-3 text-base font-medium">
        <dt>Total</dt>
        <dd>{formatPrice(total)}</dd>
      </div>
    </dl>
  );
}

export function AddressBlock({ address }: { address: OrderView["address"] }) {
  return (
    <address className="text-sm not-italic leading-relaxed">
      {address.name}
      <br />
      {address.line1}
      {address.line2 ? (
        <>
          <br />
          {address.line2}
        </>
      ) : null}
      <br />
      {address.city}, {address.state} {address.pincode}
      <br />
      {address.country ?? COUNTRY}
      <br />
      <span className="text-muted-foreground">Phone: {address.phone}</span>
    </address>
  );
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(LOCALE, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}
