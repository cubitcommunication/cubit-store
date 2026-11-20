import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import { accountApi } from "@/lib/account";
import { inputClass, labelClass, primaryButton, type ReturnRequest, type ReturnsInfo } from "@/lib/commerce";
import { formatDate } from "@/components/site/OrderBits";

const STATUS: Record<ReturnRequest["status"], { label: string; help: string }> = {
  requested: { label: "Waiting for approval", help: "We will review your request and reply soon." },
  approved: { label: "Approved", help: "Please send the pieces back to us as described below." },
  rejected: { label: "Not accepted", help: "We could not accept this return." },
  received: { label: "Parcel received", help: "We have your parcel and are processing the refund." },
  refunded: { label: "Refunded", help: "Your refund has been issued." },
  closed: { label: "Closed", help: "" },
};

/** "Return or exchange" block on the customer's order page. Only appears once the store switches returns on. */
export function ReturnPanel({ number, info }: { number: number; info: ReturnsInfo | undefined }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("damaged");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);

  if (!info || !info.enabled) return null;
  const chosen = info.items.filter((i) => (qty[i.id] ?? 0) > 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!chosen.length) return void toast.error("Choose at least one piece to return.");
    setBusy(true);
    try {
      await accountApi.requestReturn(number, { items: chosen.map((i) => ({ id: i.id, qty: qty[i.id]! })), reason, details: details.trim() || undefined });
      await qc.invalidateQueries({ queryKey: ["account", "order"] });
      setOpen(false);
      setQty({});
      setDetails("");
      toast.success("Return requested. We will get back to you soon.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not send the request. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h3 className="eyebrow">Returns</h3>

      {info.requests.map((r) => (
        <div key={r.id} className="mt-3 border border-border p-4 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-display">{STATUS[r.status].label}</p>
            <p className="text-xs text-muted-foreground">Requested {formatDate(r.createdAt)}</p>
          </div>
          <p className="mt-1 text-muted-foreground">{r.items.map((i) => `${i.qty} × ${i.name}`).join(", ")} · {r.reasonLabel}</p>
          {STATUS[r.status].help ? <p className="mt-2">{STATUS[r.status].help}</p> : null}
          {r.adminNote ? <p className="mt-2 border-l-2 border-brand-red pl-3">{r.adminNote}</p> : null}
        </div>
      ))}

      {!info.canRequest ? (
        info.message ? <p className="mt-3 text-sm text-muted-foreground">{info.message}</p> : null
      ) : !open ? (
        <div className="mt-3">
          <p className="text-sm text-muted-foreground">You can ask to return pieces within {info.days} days of shipping.</p>
          <button type="button" onClick={() => setOpen(true)} className="mt-3 border border-foreground px-5 py-3 text-xs uppercase tracking-widest transition-colors hover:border-brand-red hover:text-brand-red">
            Return items
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-3 space-y-5 border border-border p-5">
          <fieldset>
            <legend className={labelClass}>What would you like to return?</legend>
            <ul className="mt-3 space-y-2">
              {info.items.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate">{i.name}</span>
                  <select value={qty[i.id] ?? 0} onChange={(e) => setQty((q) => ({ ...q, [i.id]: Number(e.target.value) }))} className="border border-border bg-background px-2 py-1.5" aria-label={`Quantity of ${i.name} to return`}>
                    {Array.from({ length: i.max + 1 }, (_, n) => <option key={n} value={n}>{n === 0 ? "Keep" : `Return ${n}`}</option>)}
                  </select>
                </li>
              ))}
            </ul>
          </fieldset>
          <label className="block">
            <span className={labelClass}>Reason</span>
            <select value={reason} onChange={(e) => setReason(e.target.value)} className={`${inputClass} mt-2`}>
              {Object.entries(info.reasons).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
          </label>
          <label className="block">
            <span className={labelClass}>Tell us more (optional)</span>
            <textarea value={details} onChange={(e) => setDetails(e.target.value)} maxLength={800} rows={3} className={`${inputClass} mt-2`} />
          </label>
          <div className="flex gap-3">
            <button type="submit" disabled={busy || !chosen.length} className={primaryButton}>{busy ? "Sending…" : "Send return request"}</button>
            <button type="button" onClick={() => setOpen(false)} className="px-4 text-sm text-muted-foreground hover:text-brand-red">Cancel</button>
          </div>
        </form>
      )}
    </section>
  );
}
