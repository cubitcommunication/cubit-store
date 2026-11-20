import { useState } from "react";
import { ExternalLink, Pencil } from "lucide-react";
import { Btn, Field, adminInput } from "@/components/admin/ui";

type Tracking = { awb_code: string | null; tracking_url: string | null; courier_name: string | null };

/**
 * Courier, tracking ID and tracking link for an order. Before the order is fulfilled the fields sit just above the
 * "Mark as fulfilled" button, so what is typed goes in the shipped e-mail and on the customer's order page.
 * After fulfilment they can be corrected, and the customer can be e-mailed the new details.
 */
export function TrackingFields({ order, cancelled, busy, onSubmit }: { order: Tracking & { fulfillment_status: string }; cancelled: boolean; busy: boolean; onSubmit: (body: Record<string, unknown>) => void }) {
  const [courier, setCourier] = useState(order.courier_name ?? "");
  const [id, setId] = useState(order.awb_code ?? "");
  const [url, setUrl] = useState(order.tracking_url ?? "");
  const [editing, setEditing] = useState(false);
  const fulfilled = order.fulfillment_status === "fulfilled";

  const urlBad = url.trim() !== "" && !/^https?:\/\/\S+$/i.test(url.trim());
  const body = { tracking_id: id.trim(), tracking_url: url.trim(), courier: courier.trim() };
  if (cancelled) return null;

  const form = (
    <div className="grid gap-3 sm:grid-cols-3">
      <Field label="Courier (optional)"><input className={adminInput} value={courier} maxLength={120} onChange={(e) => setCourier(e.target.value)} placeholder="e.g. India Post" autoComplete="off" /></Field>
      <Field label="Tracking ID"><input className={adminInput} value={id} maxLength={60} onChange={(e) => setId(e.target.value)} placeholder="e.g. EE123456789IN" autoComplete="off" spellCheck={false} /></Field>
      <Field label="Tracking link" help={urlBad ? "Start with https://" : "Optional"}><input className={`${adminInput} ${urlBad ? "!border-[#c70a24]" : ""}`} value={url} maxLength={500} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" autoComplete="off" spellCheck={false} /></Field>
    </div>
  );

  if (!fulfilled) {
    return (
      <div className="mt-4 border-t border-[#ebebeb] pt-4">
        <p className="mb-2 text-[13px] font-semibold">Tracking (optional)</p>
        {form}
        <p className="mt-2 text-xs text-[#616161]">Shipped with a courier you booked yourself? Add the tracking ID and link here. They go in the “order shipped” e-mail and show on the customer’s order page in My account, so they can follow the parcel.</p>
        <div className="mt-3 flex justify-end">
          <Btn variant="primary" disabled={busy || urlBad} onClick={() => onSubmit({ action: "fulfil", ...body })}>Mark as fulfilled</Btn>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 border-t border-[#ebebeb] pt-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-semibold">Tracking</p>
        {!editing ? <Btn onClick={() => setEditing(true)}><Pencil className="size-3.5" /> {order.awb_code || order.tracking_url ? "Edit" : "Add tracking"}</Btn> : null}
      </div>
      {!editing ? (
        order.awb_code || order.tracking_url ? (
          <dl className="mt-2 grid grid-cols-[110px_1fr] gap-y-1 text-[13px]">
            {order.courier_name ? <><dt className="text-[#616161]">Courier</dt><dd>{order.courier_name}</dd></> : null}
            {order.awb_code ? <><dt className="text-[#616161]">Tracking ID</dt><dd className="font-mono">{order.awb_code}</dd></> : null}
            {order.tracking_url ? <><dt className="text-[#616161]">Tracking link</dt><dd className="min-w-0"><a href={order.tracking_url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 break-all text-[#005bd3] hover:underline"><ExternalLink className="size-3.5 shrink-0" /> {order.tracking_url}</a></dd></> : null}
          </dl>
        ) : (
          <p className="mt-1 text-xs text-[#616161]">No tracking details yet. Add them so the customer can follow the parcel.</p>
        )
      ) : (
        <div className="mt-2">
          {form}
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <Btn onClick={() => { setEditing(false); setCourier(order.courier_name ?? ""); setId(order.awb_code ?? ""); setUrl(order.tracking_url ?? ""); }}>Cancel</Btn>
            <Btn disabled={busy || urlBad || (!id.trim() && !url.trim())} onClick={() => { onSubmit({ action: "set_tracking", notify: false, ...body }); setEditing(false); }}>Save</Btn>
            <Btn variant="primary" disabled={busy || urlBad || (!id.trim() && !url.trim())} onClick={() => { onSubmit({ action: "set_tracking", notify: true, ...body }); setEditing(false); }}>Save and e-mail the customer</Btn>
          </div>
        </div>
      )}
    </div>
  );
}
