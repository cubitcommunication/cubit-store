import { CURRENCY, LOCALE } from "@/config/brand";
import { brand } from "@/config/brand";
import { Mail } from "lucide-react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin/AdminShell";
import { ShippingCard } from "@/components/admin/ShippingCard";
import { TrackingFields } from "@/components/admin/TrackingFields";
import { Badge, Btn, Card, Field, adminInput, fulfilmentBadge, money, paymentBadge, when } from "@/components/admin/ui";
import { OrderPrintMenu } from "@/components/admin/OrderPrint";
import { INDIAN_STATES } from "@/lib/commerce";
import { api, ApiError } from "@/lib/api";
import { db } from "@/lib/data";
import { OrderSkeleton } from "@/components/ui/loading-rows";

export const Route = createFileRoute("/admin/orders/$id")({
  head: () => ({ meta: [{ title: `Order — ${brand.name} Admin` }] }),
  component: OrderPage,
});

type Item = { id: string; product_id: string | null; variant_title?: string | null; name: string; sku: string; price: number; quantity: number; line_total: number; image_url: string | null };
type OrderFull = {
  id: string; number: number; customer_id: string | null; name: string; email: string; phone: string; status: string;
  payment_status: string; payment_method: string; channel?: string; fulfillment_status: string; subtotal: number; discount_total: number; coupon_code: string | null; shipping_total: number;
  cod_fee: number; total: number; notes: string | null; created_at: string; razorpay_payment_id: string | null;
  awb_code: string | null; tracking_url: string | null; courier_name: string | null;
  shipping_address: { name: string; phone: string; line1: string; line2?: string | null; city: string; state: string; pincode: string; date_of_birth?: string } | null;
  order_items: Item[]; order_events: { id: string; message: string; created_at: string }[];
};

function OrderPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState(false);

  const order = useQuery({
    queryKey: ["admin", "order", id],
    queryFn: async () => {
      const { data, error } = await db.from("orders").select("*,order_items(*),order_events(*)").eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      return (data ?? null) as unknown as OrderFull | null;
    },
  });

  const customer = useQuery({
    queryKey: ["admin", "order-customer", order.data?.customer_id ?? null],
    enabled: Boolean(order.data?.customer_id),
    queryFn: async () => {
      const { data, error } = await db.from("customers").select("id,date_of_birth,gift_note,birthday_gift_year").eq("id", order.data!.customer_id!).maybeSingle();
      if (error) throw new Error(error.message);
      return (data ?? null) as unknown as { id: string; date_of_birth: string | null; gift_note: string | null; birthday_gift_year: number | null } | null;
    },
  });
  const gift = useMutation({
    mutationFn: (sent: boolean) => api(`/admin/customers/${order.data!.customer_id}`, { method: "POST", body: { birthdayGiftSent: sent } }),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["admin"] }); toast.success("Saved"); },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not save."),
  });

  const act = useMutation({
    mutationFn: (body: Record<string, unknown>) => api(`/admin/orders/${id}`, { method: "POST", body }),
    onSuccess: async (_d, vars) => {
      await qc.invalidateQueries({ queryKey: ["admin"] });
      if (vars["action"] === "note") setNote("");
      if (vars["action"] === "edit_details") setEditing(false);
      toast.success(vars["action"] === "resend_email" ? "E-mail sent again to the customer" : "Order updated");
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : "Could not update the order."),
  });
  const run = (action: string, confirm?: string) => {
    if (confirm && !window.confirm(confirm)) return;
    act.mutate({ action });
  };

  /** Sends one of the customer's e-mails again (the server only allows ones that fit the order's status). */
  const resend = (template: string, label: string) => {
    if (window.confirm(`Send the "${label}" e-mail to ${order.data?.email ?? "the customer"} again?`)) act.mutate({ action: "resend_email", template });
  };

  const o = order.data;
  if (order.isPending) return <AdminShell title="Order" back={{ to: "/admin/orders", label: "Orders" }}><OrderSkeleton /></AdminShell>;
  if (!o) {
    return (
      <AdminShell title="Order not found" back={{ to: "/admin/orders", label: "Orders" }}>
        <Card><p className="text-[13px]">This order doesn't exist. <Link to="/admin/orders" className="text-[#005bd3] hover:underline">Back to orders</Link></p></Card>
      </AdminShell>
    );
  }

  const cancelled = o.status === "cancelled";
  const events = [...(o.order_events ?? [])].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const a = o.shipping_address;

  return (
    <AdminShell
      title={`Order #${o.number}`}
      back={{ to: "/admin/orders", label: "Orders" }}
      actions={
        <>
          <OrderPrintMenu order={{ ...o, order_items: o.order_items.map((i) => ({ ...i, variant_title: i.variant_title ?? null })) }} />
          {!cancelled ? <Btn variant="danger" disabled={act.isPending} onClick={() => run("cancel", "Cancel this order? Stock will be returned. This cannot be undone.")}>Cancel order</Btn> : null}
        </>
      }
    >
      <p className="-mt-3 mb-4 flex flex-wrap items-center gap-2 text-[13px] text-[#616161]">
        {when(o.created_at)} {paymentBadge(o.payment_status)} {fulfilmentBadge(o.fulfillment_status, o.status)}
      </p>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-4">
          <Card title={<span className="flex items-center gap-2">{fulfilmentBadge(o.fulfillment_status, o.status)}</span>} actions={
            // "Mark as fulfilled" sits under the tracking fields below; only the undo lives up here.
            !cancelled && o.fulfillment_status === "fulfilled" ? (
              <span className="flex flex-wrap gap-2">
                <Btn disabled={act.isPending} onClick={() => resend("order_shipped", "Order shipped")}><Mail className="size-3.5" /> Resend shipped e-mail</Btn>
                <Btn disabled={act.isPending} onClick={() => run("unfulfil")}>Mark as unfulfilled</Btn>
              </span>
            ) : null
          }>
            <ul className="divide-y divide-[#ebebeb]">
              {o.order_items.map((i) => (
                <li key={i.id} className="flex items-center gap-3 py-3 text-[13px]">
                  <div className="size-12 shrink-0 overflow-hidden rounded-lg border border-[#e3e3e3] bg-[#f7f7f7]">{i.image_url ? <img src={i.image_url} alt="" className="size-full object-cover" /> : null}</div>
                  <div className="min-w-0 flex-1">
                    {i.product_id ? <Link to="/admin/products/$id/edit" params={{ id: i.product_id }} className="font-medium text-[#005bd3] hover:underline">{i.name}</Link> : <span className="font-medium">{i.name}</span>}
                    <p className="text-xs text-[#616161]">{i.variant_title ? `${i.variant_title} · ` : ""}SKU {i.sku}</p>
                  </div>
                  <span className="text-[#616161]">{money(Number(i.price))} × {i.quantity}</span>
                  <span className="w-24 text-right font-medium">{money(Number(i.line_total))}</span>
                </li>
              ))}
            </ul>
            <TrackingFields key={`${o.fulfillment_status}-${o.awb_code ?? ""}-${o.tracking_url ?? ""}-${o.courier_name ?? ""}`} order={o} cancelled={cancelled} busy={act.isPending} onSubmit={(body) => act.mutate(body)} />
          </Card>

          {o.channel === "shop" ? null : <ShippingCard orderId={o.id} cancelled={cancelled} />}

          <Card title={<span className="flex items-center gap-2">{paymentBadge(o.payment_status)}<span className="font-normal text-[#616161]">{o.payment_method === "cod" ? "Cash on Delivery" : "Online (Razorpay)"}</span></span>} actions={
            o.payment_status === "paid" ? (
              <span className="flex flex-wrap gap-2">
                <Btn disabled={act.isPending} onClick={() => resend("payment_received", "Payment received")}><Mail className="size-3.5" /> Resend payment e-mail</Btn>
                <Btn disabled={act.isPending} onClick={() => {
                  const raw = window.prompt(`Refund amount in ${CURRENCY} (leave as is for the full ${money(Number(o.total))}). Do the actual refund in Razorpay or your bank first — this records it and e-mails the customer.`, String(Number(o.total)));
                  if (raw === null) return;
                  const amount = Number(raw);
                  if (!Number.isFinite(amount) || amount <= 0) { toast.error("Enter a refund amount."); return; }
                  act.mutate({ action: "refund", amount });
                }}>Record refund</Btn>
                {!cancelled ? <Btn disabled={act.isPending} onClick={() => run("mark_unpaid", "Mark this order as payment pending again?")}>Mark as pending</Btn> : null}
              </span>
            ) : (
              <span className="flex flex-wrap gap-2">
                {o.payment_status === "refunded" ? <Btn disabled={act.isPending} onClick={() => resend("order_refunded", "Refund")}><Mail className="size-3.5" /> Resend refund e-mail</Btn> : null}
                {!cancelled ? <Btn variant="primary" disabled={act.isPending} onClick={() => run("mark_paid")}>Mark as paid</Btn> : null}
              </span>
            )
          }>
            <dl className="space-y-1.5 text-[13px]">
              <Row label="Subtotal" value={money(Number(o.subtotal))} />
              {Number(o.discount_total) > 0 ? <Row label={`Discount${o.coupon_code ? ` (${o.coupon_code})` : ""}`} value={`−${money(Number(o.discount_total))}`} /> : o.coupon_code ? <Row label={`Code ${o.coupon_code}`} value="Free shipping" /> : null}
              <Row label="Shipping" value={Number(o.shipping_total) > 0 ? money(Number(o.shipping_total)) : "Free"} />
              {Number(o.cod_fee) > 0 ? <Row label="COD fee" value={money(Number(o.cod_fee))} /> : null}
              <div className="flex justify-between border-t border-[#ebebeb] pt-2 font-semibold"><dt>Total</dt><dd>{money(Number(o.total))}</dd></div>
              {o.razorpay_payment_id ? <p className="pt-1 text-xs text-[#616161]">Razorpay payment {o.razorpay_payment_id}</p> : null}
            </dl>
          </Card>

          <Card title="Timeline" actions={
            <span className="flex flex-wrap gap-2">
              {cancelled ? <Btn disabled={act.isPending} onClick={() => resend("order_cancelled", "Order cancelled")}><Mail className="size-3.5" /> Resend cancellation e-mail</Btn> : null}
              <Btn disabled={act.isPending} onClick={() => resend("order_placed", "Order confirmation")}><Mail className="size-3.5" /> Resend order confirmation</Btn>
            </span>
          }>
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (note.trim()) act.mutate({ action: "note", note: note.trim() }); }}>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Leave a comment (only you can see it)" maxLength={450} className={adminInput} />
              <Btn type="submit" disabled={!note.trim() || act.isPending}>Post</Btn>
            </form>
            <ol className="mt-4 space-y-3 border-l-2 border-[#e3e3e3] pl-4">
              {events.map((e) => (
                <li key={e.id} className="text-[13px]"><p>{e.message}</p><p className="text-xs text-[#616161]">{when(e.created_at)}</p></li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="space-y-4">
          {o.channel === "shop" ? (
            <Card title="Shop sale">
              <p className="text-[13px]">Sold in the shop and paid by {({ cash: "cash", upi: "UPI", card: "card" } as Record<string, string>)[o.payment_method] ?? o.payment_method}. Nothing to ship.</p>
              {o.name !== "Shop customer" || o.phone || a?.line1 || a?.date_of_birth ? (
                <dl className="mt-3 space-y-1 border-t border-[#ebebeb] pt-3 text-[13px]">
                  {o.name !== "Shop customer" ? <div><dt className="inline text-[#616161]">Name: </dt><dd className="inline font-medium">{o.name}</dd></div> : null}
                  {o.phone ? <div><dt className="inline text-[#616161]">Mobile: </dt><dd className="inline"><a href={`tel:${o.phone}`} className="text-[#005bd3] hover:underline">{o.phone}</a></dd></div> : null}
                  {a?.line1 ? <div><dt className="inline text-[#616161]">Address: </dt><dd className="inline whitespace-pre-wrap">{a.line1}</dd></div> : null}
                  {a?.date_of_birth ? <div><dt className="inline text-[#616161]">Date of birth: </dt><dd className="inline">{new Date(`${a.date_of_birth}T00:00:00`).toLocaleDateString(LOCALE, { day: "numeric", month: "short", year: "numeric" })}</dd></div> : null}
                </dl>
              ) : <p className="mt-2 text-xs text-[#616161]">No customer details were entered.</p>}
            </Card>
          ) : (
            <>
          <Card title="Customer" actions={!cancelled ? <Btn onClick={() => setEditing(true)}>Edit</Btn> : null}>
            <p className="text-[13px] font-medium">{o.name}</p>
            <p className="mt-1 text-[13px]"><a href={`mailto:${o.email}`} className="text-[#005bd3] hover:underline">{o.email}</a></p>
            <p className="text-[13px]"><a href={`tel:${o.phone}`} className="text-[#005bd3] hover:underline">{o.phone}</a></p>
            <p className="mt-2"><Badge tone={o.customer_id ? "info" : "neutral"}>{o.customer_id ? "Has an account" : "Guest checkout"}</Badge></p>
            {customer.data?.date_of_birth ? <Birthday c={customer.data} busy={gift.isPending} onToggle={(sent) => gift.mutate(sent)} /> : o.customer_id ? <p className="mt-3 text-xs text-[#616161]">No birthday added yet.</p> : null}
          </Card>
          <Card title="Shipping address" actions={!cancelled ? <Btn onClick={() => setEditing(true)}>Edit</Btn> : null}>
            {a ? (
              <address className="text-[13px] not-italic leading-relaxed">
                {a.name}<br />{a.line1}<br />{a.line2 ? <>{a.line2}<br /></> : null}{a.city}, {a.state} {a.pincode}<br />India<br />{a.phone}
              </address>
            ) : <p className="text-[13px] text-[#616161]">No address.</p>}
          </Card>
            </>
          )}
          {o.notes ? <Card title="Customer note"><p className="whitespace-pre-wrap text-[13px]">{o.notes}</p></Card> : null}
        </div>
      </div>
      {editing ? <EditDetails order={o} busy={act.isPending} onClose={() => setEditing(false)} onSave={(payload) => act.mutate({ action: "edit_details", ...payload })} /> : null}
    </AdminShell>
  );
}

/** Next birthday, how far away it is, and a "gift sent" tick that resets every year. */
function Birthday({ c, busy, onToggle }: { c: { date_of_birth: string | null; gift_note: string | null; birthday_gift_year: number | null }; busy: boolean; onToggle: (sent: boolean) => void }) {
  const dob = new Date(`${c.date_of_birth}T00:00:00`);
  const today = new Date();
  const next = new Date(today.getFullYear(), dob.getMonth(), dob.getDate());
  if (next < new Date(today.getFullYear(), today.getMonth(), today.getDate())) next.setFullYear(today.getFullYear() + 1);
  const days = Math.round((next.getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 86400000);
  const turns = next.getFullYear() - dob.getFullYear();
  const sent = c.birthday_gift_year === today.getFullYear();
  return (
    <div className="mt-3 rounded-lg border border-[#e3e3e3] bg-[#fafafa] p-3 text-[13px]">
      <p className="font-medium">🎂 {dob.toLocaleDateString(LOCALE, { day: "numeric", month: "long" })}</p>
      <p className="text-xs text-[#616161]">{days === 0 ? `Turns ${turns} today!` : `Turns ${turns} in ${days} day${days === 1 ? "" : "s"}`}</p>
      {c.gift_note ? <p className="mt-2 whitespace-pre-wrap text-xs">“{c.gift_note}”</p> : null}
      <label className="mt-2 flex items-center gap-2 text-xs"><input type="checkbox" checked={sent} disabled={busy} onChange={(e) => onToggle(e.target.checked)} /> Birthday gift sent this year</label>
    </div>
  );
}

type Details = { contact: { name: string; email: string; phone: string }; address: { name: string; phone: string; line1: string; line2: string; city: string; state: string; pincode: string } };

function EditDetails({ order, busy, onClose, onSave }: { order: OrderFull; busy: boolean; onClose: () => void; onSave: (d: Details) => void }) {
  const a = order.shipping_address;
  const [f, setF] = useState<Details>({
    contact: { name: order.name, email: order.email, phone: order.phone },
    address: { name: a?.name ?? order.name, phone: a?.phone ?? order.phone, line1: a?.line1 ?? "", line2: a?.line2 ?? "", city: a?.city ?? "", state: a?.state ?? "", pincode: a?.pincode ?? "" },
  });
  const c = (k: keyof Details["contact"]) => (e: React.ChangeEvent<HTMLInputElement>) => setF((p) => ({ ...p, contact: { ...p.contact, [k]: e.target.value } }));
  const ad = (k: keyof Details["address"]) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((p) => ({ ...p, address: { ...p.address, [k]: e.target.value } }));
  const ok = /^\d{6}$/.test(f.address.pincode) && f.address.line1.trim() && f.address.city.trim() && f.address.state && f.contact.name.trim() && /^\S+@\S+\.\S+$/.test(f.contact.email) && f.contact.phone.trim().length >= 10;

  return (
    <div role="dialog" aria-modal="true" aria-label="Edit customer details" className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form
        onSubmit={(e) => { e.preventDefault(); if (ok) onSave(f); }}
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:max-w-xl sm:rounded-2xl"
      >
        <h2 className="text-[15px] font-semibold">Edit customer & shipping address</h2>
        <p className="mt-1 text-xs text-[#616161]">Order #{order.number}. The change is added to the order timeline.</p>
        <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-[#616161]">Customer</p>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <Field label="Name"><input className={adminInput} value={f.contact.name} onChange={c("name")} /></Field>
          <Field label="Phone"><input className={adminInput} value={f.contact.phone} onChange={c("phone")} inputMode="tel" /></Field>
          <div className="sm:col-span-2"><Field label="E-mail"><input type="email" className={adminInput} value={f.contact.email} onChange={c("email")} /></Field></div>
        </div>
        <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-[#616161]">Shipping address</p>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <Field label="Name on parcel"><input className={adminInput} value={f.address.name} onChange={ad("name")} /></Field>
          <Field label="Phone on parcel"><input className={adminInput} value={f.address.phone} onChange={ad("phone")} inputMode="tel" /></Field>
          <div className="sm:col-span-2"><Field label="Address line 1"><input className={adminInput} value={f.address.line1} onChange={ad("line1")} /></Field></div>
          <div className="sm:col-span-2"><Field label="Address line 2 (optional)"><input className={adminInput} value={f.address.line2} onChange={ad("line2")} /></Field></div>
          <Field label="City"><input className={adminInput} value={f.address.city} onChange={ad("city")} /></Field>
          <Field label="PIN code"><input className={adminInput} value={f.address.pincode} onChange={ad("pincode")} inputMode="numeric" maxLength={6} /></Field>
          <div className="sm:col-span-2">
            <Field label="State">
              <select className={adminInput} value={f.address.state} onChange={ad("state")}>
                <option value="">Choose a state</option>
                {INDIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" type="submit" disabled={busy || !ok}>{busy ? "Saving…" : "Save changes"}</Btn>
        </div>
      </form>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between"><dt className="text-[#616161]">{label}</dt><dd>{value}</dd></div>;
}
