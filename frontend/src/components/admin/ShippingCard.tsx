import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ExternalLink, FileText, PackageCheck, RefreshCw, Send, Truck, XCircle } from "lucide-react";
import { Badge, Btn, Card, money } from "@/components/admin/ui";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { LoadingRows } from "@/components/ui/loading-rows";

type Shipping = {
  enabled: boolean;
  pickupLocation: string | null;
  canShip: boolean;
  reason: string | null;
  cod: boolean;
  parcel: { weightKg: number; length: number; breadth: number; height: number; usesDefaults: boolean };
  shipment: { orderId: string | null; shipmentId: string | null; awb: string | null; courier: string | null; trackingUrl: string | null; status: string | null; labelUrl: string | null; pickup: string | null };
};
type Courier = { id: number; name: string; rate: number; etd: string; days: number | null; rating: number | null };

const msg = (e: unknown) => (e instanceof ApiError ? e.message : "Something went wrong. Please try again.");

/** Shipping through Shiprocket: send the order, choose and book a courier, schedule the pickup, print the label and follow the parcel. */
export function ShippingCard({ orderId, cancelled }: { orderId: string; cancelled: boolean }) {
  const qc = useQueryClient();
  const key = ["admin", "order-shipping", orderId] as const;
  const q = useQuery({ queryKey: key, queryFn: () => api<Shipping>(`/admin/orders/${orderId}/shipping`), staleTime: 0, retry: false });
  const [couriers, setCouriers] = useState<{ list: Courier[]; recommended: number | null } | null>(null);
  const [chosen, setChosen] = useState<number | "auto" | null>(null);

  const done = (message: string) => async (data: Shipping) => {
    qc.setQueryData(key, data);
    toast.success(message);
    // The order's own timeline and "fulfilled" badge change too.
    await qc.invalidateQueries({ queryKey: ["admin", "order", orderId] });
    await qc.invalidateQueries({ queryKey: ["admin", "orders"] });
  };
  const post = (path: string, body?: unknown) => api<Shipping>(`/admin/orders/${orderId}/shipping/${path}`, { method: "POST", ...(body ? { body } : {}) });

  const create = useMutation({ mutationFn: () => post("create"), onSuccess: done("Order sent to Shiprocket"), onError: (e) => toast.error(msg(e)) });
  const assign = useMutation({
    mutationFn: () => post("assign", chosen !== null && chosen !== "auto" ? { courier_id: chosen } : undefined),
    onSuccess: async (d) => { setCouriers(null); await done("Courier booked. The customer has been told.")(d); },
    onError: (e) => toast.error(msg(e)),
  });
  const pickup = useMutation({ mutationFn: () => post("pickup"), onSuccess: done("Pickup scheduled"), onError: (e) => toast.error(msg(e)) });
  const track = useMutation({ mutationFn: () => post("track"), onSuccess: done("Tracking updated"), onError: (e) => toast.error(msg(e)) });
  const cancel = useMutation({ mutationFn: () => post("cancel"), onSuccess: async (d) => { setCouriers(null); await done("Shipment cancelled in Shiprocket")(d); }, onError: (e) => toast.error(msg(e)) });
  const label = useMutation({
    mutationFn: () => post("label"),
    onSuccess: async (d) => {
      await done("Label ready")(d);
      if (d.shipment.labelUrl) window.open(d.shipment.labelUrl, "_blank", "noopener,noreferrer");
    },
    onError: (e) => toast.error(msg(e)),
  });
  const load = useMutation({
    mutationFn: () => api<{ couriers: Courier[]; recommended: number | null }>(`/admin/orders/${orderId}/shipping/couriers`),
    onSuccess: (r) => { setCouriers({ list: r.couriers, recommended: r.recommended }); setChosen(r.recommended ?? r.couriers[0]?.id ?? "auto"); },
    onError: (e) => toast.error(msg(e)),
  });

  const busy = create.isPending || assign.isPending || pickup.isPending || track.isPending || cancel.isPending || label.isPending;
  const s = q.data;
  const sh = s?.shipment;

  if (q.isPending) return <Card title="Shipping"><LoadingRows /></Card>;
  if (q.isError || !s) return <Card title="Shipping"><p className="text-[13px] text-[#616161]">Could not load shipping. <button type="button" className="text-[#005bd3] underline" onClick={() => void q.refetch()}>Try again</button></p></Card>;
  // Nothing to show on an order that was never shipped through Shiprocket while the connection is off.
  if (!s.enabled && !sh?.shipmentId) {
    return <Card title="Shipping"><p className="text-[13px] text-[#616161]">Shiprocket is not switched on, so you can only mark this order as fulfilled by hand. The main administrator can connect Shiprocket in Settings → Integrations.</p></Card>;
  }

  return (
    <Card
      title={<span className="flex items-center gap-2"><Truck className="size-4" /> Shipping {sh?.status ? <Badge tone="info">{sh.status}</Badge> : null}</span>}
      actions={sh?.awb && !cancelled ? <Btn disabled={busy} onClick={() => track.mutate()}><RefreshCw className={cn("size-3.5", track.isPending && "animate-spin")} /> Refresh status</Btn> : null}
    >
      <p className="mb-3 text-xs text-[#616161]">
        Parcel: <b>{s.parcel.weightKg} kg</b>, {s.parcel.length} × {s.parcel.breadth} × {s.parcel.height} cm{s.parcel.usesDefaults ? " (some products have no weight set, so the default is used — set it on the product)" : ""}.
        {s.pickupLocation ? <> Pickup from <b>{s.pickupLocation}</b>.</> : null}
        {s.cod ? <> Cash on Delivery: the courier collects the order total.</> : null}
      </p>

      {!sh?.shipmentId ? (
        <div>
          {s.reason ? <p role="alert" className="mb-2 text-[13px] text-[#8e1f0b]">{s.reason}</p> : null}
          <Btn variant="primary" disabled={busy || !s.canShip || cancelled} onClick={() => create.mutate()}><Send className="size-3.5" /> {create.isPending ? "Sending…" : "Send to Shiprocket"}</Btn>
          <p className="mt-2 text-xs text-[#616161]">Creates the order in your Shiprocket account with this address, items and weight. Nothing is charged yet.</p>
        </div>
      ) : !sh.awb ? (
        <div className="space-y-3">
          <p className="text-[13px]"><PackageCheck className="mr-1 inline size-4 text-[#0c5132]" /> Sent to Shiprocket (shipment {sh.shipmentId}). Now choose a courier.</p>
          {!couriers ? (
            <div className="flex flex-wrap gap-2">
              <Btn disabled={busy || load.isPending || cancelled} onClick={() => load.mutate()}>{load.isPending ? "Loading couriers…" : "Show couriers and prices"}</Btn>
              <Btn variant="primary" disabled={busy || cancelled} onClick={() => { setChosen("auto"); assign.mutate(); }}>{assign.isPending ? "Booking…" : "Book the recommended courier"}</Btn>
            </div>
          ) : (
            <div>
              <ul className="divide-y divide-[#ebebeb] overflow-hidden rounded-lg border border-[#e3e3e3]">
                {couriers.list.length ? couriers.list.map((c) => (
                  <li key={c.id}>
                    <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-[13px] hover:bg-[#f7f7f7]">
                      <input type="radio" name="courier" checked={chosen === c.id} onChange={() => setChosen(c.id)} />
                      <span className="min-w-0 flex-1"><b>{c.name}</b>{couriers.recommended === c.id ? <Badge tone="success"> Recommended</Badge> : null}<span className="block text-xs text-[#616161]">{c.days ? `${c.days} days` : c.etd || "—"}{c.rating ? ` · rated ${c.rating}` : ""}</span></span>
                      <span className="font-semibold">{money(c.rate)}</span>
                    </label>
                  </li>
                )) : <li className="px-3 py-3 text-[13px] text-[#616161]">No courier can deliver to this PIN code with this parcel.</li>}
              </ul>
              <div className="mt-2 flex flex-wrap gap-2">
                <Btn variant="primary" disabled={busy || cancelled || !couriers.list.length} onClick={() => assign.mutate()}>{assign.isPending ? "Booking…" : "Book this courier"}</Btn>
                <Btn onClick={() => setCouriers(null)}>Back</Btn>
              </div>
              <p className="mt-2 text-xs text-[#616161]">Prices are what Shiprocket will deduct from your wallet. Booking marks the order as fulfilled and e-mails the customer their tracking number.</p>
            </div>
          )}
          <button type="button" disabled={busy} onClick={() => { if (window.confirm("Remove this shipment from Shiprocket?")) cancel.mutate(); }} className="text-xs text-[#8e1f0b] underline disabled:opacity-50">Cancel the Shiprocket shipment</button>
        </div>
      ) : (
        <div className="space-y-3">
          <dl className="grid grid-cols-[120px_1fr] gap-y-1 text-[13px]">
            <dt className="text-[#616161]">Courier</dt><dd>{sh.courier || "—"}</dd>
            <dt className="text-[#616161]">Tracking number</dt><dd className="font-mono">{sh.awb}</dd>
            <dt className="text-[#616161]">Pickup</dt><dd>{sh.pickup || "Not scheduled yet"}</dd>
          </dl>
          <div className="flex flex-wrap gap-2">
            {!sh.pickup ? <Btn variant="primary" disabled={busy || cancelled} onClick={() => pickup.mutate()}>{pickup.isPending ? "Scheduling…" : "Schedule pickup"}</Btn> : null}
            <Btn disabled={busy} onClick={() => (sh.labelUrl ? window.open(sh.labelUrl, "_blank", "noopener,noreferrer") : label.mutate())}><FileText className="size-3.5" /> {label.isPending ? "Preparing…" : sh.labelUrl ? "Open label" : "Get label"}</Btn>
            {sh.trackingUrl ? <a href={sh.trackingUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1.5 rounded-lg border border-[#c9c9c9] bg-white px-3 py-1.5 text-[13px] font-semibold hover:bg-[#f7f7f7]"><ExternalLink className="size-3.5" /> Tracking page</a> : null}
          </div>
          <button type="button" disabled={busy} onClick={() => { if (window.confirm("Cancel this shipment in Shiprocket? This works only before the courier collects the parcel.")) cancel.mutate(); }} className="inline-flex items-center gap-1 text-xs text-[#8e1f0b] underline disabled:opacity-50"><XCircle className="size-3.5" /> Cancel shipment</button>
        </div>
      )}
    </Card>
  );
}
